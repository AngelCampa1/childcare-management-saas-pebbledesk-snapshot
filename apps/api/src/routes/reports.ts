import { zValidator } from "@hono/zod-validator";
import { auditLog, auditReports, children, classrooms } from "@pebbledesk/db";
import { generateReportSchema, listReportsQuerySchema } from "@pebbledesk/shared";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";
import { generateReportArtifact } from "../services/report-artifacts.js";
import {
	readReportArtifact,
	sanitizeFilename,
	storeReportArtifact,
} from "../services/report-storage.js";

// Memory guard for the report-history list. The audit_reports table grows one
// row per generated report and is never pruned, so an unbounded SELECT would
// scale without limit. Return the most recent reports (ordered by generatedAt
// desc); older entries remain reachable via the date-range query filters.
const REPORTS_LIST_LIMIT = 500;

const reportsRoutes = new Hono<AppEnv>();

reportsRoutes.use("*", requireAuth, requireCenter);

async function ensureCenterOwnedReportFilters(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	input: {
		classroomId?: string;
		childId?: string;
	},
) {
	if (input.classroomId) {
		const [classroom] = await db
			.select({ id: classrooms.id })
			.from(classrooms)
			.where(and(eq(classrooms.id, input.classroomId), eq(classrooms.centerId, centerId)))
			.limit(1);

		if (!classroom) notFound("Classroom not found");
	}

	if (input.childId) {
		const [child] = await db
			.select({ id: children.id })
			.from(children)
			.where(and(eq(children.id, input.childId), eq(children.centerId, centerId)))
			.limit(1);

		if (!child) notFound("Child not found");
	}
}

reportsRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", listReportsQuerySchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const query = c.req.valid("query");
		const conditions = [eq(auditReports.centerId, centerId)];
		if (query.reportType) {
			conditions.push(eq(auditReports.reportType, query.reportType));
		}
		if (query.periodStartFrom) {
			conditions.push(gte(auditReports.periodStart, query.periodStartFrom));
		}
		if (query.periodEndTo) {
			conditions.push(lte(auditReports.periodEnd, query.periodEndTo));
		}
		if (query.generatedFrom) {
			conditions.push(
				gte(auditReports.generatedAt, new Date(`${query.generatedFrom}T00:00:00.000Z`)),
			);
		}
		if (query.generatedTo) {
			conditions.push(
				lte(auditReports.generatedAt, new Date(`${query.generatedTo}T23:59:59.999Z`)),
			);
		}

		const reports = await db
			.select()
			.from(auditReports)
			.where(and(...conditions))
			.orderBy(desc(auditReports.generatedAt))
			.limit(REPORTS_LIST_LIMIT);

		return c.json({ reports });
	},
);

reportsRoutes.post(
	"/generate",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", generateReportSchema),
	async (c) => {
		const centerId = c.get("centerId");
		const membershipId = c.get("membershipId");
		const userId = c.get("userId");
		if (!centerId || !membershipId || !userId) forbidden("No center membership found");

		const db = c.get("db");
		const input = c.req.valid("json");
		await ensureCenterOwnedReportFilters(db, centerId, input);
		const artifact = await generateReportArtifact(input, { centerId }, db);
		const stored = await storeReportArtifact(
			{
				centerId,
				reportType: input.reportType,
			},
			artifact,
			c.env,
		);

		const [report] = await db
			.insert(auditReports)
			.values({
				centerId,
				reportType: input.reportType,
				periodStart: input.periodStart,
				periodEnd: input.periodEnd,
				generatedBy: membershipId,
				fileUrl: stored.fileUrl,
				fileName: artifact.fileName,
				fileSizeBytes: stored.fileSizeBytes,
				contentType: artifact.contentType,
			})
			.returning();

		await db.insert(auditLog).values({
			centerId,
			userId,
			action: "export",
			entityType: "reports",
			entityId: report?.id ?? "unknown",
			changes: {
				after: {
					reportType: input.reportType,
					periodStart: input.periodStart,
					periodEnd: input.periodEnd,
					fileUrl: stored.fileUrl,
				},
				changedFields: ["reportType", "periodStart", "periodEnd", "fileUrl"],
			},
			ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
		});

		return c.json({ report }, 201);
	},
);

reportsRoutes.get("/:id/download", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	const userId = c.get("userId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const idParse = idSchema.safeParse(c.req.param("id"));
	if (!idParse.success) return c.json({ error: "Invalid report ID" }, 400);
	const id = idParse.data;

	const [report] = await db
		.select()
		.from(auditReports)
		.where(and(eq(auditReports.id, id), eq(auditReports.centerId, centerId)))
		.limit(1);

	if (!report?.fileUrl) {
		notFound("Report not found");
	}

	// Guard: the R2 key must be scoped to this center to prevent cross-tenant path traversal
	const expectedPrefix = `r2://${centerId}/`;
	if (!report.fileUrl.startsWith(expectedPrefix)) {
		forbidden("Report file path does not match center");
	}

	const artifact = await readReportArtifact(report.fileUrl, c.env);

	// requireAuth already guarantees userId is present; assert to satisfy the type-checker
	if (!userId) throw new Error("userId missing after requireAuth");

	// Record download audit entry
	await db.insert(auditLog).values({
		centerId,
		userId,
		action: "export",
		entityType: "reports",
		entityId: report.id,
		changes: { changedFields: [] },
		ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
	});

	c.header("content-type", artifact.contentType);
	c.header("content-disposition", `attachment; filename="${sanitizeFilename(artifact.fileName)}"`);
	return c.body(artifact.body);
});

export { reportsRoutes };
