import { zValidator } from "@hono/zod-validator";
import { centers, checkIns, subsidyCases, subsidyClaims } from "@pebbledesk/db";
import { createSubsidyClaimSchema, updateSubsidyClaimSchema } from "@pebbledesk/shared";
import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
	computeClaimAmount,
	filterAttendanceEntriesForPeriod,
	summarizeAttendance,
} from "../lib/billing-subsidy.js";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/plan.js";

// The in-transaction overlap read below cannot stop two concurrent requests
// from each passing their read and both inserting. The `subsidy_claims_no_overlap`
// GiST exclusion constraint (migration 0067) is the race-safe backstop: Postgres
// raises error 23P01 when a write would create an overlapping claim period for the
// same center/case. Detect that here (recursing into wrapped `cause` chains, as the
// driver nests the original error) so the route can return the same 409 overlap
// response instead of a generic 500.
function isSubsidyClaimOverlapExclusionViolation(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;

	const code = (error as { code?: unknown }).code;
	const constraint = (error as { constraint?: unknown }).constraint;
	const message = (error as { message?: unknown }).message;
	if (
		code === "23P01" &&
		(constraint === "subsidy_claims_no_overlap" ||
			(typeof message === "string" && message.includes("subsidy_claims_no_overlap")))
	) {
		return true;
	}

	if ("cause" in error) {
		return isSubsidyClaimOverlapExclusionViolation((error as { cause?: unknown }).cause);
	}

	return false;
}

const CLAIM_PERIOD_OVERLAP_RESPONSE = {
	error: "claim_period_overlap",
	message: "A subsidy claim already covers part of this period for this case",
} as const;

const subsidyClaimsRoutes = new Hono<AppEnv>();

subsidyClaimsRoutes.use("*", requireAuth, requireCenter, requireEntitlement("subsidies"));

const reconciliationQuerySchema = z
	.object({
		subsidyCaseId: idSchema,
		periodStart: z.string().date(),
		periodEnd: z.string().date(),
	})
	.refine((data) => data.periodStart <= data.periodEnd, {
		message: "periodStart must be on or before periodEnd",
		path: ["periodStart"],
	});

type UpdateSubsidyClaimInput = z.infer<typeof updateSubsidyClaimSchema>;

const LOCKED_SUBSIDY_CLAIM_SOURCE_FIELDS = [
	"subsidyCaseId",
	"periodStart",
	"periodEnd",
	"daysAttended",
	"hoursAttended",
	"amountClaimed",
	"submittedAt",
] satisfies readonly (keyof UpdateSubsidyClaimInput)[];

function toIsoString(value: Date | string | null | undefined) {
	if (!value) return undefined;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseOptionalSubsidyCaseFilter(subsidyCaseId?: string) {
	if (!subsidyCaseId) return undefined;
	const parsed = idSchema.safeParse(subsidyCaseId);
	if (!parsed.success) {
		badRequest("Invalid subsidy case ID");
	}
	return parsed.data;
}

function readRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) {
		return result as T[];
	}
	const rows = (result as { rows?: unknown }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

function hasLockedSourceField(data: UpdateSubsidyClaimInput) {
	return LOCKED_SUBSIDY_CLAIM_SOURCE_FIELDS.some((field) => Object.hasOwn(data, field));
}

subsidyClaimsRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", paginationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const subsidyCaseId = parseOptionalSubsidyCaseFilter(c.req.query("subsidyCaseId"));
		const conditions = [eq(subsidyClaims.centerId, centerId)];
		const { limit, offset } = resolvePagination(c.req.valid("query"));

		if (subsidyCaseId) {
			conditions.push(eq(subsidyClaims.subsidyCaseId, subsidyCaseId));
		}

		const results = await db
			.select()
			.from(subsidyClaims)
			.where(and(...conditions))
			.limit(limit)
			.offset(offset);

		return c.json({ subsidyClaims: results });
	},
);

subsidyClaimsRoutes.get(
	"/reconciliation",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const query = reconciliationQuerySchema.safeParse({
			subsidyCaseId: c.req.query("subsidyCaseId"),
			periodStart: c.req.query("periodStart"),
			periodEnd: c.req.query("periodEnd"),
		});

		if (!query.success) {
			badRequest(query.error.issues[0]?.message ?? "Invalid reconciliation query");
		}

		const { subsidyCaseId, periodStart, periodEnd } = query.data;
		const db = c.get("db");
		const [subsidyCase] = await db
			.select()
			.from(subsidyCases)
			.where(and(eq(subsidyCases.id, subsidyCaseId), eq(subsidyCases.centerId, centerId)))
			.limit(1);

		if (!subsidyCase) notFound("Subsidy case not found");

		const [center] = await db
			.select({ timezone: centers.timezone })
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);

		const attendanceEntries = await db
			.select({
				checkedInAt: checkIns.checkedInAt,
				checkedOutAt: checkIns.checkedOutAt,
			})
			.from(checkIns)
			.where(and(eq(checkIns.centerId, centerId), eq(checkIns.childId, subsidyCase.childId)));

		const timezone = center?.timezone ?? "UTC";
		const attendance = summarizeAttendance(
			filterAttendanceEntriesForPeriod(attendanceEntries, periodStart, periodEnd, timezone),
			timezone,
		);
		const claim = computeClaimAmount(subsidyCase, attendance);

		return c.json({
			subsidyCase,
			periodStart,
			periodEnd,
			summary: {
				...attendance,
				...claim,
			},
		});
	},
);

subsidyClaimsRoutes.get("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
	const id = idValidation.data;

	const db = c.get("db");
	const [subsidyClaim] = await db
		.select()
		.from(subsidyClaims)
		.where(and(eq(subsidyClaims.id, id), eq(subsidyClaims.centerId, centerId)))
		.limit(1);

	if (!subsidyClaim) notFound("Subsidy claim not found");
	return c.json({ subsidyClaim });
});

subsidyClaimsRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createSubsidyClaimSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		const [subsidyCase] = await db
			.select({ id: subsidyCases.id, status: subsidyCases.status })
			.from(subsidyCases)
			.where(and(eq(subsidyCases.id, data.subsidyCaseId), eq(subsidyCases.centerId, centerId)))
			.limit(1);

		if (!subsidyCase) notFound("Subsidy case not found");
		if (subsidyCase.status !== "active") {
			badRequest("Cannot create a claim against a non-active subsidy case");
		}

		let subsidyClaim:
			| { overlap: true }
			| { overlap: false; inserted: typeof subsidyClaims.$inferSelect | undefined };
		try {
			subsidyClaim = await db.transaction(async (tx) => {
				const [overlap] = await tx
					.select({ id: subsidyClaims.id })
					.from(subsidyClaims)
					.where(
						and(
							eq(subsidyClaims.centerId, centerId),
							eq(subsidyClaims.subsidyCaseId, data.subsidyCaseId),
							lte(subsidyClaims.periodStart, data.periodEnd),
							gte(subsidyClaims.periodEnd, data.periodStart),
						),
					);

				if (overlap) {
					return { overlap: true as const };
				}

				const [inserted] = await tx
					.insert(subsidyClaims)
					.values({
						centerId,
						subsidyCaseId: data.subsidyCaseId,
						periodStart: data.periodStart,
						periodEnd: data.periodEnd,
						daysAttended: data.daysAttended,
						hoursAttended: data.hoursAttended,
						amountClaimed: data.amountClaimed,
						amountApproved: data.amountApproved,
						amountPaid: data.amountPaid,
						status: data.status,
						submittedAt: data.submittedAt ? new Date(data.submittedAt) : undefined,
						paidAt: data.paidAt ? new Date(data.paidAt) : undefined,
					})
					.returning();

				return { overlap: false as const, inserted };
			});
		} catch (err) {
			if (isSubsidyClaimOverlapExclusionViolation(err)) {
				return c.json(CLAIM_PERIOD_OVERLAP_RESPONSE, 409);
			}
			throw err;
		}

		if (subsidyClaim.overlap) {
			return c.json(CLAIM_PERIOD_OVERLAP_RESPONSE, 409);
		}

		if (!subsidyClaim.inserted) {
			throw new Error("Failed to create subsidy claim");
		}

		return c.json({ subsidyClaim: subsidyClaim.inserted }, 201);
	},
);

subsidyClaimsRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateSubsidyClaimSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const patchIdValidation = idSchema.safeParse(c.req.param("id"));
		if (!patchIdValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const patchId = patchIdValidation.data;

		const db = c.get("db");
		const data = c.req.valid("json");
		const [existingClaim] = await db
			.select()
			.from(subsidyClaims)
			.where(and(eq(subsidyClaims.id, patchId), eq(subsidyClaims.centerId, centerId)))
			.limit(1);

		if (!existingClaim) notFound("Subsidy claim not found");
		if (existingClaim.status !== "draft" && hasLockedSourceField(data)) {
			return c.json(
				{
					error: "claim_locked",
					message: "Submitted subsidy claims cannot edit source claim fields",
				},
				409,
			);
		}
		// A non-draft claim cannot be reverted to draft. Allowing it would reopen
		// the source-field lock above (a second PATCH could then edit locked
		// financial fields), defeating the immutability guarantee for submitted
		// claims. Submission is one-way; there is no reopen flow.
		if (data.status === "draft" && existingClaim.status !== "draft") {
			return c.json(
				{
					error: "invalid_status_transition",
					message: `Cannot revert a '${existingClaim.status}' subsidy claim back to draft`,
				},
				409,
			);
		}

		const mergedClaim = createSubsidyClaimSchema.safeParse({
			subsidyCaseId: data.subsidyCaseId ?? existingClaim.subsidyCaseId,
			periodStart: data.periodStart ?? existingClaim.periodStart,
			periodEnd: data.periodEnd ?? existingClaim.periodEnd,
			daysAttended: data.daysAttended ?? existingClaim.daysAttended,
			hoursAttended: data.hoursAttended ?? Number(existingClaim.hoursAttended),
			amountClaimed: data.amountClaimed ?? Number(existingClaim.amountClaimed),
			amountApproved:
				data.amountApproved ??
				(existingClaim.amountApproved === null ? undefined : Number(existingClaim.amountApproved)),
			amountPaid:
				data.amountPaid ??
				(existingClaim.amountPaid === null ? undefined : Number(existingClaim.amountPaid)),
			status: data.status ?? existingClaim.status,
			submittedAt: data.submittedAt ?? toIsoString(existingClaim.submittedAt),
			paidAt: data.paidAt ?? toIsoString(existingClaim.paidAt),
		});

		if (!mergedClaim.success) {
			badRequest(mergedClaim.error.issues[0]?.message ?? "Invalid subsidy claim state");
		}

		if (data.subsidyCaseId !== undefined) {
			const [subsidyCase] = await db
				.select({ id: subsidyCases.id })
				.from(subsidyCases)
				.where(and(eq(subsidyCases.id, data.subsidyCaseId), eq(subsidyCases.centerId, centerId)))
				.limit(1);

			if (!subsidyCase) notFound("Subsidy case not found");
		}
		const updateData: Partial<typeof subsidyClaims.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (data.subsidyCaseId !== undefined) updateData.subsidyCaseId = data.subsidyCaseId;
		if (data.periodStart !== undefined) updateData.periodStart = data.periodStart;
		if (data.periodEnd !== undefined) updateData.periodEnd = data.periodEnd;
		if (data.daysAttended !== undefined) updateData.daysAttended = data.daysAttended;
		if (data.hoursAttended !== undefined) updateData.hoursAttended = data.hoursAttended;
		if (data.amountClaimed !== undefined) updateData.amountClaimed = data.amountClaimed;
		if (data.amountApproved !== undefined) updateData.amountApproved = data.amountApproved;
		if (data.amountPaid !== undefined) updateData.amountPaid = data.amountPaid;
		if (data.status !== undefined) updateData.status = data.status;
		if (data.submittedAt !== undefined) updateData.submittedAt = new Date(data.submittedAt);
		if (data.paidAt !== undefined) updateData.paidAt = new Date(data.paidAt);

		const effectivePeriodStart = data.periodStart ?? existingClaim.periodStart;
		const effectivePeriodEnd = data.periodEnd ?? existingClaim.periodEnd;
		const effectiveCaseId = data.subsidyCaseId ?? existingClaim.subsidyCaseId;

		let patchResult:
			| { overlap: true }
			| { overlap: false; updated: typeof subsidyClaims.$inferSelect };
		try {
			patchResult = await db.transaction(async (tx) => {
				const [overlap] = await tx
					.select({ id: subsidyClaims.id })
					.from(subsidyClaims)
					.where(
						and(
							eq(subsidyClaims.centerId, centerId),
							eq(subsidyClaims.subsidyCaseId, effectiveCaseId),
							ne(subsidyClaims.id, patchId),
							lte(subsidyClaims.periodStart, effectivePeriodEnd),
							gte(subsidyClaims.periodEnd, effectivePeriodStart),
						),
					);

				if (overlap) {
					return { overlap: true as const };
				}

				const [updated] = await tx
					.update(subsidyClaims)
					.set(updateData)
					.where(and(eq(subsidyClaims.id, patchId), eq(subsidyClaims.centerId, centerId)))
					.returning();

				return { overlap: false as const, updated };
			});
		} catch (err) {
			// The in-transaction overlap read above cannot stop a concurrent write
			// that commits an overlapping period between the read and this UPDATE.
			// The subsidy_claims_no_overlap GiST exclusion constraint (migration
			// 0067) is the backstop; map its violation to a clean 409 exactly as
			// the POST handler does, rather than leaking a raw 500.
			if (isSubsidyClaimOverlapExclusionViolation(err)) {
				return c.json(CLAIM_PERIOD_OVERLAP_RESPONSE, 409);
			}
			throw err;
		}

		if (patchResult.overlap) {
			return c.json(CLAIM_PERIOD_OVERLAP_RESPONSE, 409);
		}

		if (!patchResult.updated) notFound("Subsidy claim not found");
		return c.json({ subsidyClaim: patchResult.updated });
	},
);

subsidyClaimsRoutes.post(
	"/:id/submit",
	requireAuth,
	requireRole("owner", "director"),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const id = idValidation.data;

		const db = c.get("db");
		const submitResult = await db.transaction(async (tx) => {
			const [lockedClaim] = readRows<{ id: string; status: string }>(
				await tx.execute(sql`
					select ${subsidyClaims.id} as "id", ${subsidyClaims.status} as "status"
					from ${subsidyClaims}
					where ${subsidyClaims.id} = ${id}
						and ${subsidyClaims.centerId} = ${centerId}
					for update
				`),
			);

			if (!lockedClaim) notFound("Subsidy claim not found");
			if (lockedClaim.status !== "draft") {
				return { status: "locked" as const, claimStatus: lockedClaim.status };
			}

			const now = new Date();
			const [subsidyClaim] = await tx
				.update(subsidyClaims)
				.set({
					status: "submitted",
					submittedAt: now,
					updatedAt: now,
				})
				.where(and(eq(subsidyClaims.id, id), eq(subsidyClaims.centerId, centerId)))
				.returning();

			if (!subsidyClaim) notFound("Subsidy claim not found");
			return { status: "submitted" as const, subsidyClaim };
		});

		if (submitResult.status === "locked") {
			return c.json(
				{
					error: "invalid_status_transition",
					message: `Cannot submit a '${submitResult.claimStatus}' subsidy claim`,
				},
				409,
			);
		}

		return c.json({ subsidyClaim: submitResult.subsidyClaim });
	},
);

subsidyClaimsRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
	const id = idValidation.data;

	const db = c.get("db");
	const deleteResult = await db.transaction(async (tx) => {
		const [lockedClaim] = readRows<{ id: string; status: string }>(
			await tx.execute(sql`
				select ${subsidyClaims.id} as "id", ${subsidyClaims.status} as "status"
				from ${subsidyClaims}
				where ${subsidyClaims.id} = ${id}
					and ${subsidyClaims.centerId} = ${centerId}
				for update
			`),
		);

		if (!lockedClaim) notFound("Subsidy claim not found");
		if (lockedClaim.status !== "draft") {
			return { status: "locked" as const };
		}

		const [deleted] = await tx
			.delete(subsidyClaims)
			.where(and(eq(subsidyClaims.id, id), eq(subsidyClaims.centerId, centerId)))
			.returning();

		if (!deleted) notFound("Subsidy claim not found");
		return { status: "deleted" as const, deleted };
	});

	if (deleteResult.status === "locked") {
		return c.json(
			{
				error: "claim_locked",
				message: "Only draft subsidy claims can be deleted",
			},
			409,
		);
	}
	const deletedClaim = deleteResult.deleted;
	return c.json({ deleted: true, id: deletedClaim.id });
});

export { subsidyClaimsRoutes };
