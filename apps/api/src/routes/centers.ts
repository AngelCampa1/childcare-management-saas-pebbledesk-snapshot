import { zValidator } from "@hono/zod-validator";
import { centers, memberships } from "@pebbledesk/db";
import { createCenterSchema, updateCenterSchema } from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	DEFAULT_CENTER_SUBSCRIPTION_PLAN,
	DEFAULT_CENTER_SUBSCRIPTION_STATUS,
	ROLES,
	TRIAL_DAYS,
} from "@pebbledesk/shared/constants";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound, unauthorized } from "../lib/errors.js";
import { findPendingInvitation } from "../lib/pending-invitations.js";
import { analyticsDistinctId, getExecutionContext, schedulePostHogEvent } from "../lib/posthog.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
	deleteCenterMember,
	inviteCenterMember,
	inviteMemberSchema,
	listCenterMembers,
} from "./members.js";

const centersRoutes = new Hono<AppEnv>();
const MAX_SLUG_ATTEMPTS = 5;

function slugify(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function isCenterSlugUniqueViolation(error: unknown) {
	const isDirectUniqueViolation =
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505" &&
		(("constraint" in error &&
			(error as { constraint?: unknown }).constraint === "centers_slug_unique") ||
			("message" in error &&
				typeof (error as { message?: unknown }).message === "string" &&
				(error as { message: string }).message.includes("centers_slug_unique")));

	if (isDirectUniqueViolation) {
		return true;
	}

	if (typeof error === "object" && error !== null && "cause" in error) {
		return isCenterSlugUniqueViolation((error as { cause?: unknown }).cause);
	}

	return false;
}

function buildSlug(baseSlug: string, attempt: number) {
	return attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildTrialEndDate(now = new Date()) {
	return new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

function assertCurrentCenterPath(c: Context<AppEnv>) {
	const centerId = c.get("centerId");
	const id = c.req.param("id");

	if (centerId !== id) {
		forbidden("You do not have access to this center");
	}
}

// POST / — create center (any authenticated user)
centersRoutes.post("/", requireAuth, zValidator("json", createCenterSchema), async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();
	if (!c.get("centerId")) {
		const pendingInvitation = await findPendingInvitation(c.get("db"), userId);
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
	}

	const db = c.get("db");
	const data = c.req.valid("json");
	const trialEndsAt = buildTrialEndDate();

	const baseSlug = slugify(data.name);

	for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
		try {
			const result = await db.transaction(async (tx) => {
				const [center] = await tx
					.insert(centers)
					.values({
						name: data.name,
						slug: buildSlug(baseSlug, attempt),
						address: data.address,
						city: data.city,
						state: data.state,
						zip: data.zip,
						phone: data.phone ?? null,
						licenseNumber: data.licenseNumber ?? null,
						licensedCapacity: data.licensedCapacity ?? null,
						timezone: data.timezone,
						subscriptionStatus: DEFAULT_CENTER_SUBSCRIPTION_STATUS,
						subscriptionPlan: data.subscriptionPlan ?? DEFAULT_CENTER_SUBSCRIPTION_PLAN,
						trialEndsAt,
						currentPeriodEnd: trialEndsAt,
					})
					.returning();

				if (!center) {
					throw new Error("Failed to create center");
				}

				const [membership] = await tx
					.insert(memberships)
					.values({
						centerId: center.id,
						userId,
						role: ROLES[0],
						acceptedAt: new Date(),
					})
					.returning();

				if (!membership) {
					throw new Error("Failed to create owner membership");
				}

				return { center, membership };
			});

			schedulePostHogEvent(c.env, getExecutionContext(c), {
				event: ANALYTICS_EVENTS.centerCreated,
				distinctId: await analyticsDistinctId("center", result.center.id),
				properties: {
					plan: result.center.subscriptionPlan,
					state: result.center.state,
					timezone: result.center.timezone,
					self_serve: true,
				},
			});

			return c.json(result, 201);
		} catch (error) {
			if (isCenterSlugUniqueViolation(error) && attempt < MAX_SLUG_ATTEMPTS - 1) {
				continue;
			}

			throw error;
		}
	}

	throw new Error("Failed to allocate unique center slug");
});

// GET /:id — get center (user must belong to it)
centersRoutes.get("/:id", requireAuth, async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const centerId = c.get("centerId");
	const id = c.req.param("id");

	if (centerId !== id) {
		forbidden("You do not have access to this center");
	}

	const db = c.get("db");
	const [center] = await db.select().from(centers).where(eq(centers.id, id)).limit(1);

	if (!center) notFound("Center not found");

	return c.json({ center });
});

// PATCH /:id — update center (owner only)
centersRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner"),
	zValidator("json", updateCenterSchema),
	async (c) => {
		const centerId = c.get("centerId");
		const id = c.req.param("id");

		if (centerId !== id) {
			forbidden("You do not have access to this center");
		}

		const db = c.get("db");
		const data = c.req.valid("json");

		const updateData: Partial<typeof centers.$inferInsert> = {};
		if (data.name !== undefined) updateData.name = data.name;
		if (data.address !== undefined) updateData.address = data.address;
		if (data.city !== undefined) updateData.city = data.city;
		if (data.state !== undefined) updateData.state = data.state;
		if (data.zip !== undefined) updateData.zip = data.zip;
		if (data.phone !== undefined) updateData.phone = data.phone;
		if (data.licenseNumber !== undefined) updateData.licenseNumber = data.licenseNumber;
		if (data.licensedCapacity !== undefined) updateData.licensedCapacity = data.licensedCapacity;
		if (data.timezone !== undefined) updateData.timezone = data.timezone;
		updateData.updatedAt = new Date();

		const [updated] = await db
			.update(centers)
			.set(updateData)
			.where(eq(centers.id, id))
			.returning();

		if (!updated) notFound("Center not found");

		return c.json({ center: updated });
	},
);

// GET /:id/members — documented team roster route
centersRoutes.get("/:id/members", requireAuth, requireRole("owner", "director"), async (c) => {
	assertCurrentCenterPath(c);
	return listCenterMembers(c);
});

// POST /:id/invites — documented team invite route
centersRoutes.post(
	"/:id/invites",
	requireAuth,
	requireRole("owner"),
	zValidator("json", inviteMemberSchema),
	async (c) => {
		assertCurrentCenterPath(c);
		return inviteCenterMember(c, c.req.valid("json"));
	},
);

// DELETE /:id/members/:memberId — documented team removal route
centersRoutes.delete("/:id/members/:memberId", requireAuth, requireRole("owner"), async (c) => {
	assertCurrentCenterPath(c);
	return deleteCenterMember(c);
});

export { centersRoutes };
