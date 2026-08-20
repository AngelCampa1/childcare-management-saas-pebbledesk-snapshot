import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { requestId } from "./request-id.js";

function buildApp() {
	const app = new Hono<AppEnv>();
	app.use("*", requestId);
	app.get("/test", (c) => c.json({ id: c.get("requestId") }));
	return app;
}

describe("requestId middleware", () => {
	it("generates a UUID and sets x-request-id header when none is provided", async () => {
		const app = buildApp();
		const res = await app.request("/test");

		expect(res.status).toBe(200);
		const header = res.headers.get("x-request-id");
		expect(header).toBeTruthy();
		// UUID format
		expect(header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	it("echoes a valid UUID x-request-id header from the incoming request", async () => {
		const app = buildApp();
		const incomingId = "550e8400-e29b-41d4-a716-446655440000";
		const res = await app.request("/test", {
			headers: { "x-request-id": incomingId },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("x-request-id")).toBe(incomingId);
	});

	it("ignores a malformed x-request-id and generates a fresh UUID", async () => {
		const app = buildApp();
		const malformedId = "my-custom-request-id-12345";
		const res = await app.request("/test", {
			headers: { "x-request-id": malformedId },
		});

		expect(res.status).toBe(200);
		const header = res.headers.get("x-request-id");
		// Must not echo the malformed value
		expect(header).not.toBe(malformedId);
		// Must be a valid UUID
		expect(header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	it("stores the request id on the context so handlers can read it", async () => {
		const app = buildApp();
		const incomingId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
		const res = await app.request("/test", {
			headers: { "x-request-id": incomingId },
		});

		const body = await res.json<{ id: string }>();
		expect(body.id).toBe(incomingId);
	});

	it("generates unique IDs for concurrent requests", async () => {
		const app = buildApp();
		const responses = await Promise.all([
			app.request("/test"),
			app.request("/test"),
			app.request("/test"),
		]);

		const ids = responses.map((r) => r.headers.get("x-request-id"));
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(3);
	});
});
