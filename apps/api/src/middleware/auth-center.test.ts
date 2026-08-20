import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";

vi.mock("@pebbledesk/db", () => ({
	createDb: vi.fn(),
	memberships: {},
}));

vi.mock("@pebbledesk/auth", () => ({
	createAuth: vi.fn(() => ({ handler: vi.fn(), api: { getSession: vi.fn() } })),
}));

const { requireCenter, requireRole, requirePermission } = await import("./auth.js");

function makeApp(centerId: string | undefined) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		if (centerId !== undefined) {
			c.set("centerId", centerId);
		}
		await next();
	});
	app.use("/test", requireCenter);
	app.get("/test", (c) => c.json({ ok: true }));
	app.onError((err, c) => {
		const maybe = err as { status?: number; message?: string };
		const status = (maybe.status ?? 500) as 403 | 500;
		return c.json({ error: maybe.message ?? "Error" }, status);
	});
	return app;
}

describe("requireCenter", () => {
	it("passes through when centerId is set", async () => {
		const app = makeApp("center-1");
		const res = await app.request("/test");
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true });
	});

	it("returns 403 when centerId is missing", async () => {
		const app = makeApp(undefined);
		const res = await app.request("/test");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("No center membership found");
	});

	it("returns 403 when centerId is an empty string", async () => {
		const app = makeApp("");
		const res = await app.request("/test");
		expect(res.status).toBe(403);
	});
});

function makeRoleApp(
	userRole: string | undefined,
	requiredRoles: Array<"owner" | "director" | "staff">,
) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		if (userRole !== undefined) {
			c.set("role", userRole as "owner" | "director" | "staff");
		}
		await next();
	});
	app.use("/test", requireRole(...requiredRoles));
	app.get("/test", (c) => c.json({ ok: true }));
	app.onError((err, c) => {
		const maybe = err as { status?: number; message?: string };
		const status = (maybe.status ?? 500) as 403 | 500;
		return c.json({ error: maybe.message ?? "Error" }, status);
	});
	return app;
}

describe("requireRole", () => {
	it("passes through when the user has a matching role", async () => {
		const app = makeRoleApp("owner", ["owner", "director"]);
		const res = await app.request("/test");
		expect(res.status).toBe(200);
	});

	it("returns 403 when the user role is not in the allowed list", async () => {
		const app = makeRoleApp("staff", ["owner", "director"]);
		const res = await app.request("/test");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Insufficient permissions");
	});

	it("returns 403 when no role is set", async () => {
		const app = makeRoleApp(undefined, ["owner"]);
		const res = await app.request("/test");
		expect(res.status).toBe(403);
	});
});

describe("requirePermission", () => {
	it("passes through when the role has the required permission", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("role", "owner");
			await next();
		});
		app.use("/test", requirePermission("members:invite"));
		app.get("/test", (c) => c.json({ ok: true }));
		app.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			return c.json({ error: maybe.message ?? "Error" }, (maybe.status ?? 500) as 403 | 500);
		});

		const res = await app.request("/test");
		expect(res.status).toBe(200);
	});

	it("returns 403 when the role does not have the required permission", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", async (c, next) => {
			c.set("role", "staff");
			await next();
		});
		app.use("/test", requirePermission("members:invite"));
		app.get("/test", (c) => c.json({ ok: true }));
		app.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			return c.json({ error: maybe.message ?? "Error" }, (maybe.status ?? 500) as 403 | 500);
		});

		const res = await app.request("/test");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Insufficient permissions");
	});

	it("returns 403 when no role is set", async () => {
		const app = new Hono<AppEnv>();
		app.use("/test", requirePermission("members:invite"));
		app.get("/test", (c) => c.json({ ok: true }));
		app.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			return c.json({ error: maybe.message ?? "Error" }, (maybe.status ?? 500) as 403 | 500);
		});

		const res = await app.request("/test");
		expect(res.status).toBe(403);
	});
});
