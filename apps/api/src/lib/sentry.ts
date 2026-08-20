import * as Sentry from "@sentry/cloudflare";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./context.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKENISH_PATTERN = /^(?:token_|pi_|cs_|sk_|pk_|whsec_)?[A-Za-z0-9_-]{24,}$/;

type CaptureApiExceptionOptions = {
	requestId?: string;
	task?: string;
};

function isHttpStatus(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599;
}

function getHttpStatus(error: unknown): number | null {
	if (error instanceof HTTPException && isHttpStatus(error.status)) {
		return error.status;
	}

	if (!error || typeof error !== "object") {
		return null;
	}

	const { status, statusCode } = error as Record<string, unknown>;
	if (isHttpStatus(status)) {
		return status;
	}

	if (isHttpStatus(statusCode)) {
		return statusCode;
	}

	return null;
}

export function shouldCaptureApiException(error: unknown): boolean {
	const httpStatus = getHttpStatus(error);
	if (httpStatus !== null) {
		return httpStatus >= 500;
	}

	return true;
}

export function sanitizeRequestPath(path: string): string {
	const pathOnly = path.split("?")[0] || "/";
	const segments = pathOnly.split("/");

	return segments
		.map((segment, index) => {
			if (!segment) {
				return segment;
			}

			const previous = segments[index - 1];
			if (previous === "invoices" && segments[index - 2] === "public") {
				return ":token";
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
		})
		.join("/");
}

export function captureApiException(
	error: unknown,
	c: Context<AppEnv>,
	options: CaptureApiExceptionOptions = {},
): void {
	if (!c.env?.SENTRY_DSN || !shouldCaptureApiException(error)) {
		return;
	}

	const path = sanitizeRequestPath(c.req.path);
	Sentry.withScope((scope) => {
		scope.setTag("surface", "api");
		scope.setTag("route", path);
		scope.setTag("method", c.req.method);
		if (options.requestId) {
			scope.setTag("request_id", options.requestId);
		}
		if (options.task) {
			scope.setTag("task", options.task);
		}
		scope.setContext("request", {
			path,
			method: c.req.method,
		});
		Sentry.captureException(error);
	});
}

export function captureScheduledException(error: unknown, task: string): void {
	Sentry.withScope((scope) => {
		scope.setTag("surface", "api");
		scope.setTag("trigger", "scheduled");
		scope.setTag("task", task);
		Sentry.captureException(error);
	});
}
