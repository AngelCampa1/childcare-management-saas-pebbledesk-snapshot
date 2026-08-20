import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock @sentry/browser before importing the module under test
vi.mock("@sentry/browser", () => ({
	init: vi.fn(),
	captureException: vi.fn(),
	withScope: vi.fn(),
}));

import * as Sentry from "@sentry/browser";
import { captureException, DENY_URLS, getSentryDsn, initSentry } from "./sentry-client";

describe("sentry-client", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("MODE", "production");
		vi.stubEnv("PROD", true);
		vi.stubEnv("PUBLIC_SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	describe("getSentryDsn", () => {
		it("returns PUBLIC_SENTRY_DSN when present", () => {
			expect(getSentryDsn()).toBe("https://examplePublicKey@o0.ingest.sentry.io/0");
		});

		it("returns undefined when PUBLIC_SENTRY_DSN is absent even if VITE_SENTRY_DSN is set", () => {
			vi.stubEnv("PUBLIC_SENTRY_DSN", "");
			vi.stubEnv("VITE_SENTRY_DSN", "https://fallbackPublicKey@o0.ingest.sentry.io/1");

			expect(getSentryDsn()).toBeUndefined();
		});

		it("returns undefined when both PUBLIC_SENTRY_DSN and VITE_SENTRY_DSN are unset", () => {
			vi.stubEnv("PUBLIC_SENTRY_DSN", "");
			vi.stubEnv("VITE_SENTRY_DSN", "");

			expect(getSentryDsn()).toBeUndefined();
		});
	});

	describe("initSentry", () => {
		it("does not initialize Sentry outside production", () => {
			vi.stubEnv("MODE", "development");
			vi.stubEnv("PROD", false);

			initSentry("crewroute");

			expect(Sentry.init).not.toHaveBeenCalled();
		});

		it("does not initialize Sentry when no DSN is configured", () => {
			vi.stubEnv("PUBLIC_SENTRY_DSN", "");

			initSentry("crewroute");

			expect(Sentry.init).not.toHaveBeenCalled();
		});

		it("calls Sentry.init with the correct DSN", () => {
			initSentry("crewroute");
			expect(Sentry.init).toHaveBeenCalledOnce();
			expect(Sentry.init).toHaveBeenCalledWith(
				expect.objectContaining({ dsn: "https://examplePublicKey@o0.ingest.sentry.io/0" }),
			);
		});

		it("does not set tracesSampleRate", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			expect(call).not.toHaveProperty("tracesSampleRate");
		});

		it("sets environment from import.meta.env.MODE", () => {
			initSentry("crewroute");
			expect(Sentry.init).toHaveBeenCalledWith(
				expect.objectContaining({ environment: "production" }),
			);
		});

		it("tags the scope with the given site name", () => {
			initSentry("birvix");
			expect(Sentry.init).toHaveBeenCalledWith(
				expect.objectContaining({
					initialScope: { tags: { site: "birvix", surface: "marketing" } },
				}),
			);
		});

		it("passes the site name through to the tag for a different site", () => {
			initSentry("sweepops");
			expect(Sentry.init).toHaveBeenCalledWith(
				expect.objectContaining({
					initialScope: { tags: { site: "sweepops", surface: "marketing" } },
				}),
			);
		});

		it("filters out dynamic import chunk-load failures via ignoreErrors", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;
			expect(ignoreErrors).toBeDefined();
			expect(ignoreErrors.length).toBeGreaterThan(0);

			const hasChunkPattern = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test(
						"Failed to fetch dynamically imported module: https://horiva.app/_astro/feedback-widget.BnR-9d-F.js",
					);
				}
				return false;
			});
			expect(hasChunkPattern).toBe(true);
		});

		it("also filters ChunkLoadError and Loading chunk failed patterns", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesChunkLoadError = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) return pattern.test("ChunkLoadError");
				return pattern === "ChunkLoadError";
			});
			expect(matchesChunkLoadError).toBe(true);

			const matchesLoadingChunk = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) return pattern.test("Loading chunk 123 failed");
				return false;
			});
			expect(matchesLoadingChunk).toBe(true);
		});

		it("filters Safari 'Load failed' TypeError variant", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesSafari = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) return pattern.test("Load failed");
				return false;
			});
			expect(matchesSafari).toBe(true);
		});

		it("filters network-level 'Failed to fetch' TypeError from bots and offline users", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesFailedToFetch = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) return pattern.test("Failed to fetch");
				return pattern === "Failed to fetch";
			});
			expect(matchesFailedToFetch).toBe(true);
		});

		it("filters browser extension pluginConfig errors", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesPluginConfig = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("undefined is not an object (evaluating 'o.pluginConfig')");
				}
				return false;
			});
			expect(matchesPluginConfig).toBe(true);
		});

		it("filters PostHog SDK 'options is not defined' during pageleave", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesOptions = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("options is not defined");
				}
				return false;
			});
			expect(matchesOptions).toBe(true);
		});

		it("filters browser extension runtime.sendMessage errors", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesSendMessage = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("Invalid call to runtime.sendMessage(). Tab not found.");
				}
				return false;
			});
			expect(matchesSendMessage).toBe(true);
		});

		it("passes denyUrls to filter browser extension sources", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const denyUrls = call.denyUrls as Array<string | RegExp>;

			expect(denyUrls).toBeDefined();
			expect(denyUrls).toBe(DENY_URLS);
		});

		it("denyUrls blocks webkit-masked-url origins", () => {
			const matchesWebkit = DENY_URLS.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("webkit-masked-url://hidden/:2:6140");
				}
				return false;
			});
			expect(matchesWebkit).toBe(true);
		});

		it("denyUrls blocks chrome-extension origins", () => {
			const matchesChrome = DENY_URLS.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("chrome-extension://abc123/content.js");
				}
				return false;
			});
			expect(matchesChrome).toBe(true);
		});

		it("filters stale React runtime mismatch signatures", () => {
			initSentry("crewroute");
			const call = (Sentry.init as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
				string,
				unknown
			>;
			const ignoreErrors = call.ignoreErrors as Array<string | RegExp>;

			const matchesRuntimeMismatch = ignoreErrors.some((pattern) => {
				if (pattern instanceof RegExp) {
					return pattern.test("TypeError: jsxDEV is not a function");
				}
				return false;
			});

			expect(matchesRuntimeMismatch).toBe(true);
		});
	});

	describe("captureException", () => {
		it("forwards an Error to Sentry.captureException", () => {
			const err = new Error("boom");
			captureException(err);
			expect(Sentry.captureException).toHaveBeenCalledOnce();
			expect(Sentry.captureException).toHaveBeenCalledWith(err);
		});

		it("forwards a string error to Sentry.captureException", () => {
			captureException("string error");
			expect(Sentry.captureException).toHaveBeenCalledWith("string error");
		});

		it("forwards null to Sentry.captureException", () => {
			captureException(null);
			expect(Sentry.captureException).toHaveBeenCalledWith(null);
		});

		it("forwards undefined to Sentry.captureException", () => {
			captureException(undefined);
			expect(Sentry.captureException).toHaveBeenCalledWith(undefined);
		});

		it("uses withScope to set tags when tags option provided", () => {
			const setTag = vi.fn();
			const setExtra = vi.fn();
			(Sentry.withScope as ReturnType<typeof vi.fn>).mockImplementation(
				(cb: (scope: { setTag: typeof setTag; setExtra: typeof setExtra }) => void) => {
					cb({ setTag, setExtra });
				},
			);

			const err = new Error("scoped");
			captureException(err, { tags: { feature: "billing", count: 3, skipped: undefined } });

			expect(Sentry.withScope).toHaveBeenCalledOnce();
			expect(setTag).toHaveBeenCalledWith("feature", "billing");
			expect(setTag).toHaveBeenCalledWith("count", 3);
			expect(setTag).not.toHaveBeenCalledWith("skipped", expect.anything());
			expect(Sentry.captureException).toHaveBeenCalledWith(err);
		});

		it("uses withScope to set extras when extra option provided", () => {
			const setTag = vi.fn();
			const setExtra = vi.fn();
			(Sentry.withScope as ReturnType<typeof vi.fn>).mockImplementation(
				(cb: (scope: { setTag: typeof setTag; setExtra: typeof setExtra }) => void) => {
					cb({ setTag, setExtra });
				},
			);

			const err = new Error("with extras");
			captureException(err, { extra: { url: "/dashboard", payload: { id: 1 } } });

			expect(Sentry.withScope).toHaveBeenCalledOnce();
			expect(setExtra).toHaveBeenCalledWith("url", "/dashboard");
			expect(setExtra).toHaveBeenCalledWith("payload", { id: 1 });
			expect(Sentry.captureException).toHaveBeenCalledWith(err);
		});
	});
});
