import { zValidator } from "@hono/zod-validator";
import {
	quickbooksReviewReconciliationSchema,
	quickbooksSyncActionSchema,
} from "@pebbledesk/shared";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { assertCenterHasFeature } from "../lib/plan-limits.js";
import { requireAuth, requireCenter, requirePermission, requireRole } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/plan.js";
import {
	approveQuickBooksReconciliation,
	completeQuickBooksConnectCallback,
	decodeQuickBooksStateWithFallback,
	disconnectQuickBooks,
	dismissQuickBooksReconciliation,
	getQuickBooksStatus,
	listQuickBooksReconciliationItems,
	listQuickBooksSyncHistory,
	runQuickBooksSync,
	startQuickBooksConnect,
} from "../services/quickbooks.js";

const quickbooksRoutes = new Hono<AppEnv>();
const QUICKBOOKS_STATE_COOKIE = "qb_connect_state";

type QuickBooksOAuthConfig = {
	clientId: string;
	clientSecret?: string;
	redirectUri: string;
	appUrl: string;
	secret: string;
	legacySecret?: string;
};

type QuickBooksSyncConfig = {
	secret: string;
	legacySecret?: string;
	clientId?: string;
	clientSecret?: string;
};

function getQuickBooksTokenSecrets(c: { env: AppEnv["Bindings"] }) {
	const secret = c.env.QB_TOKEN_ENC_KEY ?? c.env.BETTER_AUTH_SECRET;
	const legacySecret =
		c.env.QB_TOKEN_ENC_KEY && c.env.QB_TOKEN_ENC_KEY !== c.env.BETTER_AUTH_SECRET
			? c.env.BETTER_AUTH_SECRET
			: undefined;

	return {
		secret,
		legacySecret,
	};
}

function getQuickBooksOAuthConfig(
	c: { env: AppEnv["Bindings"] },
	options?: { requireClientSecret?: boolean },
): QuickBooksOAuthConfig {
	const { QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI } = c.env;
	const { secret, legacySecret } = getQuickBooksTokenSecrets(c);
	if (!QUICKBOOKS_CLIENT_ID || !QUICKBOOKS_REDIRECT_URI) {
		throw new Error("QuickBooks isn't configured in this environment yet.");
	}

	if (options?.requireClientSecret !== false && !QUICKBOOKS_CLIENT_SECRET) {
		throw new Error("QuickBooks isn't configured in this environment yet.");
	}

	return {
		clientId: QUICKBOOKS_CLIENT_ID,
		clientSecret: QUICKBOOKS_CLIENT_SECRET,
		redirectUri: QUICKBOOKS_REDIRECT_URI,
		appUrl: c.env.APP_URL,
		secret,
		legacySecret,
	};
}

function getQuickBooksSyncConfig(c: { env: AppEnv["Bindings"] }): QuickBooksSyncConfig {
	const { secret, legacySecret } = getQuickBooksTokenSecrets(c);
	return {
		secret,
		legacySecret,
		clientId: c.env.QUICKBOOKS_CLIENT_ID,
		clientSecret: c.env.QUICKBOOKS_CLIENT_SECRET,
	};
}

quickbooksRoutes.get("/connect/callback", async (c) => {
	const cookieState = getCookie(c, QUICKBOOKS_STATE_COOKIE);
	const requestState = c.req.query("state");
	const shouldConsumeState = !!cookieState && cookieState === requestState;

	try {
		if (!shouldConsumeState) {
			throw new Error("Invalid QuickBooks OAuth state");
		}

		const config = getQuickBooksOAuthConfig(c);
		const state = decodeQuickBooksStateWithFallback(requestState, config);
		await assertCenterHasFeature(c.get("db"), state.centerId, "quickbooks");

		const result = await completeQuickBooksConnectCallback(
			c.get("db"),
			{
				code: c.req.query("code"),
				realmId: c.req.query("realmId"),
				state: requestState,
				error: c.req.query("error"),
				errorDescription: c.req.query("error_description"),
			},
			config,
		);

		deleteCookie(c, QUICKBOOKS_STATE_COOKIE, {
			path: "/api/quickbooks/connect/callback",
		});
		return c.redirect(result.redirectUrl);
	} catch (error) {
		if (shouldConsumeState) {
			deleteCookie(c, QUICKBOOKS_STATE_COOKIE, {
				path: "/api/quickbooks/connect/callback",
			});
		}
		const url = new URL("/settings", c.env.APP_URL);
		url.searchParams.set("quickbooks", "error");
		url.searchParams.set(
			"reason",
			error instanceof Error ? error.message : "QuickBooks connect failed",
		);
		return c.redirect(url.toString());
	}
});

// Belt-and-suspenders: quickbooks:manage is granted only to Owner in the role
// permission table (packages/shared/src/constants/roles.ts). requireRole("owner")
// pins that intent at the route so a future grant of quickbooks:manage to
// director/staff in the table cannot silently widen access here.
quickbooksRoutes.use(
	"*",
	requireAuth,
	requirePermission("quickbooks:manage"),
	requireRole("owner"),
	requireCenter,
	requireEntitlement("quickbooks"),
);

async function startQuickBooksConnectForCurrentCenter(c: Context<AppEnv>) {
	const centerId = c.get("centerId");
	const membershipId = c.get("membershipId");
	const userId = c.get("userId");
	if (!centerId || !membershipId || !userId) forbidden("No center membership found");

	let result: Awaited<ReturnType<typeof startQuickBooksConnect>>;
	try {
		const config = getQuickBooksOAuthConfig(c);
		result = await startQuickBooksConnect(centerId, membershipId, userId, config);

		setCookie(c, QUICKBOOKS_STATE_COOKIE, result.state, {
			httpOnly: true,
			sameSite: "Lax",
			secure: config.redirectUri.startsWith("https://"),
			maxAge: 10 * 60,
			path: "/api/quickbooks/connect/callback",
		});
	} catch (error) {
		badRequest(
			error instanceof Error
				? error.message
				: "QuickBooks isn't configured in this environment yet.",
		);
	}

	return c.json({ url: result.url });
}

quickbooksRoutes.post("/connect", startQuickBooksConnectForCurrentCenter);
quickbooksRoutes.post("/connect/start", startQuickBooksConnectForCurrentCenter);

quickbooksRoutes.get("/status", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const status = await getQuickBooksStatus(c.get("db"), centerId, {
		clientId: c.env.QUICKBOOKS_CLIENT_ID ?? "",
		clientSecret: c.env.QUICKBOOKS_CLIENT_SECRET ?? "",
	});
	return c.json(status);
});

quickbooksRoutes.post("/disconnect", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const result = await disconnectQuickBooks(c.get("db"), centerId);
	return c.json(result);
});

quickbooksRoutes.post("/sync", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const result = await runQuickBooksSync(
		c.get("db"),
		centerId,
		undefined,
		getQuickBooksSyncConfig(c),
	);
	return c.json({ sync: result });
});

quickbooksRoutes.post("/sync/:action", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parsedAction = quickbooksSyncActionSchema.safeParse(c.req.param("action"));
	if (!parsedAction.success) {
		badRequest("Invalid QuickBooks sync action");
	}
	const action = parsedAction.data;
	const result = await runQuickBooksSync(c.get("db"), centerId, action, getQuickBooksSyncConfig(c));
	return c.json({ sync: result });
});

quickbooksRoutes.get("/sync/history", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const history = await listQuickBooksSyncHistory(c.get("db"), centerId);
	return c.json({ history });
});

quickbooksRoutes.get("/reconciliation", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const status = c.req.query("status");
	if (status && status !== "open" && status !== "approved" && status !== "dismissed") {
		badRequest("Invalid QuickBooks reconciliation status");
	}
	const validStatus =
		status === "open" || status === "approved" || status === "dismissed" ? status : undefined;
	const items = validStatus
		? await listQuickBooksReconciliationItems(c.get("db"), centerId, validStatus)
		: await listQuickBooksReconciliationItems(c.get("db"), centerId);
	return c.json({ items });
});

quickbooksRoutes.post(
	"/reconciliation/:id/approve",
	zValidator("json", quickbooksReviewReconciliationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		const membershipId = c.get("membershipId");
		if (!centerId || !membershipId) forbidden("No center membership found");

		const idParse = idSchema.safeParse(c.req.param("id"));
		if (!idParse.success) return c.json({ error: "Invalid reconciliation ID" }, 400);

		const result = await approveQuickBooksReconciliation(
			c.get("db"),
			centerId,
			membershipId,
			idParse.data,
			c.req.valid("json"),
		);

		return c.json(result);
	},
);

quickbooksRoutes.post("/reconciliation/:id/dismiss", async (c) => {
	const centerId = c.get("centerId");
	const membershipId = c.get("membershipId");
	if (!centerId || !membershipId) forbidden("No center membership found");

	const idParseDismiss = idSchema.safeParse(c.req.param("id"));
	if (!idParseDismiss.success) return c.json({ error: "Invalid reconciliation ID" }, 400);

	const item = await dismissQuickBooksReconciliation(
		c.get("db"),
		centerId,
		membershipId,
		idParseDismiss.data,
	);

	return c.json({ item });
});

export { quickbooksRoutes };
