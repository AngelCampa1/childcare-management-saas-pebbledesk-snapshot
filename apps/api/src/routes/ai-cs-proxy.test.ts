import type { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

vi.mock("../middleware/auth.js", () => ({
	requireAuth: createMiddleware(async (c, next) => {
		c.set("userId", "user-1");
		c.set("centerId", "center-1");
		c.set("role", "owner");
		await next();
	}),
}));

// Mock auth.api.getSession for escalation email lookup
vi.mock("@pebbledesk/auth", () => ({
	createAuth: vi.fn(),
}));

const {
	aiCsProxyRouter,
	assertSessionOwnership,
	buildAssertionPayload,
	buildEscalationTicket,
	buildForwardBody,
} = await import("./ai-cs-proxy.js");

const testEnv = {
	AI_CS_CLIENT_ASSERTION_SECRET: "client-secret",
	AI_CS_WORKER_ORIGIN: "https://ventora-ai-cs-worker.REPLACE_WITH_ACCOUNT_SUBDOMAIN.workers.dev",
	APP_URL: "https://my.pebbledesk.app",
};

function mountProxy(app: Hono<AppEnv>) {
	app.route("/api/ai-cs", aiCsProxyRouter);
}

/**
 * Returns a mock db whose select chain resolves to `rows` for ownership checks.
 * The insert chain still resolves to [].
 */
function createMockDbWithOwnership(rows: { sessionId: string }[]): ReturnType<typeof createMockDb> {
	const db = createMockDb();
	// Override select to return a chain that resolves to `rows`
	db.select = vi.fn().mockReturnValue({
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(rows),
			}),
		}),
	});
	return db;
}

describe("aiCsProxyRouter", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("POST /api/ai-cs/v1/sessions", () => {
		it("forwards session creation with server-owned appId and userId, signed headers", async () => {
			const mockDb = createMockDb();
			const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
				expect(url).toBe("https://ventora-ai-cs-worker.REPLACE_WITH_ACCOUNT_SUBDOMAIN.workers.dev/v1/sessions");
				expect(body).toMatchObject({
					appId: "pebbledesk",
					userId: "user-1",
					currentPath: "/dashboard",
					metadata: { centerId: "center-1", role: "owner" },
				});
				const headers = new Headers(init?.headers);
				expect(headers.get("X-Ventora-Timestamp")).toBeTruthy();
				expect(headers.get("X-Ventora-Nonce")).toBeTruthy();
				expect(headers.get("X-Ventora-Signature")).toMatch(/^[a-f0-9]{64}$/);
				expect(headers.get("Origin")).toBe("https://my.pebbledesk.app");
				expect(headers.get("Cookie")).toBeNull();
				return Response.json({ sessionId: "acs_1" }, { status: 201 });
			});
			vi.stubGlobal("fetch", fetchMock);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({
						appId: "evil",
						userId: "other",
						currentPath: "/dashboard",
					}),
					headers: { "Content-Type": "application/json", Cookie: "session=secret" },
				},
				testEnv,
			);

			expect(res.status).toBe(201);
			await expect(res.json()).resolves.toEqual({ sessionId: "acs_1" });
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("records ownership when upstream returns a sessionId", async () => {
			const mockDb = createMockDb();
			const insertValuesMock = vi
				.fn()
				.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
			mockDb.insert = vi.fn().mockReturnValue({ values: insertValuesMock });

			vi.stubGlobal(
				"fetch",
				vi.fn(async () => Response.json({ sessionId: "sess_x" }, { status: 201 })),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(201);
			await expect(res.json()).resolves.toEqual({ sessionId: "sess_x" });
			expect(insertValuesMock).toHaveBeenCalledWith(
				expect.objectContaining({ sessionId: "sess_x", userId: "user-1" }),
			);
		});

		it("returns upstream body unchanged when sessionId is missing from upstream response (no throw)", async () => {
			const mockDb = createMockDb();
			const insertValuesMock = vi.fn();
			mockDb.insert = vi.fn().mockReturnValue({ values: insertValuesMock });

			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify({ other: "field" }), { status: 201 })),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(201);
			await expect(res.json()).resolves.toEqual({ other: "field" });
			// Ownership insert not called because sessionId was absent
			expect(insertValuesMock).not.toHaveBeenCalled();
		});

		it("returns upstream body unchanged when upstream response is not valid JSON (no throw)", async () => {
			const mockDb = createMockDb();
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("not json", { status: 201 })),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(201);
			await expect(res.text()).resolves.toBe("not json");
		});

		it("returns 503 when AI_CS_CLIENT_ASSERTION_SECRET is missing", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = createTestApp(mountProxy, createMockDb());

			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				{ ...testEnv, AI_CS_CLIENT_ASSERTION_SECRET: undefined },
			);

			expect(res.status).toBe(503);
			await expect(res.json()).resolves.toEqual({ error: "AI support unavailable" });
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns 503 when AI_CS_WORKER_ORIGIN is missing", async () => {
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);
			const app = createTestApp(mountProxy, createMockDb());

			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				{ ...testEnv, AI_CS_WORKER_ORIGIN: undefined },
			);

			expect(res.status).toBe(503);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns 400 for malformed request body", async () => {
			vi.stubGlobal("fetch", vi.fn());
			const app = createTestApp(mountProxy, createMockDb());

			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: "not json",
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(400);
		});

		it("returns 502 when the upstream worker is unreachable", async () => {
			vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
			const app = createTestApp(mountProxy, createMockDb());

			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(502);
		});

		it("returns 502 when the upstream returns a non-ok status", async () => {
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 })),
			);
			const app = createTestApp(mountProxy, createMockDb());

			const res = await app.request(
				"/api/ai-cs/v1/sessions",
				{
					method: "POST",
					body: JSON.stringify({ currentPath: "/dashboard" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(502);
		});
	});

	describe("POST /api/ai-cs/v1/chat", () => {
		it("streams the SSE response unbuffered without exposing internal headers", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);

			vi.stubGlobal(
				"fetch",
				vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
					const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
					expect(body).toEqual({
						sessionId: "acs_1",
						message: "How do I check ratios?",
						currentPath: "/ratios",
					});
					return new Response('event: message.done\ndata: {"messageId":"m1"}\n\n', {
						status: 200,
						headers: {
							"Content-Type": "text/event-stream",
							"X-Internal": "hidden",
						},
					});
				}),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({
						sessionId: "acs_1",
						message: "How do I check ratios?",
						currentPath: "/ratios",
					}),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(200);
			expect(res.headers.get("Content-Type")).toContain("text/event-stream");
			expect(res.headers.get("X-Internal")).toBeNull();
			await expect(res.text()).resolves.toContain("message.done");
		});

		it("returns 404 when sessionId is not owned by authed user", async () => {
			// select returns [] — no ownership row
			const mockDb = createMockDbWithOwnership([]);
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "other-user-session", message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(404);
			await expect(res.json()).resolves.toEqual({ error: "Session not found" });
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns 400 when sessionId is missing from chat request", async () => {
			const mockDb = createMockDbWithOwnership([]);
			vi.stubGlobal("fetch", vi.fn());

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({ error: "Invalid request" });
		});

		it("returns 400 when sessionId is empty string in chat request", async () => {
			const mockDb = createMockDbWithOwnership([]);
			vi.stubGlobal("fetch", vi.fn());

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "", message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(400);
		});

		it("returns 404 when ownership db.select throws (fail closed)", async () => {
			const mockDb = createMockDb();
			mockDb.select = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockRejectedValue(new Error("db failure")),
					}),
				}),
			});
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "acs_1", message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(404);
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns 502 when the chat upstream returns a non-ok status", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response(JSON.stringify({ error: "rate limited" }), { status: 429 })),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "acs_1", message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(502);
		});

		it("propagates 404 from chat upstream so the widget can recover a stale session", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "stale_session" }]);
			vi.stubGlobal(
				"fetch",
				vi.fn(
					async () => new Response(JSON.stringify({ error: "session not found" }), { status: 404 }),
				),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/chat",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "stale_session", message: "Hi" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(404);
			const body = (await res.json()) as { error: string };
			expect(body).toHaveProperty("error");
		});
	});

	describe("POST /api/ai-cs/v1/escalations", () => {
		it("persists the escalation and forwards to worker when session is owned", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);
			const insertValuesMock = vi.fn().mockResolvedValue(undefined);
			mockDb.insert = vi.fn().mockReturnValue({ values: insertValuesMock });

			const fetchMock = vi.fn(async () =>
				Response.json({ escalationId: "esc_1", status: "queued" }, { status: 202 }),
			);
			vi.stubGlobal("fetch", fetchMock);

			const app = createTestApp(mountProxy, mockDb);
			// Mock auth.api.getSession for email lookup
			app.use("/api/ai-cs/v1/escalations", async (c, next) => {
				c.set("auth", {
					api: {
						getSession: async () => ({ user: { email: "director@example.com" } }),
					},
				} as never);
				await next();
			});

			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({
						sessionId: "acs_1",
						reason: "billing",
						contact: { email: "director@example.com" },
					}),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(202);
			expect(mockDb.insert).toHaveBeenCalled();
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("returns 404 when session is not owned — does not persist escalation, does not forward", async () => {
			const mockDb = createMockDbWithOwnership([]);
			const fetchMock = vi.fn();
			vi.stubGlobal("fetch", fetchMock);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "other-session", reason: "billing" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(404);
			await expect(res.json()).resolves.toEqual({ error: "Session not found" });
			// insert was not called for escalation persist
			expect(mockDb.insert).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalled();
		});

		it("returns 400 when sessionId is missing from escalation body", async () => {
			const mockDb = createMockDbWithOwnership([]);
			vi.stubGlobal("fetch", vi.fn());
			const app = createTestApp(mountProxy, mockDb);

			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({ reason: "billing" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(400);
		});

		it("still forwards to worker when db persist throws (best-effort)", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);
			mockDb.insert = vi.fn().mockReturnValue({
				values: vi.fn().mockRejectedValue(new Error("db error")),
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					Response.json({ escalationId: "esc_1", status: "queued" }, { status: 202 }),
				),
			);

			const app = createTestApp(mountProxy, mockDb);
			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "acs_1" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			// Forward still succeeded despite DB error
			expect(res.status).toBe(202);
		});

		it("still forwards when getSession returns null (email falls back to empty string)", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);
			mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					Response.json({ escalationId: "esc_1", status: "queued" }, { status: 202 }),
				),
			);

			const app = createTestApp(mountProxy, mockDb);
			app.use("/api/ai-cs/v1/escalations", async (c, next) => {
				c.set("auth", {
					api: { getSession: async () => null },
				} as never);
				await next();
			});

			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "acs_1" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(202);
		});

		it("still forwards when resolveUserEmail throws (best-effort)", async () => {
			const mockDb = createMockDbWithOwnership([{ sessionId: "acs_1" }]);
			mockDb.insert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
			vi.stubGlobal(
				"fetch",
				vi.fn(async () =>
					Response.json({ escalationId: "esc_1", status: "queued" }, { status: 202 }),
				),
			);

			const app = createTestApp(mountProxy, mockDb);
			// Mock auth.api.getSession to throw
			app.use("/api/ai-cs/v1/escalations", async (c, next) => {
				c.set("auth", {
					api: {
						getSession: async () => {
							throw new Error("auth error");
						},
					},
				} as never);
				await next();
			});

			const res = await app.request(
				"/api/ai-cs/v1/escalations",
				{
					method: "POST",
					body: JSON.stringify({ sessionId: "acs_1" }),
					headers: { "Content-Type": "application/json" },
				},
				testEnv,
			);

			expect(res.status).toBe(202);
		});
	});

	describe("assertSessionOwnership", () => {
		it("returns false when db.select is not a function", async () => {
			const badDb = {} as never;
			const result = await assertSessionOwnership(badDb, "sess_1", "user-1");
			expect(result).toBe(false);
		});
	});
});

describe("buildAssertionPayload", () => {
	it("produces a deterministic payload string", async () => {
		const payload = await buildAssertionPayload({
			timestamp: "2026-06-07T12:00:00.000Z",
			nonce: "test-nonce",
			method: "POST",
			path: "/v1/sessions",
			body: { appId: "pebbledesk", userId: "u1" },
		});
		expect(payload).toMatch(
			/^2026-06-07T12:00:00\.000Z\.test-nonce\.POST\.\/v1\/sessions\.[a-f0-9]{64}$/,
		);
	});

	it("produces the same hash for the same body regardless of key order", async () => {
		const a = await buildAssertionPayload({
			timestamp: "2026-06-07T12:00:00.000Z",
			nonce: "n",
			method: "POST",
			path: "/v1/sessions",
			body: { userId: "u1", appId: "pebbledesk" },
		});
		const b = await buildAssertionPayload({
			timestamp: "2026-06-07T12:00:00.000Z",
			nonce: "n",
			method: "POST",
			path: "/v1/sessions",
			body: { appId: "pebbledesk", userId: "u1" },
		});
		expect(a).toBe(b);
	});
});

describe("buildForwardBody", () => {
	describe("chat route", () => {
		it("strips extra client-injected keys and keeps only sessionId, message, currentPath", () => {
			const result = buildForwardBody(
				"chat",
				{
					sessionId: "s",
					message: "m",
					currentPath: "/x",
					userId: "attacker",
					centerId: "other",
					evil: true,
				},
				"server-user",
				{ centerId: "center-1", role: "owner" },
			);
			expect(result).toEqual({ sessionId: "s", message: "m", currentPath: "/x" });
		});

		it("omits currentPath when not present in client body", () => {
			const result = buildForwardBody("chat", { sessionId: "s", message: "m" }, "server-user", {
				centerId: "center-1",
				role: "owner",
			});
			expect(result).toEqual({ sessionId: "s", message: "m" });
		});
	});

	describe("escalations route", () => {
		it("strips extra client-injected keys and keeps only sessionId, reason, message, contact", () => {
			const result = buildForwardBody(
				"escalations",
				{ sessionId: "s", reason: "r", message: "m", contact: "c", userId: "attacker" },
				"server-user",
				{ centerId: "center-1", role: "owner" },
			);
			expect(result).toEqual({ sessionId: "s", reason: "r", message: "m", contact: "c" });
		});

		it("omits optional fields when not present, keeping only sessionId", () => {
			const result = buildForwardBody("escalations", { sessionId: "s" }, "server-user", {
				centerId: "center-1",
				role: "owner",
			});
			expect(result).toEqual({ sessionId: "s" });
		});

		it("includes optional fields selectively when only some are present", () => {
			const result = buildForwardBody(
				"escalations",
				{ sessionId: "s", reason: "billing" },
				"server-user",
				{},
			);
			expect(result).toEqual({ sessionId: "s", reason: "billing" });
		});
	});

	describe("sessions route (regression)", () => {
		it("builds sessions body with server-owned appId, userId, metadata and client currentPath", () => {
			const result = buildForwardBody(
				"sessions",
				{ currentPath: "/dashboard", appId: "evil", userId: "attacker" },
				"server-user",
				{ centerId: "center-1", role: "owner" },
			);
			expect(result).toEqual({
				appId: "pebbledesk",
				userId: "server-user",
				currentPath: "/dashboard",
				metadata: { centerId: "center-1", role: "owner" },
			});
		});

		it("omits metadata when ctx has no centerId or role", () => {
			const result = buildForwardBody("sessions", {}, "server-user", {});
			expect(result).toEqual({ appId: "pebbledesk", userId: "server-user" });
		});
	});
});

describe("buildEscalationTicket", () => {
	it("returns null when sessionId is missing", () => {
		expect(buildEscalationTicket({ reason: "billing" }, "u1")).toBeNull();
	});

	it("returns null when sessionId is empty string", () => {
		expect(buildEscalationTicket({ sessionId: "" }, "u1")).toBeNull();
	});

	it("builds a ticket with all optional fields", () => {
		const ticket = buildEscalationTicket(
			{
				sessionId: "acs_1",
				reason: "billing",
				message: "Need help",
				contact: { email: "x@example.com" },
			},
			"u1",
		);
		expect(ticket).toEqual({
			userId: "u1",
			sessionId: "acs_1",
			reason: "billing",
			message: "Need help",
			contact: JSON.stringify({ email: "x@example.com" }),
		});
	});

	it("omits optional fields when not provided", () => {
		const ticket = buildEscalationTicket({ sessionId: "acs_1" }, "u1");
		expect(ticket).toMatchObject({ userId: "u1", sessionId: "acs_1" });
		expect(ticket?.reason).toBeNull();
		expect(ticket?.message).toBeNull();
		expect(ticket?.contact).toBeNull();
	});
});
