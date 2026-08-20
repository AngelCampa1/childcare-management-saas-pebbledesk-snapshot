import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/context.js";
import { getAllowedWebOrigins } from "../lib/local-origins.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Paths that must bypass origin check (have their own request verification)
// /api/leads and /api/unsubscribe are public marketing endpoints called from the site.
const BYPASS_PREFIXES = [
	"/api/auth/",
	"/api/stripe/",
	"/api/public/",
	"/api/leads",
	"/api/unsubscribe",
	"/api/app-signup/unsubscribe",
	"/api/messages/inbound/resend",
];

export function createCsrfMiddleware() {
	return createMiddleware<AppEnv>(async (c, next) => {
		const method = c.req.method;
		if (SAFE_METHODS.has(method)) {
			await next();
			return;
		}

		const path = c.req.path;
		if (BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix))) {
			await next();
			return;
		}

		const origin = c.req.header("origin");
		const xRequestedWith = c.req.header("x-requested-with");

		// Allow same-origin requests (no origin header = same-origin browser request)
		if (!origin) {
			await next();
			return;
		}

		const allowedOrigins = getAllowedWebOrigins(c.env.APP_URL);
		if (!allowedOrigins.includes(origin)) {
			return c.json({ error: "Forbidden" }, 403);
		}

		// Allow requests with X-Requested-With: fetch after validating Origin.
		if (xRequestedWith === "fetch") {
			await next();
			return;
		}

		await next();
	});
}
