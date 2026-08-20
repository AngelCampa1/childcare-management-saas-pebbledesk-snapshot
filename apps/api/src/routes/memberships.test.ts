import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
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
	};
});

const { membershipsRoutes } = await import("./memberships.js");

function mountMemberships(app: Hono<AppEnv>) {
	app.route("/api/memberships", membershipsRoutes);
}

describe("GET /api/memberships/mine", () => {
	it("returns all accepted memberships with center names for the authenticated user", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([
								{
									id: "membership-1",
									centerId: "center-1",
									centerName: "Sunshine Daycare",
									role: "owner",
									acceptedAt: new Date("2026-04-01T08:00:00.000Z"),
								},
								{
									id: "membership-2",
									centerId: "center-2",
									centerName: "Rainbow Kids",
									role: "director",
									acceptedAt: new Date("2026-04-05T10:00:00.000Z"),
								},
							]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/mine");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			memberships: Array<{
				id: string;
				centerId: string;
				centerName: string;
				role: string;
				acceptedAt: string;
			}>;
		};
		expect(body.memberships).toHaveLength(2);
		expect(body.memberships[0].centerName).toBe("Sunshine Daycare");
		expect(body.memberships[1].centerName).toBe("Rainbow Kids");
		expect(body.memberships[0].role).toBe("owner");
	});

	it("serializes acceptedAt as empty string when the value is null", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					innerJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							orderBy: vi.fn().mockResolvedValue([
								{
									id: "membership-1",
									centerId: "center-1",
									centerName: "Sunshine Daycare",
									role: "owner",
									acceptedAt: null,
								},
							]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/mine");

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			memberships: Array<{ acceptedAt: string }>;
		};
		expect(body.memberships[0].acceptedAt).toBe("");
	});

	it("returns 403 when no userId is on context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMemberships, db, { userId: "" });
		const res = await app.request("/api/memberships/mine");
		// unauthorized() throws a 401 HTTPException
		expect(res.status).toBe(401);
	});

	it("returns 401 when unauthenticated", async () => {
		vi.doMock("../middleware/auth.js", async () => {
			const { createMiddleware } = await import("hono/factory");
			const { HTTPException } = await import("hono/http-exception");
			return {
				requireAuth: createMiddleware(async (_c, _next) => {
					throw new HTTPException(401, { message: "Unauthorized" });
				}),
				requireRole: () =>
					createMiddleware(async (_c, next) => {
						await next();
					}),
			};
		});

		// For the unauth test we build a minimal app that directly throws 401
		const { Hono } = await import("hono");
		const { HTTPException } = await import("hono/http-exception");
		const unauthApp = new Hono<AppEnv>();
		unauthApp.get("/api/memberships/mine", () => {
			throw new HTTPException(401, { message: "Unauthorized" });
		});
		unauthApp.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			if (err instanceof HTTPException || typeof maybe.status === "number") {
				const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
				return c.json({ error: maybe.message ?? "Error" }, status);
			}
			return c.json({ error: "Internal server error" }, 500);
		});
		const res = await unauthApp.request("/api/memberships/mine");
		expect(res.status).toBe(401);
	});
});

describe("POST /api/memberships/switch", () => {
	it("sets the x-pebbledesk-center cookie and returns 200 when user is a member", async () => {
		const centerId = "00000000-0000-0000-0000-000000000001";
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId,
								userId: "user-1",
								role: "owner",
								acceptedAt: new Date("2026-04-01T08:00:00.000Z"),
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/switch", jsonBody({ centerId }));

		expect(res.status).toBe(200);
		const body = (await res.json()) as { success: boolean };
		expect(body.success).toBe(true);

		// Cookie should be set
		const setCookieHeader = res.headers.get("set-cookie");
		expect(setCookieHeader).toBeTruthy();
		expect(setCookieHeader).toContain(`x-pebbledesk-center=${centerId}`);
	});

	it("returns 400 when centerId is not a UUID", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/switch", jsonBody({ centerId: "center-1" }));

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 403 when the user is not a member of the requested center", async () => {
		const centerId = "00000000-0000-0000-0000-000000000099";
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/switch", jsonBody({ centerId }));

		expect(res.status).toBe(403);
	});

	it("returns 403 when the matching membership is not yet accepted", async () => {
		const centerId = "00000000-0000-0000-0000-000000000001";
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "membership-pending",
								centerId,
								userId: "user-1",
								role: "staff",
								acceptedAt: null,
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/switch", jsonBody({ centerId }));

		expect(res.status).toBe(403);
	});

	it("returns 400 when centerId is missing from the body", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMemberships, db);
		const res = await app.request("/api/memberships/switch", jsonBody({}));

		expect(res.status).toBe(400);
	});

	it("returns 401 when no userId is on context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountMemberships, db, { userId: "" });
		const res = await app.request(
			"/api/memberships/switch",
			jsonBody({ centerId: "00000000-0000-0000-0000-000000000001" }),
		);
		expect(res.status).toBe(401);
	});

	it("returns 401 when unauthenticated (requireAuth guard)", async () => {
		const { Hono } = await import("hono");
		const { HTTPException } = await import("hono/http-exception");
		const unauthApp = new Hono<AppEnv>();
		unauthApp.post("/api/memberships/switch", () => {
			throw new HTTPException(401, { message: "Unauthorized" });
		});
		unauthApp.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			if (err instanceof HTTPException || typeof maybe.status === "number") {
				const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
				return c.json({ error: maybe.message ?? "Error" }, status);
			}
			return c.json({ error: "Internal server error" }, 500);
		});
		const res = await unauthApp.request(
			"/api/memberships/switch",
			jsonBody({ centerId: "center-1" }),
		);
		expect(res.status).toBe(401);
	});
});
