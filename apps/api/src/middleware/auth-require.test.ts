import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { requireAuth } from "./auth.js";

type MembershipRecord = {
	id: string;
	centerId: string;
	role: "owner" | "director" | "staff";
	acceptedAt: Date | null;
	createdAt: Date;
};

function createMembershipQuery(records: MembershipRecord[]) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockResolvedValue(records),
		}),
	};
}

function createApp(records: MembershipRecord[], userId = "user-1") {
	const app = new Hono<AppEnv>();
	const auth = {
		api: {
			getSession: vi.fn().mockResolvedValue({
				user: { id: userId },
			}),
		},
	};
	const db = {
		select: vi.fn().mockReturnValue(createMembershipQuery(records)),
	};

	app.use("*", async (c, next) => {
		c.set("auth", auth as never);
		c.set("db", db as never);
		await next();
	});
	app.use("*", requireAuth);
	app.get("/test", (c) =>
		c.json({
			userId: c.get("userId"),
			centerId: c.get("centerId"),
			membershipId: c.get("membershipId"),
			role: c.get("role"),
		}),
	);
	app.get("/api/memberships/mine", (c) => c.json({ ok: true, centerId: c.get("centerId") }));
	app.post("/api/memberships/switch", (c) => c.json({ ok: true, centerId: c.get("centerId") }));
	app.get("/api/overview/multi-center", (c) => c.json({ ok: true, centerId: c.get("centerId") }));

	return app;
}

describe("requireAuth", () => {
	it("returns 409 CENTER_SELECTION_REQUIRED for multi-center users without a cookie", async () => {
		const app = createApp([
			{
				id: "membership-invited",
				centerId: "center-invited",
				role: "staff",
				acceptedAt: null,
				createdAt: new Date("2026-04-01T00:00:00.000Z"),
			},
			{
				id: "membership-accepted",
				centerId: "center-accepted",
				role: "director",
				acceptedAt: new Date("2026-04-02T00:00:00.000Z"),
				createdAt: new Date("2026-04-02T00:00:00.000Z"),
			},
			{
				id: "membership-older-accepted",
				centerId: "center-older",
				role: "owner",
				acceptedAt: new Date("2026-03-30T00:00:00.000Z"),
				createdAt: new Date("2026-03-30T00:00:00.000Z"),
			},
		]);

		const res = await app.request("/test");

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; centers: unknown[] };
		expect(body.error).toBe("CENTER_SELECTION_REQUIRED");
		expect(body.centers).toHaveLength(2);
	});

	it("does not set tenancy context when the user only has pending invitations", async () => {
		const app = createApp([
			{
				id: "membership-pending",
				centerId: "center-pending",
				role: "staff",
				acceptedAt: null,
				createdAt: new Date("2026-04-01T00:00:00.000Z"),
			},
		]);

		const res = await app.request("/test");

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			userId: "user-1",
			centerId: undefined,
			membershipId: undefined,
			role: undefined,
		});
	});

	it("allows auth-only membership and multi-center overview routes without a selected center", async () => {
		const app = createApp([
			{
				id: "membership-one",
				centerId: "center-one",
				role: "owner",
				acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
				createdAt: new Date("2026-04-01T00:00:00.000Z"),
			},
			{
				id: "membership-two",
				centerId: "center-two",
				role: "director",
				acceptedAt: new Date("2026-04-02T00:00:00.000Z"),
				createdAt: new Date("2026-04-02T00:00:00.000Z"),
			},
		]);

		const mine = await app.request("/api/memberships/mine");
		const switchRes = await app.request("/api/memberships/switch", { method: "POST" });
		const overview = await app.request("/api/overview/multi-center");

		expect(mine.status).toBe(200);
		expect(switchRes.status).toBe(200);
		expect(overview.status).toBe(200);
		await expect(mine.json()).resolves.toEqual({ ok: true });
		await expect(switchRes.json()).resolves.toEqual({ ok: true });
		await expect(overview.json()).resolves.toEqual({ ok: true });
	});
});
