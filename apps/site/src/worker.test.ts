import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sentrySpies = vi.hoisted(() => ({
	captureException: vi.fn(),
	setTag: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
	captureException: sentrySpies.captureException,
	withScope: vi.fn((callback: (scope: { setTag: typeof sentrySpies.setTag }) => void) => {
		callback({ setTag: sentrySpies.setTag });
	}),
	withSentry: vi.fn(
		(options: ((env: { SENTRY_DSN?: string }) => unknown) | unknown, worker: unknown) => {
			// Exercise the DSN-config factory both ways so its branches are covered.
			if (typeof options === "function") {
				(options as (env: { SENTRY_DSN?: string }) => unknown)({ SENTRY_DSN: "dsn" });
				(options as (env: { SENTRY_DSN?: string }) => unknown)({});
			}
			return worker;
		},
	),
}));

vi.mock("@pebbledesk/emails", () => ({
	MAGNET_TRACKS: {
		"licensing-compliance-checklist": "compliance",
		"brightwheel-cost-calculator": "buying",
	},
	getTrackForMagnet: (slug: string) =>
		slug === "brightwheel-cost-calculator" ? "buying" : "compliance",
	renderTemplate: vi.fn().mockResolvedValue({
		html: "<p>Email</p>",
		text: "Email",
		subject: "PebbleDesk guide",
	}),
}));

vi.mock("./worker/email.js", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
}));

function requestBodyAt(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
	const call = fetchMock.mock.calls[callIndex];
	expect(call).toBeDefined();
	const init = call?.[1] as RequestInit | undefined;
	expect(init?.body).toBeDefined();
	return JSON.parse(String(init?.body));
}

const { default: worker, computeUnsubscribeToken } = await import("./worker.js");
const { renderTemplate } = await import("@pebbledesk/emails");
const { sendEmail } = await import("./worker/email.js");

const retiredScheduledSendTable = ["marketing", "scheduled", "sends"].join("_");

type StatementResult = {
	results?: unknown[];
	success?: boolean;
	meta?: { changes?: number };
};

class MockD1Database {
	readonly calls: Array<{ sql: string; bindings: unknown[] }> = [];
	private readonly queue: StatementResult[] = [];
	private readonly failures: string[] = [];
	private readonly exhaustedRateKeys: string[] = [];
	private duplicateDownload = false;

	enqueue(result: StatementResult) {
		this.queue.push(result);
	}

	failWhenSqlIncludes(fragment: string) {
		this.failures.push(fragment);
	}

	/**
	 * Pre-exhaust any token-bucket whose key contains `keyFragment` (e.g.
	 * `"lead-ip:"` or `"lead-email:"`) so the next `consumeRateLimit` rejects.
	 */
	exhaustRateLimit(keyFragment: string) {
		this.exhaustedRateKeys.push(keyFragment);
	}

	/** Make the download-audit insert conflict, i.e. a repeat (email, magnet). */
	simulateDuplicateDownload() {
		this.duplicateDownload = true;
	}

	private record(sql: string, bindings: unknown[]) {
		this.calls.push({ sql, bindings });
		const failure = this.failures.find((fragment) => sql.includes(fragment));
		if (failure) {
			throw new Error(`D1 failure for ${failure}`);
		}
	}

	prepare(sql: string) {
		const db = this;
		return {
			bind(...bindings: unknown[]) {
				return {
					async first<T>() {
						db.record(sql, bindings);
						// Rate-limit lookups bypass the FIFO queue: return an exhausted
						// bucket for pre-armed keys, otherwise null (a fresh bucket).
						if (sql.includes("marketing_rate_limits")) {
							const key = String(bindings[0] ?? "");
							const exhausted = db.exhaustedRateKeys.some((fragment) => key.includes(fragment));
							return (exhausted ? { tokens: 0, updated_at: Date.now() } : null) as T | null;
						}
						// The download-audit INSERT ... RETURNING also bypasses the queue:
						// a new (lead, magnet) returns a row; a duplicate returns null.
						if (sql.includes("marketing_lead_magnet_downloads")) {
							return (db.duplicateDownload ? null : { id: "download-1" }) as T | null;
						}
						const result = db.queue.shift();
						return (result?.results?.[0] ?? null) as T | null;
					},
					async all<T>() {
						db.record(sql, bindings);
						const result = db.queue.shift();
						return { results: result?.results as T[] | undefined };
					},
					async run<T>() {
						db.record(sql, bindings);
						// Rate-limit writes bypass the FIFO queue so the queue stays
						// reserved for marketing_leads writes the tests assert on.
						if (sql.includes("marketing_rate_limits")) {
							const key = String(sql.includes("INSERT OR IGNORE") ? bindings[0] : bindings[5]);
							const exhausted = db.exhaustedRateKeys.some((fragment) => key.includes(fragment));
							if (sql.includes("INSERT OR IGNORE")) {
								return { success: true, meta: { changes: exhausted ? 0 : 1 } } as T;
							}
							if (bindings.length === 10) {
								return { success: true, meta: { changes: exhausted ? 0 : 1 } } as T;
							}
							return { success: true, meta: { changes: 1 } } as T;
						}
						const result = db.queue.shift();
						return {
							success: result?.success ?? true,
							meta: result?.meta ?? { changes: 1 },
						} as T;
					},
				};
			},
		};
	}
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
	return new Request("https://pebbledesk.app/api/leads", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

function apiJsonRequest(path: string, body: unknown): Request {
	return new Request(`https://pebbledesk.app${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

function env(
	db = new MockD1Database(),
	overrides: Partial<{
		RESEND_API_KEY: string;
		MARKETING_FROM_EMAIL: string;
		R2_PUBLIC_URL: string;
		UNSUBSCRIBE_SECRET: string;
		SENTRY_DSN: string;
		SEQUENCER_BASE_URL: string;
		SEQUENCER_CF_ACCESS_CLIENT_ID: string;
		SEQUENCER_CF_ACCESS_CLIENT_SECRET: string;
		AI_SDR_CONTEXT_SECRET: string;
		TURNSTILE_SECRET_KEY: string;
		ENVIRONMENT: string;
		POSTHOG_PROJECT_API_KEY: string;
		POSTHOG_HOST: string;
	}> = {},
) {
	return {
		MARKETING_DB: db,
		ASSETS: { fetch: vi.fn().mockResolvedValue(new Response("asset")) },
		RESEND_API_KEY: "re_test_key",
		MARKETING_FROM_EMAIL: "angel.campa@pebbledesk.app",
		R2_PUBLIC_URL: "https://cdn.pebbledesk.app",
		UNSUBSCRIBE_SECRET: "test-secret",
		SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0",
		...overrides,
	};
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(payload: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function aiSdrSignedHeaders(path: string, secret: string, productId = "pebbledesk") {
	const timestamp = new Date().toISOString();
	const nonce = "ai-sdr-nonce";
	const bodyHash = await sha256Hex(stableJson({ productId }));
	const payload = `${timestamp}.${nonce}.GET.${path}.${bodyHash}`;
	return {
		"X-Ventora-Timestamp": timestamp,
		"X-Ventora-Nonce": nonce,
		"X-Ventora-Signature": await hmacHex(payload, secret),
	};
}

type TestEnv = ReturnType<typeof env>;
const testWorker = worker as unknown as {
	fetch: (request: Request, env: TestEnv, ctx?: ExecutionContext) => Promise<Response>;
};

const payload = {
	email: "Jane@Example.com",
	firstName: "Jane",
	magnetSlug: "licensing-compliance-checklist",
	sourcePage: "/free/licensing-compliance-checklist",
	utmSource: "google",
	utmMedium: "cpc",
	utmCampaign: "spring",
};

beforeEach(() => {
	vi.clearAllMocks();
});

function posthogBodies(fetchMock: ReturnType<typeof vi.fn>) {
	return fetchMock.mock.calls
		.filter(([url]) => String(url) === "https://us.i.posthog.com/capture/")
		.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

describe("marketing Worker lead capture", () => {
	it("permanently redirects www requests to the HTTPS apex host with path and query intact", async () => {
		const res = await testWorker.fetch(
			new Request("https://www.pebbledesk.app/resources/?utm_source=test"),
			env(),
		);

		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://pebbledesk.app/resources/?utm_source=test");
	});

	it("permanently redirects HTTP apex requests to HTTPS apex", async () => {
		const res = await testWorker.fetch(new Request("http://pebbledesk.app/pricing/"), env());

		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://pebbledesk.app/pricing/");
	});

	it("canonicalizes API requests before routing them", async () => {
		const res = await testWorker.fetch(
			new Request("http://www.pebbledesk.app/api/leads", { method: "OPTIONS" }),
			env(),
		);

		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://pebbledesk.app/api/leads");
	});

	it("redirects sitemap.xml to the sitemap index", async () => {
		const res = await testWorker.fetch(new Request("https://pebbledesk.app/sitemap.xml"), env());

		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://pebbledesk.app/sitemap-index.xml");
	});

	it("canonicalizes HTTP sitemap.xml directly to the HTTPS sitemap index", async () => {
		const res = await testWorker.fetch(new Request("http://pebbledesk.app/sitemap.xml"), env());

		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://pebbledesk.app/sitemap-index.xml");
	});

	it("does not redirect unrelated sitemap.xml hosts to the production apex", async () => {
		const testEnv = env();
		const res = await testWorker.fetch(new Request("http://localhost:4321/sitemap.xml"), testEnv);

		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledOnce();
	});

	it("passes canonical non-API requests through to static assets", async () => {
		const testEnv = env();
		const res = await testWorker.fetch(new Request("https://pebbledesk.app/about/"), testEnv);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe("asset");
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledOnce();
	});

	it("keeps customer directory paths out of the indexable static surface", async () => {
		for (const path of ["/customers", "/customers/"]) {
			const testEnv = env();
			const res = await testWorker.fetch(new Request(`https://pebbledesk.app${path}`), testEnv);

			expect(res.status).toBe(404);
			expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
			expect(testEnv.ASSETS.fetch).not.toHaveBeenCalled();
		}
	});

	it("serves the branded 404 asset for missing static pages", async () => {
		const testEnv = env();
		vi.mocked(testEnv.ASSETS.fetch).mockImplementation(async (request) => {
			const url = new URL(request.url);
			if (url.pathname === "/404") {
				return new Response("<h1>This page is not part of the current record.</h1>", {
					headers: { "content-type": "text/html; charset=utf-8" },
				});
			}
			return new Response("not found", { status: 404 });
		});

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/definitely-missing-e2e-20260507/"),
			testEnv,
		);

		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("text/html");
		await expect(res.text()).resolves.toContain("This page is not part of the current record.");
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledTimes(2);
		expect(vi.mocked(testEnv.ASSETS.fetch).mock.calls[1][0].url).toBe("https://pebbledesk.app/404");
	});

	it("adds X-Robots-Tag headers only to non-indexable static assets", async () => {
		for (const path of [
			"/lead-magnets/licensing-compliance-checklist.pdf",
			"/lead-magnets/licensing-compliance-checklist-cover.png",
			"/free/licensing-compliance-checklist/print/",
		]) {
			const res = await testWorker.fetch(new Request(`https://pebbledesk.app${path}`), env());

			expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
		}
	});

	it("keeps AI-readable discovery and pricing files indexable", async () => {
		for (const path of ["/pricing.md", "/pricing.txt", "/llms.txt", "/llms-full.txt"]) {
			const res = await testWorker.fetch(new Request(`https://pebbledesk.app${path}`), env());

			expect(res.headers.get("x-robots-tag")).toBeNull();
		}
	});

	it("sets machine-readable content types when serving controlled SEO assets", async () => {
		for (const [path, contentType] of [
			["/sitemap-index.xml", "application/xml; charset=utf-8"],
			["/llms.txt", "text/plain; charset=utf-8"],
			["/llms-full.txt", "text/plain; charset=utf-8"],
			["/pricing.md", "text/markdown; charset=utf-8"],
			["/pricing.txt", "text/plain; charset=utf-8"],
		]) {
			const testEnv = env();
			vi.mocked(testEnv.ASSETS.fetch).mockResolvedValueOnce(
				new Response("asset", { headers: { "content-type": "text/html" } }),
			);

			const res = await testWorker.fetch(new Request(`https://pebbledesk.app${path}`), testEnv);

			expect(res.headers.get("content-type")).toBe(contentType);
		}
	});

	it("does not redirect unrelated HTTP hosts to the production apex", async () => {
		const testEnv = env();
		const res = await testWorker.fetch(new Request("http://localhost:4321/about/"), testEnv);

		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledOnce();
	});

	it("stores lead capture in D1 and sends the immediate welcome email without Neon", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const res = await testWorker.fetch(
			jsonRequest(payload),
			env(db, {
				POSTHOG_PROJECT_API_KEY: "phc_test",
				POSTHOG_HOST: "https://us.i.posthog.com",
			}),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			ok: true,
			downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
			emailed: true,
			recordedDownload: true,
			scheduled: false,
		});
		expect(db.calls.some((call) => call.sql.includes("marketing_leads"))).toBe(true);
		expect(db.calls.some((call) => call.sql.includes(retiredScheduledSendTable))).toBe(false);
		expect(db.calls.flatMap((call) => call.bindings)).toContain("jane@example.com");
		expect(renderTemplate).toHaveBeenCalledWith(
			"nurture-0-welcome",
			expect.objectContaining({
				firstName: "Jane",
				magnetSlug: "licensing-compliance-checklist",
			}),
		);
		expect(sendEmail).toHaveBeenCalledOnce();
		const callArgs = vi.mocked(sendEmail).mock.calls[0][0];
		expect(callArgs.to).toBe("jane@example.com");
		expect(callArgs.from).toBe("angel.campa@pebbledesk.app");
		expect(callArgs.apiKey).toBe("re_test_key");
		expect(callArgs.headers).toBeUndefined();
		expect(posthogBodies(fetchMock)).toEqual([
			expect.objectContaining({
				event: "lead_magnet_submission",
				distinct_id: expect.stringMatching(/^marketing_lead:[a-f0-9]{64}$/),
				properties: {
					source_app: "site",
					result: "success",
					lead_type: "lead_magnet",
					magnet_slug: "licensing-compliance-checklist",
					page_path: "/free/licensing-compliance-checklist",
					utm_source: "google",
					utm_medium: "cpc",
					utm_campaign: "spring",
				},
			}),
		]);
	});

	it("schedules lead capture analytics on the provided execution context", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const waitUntilPromises: Array<Promise<unknown>> = [];
		const executionContext = {
			waitUntil: vi.fn((promise: Promise<unknown>) => {
				waitUntilPromises.push(promise);
			}),
		} as unknown as ExecutionContext;

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://us.i.posthog.com",
				}),
				executionContext,
			);

			expect(res.status).toBe(200);
			expect(executionContext.waitUntil).toHaveBeenCalledOnce();
			await Promise.all(waitUntilPromises);
			expect(posthogBodies(fetchMock)).toEqual([
				expect.objectContaining({
					event: "lead_magnet_submission",
					distinct_id: expect.stringMatching(/^marketing_lead:[a-f0-9]{64}$/),
				}),
			]);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("keeps lead capture working when PostHog capture fails", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("posthog unavailable"));
		vi.stubGlobal("fetch", fetchMock);
		const waitUntilPromises: Array<Promise<unknown>> = [];
		const executionContext = {
			waitUntil: vi.fn((promise: Promise<unknown>) => {
				waitUntilPromises.push(promise);
			}),
		} as unknown as ExecutionContext;

		try {
			const res = await testWorker.fetch(
				jsonRequest({ ...payload, sourcePage: "http://[" }),
				env(db, {
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://us.i.posthog.com",
				}),
				executionContext,
			);

			expect(res.status).toBe(200);
			await expect(Promise.all(waitUntilPromises)).resolves.toEqual([false]);
			expect(fetchMock).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("enrolls lead captures in the central Sequencer when credentials are configured", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "jane@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "run-1" } }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com/",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: true });
			expect(fetchMock).toHaveBeenNthCalledWith(
				1,
				"https://sequencer.ventoralabs.com/api/v1/contacts",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"CF-Access-Client-Id": "client-id",
						"CF-Access-Client-Secret": "client-secret",
					}),
				}),
			);
			expect(requestBodyAt(fetchMock, 0)).toMatchObject({
				product: "pebbledesk",
				email: "jane@example.com",
				properties: { magnetSlug: "licensing-compliance-checklist" },
			});
			expect(requestBodyAt(fetchMock, 1)).toMatchObject({
				product: "pebbledesk",
				email: "jane@example.com",
				sequence_slug: "pebbledesk-nurture-compliance",
				properties: { contactId: "contact-1" },
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it.each([
		["licensing-compliance-checklist", "pebbledesk-nurture-compliance"],
		["ccdf-billing-error-prevention", "pebbledesk-nurture-billing"],
		["childcare-software-pricing-comparison", "pebbledesk-nurture-buying"],
		["childcare-staff-handbook-template", "pebbledesk-nurture-hr"],
	])("routes magnet %s to sequence %s in the Sequencer enrollment", async (magnetSlug, expectedSequenceSlug) => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "jane@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "run-1" } }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest({
					email: "jane@example.com",
					firstName: "Jane",
					magnetSlug,
					sourcePage: `/free/${magnetSlug}`,
				}),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com/",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);
			expect(res.status).toBe(200);
			expect(requestBodyAt(fetchMock, 1)).toMatchObject({
				sequence_slug: expectedSequenceSlug,
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("does not send or schedule for an unsubscribed D1 lead", async () => {
		const db = new MockD1Database();
		db.enqueue({
			results: [
				{
					id: "existing-lead",
					email: "jane@example.com",
					firstName: "Jane",
					unsubscribedAt: "2026-04-28T00:00:00.000Z",
					createdAt: "2026-04-27T00:00:00.000Z",
				},
			],
		});
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://us.i.posthog.com",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({
				ok: true,
				emailed: false,
				scheduled: false,
			});
			expect(sendEmail).not.toHaveBeenCalled();
			expect(db.calls.some((call) => call.sql.includes(retiredScheduledSendTable))).toBe(false);
			expect(posthogBodies(fetchMock)).toEqual([
				expect.objectContaining({
					event: "lead_magnet_submission",
					properties: expect.objectContaining({
						result: "success",
						reason: "unsubscribed",
					}),
				}),
			]);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("keeps lead capture working with a direct download when email secrets are missing", async () => {
		const db = new MockD1Database();
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					RESEND_API_KEY: "",
					UNSUBSCRIBE_SECRET: "",
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://us.i.posthog.com",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({
				ok: true,
				downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
				emailed: false,
				recordedDownload: true,
				scheduled: false,
			});
			expect(sendEmail).not.toHaveBeenCalled();
			expect(db.calls.some((call) => call.sql.includes(retiredScheduledSendTable))).toBe(false);
			expect(posthogBodies(fetchMock)).toEqual([
				expect.objectContaining({
					event: "lead_magnet_submission",
					properties: expect.objectContaining({
						result: "success",
						reason: "email_config_missing",
					}),
				}),
			]);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("returns a validation error for malformed lead payloads", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/leads", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
			env(db),
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "invalid_lead_payload" });
		expect(db.calls).toHaveLength(0);
	});

	it("rejects semantically invalid lead payloads before touching D1", async () => {
		const db = new MockD1Database();

		for (const body of [
			null,
			{ email: "not-an-email", magnetSlug: "licensing-compliance-checklist" },
			{ email: "jane@example.com", magnetSlug: 123 },
			{ email: "jane@example.com", magnetSlug: "unknown-guide" },
		]) {
			const res = await testWorker.fetch(jsonRequest(body), env(db));
			expect(res.status).toBe(400);
		}

		expect(db.calls).toHaveLength(0);
	});

	it("accepts minimal lead capture payloads and normalizes blank optional fields", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			jsonRequest({
				email: "minimal@example.com",
				firstName: "   ",
				magnetSlug: "brightwheel-cost-calculator",
			}),
			env(db),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: false });
		expect(renderTemplate).toHaveBeenCalledWith(
			"nurture-0-welcome",
			expect.objectContaining({
				firstName: undefined,
				magnetTitle: "Brightwheel Cost Calculator",
			}),
		);
		expect(db.calls.flatMap((call) => call.bindings)).toContain(null);
	});

	it("does not enqueue old local schedules for duplicate leads that are still subscribed", async () => {
		const db = new MockD1Database();
		db.enqueue({
			results: [
				{
					id: "old-lead",
					email: "jane@example.com",
					firstName: null,
					unsubscribedAt: null,
					createdAt: "2026-04-27T00:00:00.000Z",
				},
			],
		});

		const res = await testWorker.fetch(
			jsonRequest({
				email: "jane@example.com",
				magnetSlug: "licensing-compliance-checklist",
			}),
			env(db),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: false });
		expect(db.calls.some((call) => call.sql.includes(retiredScheduledSendTable))).toBe(false);
	});

	it("fails closed and skips the welcome email when the download audit errors", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		db.failWhenSqlIncludes("marketing_lead_magnet_downloads");

		try {
			const res = await testWorker.fetch(jsonRequest(payload), env(db));

			// The audit insert is the only signal that a (lead, magnet) is genuinely
			// new. If it errors we cannot prove novelty, so we fail closed: serve the
			// direct download but send and enroll nothing.
			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({
				ok: true,
				downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
				emailed: false,
				recordedDownload: false,
				scheduled: false,
			});
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet download audit failed:",
				expect.any(Error),
			);
			expect(sendEmail).not.toHaveBeenCalled();
			expect(sentrySpies.captureException).toHaveBeenCalledTimes(1);
			expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "lead-download-audit");
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});

	it("keeps the download available when only the welcome email send fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend unavailable"));

		try {
			const res = await testWorker.fetch(jsonRequest(payload), env(db));

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({
				ok: true,
				downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
				emailed: false,
				recordedDownload: true,
				scheduled: false,
			});
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet welcome email failed:",
				expect.any(Error),
			);
			expect(sentrySpies.captureException).toHaveBeenCalledTimes(1);
			expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "lead-welcome-email");
		} finally {
			consoleErrorSpy.mockRestore();
		}
	});

	it("treats a honeypot submission as a silent no-op with no DB writes or email", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			jsonRequest({ ...payload, company_website: "https://spam.example" }),
			env(db),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			ok: true,
			downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
			emailed: false,
			recordedDownload: false,
			scheduled: false,
		});
		// No DB access at all — the bot gets a success-shaped response with no tell.
		expect(db.calls).toHaveLength(0);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("does not re-send for a repeat (email, magnet) download", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		db.simulateDuplicateDownload();

		const res = await testWorker.fetch(jsonRequest(payload), env(db));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			ok: true,
			downloadUrl: "https://cdn.pebbledesk.app/lead-magnets/licensing-compliance-checklist.pdf",
			emailed: false,
			recordedDownload: false,
			scheduled: false,
		});
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects with 429 once the per-IP token bucket is exhausted", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("lead-ip:");

		const res = await testWorker.fetch(
			jsonRequest(payload, { "cf-connecting-ip": "203.0.113.9" }),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(res.headers.get("access-control-allow-origin")).toBe("*");
		// Rejected before any lead is written or any email is sent.
		expect(db.calls.some((call) => call.sql.includes("marketing_leads"))).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects with 429 once the per-email token bucket is exhausted even on a fresh IP", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("lead-email:");

		const res = await testWorker.fetch(
			jsonRequest(payload, { "cf-connecting-ip": "203.0.113.10" }),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(db.calls.some((call) => call.sql.includes("marketing_leads"))).toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("rejects with 403 when Turnstile verification fails in production", async () => {
		const db = new MockD1Database();
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: false }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest({ ...payload, turnstileToken: "bad-token" }),
				env(db, { ENVIRONMENT: "production", TURNSTILE_SECRET_KEY: "ts-secret" }),
			);

			expect(res.status).toBe(403);
			await expect(res.json()).resolves.toEqual({ error: "verification_failed" });
			expect(res.headers.get("access-control-allow-origin")).toBe("*");
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(db.calls.some((call) => call.sql.includes("marketing_leads"))).toBe(false);
			// Turnstile runs before the per-email throttle, so a failed challenge must
			// never consume a legitimate visitor's email token bucket.
			expect(
				db.calls.some((call) =>
					call.bindings.some((binding) => String(binding).includes("lead-email:")),
				),
			).toBe(false);
			expect(sendEmail).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("fails closed with 403 when the Turnstile secret is missing in production", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest({ ...payload, turnstileToken: "tok" }),
				env(db, { ENVIRONMENT: "production", TURNSTILE_SECRET_KEY: "" }),
			);

			expect(res.status).toBe(403);
			await expect(res.json()).resolves.toEqual({ error: "verification_failed" });
			// No siteverify call is possible without a secret; we reject locally.
			expect(fetchMock).not.toHaveBeenCalled();
			expect(sendEmail).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
			consoleErrorSpy.mockRestore();
		}
	});

	it("keeps the capture successful when Sequencer enrollment fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response("bad", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: false });
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet Sequencer enrollment failed:",
				expect.any(Error),
			);
			expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
			expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "lead-sequencer-enrollment");
		} finally {
			vi.unstubAllGlobals();
			consoleErrorSpy.mockRestore();
		}
	});

	it("marks a D1 lead unsubscribed with a valid token", async () => {
		const db = new MockD1Database();
		db.enqueue({ meta: { changes: 1 } });
		const token = await computeUnsubscribeToken("jane@example.com", "test-secret");

		const res = await testWorker.fetch(
			new Request(`https://pebbledesk.app/api/unsubscribe?email=jane@example.com&token=${token}`),
			env(db),
		);

		expect(res.status).toBe(200);
		expect(await res.text()).toContain("You've been unsubscribed");
		expect(db.calls[0].sql).toContain("UPDATE marketing_leads");
		expect(db.calls[0].bindings).toContain("jane@example.com");
	});

	it("suppresses the central Sequencer run when a lead unsubscribes", async () => {
		const db = new MockD1Database();
		db.enqueue({ meta: { changes: 1 } });
		const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ ok: true }));
		vi.stubGlobal("fetch", fetchMock);
		const token = await computeUnsubscribeToken("jane@example.com", "test-secret");

		try {
			const res = await testWorker.fetch(
				new Request(`https://pebbledesk.app/api/unsubscribe?email=jane@example.com&token=${token}`),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			expect(fetchMock).toHaveBeenCalledWith(
				"https://sequencer.ventoralabs.com/api/v1/unsubscribe",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"CF-Access-Client-Id": "client-id",
						"CF-Access-Client-Secret": "client-secret",
					}),
				}),
			);
			expect(requestBodyAt(fetchMock, 0)).toMatchObject({
				product: "pebbledesk",
				email: "jane@example.com",
				scope: "product",
				reason: "unsubscribe_link",
			});
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("logs central Sequencer unsubscribe failures without blocking local unsubscribe", async () => {
		const db = new MockD1Database();
		db.enqueue({ meta: { changes: 1 } });
		const fetchMock = vi.fn().mockRejectedValueOnce(new Error("sequencer unavailable"));
		vi.stubGlobal("fetch", fetchMock);
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const token = await computeUnsubscribeToken("jane@example.com", "test-secret");

		try {
			const res = await testWorker.fetch(
				new Request(`https://pebbledesk.app/api/unsubscribe?email=jane@example.com&token=${token}`),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			expect(await res.text()).toContain("You've been unsubscribed");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet Sequencer unsubscribe failed:",
				expect.any(Error),
			);
			expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		} finally {
			vi.unstubAllGlobals();
			consoleErrorSpy.mockRestore();
		}
	});

	it("rejects invalid unsubscribe tokens before touching D1", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/unsubscribe?email=jane@example.com&token=bad"),
			env(db),
		);

		expect(res.status).toBe(400);
		expect(db.calls).toHaveLength(0);
	});

	it("rejects unsubscribe requests missing required parameters before touching D1", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/unsubscribe?email=jane@example.com"),
			env(db),
		);

		expect(res.status).toBe(400);
		expect(db.calls).toHaveLength(0);
	});

	it("handles lead-capture preflight and falls back to static assets", async () => {
		const testEnv = env(new MockD1Database());
		const options = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/leads", { method: "OPTIONS" }),
			testEnv,
		);
		const asset = await testWorker.fetch(new Request("https://pebbledesk.app/pricing/"), testEnv);

		expect(options.status).toBe(204);
		expect(asset.status).toBe(200);
		expect(await asset.text()).toBe("asset");
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledOnce();
	});

	it("returns a request ID and captures unexpected 5xx failures", async () => {
		const db = new MockD1Database();
		db.failWhenSqlIncludes("marketing_leads");

		const res = await testWorker.fetch(jsonRequest(payload), env(db));
		const body = (await res.json()) as { error: string; requestId: string };

		expect(res.status).toBe(500);
		expect(body.error).toBe("internal_error");
		expect(body.requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
		);
		expect(res.headers.get("x-request-id")).toBe(body.requestId);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(expect.any(Error));
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "request");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("request_id", body.requestId);
	});

	it("proceeds and forwards the client IP when Turnstile succeeds in production", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(
					{ ...payload, turnstileToken: "good-token" },
					{ "cf-connecting-ip": "198.51.100.5" },
				),
				env(db, { ENVIRONMENT: "production", TURNSTILE_SECRET_KEY: "ts-secret" }),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({
				ok: true,
				emailed: true,
				recordedDownload: true,
			});
			expect(fetchMock).toHaveBeenCalledTimes(1);
			const form = fetchMock.mock.calls[0][1].body as FormData;
			expect(form.get("response")).toBe("good-token");
			expect(form.get("remoteip")).toBe("198.51.100.5");
			expect(sendEmail).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("treats a blank honeypot field as a legitimate submission", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });

		const res = await testWorker.fetch(jsonRequest({ ...payload, company_website: "" }), env(db));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ ok: true, emailed: true });
		expect(sendEmail).toHaveBeenCalledOnce();
	});

	it("enrolls a brand-new lead with no first name in the Sequencer", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-9", email: "noname@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "run-9" } }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest({ email: "noname@example.com", magnetSlug: "licensing-compliance-checklist" }),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: true });
			expect(requestBodyAt(fetchMock, 0)).toMatchObject({ email: "noname@example.com" });
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("treats an unparseable Sequencer contact body as an enrollment failure", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		// 200 OK but a non-JSON body: contactResponse.json() rejects, the `.catch`
		// falls back to `{}`, and the missing contact id aborts enrollment.
		const fetchMock = vi.fn().mockResolvedValueOnce(new Response("not json", { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: false });
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet Sequencer enrollment failed:",
				expect.any(Error),
			);
		} finally {
			vi.unstubAllGlobals();
			consoleErrorSpy.mockRestore();
		}
	});

	it("surfaces a Sequencer error response even when its body cannot be read", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		// A 500 whose .text() rejects exercises the assertSequencerOk body `.catch`.
		const brokenResponse = {
			ok: false,
			status: 500,
			text: () => Promise.reject(new Error("stream error")),
		} as unknown as Response;
		const fetchMock = vi.fn().mockResolvedValueOnce(brokenResponse);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const res = await testWorker.fetch(
				jsonRequest(payload),
				env(db, {
					SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com",
					SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
					SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
				}),
			);

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toMatchObject({ ok: true, scheduled: false });
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"Lead magnet Sequencer enrollment failed:",
				expect.any(Error),
			);
		} finally {
			vi.unstubAllGlobals();
			consoleErrorSpy.mockRestore();
		}
	});

	it("returns the original 404 response when the branded 404 asset is also missing", async () => {
		const testEnv = env();
		vi.mocked(testEnv.ASSETS.fetch).mockResolvedValue(new Response("missing", { status: 404 }));

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/definitely-missing-page/"),
			testEnv,
		);

		expect(res.status).toBe(404);
		expect(testEnv.ASSETS.fetch).toHaveBeenCalledTimes(2);
	});

	it("skips Sentry capture on a 5xx when no DSN is configured", async () => {
		const db = new MockD1Database();
		db.failWhenSqlIncludes("marketing_leads");

		const res = await testWorker.fetch(jsonRequest(payload), env(db, { SENTRY_DSN: "" }));

		expect(res.status).toBe(500);
		expect(sentrySpies.captureException).not.toHaveBeenCalled();
	});
});

describe("marketing Worker public signup flow", () => {
	it("stores a public signup and returns referral plus survey metadata", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		db.enqueue({ results: [{ nextPosition: 7 }] });
		db.enqueue({ success: true });
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await testWorker.fetch(
			apiJsonRequest("/api/signup", {
				email: "Director@Example.com",
				sourcePage: "/pricing",
				utmSource: "google",
				utmMedium: "cpc",
				utmCampaign: "spring",
				referredBy: "partner-one",
			}),
			env(db, {
				POSTHOG_PROJECT_API_KEY: "phc_test",
				POSTHOG_HOST: "https://us.i.posthog.com",
			}),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({
			ok: true,
			referralCode: expect.stringMatching(/^pd_[a-z0-9]{10}$/),
			position: 7,
			surveyToken: expect.stringMatching(/^sv_[a-z0-9]{32}$/),
		});
		expect(db.calls.some((call) => call.sql.includes("marketing_public_signups"))).toBe(true);
		expect(db.calls.flatMap((call) => call.bindings)).toContain("director@example.com");
		expect(db.calls.flatMap((call) => call.bindings)).toContain("/pricing");
		const [capture] = posthogBodies(fetchMock);
		expect(capture).toEqual(
			expect.objectContaining({
				event: "public_signup_submission",
				distinct_id: expect.stringMatching(/^marketing_signup:[a-f0-9]{64}$/),
				properties: {
					source_app: "site",
					result: "success",
					lead_type: "waitlist",
					page_path: "/pricing",
					utm_source: "google",
					utm_medium: "cpc",
					utm_campaign: "spring",
					position: 7,
				},
			}),
		);
	});

	it("stores a minimal public signup with nullable attribution fields", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });
		db.enqueue({ results: [{ nextPosition: 1 }] });
		db.enqueue({ success: true });

		const res = await testWorker.fetch(
			apiJsonRequest("/api/signup", {
				email: "minimal@example.com",
			}),
			env(db),
		);

		expect(res.status).toBe(200);
		expect(db.calls.some((call) => call.sql.includes("marketing_public_signups"))).toBe(true);
		const signupInsert = db.calls.find((call) =>
			call.sql.includes("INSERT INTO marketing_public_signups"),
		);
		expect(signupInsert?.bindings.slice(5, 10)).toEqual([null, null, null, null, null]);
	});

	it("does not disclose survey or referral metadata for duplicate signup emails", async () => {
		const db = new MockD1Database();
		db.enqueue({
			results: [
				{
					id: "signup-existing",
					email: "director@example.com",
					referralCode: "pd_existing1",
					surveyToken: "sv_existingtoken0000000000000000",
					position: 3,
				},
			],
		});

		const res = await testWorker.fetch(
			apiJsonRequest("/api/signup", {
				email: "director@example.com",
				sourcePage: "/",
			}),
			env(db),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true });
		expect(
			db.calls.filter((call) => call.sql.includes("INSERT INTO marketing_public_signups")),
		).toHaveLength(0);
	});

	it("rate limits public signup attempts by client IP before writing signups", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("signup-ip:");

		const res = await testWorker.fetch(
			apiJsonRequest("/api/signup", {
				email: "director@example.com",
				sourcePage: "/",
			}),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(db.calls.some((call) => call.sql.includes("marketing_public_signups"))).toBe(false);
	});

	it("rate limits public signup attempts by email before writing signups", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("signup-email:");

		const res = await testWorker.fetch(
			apiJsonRequest("/api/signup", {
				email: "director@example.com",
				sourcePage: "/",
			}),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(db.calls.some((call) => call.sql.includes("SELECT COALESCE(MAX(position)"))).toBe(false);
	});

	it("rejects malformed public signup JSON before touching D1", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/signup", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
			env(db),
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "invalid_signup_payload" });
		expect(db.calls).toHaveLength(0);
	});

	it("stores survey answers for a valid public signup survey token", async () => {
		const db = new MockD1Database();
		db.enqueue({
			results: [{ id: "signup-1", surveySubmittedAt: null }],
		});
		db.enqueue({ success: true });
		db.enqueue({ success: true });
		db.enqueue({ success: true });
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const res = await testWorker.fetch(
			apiJsonRequest("/api/survey", {
				surveyToken: "sv_validtoken00000000000000000000",
				answers: [
					{ questionId: "role", answer: "Owner" },
					{ questionId: "capacity", answer: "51-100" },
				],
			}),
			env(db, {
				POSTHOG_PROJECT_API_KEY: "phc_test",
				POSTHOG_HOST: "https://us.i.posthog.com",
			}),
		);

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true });
		expect(
			db.calls.filter((call) => call.sql.includes("INSERT INTO marketing_public_survey_answers")),
		).toHaveLength(2);
		expect(db.calls.flatMap((call) => call.bindings)).toContain("role");
		expect(db.calls.flatMap((call) => call.bindings)).toContain("Owner");
		expect(posthogBodies(fetchMock)).toEqual([
			expect.objectContaining({
				event: "public_survey_submission",
				distinct_id: expect.stringMatching(/^marketing_survey_signup:[a-f0-9]{64}$/),
				properties: {
					source_app: "site",
					result: "success",
					field_count: 2,
				},
			}),
		]);
		expect(JSON.stringify(posthogBodies(fetchMock))).not.toContain("signup-1");
	});

	it("rejects invalid public signup payloads before touching D1", async () => {
		const db = new MockD1Database();

		for (const body of [null, { email: "not-an-email", sourcePage: "/" }, { sourcePage: "/" }]) {
			const res = await testWorker.fetch(apiJsonRequest("/api/signup", body), env(db));
			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({ error: "invalid_signup_payload" });
		}

		expect(db.calls).toHaveLength(0);
	});

	it("rejects invalid public survey payloads before touching D1", async () => {
		const db = new MockD1Database();

		for (const body of [
			null,
			{ surveyToken: "bad", answers: [{ questionId: "role", answer: "Owner" }] },
			{ surveyToken: 123, answers: [{ questionId: "role", answer: "Owner" }] },
			{ surveyToken: "sv_validtoken00000000000000000000", answers: [] },
			{
				surveyToken: "sv_validtoken00000000000000000000",
				answers: [
					{ questionId: "role", answer: "Owner" },
					{ questionId: "role", answer: "Director" },
				],
			},
		]) {
			const res = await testWorker.fetch(apiJsonRequest("/api/survey", body), env(db));
			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({ error: "invalid_survey_payload" });
		}

		expect(db.calls).toHaveLength(0);
	});

	it("rejects malformed public survey JSON before touching D1", async () => {
		const db = new MockD1Database();

		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/survey", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{",
			}),
			env(db),
		);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "invalid_survey_payload" });
		expect(db.calls).toHaveLength(0);
	});

	it("returns not found for an unknown public survey token", async () => {
		const db = new MockD1Database();
		db.enqueue({ results: [] });

		const res = await testWorker.fetch(
			apiJsonRequest("/api/survey", {
				surveyToken: "sv_unknown0000000000000000000000",
				answers: [{ questionId: "role", answer: "Owner" }],
			}),
			env(db),
		);

		expect(res.status).toBe(404);
		await expect(res.json()).resolves.toEqual({ error: "survey_token_not_found" });
	});

	it("rate limits public survey token probes before looking up the token", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("survey-token:");

		const res = await testWorker.fetch(
			apiJsonRequest("/api/survey", {
				surveyToken: "sv_unknown0000000000000000000000",
				answers: [{ questionId: "role", answer: "Owner" }],
			}),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(db.calls.some((call) => call.sql.includes("FROM marketing_public_signups"))).toBe(false);
	});

	it("rate limits public survey probes by client IP even when tokens rotate", async () => {
		const db = new MockD1Database();
		db.exhaustRateLimit("survey-ip:");

		const res = await testWorker.fetch(
			apiJsonRequest("/api/survey", {
				surveyToken: "sv_rotating00000000000000000000",
				answers: [{ questionId: "role", answer: "Owner" }],
			}),
			env(db),
		);

		expect(res.status).toBe(429);
		await expect(res.json()).resolves.toEqual({ error: "rate_limited" });
		expect(db.calls.some((call) => call.sql.includes("FROM marketing_public_signups"))).toBe(false);
	});

	it("treats already submitted public survey answers as an idempotent duplicate", async () => {
		const db = new MockD1Database();
		db.enqueue({
			results: [{ id: "signup-1", surveySubmittedAt: "2026-05-26T17:00:00.000Z" }],
		});

		const res = await testWorker.fetch(
			apiJsonRequest("/api/survey", {
				surveyToken: "sv_submitted0000000000000000000",
				answers: [{ questionId: "role", answer: "Owner" }],
			}),
			env(db),
		);

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({ ok: true });
		expect(
			db.calls.filter((call) => call.sql.includes("INSERT INTO marketing_public_survey_answers")),
		).toHaveLength(0);
	});

	it("handles public signup and survey CORS preflight requests", async () => {
		for (const path of ["/api/signup", "/api/survey"]) {
			const res = await testWorker.fetch(
				new Request(`https://pebbledesk.app${path}`, { method: "OPTIONS" }),
				env(),
			);

			expect(res.status).toBe(204);
			expect(res.headers.get("access-control-allow-origin")).toBe("*");
		}
	});

	it("does not make public signup position globally unique in the D1 migration", () => {
		const migrationPath = fileURLToPath(
			new URL("../migrations/0005_public_signup_survey.sql", import.meta.url),
		);
		const migration = readFileSync(migrationPath, "utf8");

		expect(migration).not.toContain("position INTEGER NOT NULL UNIQUE");
	});
});

describe("marketing Worker AI-SDR product context endpoint", () => {
	it("returns current pricing and limited offer fields from shared billing constants", async () => {
		const secret = "test-ai-sdr-secret";
		const path = "/api/ai-sdr/product-context?productId=pebbledesk";
		const res = await testWorker.fetch(
			new Request(`https://pebbledesk.app${path}`, {
				headers: await aiSdrSignedHeaders(path, secret),
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: secret }),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			productId: string;
			plans: Array<{
				id: string;
				price: string;
				monthlyPrice: string;
				annualPrice: string;
				renewalPrice: string;
				monthlyRenewalPrice: string;
				annualRenewalPrice: string;
				promotions: {
					monthly: { code: string; terms: string; renewalPrice: string; ctaUrl: string };
					annual: { code: string; terms: string; renewalPrice: string; ctaUrl: string };
				};
				defaultCadence: string;
				trialDays: number;
				features: string[];
			}>;
		};
		expect(body.productId).toBe("pebbledesk");
		expect(body.plans[0]).toMatchObject({
			id: "home",
			price: "$8/mo when paid yearly",
			monthlyPrice: "$10/mo",
			annualPrice: "$8/mo when paid yearly",
			renewalPrice: "Then $39/mo when paid yearly ($468/year)",
			monthlyRenewalPrice: "Then $49/mo",
			annualRenewalPrice: "Then $39/mo when paid yearly ($468/year)",
			promotions: {
				monthly: {
					code: "M80OFF",
					terms: "80% off the first year",
					renewalPrice: "Then $49/mo",
					ctaUrl: "https://my.pebbledesk.app/signup?promo=M80OFF&billing=monthly",
				},
				annual: {
					code: "Y80OFF",
					terms: "80% off the first year",
					renewalPrice: "Then $39/mo when paid yearly ($468/year)",
					ctaUrl: "https://my.pebbledesk.app/signup?promo=Y80OFF&billing=annual",
				},
			},
			defaultCadence: "year",
			trialDays: 30,
			features: ["30-day free trial", "Flat childcare operations pricing", "Audit-ready records"],
		});
	});

	it("accepts the legacy product_id query alias", async () => {
		const secret = "test-ai-sdr-secret";
		const path = "/api/ai-sdr/product-context?product_id=pebbledesk";
		const res = await testWorker.fetch(
			new Request(`https://pebbledesk.app${path}`, {
				headers: await aiSdrSignedHeaders(path, secret),
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: secret }),
		);

		expect(res.status).toBe(200);
	});

	it("returns 404 for an unknown product", async () => {
		const path = "/api/ai-sdr/product-context?productId=other";
		const res = await testWorker.fetch(
			new Request(`https://pebbledesk.app${path}`),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when no product is specified", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context"),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 503 when the context secret is not configured", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk"),
			env(new MockD1Database()),
		);

		expect(res.status).toBe(503);
	});

	it("returns 401 when signature headers are missing", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk"),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toEqual({ error: "Missing signature" });
	});

	it("rejects a malformed (non-hex) signature", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk", {
				headers: {
					"X-Ventora-Timestamp": new Date().toISOString(),
					"X-Ventora-Nonce": "nonce",
					"X-Ventora-Signature": "not-hex",
				},
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(401);
		await expect(res.json()).resolves.toEqual({ error: "Invalid signature" });
	});

	it("rejects a well-formed signature carrying an unparseable timestamp", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk", {
				headers: {
					"X-Ventora-Timestamp": "not-a-date",
					"X-Ventora-Nonce": "nonce",
					"X-Ventora-Signature": "a".repeat(64),
				},
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(401);
	});

	it("rejects a signature whose timestamp is outside the allowed skew", async () => {
		const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk", {
				headers: {
					"X-Ventora-Timestamp": stale,
					"X-Ventora-Nonce": "nonce",
					"X-Ventora-Signature": "a".repeat(64),
				},
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(401);
	});

	it("rejects a correctly shaped but incorrect signature", async () => {
		const res = await testWorker.fetch(
			new Request("https://pebbledesk.app/api/ai-sdr/product-context?productId=pebbledesk", {
				headers: {
					"X-Ventora-Timestamp": new Date().toISOString(),
					"X-Ventora-Nonce": "nonce",
					"X-Ventora-Signature": "a".repeat(64),
				},
			}),
			env(new MockD1Database(), { AI_SDR_CONTEXT_SECRET: "secret" }),
		);

		expect(res.status).toBe(401);
	});
});
