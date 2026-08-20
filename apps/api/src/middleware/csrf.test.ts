import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createCsrfMiddleware } from "./csrf.js";

function makeEnv(appUrl: string): AppEnv["Bindings"] {
	return { APP_URL: appUrl } as AppEnv["Bindings"];
}

function makeApp(appUrl = "https://my.pebbledesk.app") {
	const app = new Hono<AppEnv>();
	app.use("*", createCsrfMiddleware());
	app.get("/api/data", (c) => c.json({ ok: true }));
	app.post("/api/data", (c) => c.json({ ok: true }));
	app.put("/api/data", (c) => c.json({ ok: true }));
	app.delete("/api/data", (c) => c.json({ ok: true }));
	app.post("/api/auth/sign-in", (c) => c.json({ ok: true }));
	app.post("/api/stripe/webhook", (c) => c.json({ ok: true }));
	app.post("/api/public/invoices/pay", (c) => c.json({ ok: true }));
	app.post("/api/leads", (c) => c.json({ ok: true }));
	app.post("/api/unsubscribe", (c) => c.json({ ok: true }));
	app.post("/api/app-signup/unsubscribe", (c) => c.json({ ok: true }));

	async function request(path: string, init?: RequestInit) {
		return app.request(path, init, makeEnv(appUrl));
	}

	return { request };
}

describe("createCsrfMiddleware — safe methods", () => {
	it("GET passes through regardless of foreign origin", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "GET",
			headers: { origin: "https://evil.example.com" },
		});
		expect(res.status).toBe(200);
	});

	it("HEAD passes through regardless of origin", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "HEAD",
			headers: { origin: "https://evil.example.com" },
		});
		// HEAD returns 200 but no body — just checking it's not 403
		expect(res.status).not.toBe(403);
	});

	it("OPTIONS passes through regardless of origin", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "OPTIONS",
			headers: { origin: "https://evil.example.com" },
		});
		// OPTIONS may return 200 or 404 depending on routing, but not 403
		expect(res.status).not.toBe(403);
	});
});

describe("createCsrfMiddleware — X-Requested-With allow-list", () => {
	it("POST with X-Requested-With: fetch still rejects foreign origins", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "POST",
			headers: {
				origin: "https://evil.example.com",
				"x-requested-with": "fetch",
			},
		});
		expect(res.status).toBe(403);
	});

	it("POST with X-Requested-With: fetch passes after origin validation", async () => {
		const { request } = makeApp("https://my.pebbledesk.app");
		const res = await request("/api/data", {
			method: "POST",
			headers: {
				origin: "https://my.pebbledesk.app",
				"x-requested-with": "fetch",
			},
		});
		expect(res.status).toBe(200);
	});
});

describe("createCsrfMiddleware — no-origin same-origin requests", () => {
	it("POST with no origin header passes (same-origin browser request)", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "POST",
		});
		expect(res.status).toBe(200);
	});
});

describe("createCsrfMiddleware — allowed origins", () => {
	it("POST with allowed production origin passes", async () => {
		const { request } = makeApp("https://my.pebbledesk.app");
		const res = await request("/api/data", {
			method: "POST",
			headers: { origin: "https://my.pebbledesk.app" },
		});
		expect(res.status).toBe(200);
	});

	it("PUT with allowed origin passes", async () => {
		const { request } = makeApp("https://my.pebbledesk.app");
		const res = await request("/api/data", {
			method: "PUT",
			headers: { origin: "https://my.pebbledesk.app" },
		});
		expect(res.status).toBe(200);
	});
});

describe("createCsrfMiddleware — blocked foreign origins", () => {
	it("POST with foreign origin returns 403", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "POST",
			headers: { origin: "https://evil.example.com" },
		});
		expect(res.status).toBe(403);
		const body = await res.json();
		expect(body).toEqual({ error: "Forbidden" });
	});

	it("DELETE with foreign origin returns 403", async () => {
		const { request } = makeApp();
		const res = await request("/api/data", {
			method: "DELETE",
			headers: { origin: "https://attacker.io" },
		});
		expect(res.status).toBe(403);
	});
});

describe("createCsrfMiddleware — bypass prefixes", () => {
	it("POST to /api/auth/... bypasses origin check", async () => {
		const { request } = makeApp();
		const res = await request("/api/auth/sign-in", {
			method: "POST",
			headers: { origin: "https://evil.example.com" },
		});
		// Should not be 403 — BetterAuth handles its own verification
		expect(res.status).not.toBe(403);
	});

	it("POST to /api/stripe/... bypasses origin check", async () => {
		const { request } = makeApp();
		const res = await request("/api/stripe/webhook", {
			method: "POST",
			headers: { origin: "https://stripe.com" },
		});
		expect(res.status).not.toBe(403);
	});

	it("POST to /api/public/... bypasses origin check", async () => {
		const { request } = makeApp();
		const res = await request("/api/public/invoices/pay", {
			method: "POST",
			headers: { origin: "https://evil.example.com" },
		});
		expect(res.status).not.toBe(403);
	});

	it("POST to /api/leads bypasses origin check (public marketing endpoint)", async () => {
		const { request } = makeApp();
		const res = await request("/api/leads", {
			method: "POST",
			headers: { origin: "https://pebbledesk.app" },
		});
		expect(res.status).not.toBe(403);
	});

	it("POST to /api/unsubscribe bypasses origin check (public marketing endpoint)", async () => {
		const { request } = makeApp();
		const res = await request("/api/unsubscribe", {
			method: "POST",
			headers: { origin: "https://pebbledesk.app" },
		});
		expect(res.status).not.toBe(403);
	});

	it("POST to /api/app-signup/unsubscribe bypasses origin check", async () => {
		const { request } = makeApp();
		const res = await request("/api/app-signup/unsubscribe", {
			method: "POST",
			headers: { origin: "https://email.example.com" },
		});
		expect(res.status).not.toBe(403);
	});
});

describe("createCsrfMiddleware — dev loopback origins", () => {
	it("POST from localhost is allowed when APP_URL is localhost", async () => {
		const { request } = makeApp("http://localhost:3040");
		const res = await request("/api/data", {
			method: "POST",
			headers: { origin: "http://localhost:3040" },
		});
		expect(res.status).toBe(200);
	});

	it("POST from 127.0.0.1 is allowed when APP_URL is localhost (loopback sibling)", async () => {
		const { request } = makeApp("http://localhost:3040");
		const res = await request("/api/data", {
			method: "POST",
			headers: { origin: "http://127.0.0.1:3040" },
		});
		expect(res.status).toBe(200);
	});
});
