import { zValidator } from "@hono/zod-validator";
import { guidanceProgress } from "@pebbledesk/db";
import { type GuidanceProgress, guidanceProgressPatchSchema } from "@pebbledesk/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Context } from "hono";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { requireAuth, requireCenter } from "../middleware/auth.js";

export const guidanceRoutes = new Hono<AppEnv>();

type GuidanceProgressRow = typeof guidanceProgress.$inferSelect;
type JsonbExpression = AnyPgColumn | SQL<unknown>;

function serializeProgress(row: GuidanceProgressRow): GuidanceProgress {
	return {
		id: row.id,
		centerId: row.centerId,
		membershipId: row.membershipId,
		completedStepIds: row.completedStepIds,
		dismissedGuideIds: row.dismissedGuideIds,
		lastOpenedGuideId: row.lastOpenedGuideId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function emptyProgress(centerId: string, membershipId: string): GuidanceProgress {
	const now = new Date().toISOString();
	return {
		id: "",
		centerId,
		membershipId,
		completedStepIds: [],
		dismissedGuideIds: [],
		lastOpenedGuideId: null,
		createdAt: now,
		updatedAt: now,
	};
}

function getCurrentGuidanceContext(c: Context<AppEnv>) {
	const centerId = c.get("centerId");
	const membershipId = c.get("membershipId");

	if (!centerId) forbidden("No center membership found");
	if (!membershipId) unauthorized();

	return { centerId, membershipId, db: c.get("db") };
}

async function findCurrentProgress(c: Context<AppEnv>) {
	const { centerId, membershipId, db } = getCurrentGuidanceContext(c);

	const [row] = await db
		.select()
		.from(guidanceProgress)
		.where(
			and(eq(guidanceProgress.centerId, centerId), eq(guidanceProgress.membershipId, membershipId)),
		)
		.limit(1);

	return { row, centerId, membershipId, db };
}

function uniqueIds(ids: string[]): string[] {
	return Array.from(new Set(ids));
}

function jsonbStringArray(ids: string[]): SQL<unknown> {
	return sql`${JSON.stringify(ids)}::jsonb`;
}

function buildJsonbArrayExpression(
	column: AnyPgColumn,
	addIds: string[],
	removeId: string | undefined,
): JsonbExpression {
	let expression: JsonbExpression = column;
	if (addIds.length > 0) {
		expression = sql`(
			select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
			from jsonb_array_elements_text(${column} || ${jsonbStringArray(addIds)}) as value
		)`;
	}
	if (removeId) {
		expression = sql`(
			select coalesce(jsonb_agg(value), '[]'::jsonb)
			from jsonb_array_elements_text(${expression}) as value
			where value <> ${removeId}
		)`;
	}
	return expression;
}

function removeId(ids: string[], id: string | undefined): string[] {
	return id ? ids.filter((existingId) => existingId !== id) : ids;
}

guidanceRoutes.get("/progress", requireAuth, requireCenter, async (c) => {
	const { row, centerId, membershipId } = await findCurrentProgress(c);

	return c.json({
		progress: row ? serializeProgress(row) : emptyProgress(centerId, membershipId),
	});
});

guidanceRoutes.patch(
	"/progress",
	requireAuth,
	requireCenter,
	zValidator("json", guidanceProgressPatchSchema),
	async (c) => {
		const patch = c.req.valid("json");
		const { centerId, membershipId, db } = getCurrentGuidanceContext(c);
		const completedAdditions = uniqueIds([
			...(patch.completedStepIds ?? []),
			...(patch.completeStepId ? [patch.completeStepId] : []),
		]);
		const dismissedAdditions = uniqueIds([
			...(patch.dismissedGuideIds ?? []),
			...(patch.dismissGuideId ? [patch.dismissGuideId] : []),
		]);
		const insertValues = {
			centerId,
			membershipId,
			completedStepIds: removeId(completedAdditions, patch.uncompleteStepId),
			dismissedGuideIds: removeId(dismissedAdditions, patch.undismissGuideId),
			lastOpenedGuideId: "lastOpenedGuideId" in patch ? patch.lastOpenedGuideId : null,
			updatedAt: new Date(),
		};

		const [updated] = await db
			.insert(guidanceProgress)
			.values(insertValues)
			.onConflictDoUpdate({
				target: guidanceProgress.membershipId,
				set: {
					completedStepIds: buildJsonbArrayExpression(
						guidanceProgress.completedStepIds,
						completedAdditions,
						patch.uncompleteStepId,
					),
					dismissedGuideIds: buildJsonbArrayExpression(
						guidanceProgress.dismissedGuideIds,
						dismissedAdditions,
						patch.undismissGuideId,
					),
					lastOpenedGuideId:
						"lastOpenedGuideId" in patch
							? patch.lastOpenedGuideId
							: sql`${guidanceProgress.lastOpenedGuideId}`,
					updatedAt: insertValues.updatedAt,
				},
			})
			.returning();

		return c.json({ progress: serializeProgress(updated) });
	},
);
