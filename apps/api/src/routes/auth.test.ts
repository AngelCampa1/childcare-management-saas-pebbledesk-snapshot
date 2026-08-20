import type { Hono } from "hono";
import { Hono as HonoApp } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, testBindings } from "../test/setup.js";

const mockedResolveSessionUserId = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		resolveSessionUserId: mockedResolveSessionUserId,
	};
});

const { authRoutes } = await import("./auth.js");

function mountAuth(app: Hono<AppEnv>) {
	app.route("/api/auth", authRoutes);
}

function requestBodyAt(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
	const call = fetchMock.mock.calls[callIndex];
	expect(call).toBeDefined();
	const init = call?.[1] as RequestInit | undefined;
	expect(init?.body).toBeDefined();
	return JSON.parse(String(init?.body));
}

function createAuthHandlerTestApp(
	db: ReturnType<typeof createMockDb>,
	handler: ReturnType<typeof vi.fn>,
) {
	const app = new HonoApp<AppEnv>();
	app.use("*", async (c, next) => {
		c.set("db", db as never);
		c.set("auth", { handler } as never);
		c.set("userId", "user-1");
		await next();
	});
	mountAuth(app);
	app.onError((err, c) => {
		const maybe = err as { status?: number; message?: string };
		if (typeof maybe.status === "number") {
			return c.json({ error: maybe.message ?? "Error" }, maybe.status as 400 | 401 | 500);
		}
		return c.json({ error: "Internal server error" }, 500);
	});
	return app;
}

type PendingInvitationSelectRow = {
	membershipId: string;
	centerId: string;
	role: "owner" | "director" | "staff";
	centerName: string;
	invitedAt: Date | null;
	createdAt: Date;
	emailVerified: boolean;
};

function pendingInvitationSelectResult(rows: PendingInvitationSelectRow[]) {
	const chain = {
		innerJoin: vi.fn(),
		where: vi.fn().mockResolvedValue(rows),
	};
	chain.innerJoin.mockReturnValue(chain);
	return {
		from: vi.fn().mockReturnValue(chain),
	};
}

function selectLimitResult(rows: unknown[]) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(rows),
			}),
		}),
	};
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

describe("auth routes", () => {
	it("returns authenticated status when the session resolves to an accepted membership without preloaded context", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("user-1");
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "membership-accepted",
								centerId: "center-accepted",
								userId: "user-1",
								role: "director",
								acceptedAt: new Date("2026-04-10T15:30:00.000Z"),
								createdAt: new Date("2026-04-10T15:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				}),
		});
		const app = createTestApp(mountAuth, db, {
			userId: "",
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "authenticated",
		});
	});

	it("returns an unauthenticated status without throwing a 401", async () => {
		const app = createTestApp(mountAuth, createMockDb(), {
			userId: "",
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "unauthenticated",
		});
	});

	it("returns onboarding_required status when the user has no accepted membership", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				// Call 1: membership query returns empty (no memberships)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				// Call 2: pending invitations query returns empty
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "onboarding_required",
		});
	});

	it("includes email verification metadata in signed-in public auth status", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				})
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								email: "owner@example.com",
								emailVerified: false,
							},
						]),
					}),
				}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "onboarding_required",
			email: "owner@example.com",
			emailVerified: false,
		});
	});

	it("resends verification email for a signed-in unverified user", async () => {
		const handler = vi.fn().mockResolvedValue(Response.json({ ok: true }));
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								email: "owner@example.com",
								emailVerified: false,
							},
						]),
					}),
				}),
			}),
		});
		const app = createAuthHandlerTestApp(db, handler);

		const res = await app.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(res.status).toBe(200);
		expect(handler).toHaveBeenCalledTimes(1);
		const forwardedRequest = handler.mock.calls[0]?.[0] as Request;
		expect(forwardedRequest.url).toContain("/api/auth/send-verification-email");
		await expect(forwardedRequest.json()).resolves.toMatchObject({
			email: "owner@example.com",
		});
	});

	it("does not resend verification email for a verified user", async () => {
		const handler = vi.fn();
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								email: "owner@example.com",
								emailVerified: true,
							},
						]),
					}),
				}),
			}),
		});
		const app = createAuthHandlerTestApp(db, handler);

		const res = await app.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "Email is already verified" });
		expect(handler).not.toHaveBeenCalled();
	});

	it("does not resend verification email when the signed-in user is missing", async () => {
		const handler = vi.fn();
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});
		const app = createAuthHandlerTestApp(db, handler);

		const res = await app.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(res.status).toBe(401);
		expect(handler).not.toHaveBeenCalled();
	});

	it("forwards verification resend failures from Better Auth", async () => {
		const handler = vi.fn().mockResolvedValue(Response.json({ error: "blocked" }, { status: 429 }));
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								email: "owner@example.com",
								emailVerified: false,
							},
						]),
					}),
				}),
			}),
		});
		const app = createAuthHandlerTestApp(db, handler);

		const res = await app.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "blocked" });
	});

	it("returns invite_pending status with invitation context", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("user-1");
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "membership-pending",
								centerId: "center-2",
								userId: "user-1",
								role: "staff",
								acceptedAt: null,
								createdAt: new Date("2026-04-09T09:00:00.000Z"),
							},
						]),
					}),
				})
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([
						{
							membershipId: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							role: "staff",
							centerName: "Pebble North",
							invitedAt: new Date("2026-04-09T10:00:00.000Z"),
							createdAt: new Date("2026-04-09T09:00:00.000Z"),
							emailVerified: true,
						},
					]),
				}),
		});
		const app = createTestApp(mountAuth, db, {
			userId: "",
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "invite_pending",
			invitation: {
				membershipId: "b2b21234-0000-0000-0000-000000000002",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			},
		});
	});

	it("returns authenticated status when the user has an active center context", async () => {
		const app = createTestApp(mountAuth, createMockDb());

		const res = await app.request("/api/auth/status");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			status: "authenticated",
		});
	});

	it("returns the current session context", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([
						{
							membershipId: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							role: "staff",
							centerName: "Pebble North",
							invitedAt: new Date("2026-04-09T10:00:00.000Z"),
							createdAt: new Date("2026-04-09T09:00:00.000Z"),
							emailVerified: true,
						},
					]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "user-1", name: "Taylor Reed" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "center-1",
									name: "Pebble Center",
									state: "TX",
									timezone: "America/Chicago",
									stripeCustomerId: null,
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi
							.fn()
							.mockResolvedValue([{ classroomId: "classroom-1" }, { classroomId: "classroom-2" }]),
					}),
				}),
		});

		const app = createTestApp(mountAuth, db, {
			userId: "user-1",
			centerId: "center-1",
			membershipId: "membership-1",
			role: "director",
		});

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			session: {
				user: { id: string; name: string };
				membership: { role: string };
				center: { name: string; timezone: string; canOpenBillingPortal: boolean };
				classroomIds: string[];
				pendingInvitation?: { membershipId: string };
			};
			pendingInvitation?: { membershipId: string; centerName: string };
		};
		expect(body.session.user.id).toBe("user-1");
		expect(body.session.user.name).toBe("Taylor Reed");
		expect(body.session.membership.role).toBe("director");
		expect(body.session.center.name).toBe("Pebble Center");
		expect(body.session.center.timezone).toBe("America/Chicago");
		expect(body.session.center.canOpenBillingPortal).toBe(false);
		expect(body.session.classroomIds).toEqual(["classroom-1", "classroom-2"]);
		expect(body.pendingInvitation).toEqual({
			membershipId: "b2b21234-0000-0000-0000-000000000002",
			centerId: "center-2",
			centerName: "Pebble North",
			role: "staff",
		});
	});

	it("marks the billing portal available when the center has a Stripe customer", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "user-1", name: "Taylor Reed" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "center-1",
									name: "Pebble Center",
									state: "TX",
									timezone: "America/Chicago",
									stripeCustomerId: "cus_123",
								},
							]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
		});
		const app = createTestApp(mountAuth, db);

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			session: { center: { canOpenBillingPortal: boolean } };
		};
		expect(body.session.center.canOpenBillingPortal).toBe(true);
	});

	it("only includes currently effective staff classroom assignments in the session", async () => {
		let staffClassroomCondition: unknown;
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				})
				.mockReturnValueOnce(selectLimitResult([{ id: "user-1", name: "Taylor Reed" }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "center-1",
							name: "Pebble Center",
							state: "TX",
							timezone: "America/Chicago",
							stripeCustomerId: null,
						},
					]),
				)
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockImplementation((condition) => {
							staffClassroomCondition = condition;
							return Promise.resolve([{ classroomId: "classroom-1" }]);
						}),
					}),
				}),
		});
		const app = createTestApp(mountAuth, db, {
			userId: "user-1",
			centerId: "center-1",
			membershipId: "membership-1",
			role: "staff",
		});

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(200);
		expect(sqlConditionColumnNames(staffClassroomCondition)).toContain("effective_date");
	});

	it("returns 401 when the user id is missing", async () => {
		const app = createTestApp(mountAuth, createMockDb(), {
			userId: "",
		});

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(401);
	});

	it("returns 403 when center membership data is missing", async () => {
		const app = createTestApp(mountAuth, createMockDb(), {
			centerId: "",
		});

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({
			error: "No center membership found",
			code: "onboarding_required",
		});
	});

	it("returns a pending invitation when the user has not accepted center access yet", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				...pendingInvitationSelectResult([
					{
						membershipId: "b2b21234-0000-0000-0000-000000000002",
						centerId: "center-2",
						role: "staff",
						centerName: "Pebble North",
						invitedAt: new Date("2026-04-09T10:00:00.000Z"),
						createdAt: new Date("2026-04-09T09:00:00.000Z"),
						emailVerified: true,
					},
				]),
			}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({
			error: "Invitation pending",
			code: "invite_pending",
			invitation: {
				membershipId: "b2b21234-0000-0000-0000-000000000002",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			},
		});
	});

	it("accepts a pending invitation for the current user with a valid invite token", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: null,
							inviteTokenHash: "CVw407ng6qtwgpQx4pGVI09B-pUsSC2Vwvfo2QVYCrw",
							inviteExpiresAt: new Date("2099-04-09T11:00:00.000Z"),
						},
					]),
				),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "b2b21234-0000-0000-0000-000000000002",
								centerId: "center-2",
								userId: "user-1",
								role: "director",
								acceptedAt: new Date("2026-04-09T11:00:00.000Z"),
								inviteTokenHash: null,
								inviteExpiresAt: null,
							},
						]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{
				method: "POST",
			},
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			membership: {
				id: "b2b21234-0000-0000-0000-000000000002",
				centerId: "center-2",
				userId: "user-1",
				role: "director",
				acceptedAt: "2026-04-09T11:00:00.000Z",
				inviteTokenHash: null,
				inviteExpiresAt: null,
			},
		});
	});

	it("accepts a pending invitation created before the user account existed", async () => {
		const updateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "b2b21234-0000-0000-0000-000000000002",
						centerId: "center-2",
						userId: "user-1",
						inviteEmail: null,
						role: "staff",
						acceptedAt: new Date("2026-04-09T11:00:00.000Z"),
						inviteTokenHash: null,
						inviteExpiresAt: null,
					},
				]),
			}),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(
					selectLimitResult([{ email: "new.staff@example.com", emailVerified: true }]),
				)
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							userId: null,
							inviteEmail: "new.staff@example.com",
							role: "staff",
							acceptedAt: null,
							inviteTokenHash: "CVw407ng6qtwgpQx4pGVI09B-pUsSC2Vwvfo2QVYCrw",
							inviteExpiresAt: new Date("2099-04-09T11:00:00.000Z"),
						},
					]),
				),
			update: vi.fn().mockReturnValue({
				set: updateSet,
			}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{ method: "POST" },
		);

		expect(res.status).toBe(200);
		expect(updateSet).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				inviteEmail: null,
				inviteTokenHash: null,
				inviteExpiresAt: null,
			}),
		);
		await expect(res.json()).resolves.toEqual({
			membership: {
				id: "b2b21234-0000-0000-0000-000000000002",
				centerId: "center-2",
				userId: "user-1",
				inviteEmail: null,
				role: "staff",
				acceptedAt: "2026-04-09T11:00:00.000Z",
				inviteTokenHash: null,
				inviteExpiresAt: null,
			},
		});
	});

	it("rejects expired invitation tokens before accepting membership", async () => {
		const update = vi.fn();
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "membership-1",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: null,
							inviteTokenHash: "CVw407ng6qtwgpQx4pGVI09B-pUsSC2Vwvfo2QVYCrw",
							inviteExpiresAt: new Date("2020-04-09T11:00:00.000Z"),
						},
					]),
				),
			update,
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{ method: "POST" },
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "Invitation has expired" });
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects membership-id fallback invites that have no expiry (regression: was silently bypassed)", async () => {
		const update = vi.fn();
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "membership-1",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: null,
							inviteTokenHash: null,
							inviteExpiresAt: null,
						},
					]),
				),
			update,
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/invitations/membership-1/accept", { method: "POST" });

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "Invitation has expired" });
		expect(update).not.toHaveBeenCalled();
	});

	it("accepts membership-id fallback invites with a valid future expiry", async () => {
		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "membership-1",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: null,
							inviteTokenHash: null,
							inviteExpiresAt: futureDate,
						},
					]),
				),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "b2b21234-0000-0000-0000-000000000002",
								centerId: "center-2",
								userId: "user-1",
								role: "director",
								acceptedAt: new Date(),
								inviteTokenHash: null,
								inviteExpiresAt: null,
							},
						]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/invitations/membership-1/accept", { method: "POST" });

		expect(res.status).toBe(200);
	});

	it("rejects invitation acceptance when the current user's email is unverified", async () => {
		const update = vi.fn();
		const select = vi.fn().mockReturnValueOnce(selectLimitResult([{ emailVerified: false }]));
		const db = createMockDb({
			select,
			update,
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request("/api/auth/invitations/membership-1/accept", { method: "POST" });

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({
			error: "Verify your email before accepting this invitation",
		});
		expect(select).toHaveBeenCalledTimes(1);
		expect(update).not.toHaveBeenCalled();
	});

	it("returns the same rejection for unverified users before invitation lookup", async () => {
		const select = vi.fn().mockReturnValue(selectLimitResult([{ emailVerified: false }]));
		const update = vi.fn();
		const db = createMockDb({ select, update });
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const realInviteRes = await app.request("/api/auth/invitations/membership-1/accept", {
			method: "POST",
		});
		const unknownInviteRes = await app.request(
			"/api/auth/invitations/b2b21234-0000-0000-0000-000000000002/accept",
			{ method: "POST" },
		);

		expect(realInviteRes.status).toBe(403);
		expect(unknownInviteRes.status).toBe(403);
		await expect(realInviteRes.json()).resolves.toEqual({
			error: "Verify your email before accepting this invitation",
		});
		await expect(unknownInviteRes.json()).resolves.toEqual({
			error: "Verify your email before accepting this invitation",
		});
		expect(select).toHaveBeenCalledTimes(2);
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects consumed invitation tokens before accepting membership", async () => {
		const update = vi.fn();
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(selectLimitResult([])),
			update,
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{ method: "POST" },
		);

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "Invitation not found" });
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects deactivated invitation tokens before accepting membership", async () => {
		const deactivatedInvitation = {
			id: "membership-1",
			centerId: "center-2",
			userId: "user-1",
			role: "director",
			acceptedAt: null,
			deactivatedAt: new Date("2026-04-10T00:00:00.000Z"),
			inviteTokenHash: "CVw407ng6qtwgpQx4pGVI09B-pUsSC2Vwvfo2QVYCrw",
			inviteExpiresAt: new Date("2099-04-09T11:00:00.000Z"),
		};
		const limit = vi.fn().mockImplementation((predicate?: unknown) => {
			void predicate;
			return Promise.resolve([deactivatedInvitation]);
		});
		const inviteWhere = vi.fn().mockImplementation((condition: unknown) => ({
			limit: vi
				.fn()
				.mockResolvedValue(
					sqlConditionColumnNames(condition).includes("deactivated_at")
						? []
						: [deactivatedInvitation],
				),
		}));
		const update = vi.fn();
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: inviteWhere,
						limit,
					}),
				}),
			update,
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{ method: "POST" },
		);

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "Invitation not found" });
		expect(update).not.toHaveBeenCalled();
	});

	it("rejects accepting an invitation that does not belong to the current user", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(selectLimitResult([])),
		});
		const app = createTestApp(mountAuth, db, {
			centerId: "",
			membershipId: "",
		});

		const res = await app.request(
			"/api/auth/invitations/b2b21234-0000-0000-0000-000000000002/accept",
			{
				method: "POST",
			},
		);

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "Invitation not found" });
	});

	it("accepts a new invitation even when the user already has an active center context", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: null,
							inviteTokenHash: "CVw407ng6qtwgpQx4pGVI09B-pUsSC2Vwvfo2QVYCrw",
							inviteExpiresAt: new Date("2099-04-09T11:00:00.000Z"),
						},
					]),
				),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "b2b21234-0000-0000-0000-000000000002",
								centerId: "center-2",
								userId: "user-1",
								role: "director",
								acceptedAt: new Date("2026-04-09T11:00:00.000Z"),
								inviteTokenHash: null,
								inviteExpiresAt: null,
							},
						]),
					}),
				}),
			}),
		});
		const app = createTestApp(mountAuth, db);

		const res = await app.request(
			"/api/auth/invitations/plain-text-test-token-with-opaque-secret/accept",
			{
				method: "POST",
			},
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			membership: {
				id: "b2b21234-0000-0000-0000-000000000002",
				centerId: "center-2",
				userId: "user-1",
				role: "director",
				acceptedAt: "2026-04-09T11:00:00.000Z",
				inviteTokenHash: null,
				inviteExpiresAt: null,
			},
		});
	});

	it("returns 404 when the center record is missing", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "user-1", name: "Taylor Reed" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
		});
		const app = createTestApp(mountAuth, db);

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(404);
	});

	it("returns 401 when the user record is missing", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					...pendingInvitationSelectResult([]),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
		});
		const app = createTestApp(mountAuth, db);

		const res = await app.request("/api/auth/me");

		expect(res.status).toBe(401);
	});

	it("forwards auth catch-all requests to the auth handler", async () => {
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const db = createMockDb();
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("userId", "user-1");
			c.set("centerId", "center-1");
			c.set("membershipId", "membership-1");
			c.set("role", "owner");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/session");

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("writes sanitized login audit rows for successful raw auth sign-in requests", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("user-1");
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			body: JSON.stringify({ email: "taylor@example.com", password: "secret-password" }),
		});

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				userId: "user-1",
				action: "login",
				entityType: "auth",
				entityId: "user-1",
				changes: { path: "/api/auth/sign-in/email" },
			}),
		);
		expect(JSON.stringify(insertValues.mock.calls[0][0])).not.toContain("secret-password");
	});

	it("writes login audit rows for first-time sign-in requests by resolving the submitted email", async () => {
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "user-1" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "taylor@example.com", password: "secret-password" }),
		});

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				action: "login",
				changes: { path: "/api/auth/sign-in/email" },
			}),
		);
		expect(JSON.stringify(insertValues.mock.calls[0][0])).not.toContain("secret-password");
	});

	it("writes sanitized logout audit rows for successful raw auth sign-out requests", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("user-1");
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-out", { method: "POST" });

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				userId: "user-1",
				action: "logout",
				entityType: "auth",
				entityId: "user-1",
				changes: { path: "/api/auth/sign-out" },
			}),
		);
	});

	it("does not fail successful auth requests when audit persistence fails", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("user-1");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockRejectedValue(new Error("audit unavailable")),
			}),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-out", { method: "POST" });

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("ok");
		expect(warn).toHaveBeenCalledWith("Auth audit log write failed", "audit unavailable");
		warn.mockRestore();
	});

	it("audits redirect-style successful login responses", async () => {
		const handler = vi.fn().mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: { Location: "https://my.pebbledesk.app/dashboard" },
			}),
		);
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "user-1" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "taylor@example.com", password: "secret-password" }),
			redirect: "manual",
		});

		expect(res.status).toBe(302);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-1",
				action: "login",
				changes: { path: "/api/auth/sign-in/email" },
			}),
		);
	});

	it("audits login responses using the response user id before falling back to session lookup", async () => {
		const handler = vi
			.fn()
			.mockResolvedValue(Response.json({ user: { id: "user-from-response" } }, { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const sessionLookupCount = mockedResolveSessionUserId.mock.calls.length;
		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "taylor@example.com", password: "secret-password" }),
		});

		expect(res.status).toBe(200);
		expect(mockedResolveSessionUserId).toHaveBeenCalledTimes(sessionLookupCount);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-from-response",
				entityId: "user-from-response",
				action: "login",
			}),
		);
	});

	it("audits login responses using nested data.user response payloads", async () => {
		const handler = vi
			.fn()
			.mockResolvedValue(
				Response.json({ data: { user: { id: "user-from-data-response" } } }, { status: 200 }),
			);
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/login", { method: "POST" });

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-from-data-response",
				action: "login",
				changes: { path: "/api/auth/login" },
			}),
		);
	});

	it("resolves first-time sign-in audits from url-encoded email bodies", async () => {
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "user-from-form" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				email: "taylor@example.com",
				password: "secret-password",
			}).toString(),
		});

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "user-from-form",
				action: "login",
			}),
		);
		expect(JSON.stringify(insertValues.mock.calls[0][0])).not.toContain("secret-password");
	});

	it("attributes login audits to the submitted email instead of a pre-existing session", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce("old-session-user");
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "new-login-user" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("userId", "old-context-user");
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "new@example.com", password: "secret-password" }),
		});

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: "new-login-user",
				entityId: "new-login-user",
				action: "login",
			}),
		);
		expect(JSON.stringify(insertValues.mock.calls[0][0])).not.toContain("secret-password");
	});

	it("skips auth audit rows for failed raw auth responses", async () => {
		const handler = vi
			.fn()
			.mockResolvedValue(Response.json({ error: "Invalid password" }, { status: 401 }));
		const insert = vi.fn();
		const db = createMockDb({ insert });
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			c.set("centerId", "center-1");
			await next();
		});
		mountAuth(app);

		const res = await app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "taylor@example.com", password: "wrong-password" }),
		});

		expect(res.status).toBe(401);
		expect(insert).not.toHaveBeenCalled();
	});

	it("enrolls signup trial emails in Sequencer after successful signup without extra Neon writes", async () => {
		const handler = vi
			.fn()
			.mockResolvedValue(
				Response.json({ user: { id: "new-user", email: "OWNER@EXAMPLE.COM", name: "Mia Owner" } }),
			);
		const insert = vi.fn();
		const db = createMockDb({ insert });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "owner@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "welcome-run" } }))
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "sequencer-run" } }));
		vi.stubGlobal("fetch", fetchMock);
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", db as never);
			c.set("auth", { handler } as never);
			await next();
		});
		mountAuth(app);

		const res = await app.request(
			"/api/auth/sign-up/email",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: "owner@example.com",
					name: "Mia Owner",
					password: "secret-password",
				}),
			},
			{
				...testBindings,
				SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
				SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
				SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
			},
		);

		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(requestBodyAt(fetchMock, 0)).toMatchObject({
			product: "pebbledesk",
			email: "owner@example.com",
			first_name: "Mia",
			properties: { userId: "new-user", source: "app-signup" },
		});
		expect(requestBodyAt(fetchMock, 1)).toMatchObject({
			sequence_slug: "pebbledesk-fulfillment-welcome",
		});
		expect(requestBodyAt(fetchMock, 2)).toMatchObject({
			sequence_slug: "pebbledesk-nurture-value-1",
		});
		expect(insert).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("does not throw or schedule signup trial emails when signup metadata is missing", async () => {
		const handler = vi.fn().mockResolvedValue(Response.json({ user: { id: "new-user" } }));
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const app = createAuthHandlerTestApp(createMockDb(), handler);

		const res = await app.request(
			"/api/auth/sign-up/email",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
			{ ...testBindings },
		);

		expect(res.status).toBe(200);
		expect(fetchMock).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	it("uses url-encoded signup request metadata when the auth response omits email and name", async () => {
		const handler = vi.fn().mockResolvedValue(Response.json({ user: { id: "new-user" } }));
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "director@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "welcome-run" } }))
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "sequencer-run" } }));
		vi.stubGlobal("fetch", fetchMock);
		const app = createAuthHandlerTestApp(createMockDb(), handler);

		const res = await app.request(
			"/api/auth/sign-up/email",
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					email: "director@example.com",
					name: "Dana Director",
					password: "secret-password",
				}).toString(),
			},
			{
				...testBindings,
				SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
				SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
				SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
			},
		);

		expect(res.status).toBe(200);
		expect(requestBodyAt(fetchMock, 0)).toMatchObject({
			product: "pebbledesk",
			email: "director@example.com",
			first_name: "Dana",
			properties: { userId: "new-user", source: "app-signup" },
		});
		vi.unstubAllGlobals();
	});

	it("logs and preserves successful signup responses when Sequencer enrollment fails", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const handler = vi
			.fn()
			.mockResolvedValue(Response.json({ user: { id: "new-user", email: "owner@example.com" } }));
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response("bad", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		const app = createAuthHandlerTestApp(createMockDb(), handler);

		const res = await app.request(
			"/api/auth/sign-up/email",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json" },
			{
				...testBindings,
				SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
				SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
				SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
			},
		);

		expect(res.status).toBe(200);
		expect(warn).toHaveBeenCalledWith(
			"Signup trial email queue write failed",
			"Sequencer contact upsert failed with 500: bad",
		);
		vi.unstubAllGlobals();
		warn.mockRestore();
	});

	it("skips login audit when malformed JSON prevents resolving a user", async () => {
		mockedResolveSessionUserId.mockReset();
		mockedResolveSessionUserId.mockResolvedValue(null);
		const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
		const insert = vi.fn();
		const app = new (await import("hono")).Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("db", createMockDb({ insert }) as never);
			c.set("auth", { handler } as never);
			await next();
		});
		mountAuth(app);

		const res = await app.request(
			"/api/auth/sign-in/email",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json" },
			testBindings,
		);

		expect(res.status).toBe(200);
		expect(insert).not.toHaveBeenCalled();
	});

	it("returns the raw verification response when resend-verification fails upstream", async () => {
		const handler = vi.fn().mockResolvedValue(new Response("upstream failed", { status: 502 }));
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								email: "owner@example.com",
								emailVerified: false,
							},
						]),
					}),
				}),
			}),
		});
		const app = createAuthHandlerTestApp(db, handler);

		const res = await app.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(res.status).toBe(502);
		expect(await res.text()).toBe("upstream failed");
	});

	it("rejects resend-verification when no user context or user record exists", async () => {
		mockedResolveSessionUserId.mockResolvedValueOnce(null).mockResolvedValueOnce("missing-user");
		const noContext = createTestApp(mountAuth, createMockDb(), { userId: "" });
		const missingUser = createTestApp(
			mountAuth,
			createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
					}),
				}),
			}),
			{ userId: "" },
		);

		const noContextRes = await noContext.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);
		const missingUserRes = await missingUser.request(
			"/api/auth/resend-verification",
			{ method: "POST" },
			testBindings,
		);

		expect(noContextRes.status).toBe(401);
		expect(missingUserRes.status).toBe(401);
	});

	it("rejects invalid or already accepted invitation accepts", async () => {
		const alreadyAcceptedDb = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce(selectLimitResult([{ emailVerified: true }]))
				.mockReturnValueOnce(
					selectLimitResult([
						{
							id: "b2b21234-0000-0000-0000-000000000002",
							centerId: "center-2",
							userId: "user-1",
							role: "director",
							acceptedAt: new Date("2026-04-09T11:00:00.000Z"),
						},
					]),
				),
		});
		const invalidApp = createTestApp(mountAuth, createMockDb());
		const alreadyAcceptedApp = createTestApp(mountAuth, alreadyAcceptedDb);

		const invalid = await invalidApp.request("/api/auth/invitations/not-an-id/accept", {
			method: "POST",
		});
		const alreadyAccepted = await alreadyAcceptedApp.request(
			"/api/auth/invitations/b2b21234-0000-0000-0000-000000000002/accept",
			{ method: "POST" },
		);

		expect(invalid.status).toBe(400);
		expect(alreadyAccepted.status).toBe(400);
	});
});
