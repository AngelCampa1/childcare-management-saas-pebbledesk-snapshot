import { zValidator } from "@hono/zod-validator";
import { children, subsidyCases, subsidyClaims } from "@pebbledesk/db";
import {
	canTransitionSubsidyStatus,
	createSubsidyCaseSchema,
	isTerminalSubsidyStatus,
	updateSubsidyCaseSchema,
} from "@pebbledesk/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { requireEntitlement } from "../middleware/plan.js";

const subsidyCasesRoutes = new Hono<AppEnv>();

subsidyCasesRoutes.use("*", requireAuth, requireCenter, requireEntitlement("subsidies"));

function readRows<T>(result: unknown): T[] {
	if (Array.isArray(result)) {
		return result as T[];
	}
	const rows = (result as { rows?: unknown }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

subsidyCasesRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", paginationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const childId = c.req.query("childId");
		const conditions = [eq(subsidyCases.centerId, centerId)];
		const { limit, offset } = resolvePagination(c.req.valid("query"));

		if (childId) {
			const parsed = idSchema.safeParse(childId);
			if (!parsed.success) return c.json({ error: "Invalid ID format" }, 400);
			conditions.push(eq(subsidyCases.childId, parsed.data));
		}

		const results = await db
			.select()
			.from(subsidyCases)
			.where(and(...conditions))
			.orderBy(desc(subsidyCases.createdAt))
			.limit(limit)
			.offset(offset);

		return c.json({ subsidyCases: results });
	},
);

subsidyCasesRoutes.get("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
	const id = idValidation.data;

	const db = c.get("db");
	const [subsidyCase] = await db
		.select()
		.from(subsidyCases)
		.where(and(eq(subsidyCases.id, id), eq(subsidyCases.centerId, centerId)))
		.limit(1);

	if (!subsidyCase) notFound("Subsidy case not found");
	return c.json({ subsidyCase });
});

subsidyCasesRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createSubsidyCaseSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		const [child] = await db
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, data.childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");

		const [subsidyCase] = await db
			.insert(subsidyCases)
			.values({
				centerId,
				...data,
			})
			.returning();

		if (!subsidyCase) {
			throw new Error("Failed to create subsidy case");
		}

		return c.json({ subsidyCase }, 201);
	},
);

subsidyCasesRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateSubsidyCaseSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const idValidation = idSchema.safeParse(c.req.param("id"));
		if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
		const id = idValidation.data;

		const db = c.get("db");
		const data = c.req.valid("json");

		// Always fetch the current record to enforce terminal-state immutability
		// and validate status transitions. A single SELECT covers both checks.
		const [existing] = await db
			.select({
				status: subsidyCases.status,
				effectiveDate: subsidyCases.effectiveDate,
				expirationDate: subsidyCases.expirationDate,
			})
			.from(subsidyCases)
			.where(and(eq(subsidyCases.id, id), eq(subsidyCases.centerId, centerId)))
			.limit(1);

		if (!existing) notFound("Subsidy case not found");

		if (isTerminalSubsidyStatus(existing.status)) {
			return c.json(
				{
					error: "case_terminal",
					message: `Subsidy case is ${existing.status} and cannot be modified`,
				},
				409,
			);
		}

		if (data.effectiveDate !== undefined || data.expirationDate !== undefined) {
			const mergedDates = updateSubsidyCaseSchema.safeParse({
				effectiveDate: data.effectiveDate ?? existing.effectiveDate,
				expirationDate: data.expirationDate ?? existing.expirationDate ?? undefined,
			});

			if (!mergedDates.success) {
				badRequest(mergedDates.error.issues[0]?.message ?? "Invalid subsidy case date range");
			}
		}

		if (data.status !== undefined) {
			if (!canTransitionSubsidyStatus(existing.status, data.status)) {
				return c.json(
					{
						error: "invalid_status_transition",
						message: `Cannot transition from '${existing.status}' to '${data.status}'`,
					},
					409,
				);
			}
		}

		if (data.childId !== undefined) {
			const [child] = await db
				.select({ id: children.id })
				.from(children)
				.where(and(eq(children.id, data.childId), eq(children.centerId, centerId)))
				.limit(1);

			if (!child) notFound("Child not found");
		}

		const [subsidyCase] = await db
			.update(subsidyCases)
			.set({
				...data,
				updatedAt: new Date(),
			})
			.where(and(eq(subsidyCases.id, id), eq(subsidyCases.centerId, centerId)))
			.returning();

		if (!subsidyCase) notFound("Subsidy case not found");
		return c.json({ subsidyCase });
	},
);

subsidyCasesRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const idValidation = idSchema.safeParse(c.req.param("id"));
	if (!idValidation.success) return c.json({ error: "Invalid ID format" }, 400);
	const id = idValidation.data;

	const db = c.get("db");
	const deleteResult = await db.transaction(async (tx) => {
		const [lockedCase] = readRows<{ id: string }>(
			await tx.execute(sql`
				select ${subsidyCases.id} as "id"
				from ${subsidyCases}
				where ${subsidyCases.id} = ${id}
					and ${subsidyCases.centerId} = ${centerId}
				for update
			`),
		);

		if (!lockedCase) notFound("Subsidy case not found");

		const [existingClaim] = await tx
			.select({ id: subsidyClaims.id })
			.from(subsidyClaims)
			.where(and(eq(subsidyClaims.subsidyCaseId, id), eq(subsidyClaims.centerId, centerId)))
			.limit(1);

		if (existingClaim) {
			return { status: "locked" as const };
		}

		const [deleted] = await tx
			.delete(subsidyCases)
			.where(and(eq(subsidyCases.id, id), eq(subsidyCases.centerId, centerId)))
			.returning();

		if (!deleted) notFound("Subsidy case not found");
		return { status: "deleted" as const, deleted };
	});
	if (deleteResult.status === "locked") {
		return c.json(
			{
				error: "case_locked",
				message: "Subsidy cases with claims cannot be deleted",
			},
			409,
		);
	}
	const deletedCase = deleteResult.deleted;
	return c.json({ deleted: true, id: deletedCase.id });
});

export { subsidyCasesRoutes };
