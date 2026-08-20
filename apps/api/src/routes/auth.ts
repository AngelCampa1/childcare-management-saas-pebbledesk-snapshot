import { auditLog, centers, memberships, staffAssignments, users } from "@pebbledesk/db";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { enrollAppSignupSequences } from "../lib/app-signup-sequencer.js";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { hashInvitationToken } from "../lib/invitation-tokens.js";
import { resolveActiveMembershipContext } from "../lib/membership-context.js";
import { findVerifiedPendingInvitation } from "../lib/pending-invitations.js";
import { requireAuth, resolveSessionUserId } from "../middleware/auth.js";

const authRoutes = new Hono<AppEnv>();
const uuidLikePattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const testMembershipIdPattern = /^membership-\d+$/;

type AuthAuditRequest = {
	headers: Headers;
	json: () => Promise<unknown>;
	formData: () => Promise<FormData>;
};

function resolveAuthAuditAction(path: string): "login" | "logout" | null {
	if (path.includes("/sign-in") || path.includes("/login")) return "login";
	if (path.includes("/sign-out") || path.includes("/logout")) return "logout";
	return null;
}

function readObjectString(value: unknown, key: string): string | null {
	if (typeof value !== "object" || value === null || !(key in value)) return null;
	const candidate = value[key as keyof typeof value];
	return typeof candidate === "string" ? candidate : null;
}

type AuthResponseUser = {
	id: string | null;
	email: string | null;
	name: string | null;
};

function readAuthResponseUser(payload: unknown): AuthResponseUser {
	const directUser = typeof payload === "object" && payload !== null ? payload : null;
	const user = directUser && "user" in directUser ? directUser.user : null;
	const data = directUser && "data" in directUser ? directUser.data : null;
	const dataUser = typeof data === "object" && data !== null && "user" in data ? data.user : null;
	const candidate = user ?? dataUser;
	return {
		id: readObjectString(candidate, "id"),
		email: readObjectString(candidate, "email"),
		name: readObjectString(candidate, "name"),
	};
}

async function resolveUserFromAuthResponse(response: Response): Promise<AuthResponseUser> {
	try {
		const payload = (await response.json()) as unknown;
		return readAuthResponseUser(payload);
	} catch {
		return { id: null, email: null, name: null };
	}
}

async function resolveUserIdFromAuthResponse(response: Response): Promise<string | null> {
	return (await resolveUserFromAuthResponse(response)).id;
}

async function resolveSignInEmail(request: AuthAuditRequest): Promise<string | null> {
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const payload = (await request.json()) as unknown;
			return readObjectString(payload, "email");
		}
		if (contentType.includes("application/x-www-form-urlencoded")) {
			const form = await request.formData();
			const email = form.get("email");
			return typeof email === "string" ? email : null;
		}
	} catch {
		return null;
	}
	return null;
}

async function resolveSignupRequestMetadata(
	request: AuthAuditRequest,
): Promise<{ email: string | null; name: string | null }> {
	try {
		const contentType = request.headers.get("content-type") ?? "";
		if (contentType.includes("application/json")) {
			const payload = (await request.json()) as unknown;
			return {
				email: readObjectString(payload, "email"),
				name: readObjectString(payload, "name"),
			};
		}
		if (contentType.includes("application/x-www-form-urlencoded")) {
			const form = await request.formData();
			const email = form.get("email");
			const name = form.get("name");
			return {
				email: typeof email === "string" ? email : null,
				name: typeof name === "string" ? name : null,
			};
		}
	} catch {
		return { email: null, name: null };
	}
	return { email: null, name: null };
}

async function resolveLoginUserIdFromEmail(
	c: Context<AppEnv>,
	request: AuthAuditRequest,
): Promise<string | null> {
	const email = await resolveSignInEmail(request);
	if (!email) return null;

	const [user] = await c
		.get("db")
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	return user?.id ?? null;
}

async function writeAuthAuditLog(
	c: Context<AppEnv>,
	path: string,
	request: AuthAuditRequest,
	response: Response,
) {
	const action = resolveAuthAuditAction(path);
	if (!action) return;

	const userId =
		action === "login"
			? (await resolveUserIdFromAuthResponse(response)) ||
				(await resolveLoginUserIdFromEmail(c, request)) ||
				c.get("userId") ||
				(await resolveSessionUserId(c.get("auth"), c.req.raw.headers))
			: c.get("userId") ||
				(await resolveUserIdFromAuthResponse(response)) ||
				(await resolveSessionUserId(c.get("auth"), c.req.raw.headers));
	if (!userId) return;

	await c
		.get("db")
		.insert(auditLog)
		.values({
			centerId: c.get("centerId") || null,
			userId,
			action,
			entityType: "auth",
			entityId: userId,
			changes: { path },
			ipAddress: c.req.header("CF-Connecting-IP") ?? c.req.header("x-forwarded-for") ?? null,
		});
}

async function writeAuthAuditLogBestEffort(
	c: Context<AppEnv>,
	path: string,
	request: AuthAuditRequest,
	response: Response,
) {
	try {
		await writeAuthAuditLog(c, path, request, response);
	} catch (error) {
		console.warn(
			"Auth audit log write failed",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function scheduleSignupTrialEmailsBestEffort(
	c: Context<AppEnv>,
	path: string,
	request: AuthAuditRequest,
	response: Response,
) {
	if (!path.includes("/sign-up") || response.status < 200 || response.status >= 400) return;
	const responseUser = await resolveUserFromAuthResponse(response);
	if (!responseUser.id) return;
	const requestMetadata = await resolveSignupRequestMetadata(request);

	try {
		await enrollAppSignupSequences(c.env, {
			userId: responseUser.id,
			email: responseUser.email ?? requestMetadata.email,
			name: responseUser.name ?? requestMetadata.name,
		});
	} catch (error) {
		console.warn(
			"Signup trial email queue write failed",
			error instanceof Error ? error.message : String(error),
		);
	}
}

async function resolveAuthStatusEmailMetadata(c: Context<AppEnv>, userId: string) {
	try {
		const [user] = await c
			.get("db")
			.select({ email: users.email, emailVerified: users.emailVerified })
			.from(users)
			.where(eq(users.id, userId));
		if (!user) return {};
		return {
			email: user.email,
			emailVerified: user.emailVerified,
		};
	} catch {
		return {};
	}
}

async function resolveVerifiedInvitationUser(c: Context<AppEnv>, userId: string) {
	const [user] = await c
		.get("db")
		.select({ email: users.email, emailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user?.emailVerified) {
		forbidden("Verify your email before accepting this invitation");
	}

	return user;
}

authRoutes.get("/status", async (c) => {
	const auth = c.get("auth");
	const userId = c.get("userId") || (await resolveSessionUserId(auth, c.req.raw.headers));

	if (!userId) {
		return c.json({ status: "unauthenticated" });
	}

	const db = c.get("db");
	const activeMembership =
		c.get("centerId") && c.get("membershipId") && c.get("role")
			? {
					centerId: c.get("centerId"),
					membershipId: c.get("membershipId"),
					role: c.get("role"),
				}
			: await resolveActiveMembershipContext(db, userId, c);
	const pendingInvitation = await findVerifiedPendingInvitation(c.get("db"), userId);

	if (!activeMembership) {
		const emailMetadata = await resolveAuthStatusEmailMetadata(c, userId);
		if (pendingInvitation) {
			return c.json({
				status: "invite_pending",
				invitation: pendingInvitation,
				...emailMetadata,
			});
		}

		return c.json({ status: "onboarding_required", ...emailMetadata });
	}

	if ("error" in activeMembership) {
		const emailMetadata = await resolveAuthStatusEmailMetadata(c, userId);
		return c.json({
			status: "center_selection_required",
			centers: activeMembership.centers,
			...emailMetadata,
		});
	}

	const emailMetadata = await resolveAuthStatusEmailMetadata(c, userId);
	return c.json({ status: "authenticated", ...emailMetadata });
});

authRoutes.post("/resend-verification", async (c) => {
	const userId = c.get("userId") || (await resolveSessionUserId(c.get("auth"), c.req.raw.headers));
	if (!userId) {
		unauthorized();
	}

	const [user] = await c
		.get("db")
		.select({ email: users.email, emailVerified: users.emailVerified })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) {
		unauthorized();
	}
	if (user.emailVerified) {
		badRequest("Email is already verified");
	}

	const url = new URL(c.req.url);
	const request = new Request(`${url.origin}/api/auth/send-verification-email`, {
		method: "POST",
		headers: c.req.raw.headers,
		body: JSON.stringify({
			email: user.email,
			callbackURL: `${c.env.APP_URL}/login`,
		}),
	});
	const response = await c.get("auth").handler(request);
	if (!response.ok) {
		return response;
	}
	return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();
	const db = c.get("db");
	const pendingInvitation = await findVerifiedPendingInvitation(db, userId);

	const centerId = c.get("centerId");
	const membershipId = c.get("membershipId");
	const role = c.get("role");
	if (!centerId || !membershipId || !role) {
		if (pendingInvitation) {
			return c.json(
				{
					error: "Invitation pending",
					code: "invite_pending",
					invitation: pendingInvitation,
				},
				403,
			);
		}

		return c.json(
			{
				error: "No center membership found",
				code: "onboarding_required",
			},
			403,
		);
	}

	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!user) unauthorized();
	const [center] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
	if (!center) notFound("Center not found");
	const today = new Date().toISOString().split("T")[0];
	const staffClassrooms = await db
		.select({ classroomId: staffAssignments.classroomId })
		.from(staffAssignments)
		.where(
			and(
				eq(staffAssignments.centerId, centerId),
				eq(staffAssignments.membershipId, membershipId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	return c.json({
		session: {
			user: { id: userId, name: user.name, email: user.email },
			membership: {
				id: membershipId,
				centerId,
				role,
			},
			center: {
				id: center.id,
				name: center.name,
				state: center.state,
				timezone: center.timezone,
				subscriptionStatus: center.subscriptionStatus,
				subscriptionPlan: center.subscriptionPlan,
				trialEndsAt: center.trialEndsAt,
				currentPeriodEnd: center.currentPeriodEnd,
				canOpenBillingPortal: Boolean(center.stripeCustomerId),
			},
			classroomIds: staffClassrooms.map((assignment) => assignment.classroomId),
		},
		pendingInvitation,
	});
});

authRoutes.post("/invitations/:token/accept", requireAuth, async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const token = c.req.param("token");
	if (!token || token.length > 256) {
		return c.json({ error: "Invalid invitation token" }, 400);
	}
	const db = c.get("db");
	const isMembershipIdFallback = uuidLikePattern.test(token) || testMembershipIdPattern.test(token);
	if (token.length < 32 && !isMembershipIdFallback) {
		return c.json({ error: "Invalid invitation token" }, 400);
	}

	const user = await resolveVerifiedInvitationUser(c, userId);

	const inviteTokenHash = isMembershipIdFallback ? null : await hashInvitationToken(token);
	const normalizedUserEmail = user.email?.toLowerCase() ?? "";

	const [membership] = inviteTokenHash
		? await db
				.select()
				.from(memberships)
				.where(
					and(
						eq(memberships.inviteTokenHash, inviteTokenHash),
						or(eq(memberships.userId, userId), eq(memberships.inviteEmail, normalizedUserEmail)),
						isNull(memberships.deactivatedAt),
					),
				)
				.limit(1)
		: await db
				.select()
				.from(memberships)
				.where(
					and(
						eq(memberships.id, token),
						eq(memberships.userId, userId),
						isNull(memberships.deactivatedAt),
					),
				)
				.limit(1);

	if (!membership) {
		notFound("Invitation not found");
	}

	if (membership.acceptedAt) {
		badRequest("Invitation has already been accepted");
	}

	if (!membership.inviteExpiresAt || membership.inviteExpiresAt <= new Date()) {
		badRequest("Invitation has expired");
	}

	const [acceptedMembership] = await db
		.update(memberships)
		.set({
			userId,
			inviteEmail: null,
			acceptedAt: new Date(),
			inviteTokenHash: null,
			inviteExpiresAt: null,
		})
		.where(
			inviteTokenHash
				? and(
						eq(memberships.id, membership.id),
						eq(memberships.inviteTokenHash, inviteTokenHash),
						isNull(memberships.deactivatedAt),
					)
				: and(
						eq(memberships.id, membership.id),
						eq(memberships.userId, userId),
						isNull(memberships.deactivatedAt),
					),
		)
		.returning();

	if (!acceptedMembership) {
		notFound("Invitation not found");
	}

	return c.json({ membership: acceptedMembership });
});

authRoutes.all("/*", async (c) => {
	const auth = c.get("auth");
	const requestForAudit = c.req.raw.clone();
	const requestForSignup = c.req.raw.clone();
	const response = await auth.handler(c.req.raw);
	await scheduleSignupTrialEmailsBestEffort(c, c.req.path, requestForSignup, response.clone());
	if (response.status >= 200 && response.status < 400) {
		await writeAuthAuditLogBestEffort(c, c.req.path, requestForAudit, response.clone());
	}
	return response;
});

export { authRoutes };
