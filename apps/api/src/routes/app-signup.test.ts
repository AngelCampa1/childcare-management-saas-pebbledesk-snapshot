import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { computeHmac } from "../lib/hmac.js";
import { createMockDb, createTestApp, testBindings } from "../test/setup.js";
import { appSignupRoutes } from "./app-signup.js";

function mountAppSignup(app: Hono<AppEnv>) {
	app.route("/api/app-signup", appSignupRoutes);
}

describe("app signup routes", () => {
	it("rejects unsubscribe requests missing the user or token", async () => {
		const insert = vi.fn();
		const db = createMockDb({ insert });
		const app = createTestApp(mountAppSignup, db);

		const res = await app.request("/api/app-signup/unsubscribe?userId=user-1");

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Missing userId or token" });
		expect(insert).not.toHaveBeenCalled();
	});

	it("rejects unsubscribe requests with an invalid token", async () => {
		const insert = vi.fn();
		const db = createMockDb({ insert });
		const app = createTestApp(mountAppSignup, db);

		const res = await app.request("/api/app-signup/unsubscribe?userId=user-1&token=invalid");

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Invalid token" });
		expect(insert).not.toHaveBeenCalled();
	});

	it.each(["GET", "POST"])("records app signup unsubscribe suppressions via %s", async (method) => {
		const run = vi.fn().mockResolvedValue({ success: true });
		const first = vi.fn().mockResolvedValue({ email: "owner@example.com" });
		const selectBind = vi.fn().mockReturnValue({ first });
		const updateBind = vi.fn().mockReturnValue({ run });
		const prepare = vi
			.fn()
			.mockReturnValueOnce({ bind: selectBind })
			.mockReturnValueOnce({ bind: updateBind });
		const marketingDb = { prepare } as unknown as D1Database;
		const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);
		const db = createMockDb();
		const app = createTestApp(mountAppSignup, db);
		const token = await computeHmac("app-signup:user-1", testBindings.UNSUBSCRIBE_SECRET);

		try {
			const res = await app.request(
				`/api/app-signup/unsubscribe?userId=user-1&token=${token}`,
				{
					method,
				},
				{
					MARKETING_DB: marketingDb,
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				},
			);

			expect(res.status).toBe(200);
			expect(prepare).toHaveBeenCalledWith(
				expect.stringContaining("marketing_app_signup_subscribers"),
			);
			expect(selectBind).toHaveBeenCalledWith("user-1");
			expect(updateBind).toHaveBeenCalledWith(
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				"unsubscribe_link",
				expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
				"user-1",
			);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://sequencer.ventoralabs.com/api/v1/unsubscribe",
				expect.objectContaining({ method: "POST" }),
			);
			expect(db.insert).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("rejects unsubscribe requests with missing or invalid HMAC metadata", async () => {
		const prepare = vi.fn();
		const marketingDb = { prepare } as unknown as D1Database;
		const app = createTestApp(mountAppSignup, createMockDb());

		const missing = await app.request("/api/app-signup/unsubscribe?userId=user-1", undefined, {
			MARKETING_DB: marketingDb,
		});
		const invalid = await app.request(
			"/api/app-signup/unsubscribe?userId=user-1&token=invalid",
			undefined,
			{ MARKETING_DB: marketingDb },
		);

		expect(missing.status).toBe(400);
		expect(invalid.status).toBe(400);
		expect(prepare).not.toHaveBeenCalled();
	});
});
