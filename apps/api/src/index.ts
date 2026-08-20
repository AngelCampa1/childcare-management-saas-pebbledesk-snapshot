import { assertProductionDbDriver, createDb, resolveConnectionString } from "@pebbledesk/db";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import * as Sentry from "@sentry/cloudflare";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

export { RateLimiterDO } from "./durable-objects/rate-limiter.js";

import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { AppEnv, Bindings } from "./lib/context.js";
import { isTransientDbError, retryOnTransientDbError } from "./lib/db-retry.js";
import { validateEnv } from "./lib/env.js";
import { getAllowedWebOrigins } from "./lib/local-origins.js";
import { analyticsDistinctId, schedulePostHogEvent } from "./lib/posthog.js";
import { captureApiException, captureScheduledException } from "./lib/sentry.js";
import { auditMiddleware } from "./middleware/audit.js";
import { initMiddleware } from "./middleware/auth.js";
import { createCsrfMiddleware } from "./middleware/csrf.js";
import { createRateLimit } from "./middleware/rate-limit.js";
import { requestId } from "./middleware/request-id.js";
import { createSignUpRateLimit } from "./middleware/signup-rate-limit.js";
import { aiCsContextRouter } from "./routes/ai-cs-context.js";
import { aiCsProxyRouter } from "./routes/ai-cs-proxy.js";
import { appSignupRoutes } from "./routes/app-signup.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { authRoutes } from "./routes/auth.js";
import { centersRoutes } from "./routes/centers.js";
import { checkInsRoutes } from "./routes/check-ins.js";
import { childrenRoutes } from "./routes/children.js";
import { classroomsRoutes } from "./routes/classrooms.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { guardiansRoutes } from "./routes/guardians.js";
import { guidanceRoutes } from "./routes/guidance.js";
import { importsRouter } from "./routes/imports.js";
import { invoiceTemplatesRoutes } from "./routes/invoice-templates.js";
import { invoicesRoutes } from "./routes/invoices.js";
import { membersRoutes } from "./routes/members.js";
import { membershipsRoutes } from "./routes/memberships.js";
import { messagesRoutes } from "./routes/messages.js";
import { overviewRoutes } from "./routes/overview.js";
import { paymentsRoutes } from "./routes/payments.js";
import { publicInvoicesRoutes } from "./routes/public-invoices.js";
import { quickbooksRoutes } from "./routes/quickbooks.js";
import { ratiosRoutes } from "./routes/ratios.js";
import { reportsRoutes } from "./routes/reports.js";
import { schedulesRoutes } from "./routes/schedules.js";
import { shiftsRoutes } from "./routes/shifts.js";
import { staffCheckInsRoutes } from "./routes/staff-check-ins.js";
import { stripeRoutes } from "./routes/stripe.js";
import { subscriptionRoutes } from "./routes/subscriptions.js";
import { subscriptionWebhookRoutes } from "./routes/subscriptions-webhook.js";
import { subsidyCasesRoutes } from "./routes/subsidy-cases.js";
import { subsidyClaimsRoutes } from "./routes/subsidy-claims.js";
import { timeEntriesRoutes } from "./routes/time-entries.js";
import { runSubscriptionNotificationDispatcher } from "./scheduled/subscription-notification-dispatcher.js";
import { runSubsidyAutoDraft } from "./scheduled/subsidy-auto-draft.js";
import { runTrialExpirer } from "./scheduled/trial-expirer.js";
import { deleteExpiredAiCsSessionOwners } from "./services/ai-cs-session-owners-cleanup.js";
import { deleteExpiredWebhookEvents } from "./services/webhook-events-cleanup.js";

const app = new Hono<AppEnv>();
const SCHEDULED_DB_RETRY_OPTIONS = {
	attempts: 5,
	maxBackoffMs: 2_000,
};

/**
 * WeakMap-keyed env-validation cache. Keyed on the env bindings object so the
 * check fires once per unique Cloudflare Worker isolate binding context instead
 * of once per module lifetime. A module-level boolean would persist across
 * different binding contexts if the isolate is reused.
 */
const envValidatedMap = new WeakMap<object, boolean>();

// Request ID must be first so every response carries x-request-id
app.use("*", requestId);

// Env validation is skipped on all requests after the first successful validation for this env
app.use("*", async (c, next) => {
	const env = c.env as object | null | undefined;
	if (env && !envValidatedMap.has(env)) {
		try {
			validateEnv(c.env);
			envValidatedMap.set(env, true);
		} catch (err) {
			const reqId = c.get("requestId");
			captureApiException(err, c, { requestId: reqId });
			const message = err instanceof Error ? err.message : "Environment misconfiguration";
			return c.json({ error: message }, 503);
		}
	}
	await next();
});

// Security headers apply before CORS so they are present on all responses
app.use(
	"*",
	secureHeaders({
		referrerPolicy: "strict-origin-when-cross-origin",
		xContentTypeOptions: "nosniff",
		xFrameOptions: "DENY",
		strictTransportSecurity: "max-age=31536000; includeSubDomains",
		permissionsPolicy: {
			camera: [],
			microphone: [],
			geolocation: [],
		},
	}),
);

// CORS
app.use(
	"*",
	cors({
		origin: (origin, c) => {
			if (!origin) {
				return origin;
			}

			const allowedOrigins = getAllowedWebOrigins(c.env.APP_URL);
			return allowedOrigins.includes(origin) ? origin : null;
		},
		credentials: true,
	}),
);

// CSRF origin-header check runs after CORS and before rate limits
app.use("*", createCsrfMiddleware());

// Body size limit is 1 MB for all routes except /api/imports which may carry
// up to 500 JSON records and legitimately exceeds 1 MB; those payloads are
// capped instead by the 500-row Zod limit in the route validators.
app.use("*", async (c, next) => {
	if (c.req.path.startsWith("/api/imports")) {
		return next();
	}
	return bodyLimit({ maxSize: 1_000_000 })(c, next);
});

// Sign-in brute-force protection: 5 attempts/min/IP
const signInRateLimit = createRateLimit({ windowMs: 60_000, max: 5, bucket: "auth-sign-in" });
app.use("/api/auth/sign-in/*", signInRateLimit);

// Payment-intent creation: 10/min/IP (tighter limit — Stripe call is expensive)
const publicInvoicePaymentIntentRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 10,
	bucket: "public-invoice-pi",
});
app.use("/api/public/invoices/:token/payment-intent", publicInvoicePaymentIntentRateLimit);

// Public invoice access: 30/min/IP (prevents token enumeration)
const publicInvoiceRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 30,
	bucket: "public-invoices",
});
app.use("/api/public/invoices/*", publicInvoiceRateLimit);

// Sign-up brute-force protection: 5 attempts/min/IP for normal signups.
// Configured disposable E2E email domains use a token-gated higher capped bucket
// so production QA can create role accounts without weakening public signup.
const signUpRateLimit = createSignUpRateLimit();
app.use("/api/auth/sign-up/*", signUpRateLimit);

// Email verification resend protection: enough for retries, low enough to block abuse.
const verificationResendRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 3,
	bucket: "auth-resend-verification",
});
app.use("/api/auth/resend-verification", verificationResendRateLimit);

const authReadRateLimit = createRateLimit({ windowMs: 60_000, max: 300, bucket: "auth-read" });
app.use("/api/auth/me", authReadRateLimit);
app.use("/api/auth/status", authReadRateLimit);

// Guardian-create rate limit is 10/min/IP. POST only so GET list/read unaffected.
// Must run BEFORE initMiddleware so unauthenticated floods are rejected too.
const guardianCreateRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 10,
	bucket: "guardian-create",
	message: "Too many guardian creates, please try again shortly.",
});
app.use("/api/guardians", async (c, next) => {
	if (c.req.method === "POST") return guardianCreateRateLimit(c, next);
	return next();
});

// Message-send rate limit is 5/min/IP. POST only so GET list/read unaffected.
// Must run BEFORE initMiddleware so unauthenticated floods are rejected too.
const messageSendRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 5,
	bucket: "message-send",
	message: "Too many message sends, please try again shortly.",
});
// Covers both POST /api/messages (send) and POST /api/messages/:id/redeliver,
// since redeliver re-fans-out emails to the same recipients and shares blast radius.
app.use("/api/messages/*", async (c, next) => {
	if (c.req.path === "/api/messages/inbound/resend") return next();
	if (c.req.method === "POST") return messageSendRateLimit(c, next);
	return next();
});
app.use("/api/messages", async (c, next) => {
	if (c.req.method === "POST") return messageSendRateLimit(c, next);
	return next();
});

// Member-invite rate limit is 10/min/IP. POST /api/members/invites only.
// Must run BEFORE initMiddleware so unauthenticated floods are rejected too.
const memberInviteRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 10,
	bucket: "member-invite",
	message: "Too many invite requests, please try again shortly.",
});
app.use("/api/members/invites", async (c, next) => {
	if (c.req.method === "POST") return memberInviteRateLimit(c, next);
	return next();
});

// Reports can trigger expensive DB scans and artifact generation. Keep them in
// a tighter named bucket than routine app navigation.
const reportsRateLimit = createRateLimit({
	windowMs: 60_000,
	max: 10,
	bucket: "reports",
	message: "Too many report requests, please try again shortly.",
});
app.use("/api/reports/*", async (c, next) => {
	if (c.req.path === "/api/reports") return next();
	return reportsRateLimit(c, next);
});
app.use("/api/reports", reportsRateLimit);

// Global rate limit is 60 requests per minute per IP
const globalRateLimit = createRateLimit({ windowMs: 60_000, max: 180, bucket: "global" });
app.use("*", async (c, next) => {
	if (c.req.path === "/api/auth/me" || c.req.path === "/api/auth/status") {
		return next();
	}
	return globalRateLimit(c, next);
});

// Tight rate limit on feedback endpoint is 5 requests per minute per IP
const feedbackRateLimit = createRateLimit({ windowMs: 60_000, max: 5, bucket: "feedback" });
app.use("/api/feedback", feedbackRateLimit);

// Marketing capture now lives on the D1-backed marketing Worker.
// Redirect legacy API-origin requests before initMiddleware can wake Neon.
app.all("/api/leads", (c) => {
	const url = new URL(c.req.url);
	const publicOrigin = new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
	url.protocol = publicOrigin.protocol;
	url.hostname = publicOrigin.hostname;
	return c.redirect(url.toString(), 308);
});

app.get("/api/unsubscribe", (c) => {
	const url = new URL(c.req.url);
	const publicOrigin = new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
	url.protocol = publicOrigin.protocol;
	url.hostname = publicOrigin.hostname;
	return c.redirect(url.toString(), 308);
});

app.get("/api/readiness/database", async (c) => {
	const reqId = c.get("requestId");
	const expectedToken = c.env.API_READINESS_TOKEN;
	const providedToken = c.req.header("x-pebbledesk-readiness-token");

	if (!expectedToken || providedToken !== expectedToken) {
		return c.json({ error: "Not found" }, 404);
	}

	try {
		const isProductionDbRuntime = c.env.APP_URL.startsWith("https://");
		assertProductionDbDriver(c.env.HYPERDRIVE, isProductionDbRuntime);
		const connectionString = resolveConnectionString(c.env.HYPERDRIVE, c.env.DATABASE_URL);
		const db = createDb(connectionString, {
			hyperdriveBound: Boolean(c.env.HYPERDRIVE),
		});

		await db.execute(sql`select 1`);

		return c.json({ status: "ok", database: "ok" });
	} catch {
		captureApiException(new Error("Database readiness query failed"), c, { requestId: reqId });
		return c.json({ status: "error", database: "unavailable", requestId: reqId }, 503);
	}
});

// Global init middleware sets db + auth on context
app.use("*", initMiddleware);

// Audit middleware logs mutations after handler runs
app.use("*", auditMiddleware);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Routes
app.route("/api/auth", authRoutes);
app.route("/api/app-signup", appSignupRoutes);
app.route("/api/ai-cs", aiCsProxyRouter);
app.route("/api/ai-cs", aiCsContextRouter);
app.route("/api/audit-log", auditLogRoutes);
app.route("/api/centers", centersRoutes);
app.route("/api/check-ins", checkInsRoutes);
app.route("/api/children", childrenRoutes);
app.route("/api/classrooms", classroomsRoutes);
app.route("/api/guardians", guardiansRoutes);
app.route("/api/guidance", guidanceRoutes);
app.route("/api/imports", importsRouter);
app.route("/api/invoice-templates", invoiceTemplatesRoutes);
app.route("/api/invoices", invoicesRoutes);
app.route("/api/members", membersRoutes);
app.route("/api/memberships", membershipsRoutes);
app.route("/api/messages", messagesRoutes);
app.route("/api/overview", overviewRoutes);
app.route("/api/payments", paymentsRoutes);
app.route("/api/public/invoices", publicInvoicesRoutes);
app.route("/api/quickbooks", quickbooksRoutes);
app.route("/api/ratios", ratiosRoutes);
app.route("/api/reports", reportsRoutes);
app.route("/api/schedules", schedulesRoutes);
app.route("/api/shifts", shiftsRoutes);
app.route("/api/staff-check-ins", staffCheckInsRoutes);
app.route("/api/stripe", stripeRoutes);
app.route("/api/subscriptions/webhook", subscriptionWebhookRoutes);
app.route("/api/subscriptions", subscriptionRoutes);
app.route("/api/subsidy-cases", subsidyCasesRoutes);
app.route("/api/subsidy-claims", subsidyClaimsRoutes);
app.route("/api/feedback", feedbackRoutes);
app.route("/api/time-entries", timeEntriesRoutes);

// Global error handler
app.onError((err, c) => {
	const reqId = c.get("requestId");
	captureApiException(err, c, { requestId: reqId });
	if (err instanceof HTTPException) {
		return c.json({ error: err.message, requestId: reqId }, err.status);
	}
	console.error(err);
	return c.json({ error: "Internal server error", requestId: reqId }, 500);
});

export { app };

const worker = {
	fetch: app.fetch.bind(app),
	async scheduled(controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
		const getDb = () => {
			assertProductionDbDriver(env.HYPERDRIVE, env.APP_URL.startsWith("https://"));
			const connectionString = resolveConnectionString(env.HYPERDRIVE, env.DATABASE_URL);
			return createDb(connectionString, {
				hyperdriveBound: Boolean(env.HYPERDRIVE),
			});
		};
		// Dispatch only the tasks assigned to this cron schedule. Each DB task owns a
		// retry budget that absorbs cold Neon/Hyperdrive connection hiccups.
		// `bestEffort` tasks are idempotent cleanup crons that re-run on the next
		// schedule. A transient DB outage that exhausts the retry budget on one run
		// self-heals on the next, so it is logged but not paged to Sentry as an
		// actionable error (PEBBLEDESK-API-F). Non-transient failures still page.
		type Task = { name: string; run: () => Promise<unknown>; bestEffort?: boolean };
		const runScheduledDbTask = <T>(task: () => Promise<T>) =>
			retryOnTransientDbError(task, SCHEDULED_DB_RETRY_OPTIONS);
		let tasks: Task[];
		switch (controller.cron) {
			case "0 8 * * *":
				tasks = [
					{
						name: "subscription-notification-dispatcher",
						run: () =>
							runScheduledDbTask(() => runSubscriptionNotificationDispatcher(env, getDb())),
					},
				];
				break;
			case "0 2 * * *":
				tasks = [
					{
						name: "trial-expirer",
						run: async () => {
							const result = await runScheduledDbTask(() => runTrialExpirer(getDb()));
							for (const centerId of result.expiredCenterIds) {
								schedulePostHogEvent(env, ctx, {
									event: ANALYTICS_EVENTS.trialExpired,
									distinctId: await analyticsDistinctId("center", centerId),
									properties: { subscription_status: "canceled" },
								});
							}
							return result;
						},
					},
				];
				break;
			case "0 3 * * *":
				tasks = [
					{
						name: "webhook-events-cleanup",
						run: () => runScheduledDbTask(() => deleteExpiredWebhookEvents(getDb())),
						bestEffort: true,
					},
				];
				break;
			case "0 4 * * *":
				tasks = [
					{
						name: "ai-cs-session-owners-cleanup",
						run: () => runScheduledDbTask(() => deleteExpiredAiCsSessionOwners(getDb())),
						bestEffort: true,
					},
				];
				break;
			case "0 9 * * 1":
				tasks = [
					{
						name: "subsidy-auto-draft",
						run: () => runScheduledDbTask(() => runSubsidyAutoDraft(getDb())),
					},
				];
				break;
			default:
				console.warn(`[scheduled] Unrecognised cron: ${controller.cron}`);
				tasks = [];
		}
		const results = await Promise.allSettled(tasks.map((task) => task.run()));
		for (const [index, result] of results.entries()) {
			if (result.status !== "rejected") {
				continue;
			}
			const task = tasks[index];
			const taskName = task?.name ?? "unknown";
			if (task?.bestEffort && isTransientDbError(result.reason)) {
				console.warn(
					`[scheduled] best-effort task "${taskName}" skipped after exhausting retries on a transient DB outage; the next scheduled run will retry`,
				);
				continue;
			}
			console.error("[scheduled] task failed:", result.reason);
			captureScheduledException(result.reason, taskName);
		}
	},
};

const instrumentedWorker = Sentry.withSentry<Bindings>(
	(env) =>
		env.SENTRY_DSN
			? {
					dsn: env.SENTRY_DSN,
					environment: env.APP_URL.startsWith("https://") ? "production" : "development",
				}
			: undefined,
	{
		fetch: worker.fetch,
		scheduled: worker.scheduled,
	},
);

export { worker };
export default instrumentedWorker;
