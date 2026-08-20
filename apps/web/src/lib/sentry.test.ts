import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/browser", () => ({
	init: vi.fn(),
	captureException: vi.fn(),
	withScope: vi.fn((callback: (scope: { setTag: () => void; setExtra: () => void }) => void) =>
		callback({ setTag: vi.fn(), setExtra: vi.fn() }),
	),
}));

import * as Sentry from "@sentry/browser";
import { ApiError } from "../api";
import { captureException, initSentry, sanitizeQueryKey, sanitizeRoutePath } from "./sentry";

describe("web sentry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv("MODE", "production");
		vi.stubEnv("PROD", true);
		vi.stubEnv("VITE_SENTRY_DSN", "https://examplePublicKey@o0.ingest.sentry.io/0");
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("does not initialize outside production", () => {
		vi.stubEnv("PROD", false);
		vi.stubEnv("MODE", "development");

		initSentry();

		expect(Sentry.init).not.toHaveBeenCalled();
	});

	it("does not initialize when VITE_SENTRY_DSN is absent", () => {
		vi.stubEnv("VITE_SENTRY_DSN", "");

		initSentry();

		expect(Sentry.init).not.toHaveBeenCalled();
	});

	it("initializes Sentry with the configured DSN in production", () => {
		initSentry();

		expect(Sentry.init).toHaveBeenCalledOnce();
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
				environment: "production",
				initialScope: { tags: { surface: "app" } },
			}),
		);
	});

	it("forwards captured exceptions", () => {
		const error = new Error("boom");

		captureException(error);

		expect(Sentry.captureException).toHaveBeenCalledWith(error);
	});

	it("captures unexpected exceptions with sanitized tags and extra context", () => {
		const error = new Error("boom");

		const captured = captureException(error, {
			tags: { component: "RootErrorBoundary", route: "/children/:id" },
			extra: { attempt: 1, queryKey: ["children", "detail"] },
		});

		expect(captured).toBe(true);
		expect(Sentry.withScope).toHaveBeenCalledOnce();
		expect(Sentry.captureException).toHaveBeenCalledWith(error);
	});

	it("sanitizes string and object extra context", () => {
		const error = new Error("boom");

		const captured = captureException(error, {
			extra: {
				route: "/children/550e8400-e29b-41d4-a716-446655440000",
				filters: { childName: "Mila", nested: { guardianEmail: "taylor@example.com" } },
			},
		});

		expect(captured).toBe(true);
		expect(Sentry.withScope).toHaveBeenCalledOnce();
	});

	it("sanitizes route tags before they can reach Sentry", () => {
		expect(sanitizeRoutePath("")).toBe("/");
		expect(
			sanitizeRoutePath("/children/550e8400-e29b-41d4-a716-446655440000?expanded=guardian"),
		).toBe("/children/:id");
		expect(sanitizeRoutePath("/invites/taylor@example.com")).toBe("/invites/:email");
		expect(sanitizeRoutePath("/payments/token_abcdefghijklmnopqrstuvwxyz")).toBe(
			"/payments/:token",
		);
	});

	it("redacts object-valued query key filters before they can reach Sentry", () => {
		expect(
			sanitizeQueryKey([
				"guardians",
				["/children/550e8400-e29b-41d4-a716-446655440000", { search: "Mila", tags: ["new"] }, 3],
				{ search: "Taylor Reed", page: 2, include: ["children", "billing"] },
				{ child: { name: "Mila" }, empty: null, unknown: undefined },
				"/children/550e8400-e29b-41d4-a716-446655440000",
			]),
		).toEqual([
			"guardians",
			["/children/:id", { search: "[redacted]", tags: ["[redacted]"] }, 3],
			{ search: "[redacted]", page: "[redacted]", include: ["[redacted]", "[redacted]"] },
			{ child: { name: "[redacted]" }, empty: null, unknown: undefined },
			"/children/:id",
		]);
	});

	it("skips expected API 4xx failures", () => {
		const captured = captureException(new ApiError("Forbidden", 403, {}));

		expect(captured).toBe(false);
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	it("captures primitive errors", () => {
		const captured = captureException("boom");

		expect(captured).toBe(true);
		expect(Sentry.captureException).toHaveBeenCalledWith("boom");
	});

	it("captures API 5xx failures", () => {
		const error = new ApiError("Server failed", 502, {});

		const captured = captureException(error);

		expect(captured).toBe(true);
		expect(Sentry.captureException).toHaveBeenCalledWith(error);
	});

	it("skips auth control-flow errors", () => {
		const error = Object.assign(new Error("Invitation pending"), {
			name: "AuthSessionError",
			code: "invite_pending",
		});

		const captured = captureException(error);

		expect(captured).toBe(false);
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	it("skips non-5xx auth verification failures", () => {
		const error = Object.assign(new Error("Failed to verify auth session"), {
			name: "AuthVerificationError",
			status: 429,
		});

		const captured = captureException(error);

		expect(captured).toBe(false);
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	it("skips auth verification failures without a status", () => {
		const error = Object.assign(new Error("Failed to verify auth session"), {
			name: "AuthVerificationError",
		});

		const captured = captureException(error);

		expect(captured).toBe(false);
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	it("captures 5xx auth verification failures", () => {
		const error = Object.assign(new Error("Failed to verify auth session"), {
			name: "AuthVerificationError",
			status: 503,
		});

		const captured = captureException(error);

		expect(captured).toBe(true);
		expect(Sentry.captureException).toHaveBeenCalledWith(error);
	});
});
