import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createTestApp } from "../test/setup.js";
import {
	buildHmacPayload,
	buildPebbleDeskAppContext,
	signHmacPayload,
	verifyHmacSignature,
} from "./ai-cs-context.js";

const { aiCsContextRouter } = await import("./ai-cs-context.js");

const TEST_SECRET = "test-context-secret-32-chars-long!";
const APP_ID = "pebbledesk";

function mountContext(app: Hono<AppEnv>) {
	app.route("/api/ai-cs", aiCsContextRouter);
}

function makeMockD1(rows: number = 1): D1Database {
	return {
		prepare: vi.fn().mockReturnValue({
			bind: vi.fn().mockReturnValue({
				run: vi.fn().mockResolvedValue({
					success: true,
					meta: { changes: rows },
				}),
			}),
		}),
	} as unknown as D1Database;
}

async function signedContextRequest(
	path: string,
	secret: string,
	overrides?: Partial<{ timestamp: string; nonce: string; appId: string; userId: string }>,
) {
	const timestamp = overrides?.timestamp ?? new Date().toISOString();
	const nonce = overrides?.nonce ?? crypto.randomUUID();
	const appId = overrides?.appId ?? APP_ID;
	const userId = overrides?.userId ?? "user-1";

	const payload = await buildHmacPayload({
		timestamp,
		nonce,
		method: "GET",
		path,
		body: { appId, userId },
	});
	const signature = await signHmacPayload(payload, secret);

	return {
		headers: {
			"X-Ventora-Timestamp": timestamp,
			"X-Ventora-Nonce": nonce,
			"X-Ventora-Signature": signature,
		},
		params: `?appId=${appId}&userId=${userId}`,
	};
}

describe("aiCsContextRouter GET /api/ai-cs/context", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns 404 for unknown appId", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const nonceDb = makeMockD1();
		const res = await app.request(
			"/api/ai-cs/context?appId=other&userId=u1",
			{ method: "GET" },
			{
				AI_CS_CONTEXT_SECRET: TEST_SECRET,
				AI_CS_NONCE_DB: nonceDb,
			},
		);
		expect(res.status).toBe(404);
	});

	it("returns 503 when AI_CS_CONTEXT_SECRET is missing", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const res = await app.request(
			`/api/ai-cs/context?appId=${APP_ID}&userId=u1`,
			{ method: "GET" },
			{ AI_CS_CONTEXT_SECRET: undefined, AI_CS_NONCE_DB: makeMockD1() },
		);
		expect(res.status).toBe(503);
	});

	it("returns 503 when AI_CS_NONCE_DB is missing", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const res = await app.request(
			`/api/ai-cs/context?appId=${APP_ID}&userId=u1`,
			{ method: "GET" },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: undefined },
		);
		expect(res.status).toBe(503);
	});

	it("returns 401 when userId query param is missing", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const res = await app.request(
			`/api/ai-cs/context?appId=${APP_ID}`,
			{ method: "GET" },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: makeMockD1() },
		);
		expect(res.status).toBe(401);
	});

	it("returns 401 when HMAC headers are missing", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const res = await app.request(
			`/api/ai-cs/context?appId=${APP_ID}&userId=u1`,
			{ method: "GET" },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: makeMockD1() },
		);
		expect(res.status).toBe(401);
	});

	it("returns 401 when signature is invalid", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const queryString = `?appId=${APP_ID}&userId=user-1`;
		const { headers } = await signedContextRequest(
			`/api/ai-cs/context${queryString}`,
			"wrong-secret",
		);
		const res = await app.request(
			`/api/ai-cs/context${queryString}`,
			{ method: "GET", headers },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: makeMockD1() },
		);
		expect(res.status).toBe(401);
	});

	it("returns 200 with signed context for a valid request", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const basePath = `/api/ai-cs/context?appId=${APP_ID}&userId=user-1`;
		const { headers } = await signedContextRequest(basePath, TEST_SECRET);

		const res = await app.request(
			basePath,
			{ method: "GET", headers },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: makeMockD1() },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.assistantId).toBe("ai-cs");
		expect(body.appId).toBe(APP_ID);
		expect(body.appName).toBe("PebbleDesk");
		expect(body.authenticatedOnly).toBe(true);
		expect(Array.isArray(body.sources)).toBe(true);
		expect(Array.isArray(body.navigation)).toBe(true);
		expect(Array.isArray(body.workflow)).toBe(true);
		expect(res.headers.get("X-Ventora-Timestamp")).toBeTruthy();
		expect(res.headers.get("X-Ventora-Nonce")).toBeTruthy();
		expect(res.headers.get("X-Ventora-Signature")).toMatch(/^[a-f0-9]{64}$/);
		expect(res.headers.get("Cache-Control")).toBe("private, max-age=300");
	});

	it("returns 503 when the nonce database throws (D1 error)", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const basePath = `/api/ai-cs/context?appId=${APP_ID}&userId=user-1`;
		const { headers } = await signedContextRequest(basePath, TEST_SECRET);

		const brokenDb = {
			prepare: vi.fn().mockReturnValue({
				bind: vi.fn().mockReturnValue({
					run: vi.fn().mockRejectedValue(new Error("D1 error")),
				}),
			}),
		} as unknown as D1Database;

		const res = await app.request(
			basePath,
			{ method: "GET", headers },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: brokenDb },
		);
		expect(res.status).toBe(503);
	});

	it("returns 401 when nonce replay is detected (changes === 0)", async () => {
		const app = createTestApp(mountContext, undefined as never);
		const basePath = `/api/ai-cs/context?appId=${APP_ID}&userId=user-1`;
		const { headers } = await signedContextRequest(basePath, TEST_SECRET);

		const replayNonceDb = makeMockD1(0); // 0 changes = duplicate nonce

		const res = await app.request(
			basePath,
			{ method: "GET", headers },
			{ AI_CS_CONTEXT_SECRET: TEST_SECRET, AI_CS_NONCE_DB: replayNonceDb },
		);
		expect(res.status).toBe(401);
	});
});

describe("buildPebbleDeskAppContext", () => {
	it("returns a valid context shape", () => {
		const ctx = buildPebbleDeskAppContext();
		expect(ctx.assistantId).toBe("ai-cs");
		expect(ctx.appId).toBe("pebbledesk");
		expect(ctx.authenticatedOnly).toBe(true);
		expect(ctx.sources.length).toBeGreaterThan(0);
		expect(ctx.navigation.length).toBeGreaterThan(0);
		expect(ctx.workflow.length).toBeGreaterThan(0);
		for (const source of ctx.sources) {
			expect(typeof source.id).toBe("string");
			expect(typeof source.title).toBe("string");
			expect(source.url).toMatch(/^https?:\/\//);
			expect(typeof source.excerpt).toBe("string");
		}
		for (const nav of ctx.navigation) {
			expect(typeof nav.label).toBe("string");
			expect(nav.path).toMatch(/^\//);
		}
		for (const step of ctx.workflow) {
			expect(step.status).toBe("next");
			expect(step.path).toMatch(/^\//);
		}
	});
});

describe("verifyHmacSignature", () => {
	it("returns true for a valid signature within skew window", async () => {
		const payload = "test-payload";
		const sig = await signHmacPayload(payload, TEST_SECRET);
		const result = await verifyHmacSignature({
			payload,
			signature: sig,
			secret: TEST_SECRET,
			timestamp: new Date().toISOString(),
		});
		expect(result).toBe(true);
	});

	it("returns false for a wrong secret", async () => {
		const payload = "test-payload";
		const sig = await signHmacPayload(payload, "wrong-secret");
		const result = await verifyHmacSignature({
			payload,
			signature: sig,
			secret: TEST_SECRET,
			timestamp: new Date().toISOString(),
		});
		expect(result).toBe(false);
	});

	it("returns false when timestamp is outside the 5-minute skew window", async () => {
		const payload = "test-payload";
		const oldTimestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
		const sig = await signHmacPayload(payload, TEST_SECRET);
		const result = await verifyHmacSignature({
			payload,
			signature: sig,
			secret: TEST_SECRET,
			timestamp: oldTimestamp,
		});
		expect(result).toBe(false);
	});

	it("returns false for a malformed signature", async () => {
		const result = await verifyHmacSignature({
			payload: "test",
			signature: "not-hex!!!",
			secret: TEST_SECRET,
			timestamp: new Date().toISOString(),
		});
		expect(result).toBe(false);
	});
});
