import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "./context.js";
import {
	captureApiException,
	captureScheduledException,
	sanitizeRequestPath,
	shouldCaptureApiException,
} from "./sentry.js";

const sentrySpies = vi.hoisted(() => ({
	captureException: vi.fn(),
	setContext: vi.fn(),
	setTag: vi.fn(),
}));

vi.mock("@sentry/cloudflare", () => ({
	captureException: sentrySpies.captureException,
	withScope: vi.fn(
		(
			callback: (scope: {
				setContext: typeof sentrySpies.setContext;
				setTag: typeof sentrySpies.setTag;
			}) => void,
		) => {
			callback({
				setContext: sentrySpies.setContext,
				setTag: sentrySpies.setTag,
			});
		},
	),
}));

function createContext(path: string, method = "GET"): Context<AppEnv> {
	return {
		env: { SENTRY_DSN: "https://examplePublicKey@o0.ingest.sentry.io/0" },
		req: { method, path },
	} as unknown as Context<AppEnv>;
}

describe("api sentry helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("only captures unexpected and server-side HTTP exceptions", () => {
		expect(shouldCaptureApiException(new Error("boom"))).toBe(true);
		expect(shouldCaptureApiException(new HTTPException(502, { message: "bad gateway" }))).toBe(
			true,
		);
		expect(shouldCaptureApiException(new HTTPException(404, { message: "not found" }))).toBe(false);
	});

	it("skips status-shaped client HTTP errors across runtimes", () => {
		const unauthorizedError = Object.assign(new Error("Unauthorized"), { status: 401 });
		const forbiddenError = Object.assign(new Error("Forbidden"), { statusCode: 403 });

		expect(shouldCaptureApiException(unauthorizedError)).toBe(false);
		expect(shouldCaptureApiException(forbiddenError)).toBe(false);

		captureApiException(unauthorizedError, createContext("/api/auth/me"));
		captureApiException(forbiddenError, createContext("/api/auth/me"));

		expect(sentrySpies.captureException).not.toHaveBeenCalled();
	});

	it("captures status-shaped server HTTP errors across runtimes", () => {
		const upstreamError = Object.assign(new Error("Bad gateway"), { status: 502 });

		expect(shouldCaptureApiException(upstreamError)).toBe(true);

		captureApiException(upstreamError, createContext("/api/auth/me"));

		expect(sentrySpies.captureException).toHaveBeenCalledWith(upstreamError);
	});

	it("ignores invalid status-like fields and captures them as unexpected errors", () => {
		const nonIntegerStatus = Object.assign(new Error("Partial status"), { status: 401.5 });
		const outOfRangeStatus = Object.assign(new Error("Out of range status"), { statusCode: 700 });

		expect(shouldCaptureApiException(nonIntegerStatus)).toBe(true);
		expect(shouldCaptureApiException(outOfRangeStatus)).toBe(true);

		captureApiException(nonIntegerStatus, createContext("/api/auth/me"));
		captureApiException(outOfRangeStatus, createContext("/api/auth/me"));

		expect(sentrySpies.captureException).toHaveBeenCalledWith(nonIntegerStatus);
		expect(sentrySpies.captureException).toHaveBeenCalledWith(outOfRangeStatus);
	});

	it("sanitizes private path segments before tagging requests", () => {
		expect(sanitizeRequestPath("")).toBe("/");
		expect(
			sanitizeRequestPath("/api/children/550e8400-e29b-41d4-a716-446655440000?include=guardians"),
		).toBe("/api/children/:id");
		expect(sanitizeRequestPath("/api/invites/taylor@example.com")).toBe("/api/invites/:email");
		expect(sanitizeRequestPath("/api/payments/token_abcdefghijklmnopqrstuvwxyz")).toBe(
			"/api/payments/:token",
		);
		expect(sanitizeRequestPath("/api/public/invoices/public-token/payment-intent")).toBe(
			"/api/public/invoices/:token/payment-intent",
		);
	});

	it("captures request failures with sanitized tags and request context", () => {
		const error = new Error("sync failed");

		captureApiException(
			error,
			createContext("/api/tasks/token_abcdefghijklmnopqrstuvwxyz", "POST"),
			{
				requestId: "req_123",
				task: "billing-sync",
			},
		);

		expect(sentrySpies.setTag).toHaveBeenCalledWith("surface", "api");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("route", "/api/tasks/:token");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("method", "POST");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("request_id", "req_123");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "billing-sync");
		expect(sentrySpies.setContext).toHaveBeenCalledWith("request", {
			path: "/api/tasks/:token",
			method: "POST",
		});
		expect(sentrySpies.captureException).toHaveBeenCalledWith(error);
	});

	it("skips capture when Sentry is not configured", () => {
		const context = {
			env: { SENTRY_DSN: "" },
			req: { method: "GET", path: "/api/test" },
		} as unknown as Context<AppEnv>;

		captureApiException(new Error("boom"), context);

		expect(sentrySpies.captureException).not.toHaveBeenCalled();
	});

	it("captures scheduled task failures with task tags", () => {
		const error = new Error("scheduled failure");

		captureScheduledException(error, "subsidy-auto-draft");

		expect(sentrySpies.setTag).toHaveBeenCalledWith("surface", "api");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("trigger", "scheduled");
		expect(sentrySpies.setTag).toHaveBeenCalledWith("task", "subsidy-auto-draft");
		expect(sentrySpies.captureException).toHaveBeenCalledWith(error);
	});
});
