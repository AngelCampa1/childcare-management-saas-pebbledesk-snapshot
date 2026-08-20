import { zValidator } from "@hono/zod-validator";
import { centers, memberships, users } from "@pebbledesk/db";
import { escapeHtml, ROLES } from "@pebbledesk/shared";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { buildBrandHeaderHtml } from "../lib/brand-email.js";
import type { AppEnv } from "../lib/context.js";
import { sendEmail } from "../lib/email.js";
import { badRequest, forbidden, notFound, unauthorized } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import {
	generateInvitationToken,
	hashInvitationToken,
	invitationExpiresAt,
} from "../lib/invitation-tokens.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const membersRoutes = new Hono<AppEnv>();

membersRoutes.use("*", requireAuth, requireCenter);

export const inviteMemberSchema = z.object({
	email: z.string().trim().toLowerCase().email(),
	role: z.enum(ROLES),
});
type MemberContext = Context<AppEnv>;
type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export async function listCenterMembers(c: MemberContext) {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");

	const members = await db
		.select({
			id: memberships.id,
			centerId: memberships.centerId,
			userId: memberships.userId,
			role: memberships.role,
			joinedAt: memberships.createdAt,
			acceptedAt: memberships.acceptedAt,
			invitedAt: memberships.invitedAt,
			userName: users.name,
			userEmail: sql<string | null>`coalesce(${users.email}, ${memberships.inviteEmail})`,
		})
		.from(memberships)
		.leftJoin(users, eq(memberships.userId, users.id))
		.where(and(eq(memberships.centerId, centerId), isNull(memberships.deactivatedAt)));

	return c.json({ members });
}

// GET /  -  list members with user name/email
membersRoutes.get("/", requireAuth, requireRole("owner", "director"), listCenterMembers);

export async function inviteCenterMember(c: MemberContext, input: InviteMemberInput) {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const { email, role } = input;

	const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

	// Check not already a member
	const [existing] = await db
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.centerId, centerId),
				isNull(memberships.deactivatedAt),
				user
					? or(eq(memberships.userId, user.id), eq(memberships.inviteEmail, email))
					: eq(memberships.inviteEmail, email),
			),
		)
		.limit(1);

	if (existing) badRequest("Invitation could not be sent");

	const inviteToken = generateInvitationToken();
	const inviteTokenHash = await hashInvitationToken(inviteToken);
	const [membership] = await db
		.insert(memberships)
		.values({
			centerId,
			userId: user?.id ?? null,
			inviteEmail: user ? null : email,
			role,
			invitedAt: new Date(),
			inviteTokenHash,
			inviteExpiresAt: invitationExpiresAt(),
		})
		.returning();

	// Send invitation email so the invitee knows they have been invited.
	const [center] = await db
		.select({ name: centers.name })
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);
	const acceptLink = `${c.env.APP_URL}/accept-invite?token=${inviteToken}`;
	const centerName = center?.name ?? "your center";
	const inviteeEmail = user?.email ?? email;
	const inviteeName = user?.name ?? inviteeEmail;
	try {
		await sendEmail({
			to: inviteeEmail,
			subject: `You've been invited to join ${centerName} on PebbleDesk`,
			html: `${buildBrandHeaderHtml()}<p>Hello ${escapeHtml(inviteeName)},</p><p>You have been invited to join <strong>${escapeHtml(centerName)}</strong> on PebbleDesk as a <strong>${escapeHtml(role)}</strong>.</p><p><a href="${escapeHtml(acceptLink)}">Accept invitation</a></p>`,
			text: `You have been invited to join ${centerName} on PebbleDesk as a ${role}. Accept here: ${acceptLink}`,
			apiKey: c.env.RESEND_API_KEY,
			fromEmail: c.env.RESEND_FROM_EMAIL,
		});
	} catch (emailErr) {
		console.warn("Failed to send invitation email", emailErr);
	}

	return c.json({ membership }, 201);
}

// POST /invites  -  invite member by email + role (owner only)
membersRoutes.post(
	"/invites",
	requireAuth,
	requireRole("owner"),
	zValidator("json", inviteMemberSchema),
	async (c) => inviteCenterMember(c, c.req.valid("json")),
);

export async function deleteCenterMember(c: MemberContext) {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const memberIdValidation = idSchema.safeParse(c.req.param("memberId"));
	if (!memberIdValidation.success) return c.json({ error: "Invalid ID format" }, 400);
	const memberId = memberIdValidation.data;
	const db = c.get("db");

	const [target] = await db
		.select()
		.from(memberships)
		.where(and(eq(memberships.id, memberId), eq(memberships.centerId, centerId)))
		.limit(1);

	if (!target) notFound("Member not found");

	if (target.role === "owner") {
		forbidden("Cannot remove the owner from the center");
	}

	if (target.acceptedAt) {
		const [deactivated] = await db
			.update(memberships)
			.set({ deactivatedAt: new Date() })
			.where(and(eq(memberships.id, memberId), eq(memberships.centerId, centerId)))
			.returning();

		if (!deactivated) notFound("Member not found");

		return c.json({ success: true });
	}

	await db
		.delete(memberships)
		.where(and(eq(memberships.id, memberId), eq(memberships.centerId, centerId)));

	return c.json({ success: true });
}

// DELETE /:memberId  -  remove member (owner only), can't remove owner
membersRoutes.delete("/:memberId", requireAuth, requireRole("owner"), deleteCenterMember);

export { membersRoutes };
