import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv, Variables } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireCenter: createMiddleware(async (_c, next) => {
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
	};
});

const { membersRoutes } = await import("./members.js");
const { createRateLimit } = await import("../middleware/rate-limit.js");

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

function mountMembers(app: Hono<AppEnv>) {
	app.route("/api/members", membersRoutes);
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

/** Creates a bare app without setting userId/centerId  -  to test guard branches. */
function createContextApp(
	mountRoutes: (app: Hono<AppEnv>) => void,
	db: ReturnType<typeof createMockDb>,
	ctx: { userId?: string; centerId?: string; role?: Variables["role"] },
) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("db", db as unknown as Variables["db"]);
		if (ctx.userId !== undefined) c.set("userId", ctx.userId);
		if (ctx.centerId !== undefined) c.set("centerId", ctx.centerId);
		if (ctx.role !== undefined) c.set("role", ctx.role);
		await next();
	});
	mountRoutes(app);
	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 500);
		}
		return c.json({ error: "Internal server error" }, 500);
	});
	return app;
}

describe("members routes", () => {
	it("lists members for the current center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId: "center-1",
								userId: "user-1",
								role: "owner",
								joinedAt: new Date(),
								acceptedAt: new Date("2026-04-01T08:00:00.000Z"),
								invitedAt: null,
								userName: "Taylor Reed",
								userEmail: "taylor@example.com",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			members: Array<{ userEmail: string; acceptedAt: string | null; invitedAt: string | null }>;
		};
		expect(body.members).toHaveLength(1);
		expect(body.members[0].userEmail).toBe("taylor@example.com");
		expect(body.members[0].acceptedAt).toBeTruthy();
		expect(body.members[0].invitedAt).toBeNull();
	});

	it("rejects staff from listing the center roster", async () => {
		const db = createMockDb({
			select: vi.fn(),
		});

		const app = createTestApp(mountMembers, db, { role: "staff" });
		const res = await app.request("/api/members");

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 401 when userId is not in context for list members", async () => {
		const db = createMockDb();
		const app = createContextApp(mountMembers, db, { role: "owner", centerId: "center-1" });
		const res = await app.request("/api/members");
		expect(res.status).toBe(401);
	});

	it("returns 403 when centerId is not in context for list members", async () => {
		const db = createMockDb();
		const app = createContextApp(mountMembers, db, { userId: "user-1", role: "owner" });
		const res = await app.request("/api/members");
		expect(res.status).toBe(403);
	});

	it("creates an invited member for an existing user", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					// users lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "user-2", email: "staff@example.com" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// existing membership check
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// center name lookup for email
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ name: "Test Center" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "membership-2",
							centerId: "center-1",
							userId: "user-2",
							role: "staff",
						},
					]),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "staff@example.com", role: "staff" }),
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { membership: { role: string } };
		expect(body.membership.role).toBe("staff");
		expect(fetch).toHaveBeenCalledTimes(1);
		const fetchCall = vi.mocked(fetch).mock.calls[0];
		const requestInit = fetchCall[1];
		expect(requestInit?.body).toBeTruthy();
		const payload = JSON.parse(String(requestInit?.body)) as { html: string };
		expect(payload.html).toContain("https://pebbledesk.app/logo-email.png");
		expect(payload.html).toContain('alt="PebbleDesk"');
		expect(payload.html).toContain(">PebbleDesk</div>");
	});

	it("creates an invited member for an email without an account", async () => {
		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "membership-new-user",
					centerId: "center-1",
					userId: null,
					inviteEmail: "new.staff@example.com",
					role: "staff",
				},
			]),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					// users lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// pending invite check
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// center name lookup for email
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ name: "Test Center" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: insertValues,
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: " New.Staff@Example.COM ", role: "staff" }),
		);

		expect(res.status).toBe(201);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				userId: null,
				inviteEmail: "new.staff@example.com",
				role: "staff",
			}),
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		const [, requestInit] = vi.mocked(fetch).mock.calls[0];
		const payload = JSON.parse(String(requestInit?.body)) as { to: string; html: string };
		expect(payload.to).toBe("new.staff@example.com");
		expect(payload.html).toContain("Hello new.staff@example.com,");
	});

	it("sends an invitation email to the invitee when invite is created", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					// users lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "user-2", email: "staff@example.com", name: "Staff Member" },
								]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// existing membership check
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// center name lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ name: "Sunny Day Care" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "membership-invite-1",
							centerId: "center-1",
							userId: "user-2",
							role: "director",
						},
					]),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "staff@example.com", role: "director" }),
			{
				APP_URL: "https://app.pebbledesk.test",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "hello@pebbledesk.test",
			},
		);

		expect(res.status).toBe(201);
		expect(fetch).toHaveBeenCalledTimes(1);
		const fetchCall = vi.mocked(fetch).mock.calls[0];
		const requestInit = fetchCall[1];
		expect(requestInit?.body).toBeTruthy();
		const payload = JSON.parse(String(requestInit?.body)) as { html: string; text: string };
		expect(payload.html).toContain("https://pebbledesk.app/logo-email.png");
		expect(payload.html).toContain('alt="PebbleDesk"');
		expect(payload.html).toContain(">PebbleDesk</div>");
		const token = new URL(payload.text.match(/https:\/\/\S+/)?.[0] ?? "").searchParams.get("token");
		expect(token).toBeTruthy();
		expect(token).not.toBe("membership-invite-1");
		expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
		expect(payload.html).toContain(`/accept-invite?token=${token}`);
	});

	it("escapes invitee name, center name, and role in invitation email HTML", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					// users lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "user-2",
									email: "staff@example.com",
									name: `Staff <img src=x onerror="alert('name')">`,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// existing membership check
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					// center name lookup
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ name: `<script>alert("center")</script> Day Care` }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "membership-invite-1",
							centerId: "center-1",
							userId: "user-2",
							role: "staff",
						},
					]),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "staff@example.com", role: "staff" }),
			{
				APP_URL: "https://app.pebbledesk.test",
				RESEND_API_KEY: "re_test",
				RESEND_FROM_EMAIL: "hello@pebbledesk.test",
			},
		);

		expect(res.status).toBe(201);
		const [, requestInit] = vi.mocked(fetch).mock.calls[0];
		const payload = JSON.parse(String(requestInit?.body)) as { html: string };
		expect(payload.html).toContain(
			`Staff &lt;img src=x onerror=&quot;alert(&#x27;name&#x27;)&quot;&gt;`,
		);
		expect(payload.html).toContain(
			`&lt;script&gt;alert(&quot;center&quot;)&lt;/script&gt; Day Care`,
		);
		expect(payload.html).toContain("<strong>staff</strong>");
		expect(payload.html).not.toContain("<script>");
		expect(payload.html).not.toContain("<img src=x");
	});

	it("returns 403 when centerId is not in context for invites", async () => {
		const db = createMockDb();
		const app = createContextApp(mountMembers, db, { userId: "user-1", role: "owner" });
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "x@x.com", role: "staff" }),
		);
		expect(res.status).toBe(403);
	});

	it("returns the same status and message when inviting an already pending email", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "membership-pending",
									centerId: "center-1",
									userId: null,
									inviteEmail: "missing@example.com",
									role: "staff",
								},
							]),
						}),
					}),
				}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "missing@example.com", role: "staff" }),
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Invitation could not be sent");
	});

	it("returns the same status and message when inviting an existing member (prevents email enumeration)", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "user-2", email: "staff@example.com" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([
									{ id: "membership-2", centerId: "center-1", userId: "user-2", role: "staff" },
								]),
						}),
					}),
				}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request(
			"/api/members/invites",
			jsonBody({ email: "staff@example.com", role: "staff" }),
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Invitation could not be sent");
	});

	it("returns 403 when centerId is not in context for delete member", async () => {
		const db = createMockDb();
		const app = createContextApp(mountMembers, db, { userId: "user-1", role: "owner" });
		const res = await app.request("/api/members/membership-1", { method: "DELETE" });
		expect(res.status).toBe(403);
	});

	it("returns 400 for non-UUID member id on delete", async () => {
		const db = createMockDb();

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members/not-a-uuid", { method: "DELETE" });
		expect(res.status).toBe(400);
	});

	it("returns 404 when member is not found for delete", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members/00000000-0000-0000-0000-000000000099", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});

	it("prevents deleting the owner membership", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId: "center-1",
								role: "owner",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members/00000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(403);
	});

	it("deletes a pending non-owner invitation", async () => {
		const where = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "00000000-0000-0000-0000-000000000002",
								centerId: "center-1",
								role: "staff",
								acceptedAt: null,
							},
						]),
					}),
				}),
			}),
			delete: vi.fn().mockReturnValue({ where }),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members/00000000-0000-0000-0000-000000000002", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalled();
		expect(collectStringValues(where.mock.calls[0]?.[0])).toContain("center-1");
		expect(await res.json()).toEqual({ success: true });
	});

	it("deactivates an accepted non-owner membership without deleting historical rows", async () => {
		const updateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "00000000-0000-0000-0000-000000000002",
						centerId: "center-1",
						role: "staff",
						acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
						deactivatedAt: new Date("2026-04-10T00:00:00.000Z"),
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "00000000-0000-0000-0000-000000000002",
								centerId: "center-1",
								role: "staff",
								acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({ set: updateSet }),
			delete: vi.fn(),
		});

		const app = createTestApp(mountMembers, db);
		const res = await app.request("/api/members/00000000-0000-0000-0000-000000000002", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		expect(db.delete).not.toHaveBeenCalled();
		expect(updateSet).toHaveBeenCalledWith({ deactivatedAt: expect.any(Date) });
		expect(await res.json()).toEqual({ success: true });
	});
});

describe("POST /api/members/invites — rate limiting", () => {
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

	function makeInviteDb() {
		return createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ name: "Test Center" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "m-rl",
							centerId: "center-1",
							userId: null,
							inviteEmail: "rl@example.com",
							role: "staff",
						},
					]),
				}),
			}),
		});
	}

	function attachInviteRateLimit(app: Hono<AppEnv>) {
		const rl = createRateLimit({
			windowMs: 60_000,
			max: 10,
			message: "Too many invite requests, please try again shortly.",
		});
		app.use("/api/members/invites", async (c, next) => {
			if (c.req.method === "POST") return rl(c, next);
			return next();
		});
	}

	it("11th POST /api/members/invites from same IP within the window returns 429", async () => {
		const ns = makeMockRateLimiterNamespace();
		const ip = "198.51.100.20";
		const requestInit = {
			...jsonBody({ email: "rl@example.com", role: "staff" }),
			headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
		};

		// Exhaust the 10-request limit — all allowed
		for (let i = 0; i < 10; i++) {
			const db = makeInviteDb();
			const app = createTestApp(mountMembers, db, undefined, attachInviteRateLimit);
			const res = await app.request("/api/members/invites", requestInit, { RATE_LIMITER: ns });
			expect(res.status).toBe(201);
		}

		// 11th request should be rate-limited
		const db = makeInviteDb();
		const app = createTestApp(mountMembers, db, undefined, attachInviteRateLimit);
		const res = await app.request("/api/members/invites", requestInit, { RATE_LIMITER: ns });
		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Too many invite requests");
	});
});
