import * as Sentry from "@sentry/browser";
import { ApiError } from "../api";

type SentryTagValue = string | number | boolean | undefined;

export type CaptureExceptionOptions = {
	tags?: Record<string, SentryTagValue>;
	extra?: Record<string, unknown>;
};

const EXPECTED_AUTH_CODES = new Set(["unauthenticated", "onboarding_required", "invite_pending"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKENISH_PATTERN = /^(?:token_|pi_|cs_|sk_|pk_|whsec_)?[A-Za-z0-9_-]{24,}$/;
const REDACTED_EXTRA_VALUE = "[redacted]";

export function initSentry(): void {
	if (!import.meta.env.PROD) {
		return;
	}

	const dsn = import.meta.env.VITE_SENTRY_DSN;
	if (!dsn) {
		return;
	}

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		initialScope: {
			tags: { surface: "app" },
		},
	});
}

export function shouldCaptureException(error: unknown): boolean {
	if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
		return false;
	}

	if (isExpectedAuthControlFlowError(error)) {
		return false;
	}

	if (isExpectedAuthVerificationError(error)) {
		return false;
	}

	return true;
}

export function captureException(error: unknown, options: CaptureExceptionOptions = {}): boolean {
	if (!shouldCaptureException(error)) {
		return false;
	}

	if (!options.tags && !options.extra) {
		Sentry.captureException(error);
		return true;
	}

	Sentry.withScope((scope) => {
		for (const [key, value] of Object.entries(options.tags ?? {})) {
			if (value !== undefined) {
				scope.setTag(
					key,
					key === "route" && typeof value === "string" ? sanitizeRoutePath(value) : value,
				);
			}
		}

		for (const [key, value] of Object.entries(options.extra ?? {})) {
			scope.setExtra(key, sanitizeExtraValue(value));
		}

		Sentry.captureException(error);
	});

	return true;
}

function isExpectedAuthControlFlowError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const maybeError = error as { code?: unknown; name?: unknown };
	return (
		maybeError.name === "AuthSessionError" &&
		typeof maybeError.code === "string" &&
		EXPECTED_AUTH_CODES.has(maybeError.code)
	);
}

function isExpectedAuthVerificationError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}

	const maybeError = error as { name?: unknown; status?: unknown };
	return (
		maybeError.name === "AuthVerificationError" &&
		(typeof maybeError.status !== "number" || maybeError.status < 500)
	);
}

export function sanitizeRoutePath(path: string): string {
	const pathOnly = path.split("?")[0] || "/";
	return pathOnly
		.split("/")
		.map((segment) => sanitizeRouteSegment(segment))
		.join("/");
}

export function sanitizeQueryKey(queryKey: readonly unknown[]): unknown[] {
	return queryKey.map((item) => sanitizeArrayExtraValue(item));
}

function sanitizeExtraValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeArrayExtraValue(item));
	}

	if (typeof value === "string") {
		return sanitizeRoutePath(value);
	}

	if (isPlainRecord(value)) {
		return sanitizeObjectExtraValue(value);
	}

	return value;
}

function sanitizeArrayExtraValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeArrayExtraValue(item));
	}

	if (typeof value === "string") {
		return sanitizeRoutePath(value);
	}

	if (isPlainRecord(value)) {
		return sanitizeObjectExtraValue(value);
	}

	return value;
}

function sanitizeObjectExtraValue(value: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => [key, sanitizeNestedObjectValue(item)]),
	);
}

function sanitizeNestedObjectValue(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeNestedObjectValue(item));
	}

	if (isPlainRecord(value)) {
		return sanitizeObjectExtraValue(value);
	}

	return REDACTED_EXTRA_VALUE;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return Object.prototype.toString.call(value) === "[object Object]";
}

function sanitizeRouteSegment(segment: string): string {
	if (!segment) {
		return segment;
	}

	if (UUID_PATTERN.test(segment)) {
		return ":id";
	}

	if (segment.includes("@")) {
		return ":email";
	}

	if (TOKENISH_PATTERN.test(segment)) {
		return ":token";
	}

	return segment;
}
