import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

const { messagesRoutes } = await import("./messages.js");
const { createRateLimit } = await import("../middleware/rate-limit.js");

const RESEND_WEBHOOK_SECRET = "whsec_dGVzdF9zZWNyZXQ=";

function mountMessages(app: Hono<AppEnv>) {
	app.route("/api/messages", messagesRoutes);
}

// Mirror the app-level, method-gated rate limit from src/index.ts so tests
// exercise the same pre-auth guardrail that runs in production.
function attachMessageSendRateLimit(app: Hono<AppEnv>) {
	const rl = createRateLimit({
		windowMs: 60_000,
		max: 5,
		message: "Too many message sends, please try again shortly.",
	});
	app.use("/api/messages", async (c, next) => {
		if (c.req.method === "POST") return rl(c, next);
		return next();
	});
}

function selectWhereResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(value),
		}),
	};
}

function selectWherePaginatedResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						offset: vi.fn().mockResolvedValue(value),
					}),
				}),
			}),
		}),
	};
}

function selectLimitResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(value),
			}),
		}),
	};
}

function selectLeftJoinWhereResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(value),
			}),
		}),
	};
}

function selectLeftJoinWhereOrderByResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockResolvedValue(value),
				}),
			}),
		}),
	};
}

function selectDoubleLeftJoinWhereOrderByLimitResolved<T>(value: T) {
	return {
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				leftJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(value),
						}),
					}),
				}),
			}),
		}),
	};
}

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

function sqlConditionColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) {
		return [];
	}

	const names: string[] = [];
	for (const chunk of value.queryChunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if ("name" in chunk && typeof chunk.name === "string") {
			names.push(chunk.name);
		}
		names.push(...sqlConditionColumnNames(chunk, seen));
	}

	return names;
}

async function signResendWebhook(payload: string, secret: string, timestamp?: string) {
	const id = "msg_test_webhook";
	const signedAt = timestamp ?? Math.floor(Date.now() / 1000).toString();
	const key = await crypto.subtle.importKey(
		"raw",
		base64ToBytes(secret.replace(/^whsec_/, "")),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${id}.${signedAt}.${payload}`),
	);
	const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));

	return {
		"content-type": "application/json",
		"svix-id": id,
		"svix-timestamp": signedAt,
		"svix-signature": `v1,${encodedSignature}`,
	};
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: "email-1" }),
			text: async () => "ok",
		}),
	);
});

describe("messages routes", () => {
	const MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";
	const CLASSROOM_ID = "550e8400-e29b-41d4-a716-446655440010";

	it.each([
		["GET", "/api/messages", undefined],
		["GET", "/api/messages/inbox", undefined],
		["GET", `/api/messages/${MESSAGE_ID}`, undefined],
		[
			"POST",
			"/api/messages",
			jsonBody({
				subject: "Daily update",
				body: "Nap and lunch went well.",
				messageType: "direct",
				recipientMode: "classroom",
				classroomId: CLASSROOM_ID,
			}),
		],
		["POST", `/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" }],
	] as const)("rejects %s message route requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});

	it("returns 500 when staff list requests have no membership context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "staff", membershipId: "" });

		await expect(app.request("/api/messages")).rejects.toMatchObject({ status: 500 });
	});

	it("returns 500 when staff inbox requests have no membership context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "staff", membershipId: "" });

		await expect(app.request("/api/messages/inbox")).rejects.toMatchObject({ status: 500 });
	});

	it("returns 404 when reading a missing message", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}`);

		expect(res.status).toBe(404);
	});

	it("returns 500 when staff send requests have no membership context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "staff", membershipId: "" });

		await expect(
			app.request(
				"/api/messages",
				jsonBody({
					subject: "Daily update",
					body: "Nap and lunch went well.",
					messageType: "direct",
					recipientMode: "classroom",
					classroomId: CLASSROOM_ID,
				}),
			),
		).rejects.toMatchObject({ status: 500 });
	});

	it("returns 404 when redelivering a missing message", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" });

		expect(res.status).toBe(404);
	});

	it("lists messages for director", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValue(selectWherePaginatedResolved([{ id: "message-1", subject: "Update" }])),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<{ id: string }> };
		expect(body.messages).toHaveLength(1);
	});

	it("filters messages by the search query", async () => {
		const where = vi.fn().mockImplementation((condition: unknown) => {
			const queryText = collectStringValues(condition).join(" ");
			const results = queryText.includes("annual")
				? [{ id: "message-1", subject: "Annual update" }]
				: [
						{ id: "message-1", subject: "Annual update" },
						{ id: "message-2", subject: "Daily update" },
					];
			const offset = vi.fn().mockResolvedValue(results);
			const limit = vi.fn().mockReturnValue({ offset });
			const orderBy = vi.fn().mockReturnValue({ limit });
			return { orderBy };
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where,
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages?search=annual");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			messages: Array<{ id: string; subject: string }>;
			nextCursor: number | null;
		};
		expect(body.messages).toEqual([{ id: "message-1", subject: "Annual update" }]);
	});

	it("returns an empty list for staff with no classroom assignments", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue(selectWhereResolved([])),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request("/api/messages");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ messages: [], nextCursor: null });
	});

	it("lists messages for staff in assigned classrooms", async () => {
		const assignmentWhere = vi
			.fn()
			.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]);
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: assignmentWhere,
					}),
				})
				.mockReturnValueOnce(
					selectWherePaginatedResolved([{ id: "message-1", subject: "Room update" }]),
				),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages?classroomId=550e8400-e29b-41d4-a716-446655440010&messageType=announcement",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { messages: Array<{ id: string; subject: string }> };
		expect(body.messages).toEqual([{ id: "message-1", subject: "Room update" }]);
		expect(db.select).toHaveBeenCalledTimes(2);
		expect(collectStringValues(assignmentWhere.mock.calls[0]?.[0]).join("")).toContain(
			new Date().toISOString().split("T")[0],
		);
	});

	it("applies the search filter when listing messages", async () => {
		const offset = vi.fn().mockResolvedValue([{ id: "message-1", subject: "Room update" }]);
		const limit = vi.fn().mockReturnValue({ offset });
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages?search=update");

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalledTimes(1);
	});

	it("lists recent inbound reply inbox items for directors", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue(
				selectDoubleLeftJoinWhereOrderByLimitResolved([
					{
						messageReplies: {
							id: "reply-1",
							body: "We can help.",
							receivedAt: "2026-05-19T12:00:00.000Z",
						},
						messages: {
							id: MESSAGE_ID,
							subject: "Class update",
							centerId: "center-1",
						},
						guardians: {
							id: "guardian-1",
							firstName: "Mia",
							lastName: "Jones",
							email: "mia@example.com",
						},
					},
				]),
			),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages/inbox?limit=10");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			replies: [
				{
					reply: {
						id: "reply-1",
						body: "We can help.",
						receivedAt: "2026-05-19T12:00:00.000Z",
					},
					message: {
						id: MESSAGE_ID,
						subject: "Class update",
						centerId: "center-1",
					},
					guardian: {
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Jones",
						email: "mia@example.com",
					},
				},
			],
		});
	});

	it("returns an empty inbound reply inbox for staff with no classroom assignments", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue(selectWhereResolved([])),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request("/api/messages/inbox");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ replies: [] });
		expect(db.select).toHaveBeenCalledTimes(1);
	});

	it("scopes staff inbound reply inbox items to assigned classrooms", async () => {
		const inboxWhere = vi.fn().mockReturnValue({
			orderBy: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectWhereResolved([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: inboxWhere,
							}),
						}),
					}),
				}),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request("/api/messages/inbox");

		expect(res.status).toBe(200);
		expect(collectStringValues(inboxWhere.mock.calls[0]?.[0]).join(" ")).toContain(
			"550e8400-e29b-41d4-a716-446655440010",
		);
	});

	it("uses a generic greeting when a guardian first name is missing", async () => {
		const guardianRows = [
			{
				id: "guardian-1",
				centerId: "center-1",
				firstName: null,
				lastName: "Jones",
				email: "mia@example.com",
			},
		];
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(guardianRows),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockResolvedValue([]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(fetch).toHaveBeenCalledTimes(1);
		const fetchMock = vi.mocked(fetch);
		const [, requestInit] = fetchMock.mock.calls[0];
		expect(requestInit?.body).toContain("<p>Hello ");
		expect(requestInit?.body).not.toContain("Hello null");
	});

	it("creates and sends a message to guardian ids", async () => {
		const guardianRows = [
			{
				id: "guardian-1",
				centerId: "center-1",
				firstName: "Mia",
				lastName: "Jones",
				email: "mia@example.com",
			},
		];
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(guardianRows),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								onConflictDoNothing: vi.fn().mockResolvedValue([]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		expect(body.count).toBe(1);
		expect(fetch).toHaveBeenCalledTimes(1);
		const fetchCall = vi.mocked(fetch).mock.calls[0];
		const requestInit = fetchCall[1];
		expect(requestInit?.body).toBeTruthy();
		const payload = JSON.parse(String(requestInit?.body)) as { html: string; reply_to: string };
		expect(payload.html).toContain("https://pebbledesk.app/logo-email.png");
		expect(payload.html).toContain('alt="PebbleDesk"');
		expect(payload.html).toContain(">PebbleDesk</div>");
		expect(payload.reply_to).toBe("replies+message-1.guardian-1@pebbledesk.test");
	});

	it("escapes guardian names and message bodies in outbound email HTML", async () => {
		const guardianRows = [
			{
				id: "guardian-1",
				centerId: "center-1",
				firstName: `Mia <img src=x onerror="alert('name')">`,
				lastName: "Jones",
				email: "mia@example.com",
			},
		];
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(guardianRows),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: `<script>alert("body")</script> Please read & confirm.`,
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: `<script>alert("body")</script> Please read & confirm.`,
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		const [, requestInit] = vi.mocked(fetch).mock.calls[0];
		const payload = JSON.parse(String(requestInit?.body)) as { html: string };
		expect(payload.html).toContain(
			`Mia &lt;img src=x onerror=&quot;alert(&#x27;name&#x27;)&quot;&gt;`,
		);
		expect(payload.html).toContain(
			`&lt;script&gt;alert(&quot;body&quot;)&lt;/script&gt; Please read &amp; confirm.`,
		);
		expect(payload.html).not.toContain("<script>");
		expect(payload.html).not.toContain("<img src=x");
	});

	it("stores a verified inbound Resend reply for the addressed message thread", async () => {
		const insertValues = vi.fn().mockReturnValue({
			onConflictDoNothing: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "reply-1",
						messageId: MESSAGE_ID,
						guardianId: "550e8400-e29b-41d4-a716-446655440001",
						body: "We will be there.",
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "recipient-1",
						},
					]),
				),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					text: "We will be there.",
					html: "<p>We will be there.</p>",
				}),
				text: async () => "ok",
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				message_id: "<provider-message-id>",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
				subject: "Re: Field trip",
				created_at: "2026-05-19T12:00:00.123456+00:00",
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ status: "accepted", replyId: "reply-1" });
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				messageId: MESSAGE_ID,
				guardianId: "550e8400-e29b-41d4-a716-446655440001",
				body: "We will be there.",
				providerEmailId: "email-123",
				providerMessageId: "<provider-message-id>",
			}),
		);
	});

	it("accepts duplicate inbound replies by returning the existing reply id", async () => {
		const insertValues = vi.fn().mockReturnValue({
			onConflictDoNothing: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }]))
				.mockReturnValueOnce(selectLimitResolved([{ id: "reply-existing" }])),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ text: "We will be there." }),
				text: async () => "ok",
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				message_id: "<provider-message-id>",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
				subject: "Re: Field trip",
				created_at: "2026-05-19T12:00:00.123456+00:00",
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ status: "accepted", replyId: "reply-existing" });
	});

	it("returns an error when an inbound reply conflict cannot be found", async () => {
		const insertValues = vi.fn().mockReturnValue({
			onConflictDoNothing: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }]))
				.mockReturnValueOnce(selectLimitResolved([])),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ text: "We will be there." }),
				text: async () => "ok",
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				message_id: "<provider-message-id>",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
				subject: "Re: Field trip",
				created_at: "2026-05-19T12:00:00.123456+00:00",
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(500);
	});

	it("rejects inbound replies when the sender email does not match the addressed guardian", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Attacker <attacker@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Inbound reply sender does not match guardian" });
		expect(fetch).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects inbound replies when the addressed guardian was not a message recipient", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([])),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Inbound reply recipient is not on this message" });
		expect(fetch).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects inbound replies without a recognized reply address", async () => {
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				message_id: "<provider-message-id>",
				from: "Mia Jones <mia@example.com>",
				to: ["hello@pebbledesk.test"],
				subject: "Re: Field trip",
				created_at: "2026-05-19T12:00:00.123456+00:00",
			},
		});

		const app = createTestApp(mountMessages, createMockDb(), { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Reply address not recognized" });
	});

	it("truncates oversized inbound reply bodies before storing them", async () => {
		const insertValues = vi.fn().mockReturnValue({
			onConflictDoNothing: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "reply-1" }]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "MIA@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }])),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const longBody = "a".repeat(10_050);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ text: longBody }),
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(202);
		const storedReply = insertValues.mock.calls[0]?.[0] as { body: string };
		expect(storedReply.body).toHaveLength(10_000);
		expect(storedReply.body).toContain("[Reply truncated]");
	});

	it("rejects inbound replies when the fetched email body is empty", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: null,
						},
					]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }])),
			insert: vi.fn(),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ text: "", html: "" }),
				text: async () => "ok",
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				message_id: "<provider-message-id>",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
				subject: "Re: Field trip",
				created_at: "2026-05-19T12:00:00.123456+00:00",
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Inbound email body is empty" });
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects stale Resend inbound webhook signatures", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});
		const staleTimestamp = Math.floor(Date.now() / 1000 - 60 * 10).toString();

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET, staleTimestamp),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid signature" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects inbound Resend webhooks when the signing secret is not configured", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				body: JSON.stringify({ type: "email.received" }),
			},
			{ RESEND_WEBHOOK_SECRET: "" },
		);

		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({ error: "Inbound webhook is not configured" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects signed inbound Resend webhooks with malformed JSON", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = "{not json";

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid webhook payload" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects signed inbound Resend webhooks that fail payload validation", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid webhook payload" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects inbound Resend webhooks when the configured secret is malformed", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET: "whsec_%%%" },
		);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid signature" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects inbound Resend webhooks with malformed signature bytes", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});
		const headers = await signResendWebhook(payload, RESEND_WEBHOOK_SECRET);

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: { ...headers, "svix-signature": "v1,%%%" },
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Invalid signature" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 404 when an inbound reply targets a missing message", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce(selectLimitResolved([])),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(404);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("returns 404 when an inbound reply targets a missing guardian", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([{ id: MESSAGE_ID, centerId: "center-1", classroomId: null }]),
				)
				.mockReturnValueOnce(selectLimitResolved([])),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(404);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("returns 500 when Resend cannot fetch the inbound email body", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([{ id: MESSAGE_ID, centerId: "center-1", classroomId: null }]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }])),
			insert: vi.fn(),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				text: async () => "not found",
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(500);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("returns 500 when Resend returns an invalid inbound email payload", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([{ id: MESSAGE_ID, centerId: "center-1", classroomId: null }]),
				)
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "550e8400-e29b-41d4-a716-446655440001",
							centerId: "center-1",
							email: "mia@example.com",
						},
					]),
				)
				.mockReturnValueOnce(selectLimitResolved([{ id: "recipient-1" }])),
			insert: vi.fn(),
		});
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ text: 123 }),
			}),
		);
		const payload = JSON.stringify({
			type: "email.received",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: [`replies+${MESSAGE_ID}.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test`],
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(500);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("ignores signed Resend webhook events that are not inbound email receipts", async () => {
		const db = createMockDb({
			select: vi.fn(),
			insert: vi.fn(),
		});
		const payload = JSON.stringify({
			type: "email.delivered",
			data: {
				email_id: "email-123",
				from: "Mia Jones <mia@example.com>",
				to: "replies+550e8400-e29b-41d4-a716-446655440000.550e8400-e29b-41d4-a716-446655440001@pebbledesk.test",
			},
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(
			"/api/messages/inbound/resend",
			{
				method: "POST",
				headers: await signResendWebhook(payload, RESEND_WEBHOOK_SECRET),
				body: payload,
			},
			{ RESEND_WEBHOOK_SECRET },
		);

		expect(res.status).toBe(202);
		expect(await res.json()).toEqual({ status: "ignored" });
		expect(db.select).not.toHaveBeenCalled();
	});

	it("delivers emails after the transaction callback completes", async () => {
		let transactionOpen = false;
		const fetchMock = vi.fn().mockImplementation(() => {
			expect(transactionOpen).toBe(false);
			return Promise.resolve({
				ok: true,
				json: async () => ({ id: "email-1" }),
				text: async () => "ok",
			});
		});
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				transactionOpen = true;
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									id: "guardian-1",
									centerId: "center-1",
									firstName: "Mia",
									lastName: "Jones",
									email: "mia@example.com",
								},
							]),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};

				try {
					return await fn(txDb);
				} finally {
					transactionOpen = false;
				}
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("retries once on Resend 429 and marks delivery on successful retry", async () => {
		const updateWhere = vi.fn().mockResolvedValue([]);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response("rate", { status: 429, headers: { "retry-after": "0" } }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									id: "guardian-1",
									centerId: "center-1",
									firstName: "Mia",
									lastName: "Jones",
									email: "mia@example.com",
								},
							]),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: updateWhere,
						}),
					}),
				};
				return fn(txDb);
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: updateWhere,
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(updateWhere).toHaveBeenCalledTimes(1);
	});

	it("creates a message from child recipients and skips guardians without email", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: null,
											},
										},
										{
											guardian: {
												id: "guardian-2",
												firstName: "Alex",
												lastName: "Stone",
												email: "alex@example.com",
											},
										},
									]),
								}),
							}),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{ id: "recipient-1", guardianId: "guardian-1" },
									{ id: "recipient-2", guardianId: "guardian-2" },
								]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(fetch).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		// 1 guardian has an email (guardian-2 has email, guardian-1 does not)
		expect(body.count).toBe(1);
	});

	it("dedupes guardians when multiple selected children share the same guardian", async () => {
		const recipientInsert = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: "mia@example.com",
											},
										},
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: "mia@example.com",
											},
										},
									]),
								}),
							}),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: recipientInsert,
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: [
					"550e8400-e29b-41d4-a716-446655440000",
					"550e8400-e29b-41d4-a716-446655440001",
				],
			}),
		);

		expect(res.status).toBe(202);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(recipientInsert).toHaveBeenCalledWith([
			{ centerId: "center-1", messageId: "message-1", guardianId: "guardian-1" },
		]);
	});

	it("does not resolve child recipients from another center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					}),
					insert: vi.fn().mockReturnValueOnce({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "message-1",
									centerId: "center-1",
									subject: "Update",
									body: "Hello",
									messageType: "announcement",
								},
							]),
						}),
					}),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Choose at least one recipient with an email address.");
	});

	it("center-scopes the child recipient child join", async () => {
		let childJoinCondition: unknown;
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockImplementationOnce((_table, condition) => {
								childJoinCondition = condition;
								return {
									leftJoin: vi.fn().mockReturnValue({
										where: vi.fn().mockResolvedValue([]),
									}),
								};
							}),
						}),
					}),
					insert: vi.fn(),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(400);
		expect(sqlConditionColumnNames(childJoinCondition)).toContain("center_id");
	});

	it("center-scopes selected child recipient relationship rows", async () => {
		let childRecipientWhereCondition: unknown;
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockImplementation((condition: unknown) => {
										childRecipientWhereCondition = condition;
										return Promise.resolve([]);
									}),
								}),
							}),
						}),
					}),
					insert: vi.fn(),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(400);
		const centerScopeCount = sqlConditionColumnNames(childRecipientWhereCondition).filter(
			(name) => name === "center_id",
		).length;
		expect(centerScopeCount).toBeGreaterThanOrEqual(2);
	});

	it("only resolves active selected child recipients", async () => {
		let childRecipientWhereCondition: unknown;
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockImplementation((condition: unknown) => {
										childRecipientWhereCondition = condition;
										return Promise.resolve([]);
									}),
								}),
							}),
						}),
					}),
					insert: vi.fn(),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "child_ids",
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(400);
		expect(sqlConditionColumnNames(childRecipientWhereCondition)).toContain("enrollment_status");
		expect(collectStringValues(childRecipientWhereCondition).join(" ")).toContain("active");
	});

	it("rejects a classroom message with no deliverable recipients", async () => {
		const insert = vi.fn().mockReturnValueOnce({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "message-1",
						centerId: "center-1",
						subject: "Update",
						body: "Hello",
						messageType: "announcement",
						classroomId: "550e8400-e29b-41d4-a716-446655440010",
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					}),
					insert,
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(400);
		expect(fetch).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Choose at least one recipient with an email address.");
	});

	it("rejects a classroom message for a classroom outside the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			transaction: vi.fn(),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440099",
			}),
		);

		expect(res.status).toBe(404);
	});

	it("ignores null guardian rows when deduping classroom recipients", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([
										{ guardian: null },
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: "mia@example.com",
											},
										},
									]),
								}),
							}),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
										classroomId: "550e8400-e29b-41d4-a716-446655440010",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(202);
		expect(fetch).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		expect(body.count).toBe(1);
	});

	it("center-scopes the classroom recipient child-guardian join", async () => {
		let childGuardianJoinCondition: unknown;
		let classroomAssignmentCondition: unknown;
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockImplementationOnce((_table, condition) => {
								childGuardianJoinCondition = condition;
								return {
									leftJoin: vi.fn().mockReturnValue({
										where: vi.fn().mockImplementation((condition) => {
											classroomAssignmentCondition = condition;
											return Promise.resolve([]);
										}),
									}),
								};
							}),
						}),
					}),
					insert: vi.fn(),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(400);
		expect(sqlConditionColumnNames(childGuardianJoinCondition)).toContain("center_id");
		expect(sqlConditionColumnNames(classroomAssignmentCondition)).toContain("effective_date");
	});

	it("tracks failed delivery attempts without updating delivered timestamps", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ message: "failed" }),
				text: async () => "failed",
			}),
		);

		const updateWhere = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									id: "guardian-1",
									firstName: "Mia",
									lastName: "Jones",
									email: "mia@example.com",
								},
							]),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: updateWhere,
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(updateWhere).not.toHaveBeenCalled();
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		expect(body.count).toBe(1);
	});

	it("returns 500 when message creation fails", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									id: "guardian-1",
									firstName: "Mia",
									lastName: "Jones",
									email: "mia@example.com",
								},
							]),
						}),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(500);
	});

	it("rejects staff sends outside their assigned classroom", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440099",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("rejects message creation without a center membership", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			centerId: undefined as never,
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects staff sends to explicit guardian lists", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(403);
	});

	it("rejects staff direct messages to explicit guardian lists", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "direct",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(403);
	});

	it("rejects staff direct messages outside their assigned classroom", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "direct",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440099",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("returns message detail with recipients", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "message-1", subject: "Update" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									messageRecipients: {
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: "2026-04-07T12:00:00Z",
										readAt: null,
									},
									guardians: {
										id: "guardian-1",
										firstName: "Mia",
										lastName: "Jones",
										email: "mia@example.com",
									},
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								orderBy: vi.fn().mockResolvedValue([
									{
										messageReplies: {
											id: "reply-1",
											messageId: "message-1",
											guardianId: "guardian-1",
											fromEmail: "mia@example.com",
											fromName: "Mia Jones",
											body: "We can help with snacks.",
											receivedAt: "2026-05-19T12:00:00.000Z",
											readAt: null,
										},
										guardians: {
											id: "guardian-1",
											firstName: "Mia",
											lastName: "Jones",
											email: "mia@example.com",
										},
									},
								]),
							}),
						}),
					}),
				}),
		});

		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			recipients: Array<{ id: string }>;
			replies: Array<{ messageReplies: { body: string } }>;
		};
		expect(body.recipients).toHaveLength(1);
		expect(body.replies[0]?.messageReplies.body).toBe("We can help with snacks.");
	});

	it("rejects staff reading message detail outside their classroom", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "message-1",
							subject: "Update",
							classroomId: "550e8400-e29b-41d4-a716-446655440099",
						},
					]),
				)
				.mockReturnValueOnce(
					selectWhereResolved([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				),
		});

		const app = createTestApp(mountMessages, db, { role: "staff" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}`);

		expect(res.status).toBe(403);
	});

	it("allows staff to read a message in their own classroom", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "message-1",
							subject: "Update",
							classroomId: "550e8400-e29b-41d4-a716-446655440010",
						},
					]),
				)
				.mockReturnValueOnce(
					selectWhereResolved([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				)
				.mockReturnValueOnce(
					selectLeftJoinWhereResolved([
						{
							messageRecipients: {
								id: "recipient-1",
								messageId: "message-1",
								guardianId: "guardian-1",
								deliveredAt: "2026-04-07T12:00:00Z",
								readAt: null,
							},
							guardians: {
								id: "guardian-1",
								firstName: "Mia",
								lastName: "Jones",
								email: "mia@example.com",
							},
						},
					]),
				)
				.mockReturnValueOnce(
					selectLeftJoinWhereOrderByResolved([
						{
							messageReplies: {
								id: "reply-1",
								messageId: "message-1",
								guardianId: "guardian-1",
								body: "We can help with snacks.",
							},
							guardians: {
								id: "guardian-1",
								firstName: "Mia",
								lastName: "Jones",
								email: "mia@example.com",
							},
						},
					]),
				),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(`/api/messages/${MESSAGE_ID}`);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { recipients: Array<{ id: string }> };
		expect(body.recipients).toHaveLength(1);
	});

	it("returns 400 for malformed message identifiers on get", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request("/api/messages/message-missing");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 400 for non-uuid message identifiers", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "owner" });
		const res = await app.request("/api/messages/message-1");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects reading message detail without a center membership", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			centerId: undefined as never,
		});
		const res = await app.request(`/api/messages/${MESSAGE_ID}`);

		expect(res.status).toBe(403);
	});

	it("redelivers undelivered recipients", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "message-1", subject: "Update" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									messageRecipients: {
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
									guardians: {
										id: "guardian-1",
										email: "mia@example.com",
										firstName: "Mia",
									},
								},
							]),
						}),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" });

		expect(res.status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("rejects staff redelivery outside their classroom", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: "message-1",
							subject: "Update",
							body: "Hello",
							classroomId: "550e8400-e29b-41d4-a716-446655440099",
						},
					]),
				)
				.mockReturnValueOnce(
					selectWhereResolved([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				),
		});

		const app = createTestApp(mountMessages, db, { role: "staff" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" });

		expect(res.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rejects redelivery without a center membership", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			centerId: undefined as never,
		});
		const res = await app.request(`/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" });

		expect(res.status).toBe(403);
		expect(fetch).not.toHaveBeenCalled();
	});

	it("allows staff to send a classroom message to their own classroom", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: "mia@example.com",
											},
										},
									]),
								}),
							}),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
										classroomId: "550e8400-e29b-41d4-a716-446655440010",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
							}),
						}),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "direct",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(202);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("skips delivered recipients, missing emails, and failed redelivery attempts", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				json: async () => ({ message: "failed" }),
				text: async () => "failed",
			}),
		);
		const updateWhere = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: "message-1", subject: "Update", body: "Hello" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									messageRecipients: {
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: "2026-04-07T12:00:00Z",
									},
									guardians: {
										id: "guardian-1",
										email: "mia@example.com",
										firstName: "Mia",
									},
								},
								{
									messageRecipients: {
										id: "recipient-2",
										messageId: "message-1",
										guardianId: "guardian-2",
										deliveredAt: null,
									},
									guardians: {
										id: "guardian-2",
										email: null,
										firstName: "Alex",
									},
								},
								{
									messageRecipients: {
										id: "recipient-3",
										messageId: "message-1",
										guardianId: "guardian-3",
										deliveredAt: null,
									},
									guardians: {
										id: "guardian-3",
										email: "sam@example.com",
										firstName: "Sam",
									},
								},
							]),
						}),
					}),
				}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: updateWhere,
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/redeliver`, { method: "POST" });

		expect(res.status).toBe(200);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(updateWhere).not.toHaveBeenCalled();
		expect(await res.json()).toEqual({ delivered: 0 });
	});

	it("marks all unread replies read and returns the count", async () => {
		const updatedRows = [{ id: "reply-1" }, { id: "reply-2" }];
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([{ id: MESSAGE_ID, centerId: "center-1", classroomId: null }]),
				)
				.mockReturnValueOnce(selectWhereResolved([])), // ensureMessageAccess staff assignment (skipped for director)
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue(updatedRows),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/replies/read`, { method: "POST" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ markedRead: 2 });
	});

	it("returns markedRead: 0 when all replies were already read", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([{ id: MESSAGE_ID, centerId: "center-1", classroomId: null }]),
				),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/replies/read`, { method: "POST" });

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ markedRead: 0 });
	});

	it("returns 404 when marking replies read for a message in another center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce(selectLimitResolved([])),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/replies/read`, { method: "POST" });

		expect(res.status).toBe(404);
	});

	it("rejects staff mark-read outside their classroom", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResolved([
						{
							id: MESSAGE_ID,
							centerId: "center-1",
							classroomId: "550e8400-e29b-41d4-a716-446655440099",
						},
					]),
				)
				.mockReturnValueOnce(
					selectWhereResolved([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				),
		});

		const app = createTestApp(mountMessages, db, { role: "staff", membershipId: "membership-1" });
		const res = await app.request(`/api/messages/${MESSAGE_ID}/replies/read`, { method: "POST" });

		expect(res.status).toBe(403);
	});

	it("returns 400 for malformed mark-read targets", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages/message-1/replies/read", { method: "POST" });

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed redeliver targets", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages/message-1/redeliver", { method: "POST" });

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 400 for non-uuid redeliver targets", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request("/api/messages/message-missing/redeliver", { method: "POST" });

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 403 when center membership is missing", async () => {
		const app = createTestApp(mountMessages, createMockDb(), {
			centerId: undefined as unknown as string,
		});
		const res = await app.request("/api/messages");

		expect(res.status).toBe(403);
	});

	it("uses executionCtx.waitUntil when available and returns 202 immediately", async () => {
		const waitUntilMock = vi.fn();
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									id: "guardian-1",
									centerId: "center-1",
									firstName: "Mia",
									lastName: "Jones",
									email: "mia@example.com",
								},
							]),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const { Hono: HonoClass } = await import("hono");
		const { HTTPException: HE } = await import("hono/http-exception");
		const app = new HonoClass<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as unknown as import("../lib/context.js").Variables["db"]);
			c.set("auth", {} as unknown as import("../lib/context.js").Variables["auth"]);
			c.set("userId", "user-1");
			c.set("centerId", "center-1");
			c.set("membershipId", "membership-1");
			c.set("role", "director");
			Object.defineProperty(c, "executionCtx", {
				value: { waitUntil: waitUntilMock },
				configurable: true,
			});
			await next();
		});
		mountMessages(app);
		app.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			if (err instanceof HE || typeof maybe.status === "number") {
				const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
				return c.json({ error: maybe.message ?? "Error" }, status);
			}
			return c.json({ error: "Internal server error" }, 500);
		});

		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Update",
				body: "Hello",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
		expect(waitUntilMock).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		expect(body.count).toBe(1);
	});

	it("chunks large recipient lists into batches of 50", async () => {
		// Create 60 guardians with emails to verify batching works
		const guardianRows = Array.from({ length: 60 }, (_, i) => ({
			id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, "a")}`,
			centerId: "center-1",
			firstName: "Guardian",
			lastName: `${i}`,
			email: `guardian${i}@example.com`,
		}));
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(guardianRows),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Update",
										body: "Hello",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue(
										guardianRows.map((g) => ({ id: `r-${g.id}`, guardianId: g.id })),
									),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Bulk",
				body: "Hello all",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: guardianRows.map((g) => g.id),
			}),
		);

		expect(res.status).toBe(202);
		const body = (await res.json()) as { status: string; count: number };
		expect(body.status).toBe("queued");
		expect(body.count).toBe(60);
		// All 60 guardians have emails so fetch was called 60 times
		expect(fetch).toHaveBeenCalledTimes(60);
	});

	it("returns 403 when staff tries to send an announcement (even to their own classroom)", async () => {
		// Staff IS assigned to this classroom — the block must come from messageType, not recipientMode
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				}),
			}),
		});
		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Important Announcement",
				body: "Please read this.",
				messageType: "announcement",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("returns 403 when staff tries to send an alert (even to their own classroom)", async () => {
		// Staff IS assigned to this classroom — the block must come from messageType, not recipientMode
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi
						.fn()
						.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
				}),
			}),
		});
		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Urgent Alert",
				body: "Emergency!",
				messageType: "alert",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(403);
	});

	it("allows staff to send a direct (classroom) message", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ classroomId: "550e8400-e29b-41d4-a716-446655440010" }]),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
						}),
					}),
				}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([
										{
											guardian: {
												id: "guardian-1",
												firstName: "Mia",
												lastName: "Jones",
												email: "mia@example.com",
											},
										},
									]),
								}),
							}),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Hi there",
										body: "A note",
										messageType: "direct",
										classroomId: "550e8400-e29b-41d4-a716-446655440010",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi
									.fn()
									.mockResolvedValue([{ id: "recipient-1", guardianId: "guardian-1" }]),
							}),
						}),
					update: vi.fn(),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, {
			role: "staff",
			membershipId: "membership-1",
		});
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Hi there",
				body: "A note",
				messageType: "direct",
				recipientMode: "classroom",
				classroomId: "550e8400-e29b-41d4-a716-446655440010",
			}),
		);

		expect(res.status).toBe(202);
	});

	it("allows director to send an announcement", async () => {
		const guardianRows = [
			{
				id: "guardian-1",
				centerId: "center-1",
				firstName: "Mia",
				lastName: "Jones",
				email: "mia@example.com",
			},
		];
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn().mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue(guardianRows),
						}),
					}),
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "message-1",
										centerId: "center-1",
										subject: "Big news",
										body: "Details here.",
										messageType: "announcement",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "recipient-1",
										messageId: "message-1",
										guardianId: "guardian-1",
										deliveredAt: null,
									},
								]),
							}),
						}),
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountMessages, db, { role: "director" });
		const res = await app.request(
			"/api/messages",
			jsonBody({
				subject: "Big news",
				body: "Details here.",
				messageType: "announcement",
				recipientMode: "guardian_ids",
				recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
			}),
		);

		expect(res.status).toBe(202);
	});

	describe("POST /api/messages — rate limiting", () => {
		interface RateLimitState {
			count: number;
			windowStart: number;
		}

		function makeMockRateLimiterNamespace(): DurableObjectNamespace {
			const instances = new Map<string, Map<string, RateLimitState>>();
			function getStorage(name: string): Map<string, RateLimitState> {
				if (!instances.has(name)) instances.set(name, new Map());
				return instances.get(name) as Map<string, RateLimitState>;
			}
			const makeStub = (name: string) => ({
				checkLimit: async (
					key: string,
					limit: number,
					windowMs: number,
				): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
					const storage = getStorage(name);
					const now = Date.now();
					const stored = storage.get(key);
					const windowStart = stored?.windowStart ?? now;
					const count = stored?.count ?? 0;
					if (now - windowStart > windowMs) {
						storage.set(key, { count: 1, windowStart: now });
						return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
					}
					const resetAt = windowStart + windowMs;
					if (count >= limit) {
						return { allowed: false, remaining: 0, resetAt };
					}
					storage.set(key, { count: count + 1, windowStart });
					return { allowed: true, remaining: limit - count - 1, resetAt };
				},
			});
			return {
				newUniqueId: () => ({ toString: () => "unique-id" }) as DurableObjectId,
				idFromName: (name: string) => ({ toString: () => name, name }) as DurableObjectId,
				idFromString: (id: string) => ({ toString: () => id }) as DurableObjectId,
				get: (id: DurableObjectId) => makeStub(id.toString()) as unknown as DurableObjectStub,
				jurisdiction: () => ({}) as DurableObjectNamespace,
			} as unknown as DurableObjectNamespace;
		}

		function makeCreateMessageDb() {
			return createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([
									{
										id: "guardian-rl",
										centerId: "center-1",
										firstName: "Rate",
										lastName: "Limited",
										email: "rl@example.com",
									},
								]),
							}),
						}),
						insert: vi
							.fn()
							.mockReturnValueOnce({
								values: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([
										{
											id: "message-rl",
											centerId: "center-1",
											subject: "Hi",
											body: "Body",
											messageType: "direct",
										},
									]),
								}),
							})
							.mockReturnValueOnce({
								values: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([
										{
											id: "recipient-rl",
											messageId: "message-rl",
											guardianId: "guardian-rl",
											deliveredAt: null,
										},
									]),
								}),
							}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});
		}

		it("6th request from same IP within the window returns 429", async () => {
			const ns = makeMockRateLimiterNamespace();
			const ip = "198.51.100.20";
			const requestInit = {
				...jsonBody({
					subject: "Hi",
					body: "Body",
					messageType: "direct",
					recipientMode: "guardian_ids",
					recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
				}),
				headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
			};

			// Exhaust the 5-request limit — all allowed
			for (let i = 0; i < 5; i++) {
				const db = makeCreateMessageDb();
				const app = createTestApp(
					mountMessages,
					db,
					{ role: "director" },
					attachMessageSendRateLimit,
				);
				const res = await app.request("/api/messages", requestInit, { RATE_LIMITER: ns });
				expect(res.status).toBe(202);
			}

			// 6th request should be rate-limited
			const db = makeCreateMessageDb();
			const app = createTestApp(
				mountMessages,
				db,
				{ role: "director" },
				attachMessageSendRateLimit,
			);
			const res = await app.request("/api/messages", requestInit, { RATE_LIMITER: ns });
			expect(res.status).toBe(429);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Too many message sends");
		});
	});
});
