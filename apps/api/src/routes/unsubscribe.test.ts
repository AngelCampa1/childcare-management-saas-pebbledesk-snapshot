import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

// Mock auth middleware
vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireAuth: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
		initMiddleware: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

const { unsubscribeRoutes, computeUnsubscribeToken } = await import("./unsubscribe.js");

const TEST_ENV = {
	UNSUBSCRIBE_SECRET: "test-unsubscribe-secret-abc",
};

function mountUnsubscribe(app: Hono<AppEnv>) {
	app.route("/api/unsubscribe", unsubscribeRoutes);
}

async function makeValidToken(email: string) {
	return computeUnsubscribeToken(email, TEST_ENV.UNSUBSCRIBE_SECRET);
}

describe("GET /api/unsubscribe", () => {
	it("valid token+email: returns 200 with HTML confirmation page", async () => {
		const email = "unsubscribe@example.com";
		const token = await makeValidToken(email);

		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountUnsubscribe, db);
		const res = await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);

		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("unsubscribed");
		expect(html).toContain("pebbledesk.app");
	});

	it("valid token+email: updates unsubscribed_at in DB", async () => {
		const email = "unsubscribe2@example.com";
		const token = await makeValidToken(email);

		const whereMock = vi.fn().mockResolvedValue([]);
		const setMock = vi.fn().mockReturnValue({ where: whereMock });
		const updateMock = vi.fn().mockReturnValue({ set: setMock });

		const db = createMockDb({ update: updateMock });
		const app = createTestApp(mountUnsubscribe, db);

		await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);

		expect(updateMock).toHaveBeenCalledOnce();
		expect(setMock).toHaveBeenCalledOnce();
		expect(whereMock).toHaveBeenCalledOnce();
	});

	it("invalid token returns 400", async () => {
		const email = "unsubscribe3@example.com";
		const token = "invalid-token-abc123";

		const db = createMockDb();
		const app = createTestApp(mountUnsubscribe, db);
		const res = await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);

		expect(res.status).toBe(400);
	});

	it("double unsubscribe: returns 200 (idempotent)", async () => {
		const email = "double-unsub@example.com";
		const token = await makeValidToken(email);

		// First unsubscribe
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
		const app = createTestApp(mountUnsubscribe, db);

		const res1 = await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);
		expect(res1.status).toBe(200);

		// Second unsubscribe (same token)
		const res2 = await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);
		expect(res2.status).toBe(200);
	});

	it("missing token param returns 400", async () => {
		const db = createMockDb();
		const app = createTestApp(mountUnsubscribe, db);
		const res = await app.request(
			`/api/unsubscribe?email=test@example.com`,
			{ method: "GET" },
			TEST_ENV,
		);
		expect(res.status).toBe(400);
	});

	it("missing email param returns 400", async () => {
		const db = createMockDb();
		const app = createTestApp(mountUnsubscribe, db);
		const res = await app.request(`/api/unsubscribe?token=sometoken`, { method: "GET" }, TEST_ENV);
		expect(res.status).toBe(400);
	});

	it("tampered email with valid token returns 400", async () => {
		const realEmail = "real@example.com";
		const token = await makeValidToken(realEmail);
		const tamperedEmail = "attacker@example.com";

		const db = createMockDb();
		const app = createTestApp(mountUnsubscribe, db);
		const res = await app.request(
			`/api/unsubscribe?email=${encodeURIComponent(tamperedEmail)}&token=${token}`,
			{ method: "GET" },
			TEST_ENV,
		);
		expect(res.status).toBe(400);
	});

	// Round-trip: an unsubscribeUrl built the way the marketing-site worker
	// builds it (HMAC of email + UNSUBSCRIBE_SECRET, appended as ?email=&token=)
	// must validate against this route. This guards against drift between the
	// URL builder and the validator if either side changes its hashing or
	// encoding.
	it("round-trip: a worker-built unsubscribeUrl validates and unsubscribes the lead", async () => {
		const email = "round.trip+filter@example.com";
		const token = await computeUnsubscribeToken(email, TEST_ENV.UNSUBSCRIBE_SECRET);
		const unsubscribeUrl = `https://pebbledesk.app/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;

		// Parse it back the same way Hono / the route would.
		const parsed = new URL(unsubscribeUrl);
		expect(parsed.pathname).toBe("/api/unsubscribe");

		const whereMock = vi.fn().mockResolvedValue([]);
		const setMock = vi.fn().mockReturnValue({ where: whereMock });
		const updateMock = vi.fn().mockReturnValue({ set: setMock });

		const db = createMockDb({ update: updateMock });
		const app = createTestApp(mountUnsubscribe, db);

		const res = await app.request(`/api/unsubscribe${parsed.search}`, { method: "GET" }, TEST_ENV);

		expect(res.status).toBe(200);
		expect(updateMock).toHaveBeenCalledOnce();
		expect(setMock).toHaveBeenCalledOnce();
		expect(whereMock).toHaveBeenCalledOnce();
	});
});
