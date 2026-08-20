import { z } from "zod";
import { REPORT_TYPES } from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

const dateString = z.string().date();

export const generateReportSchema = z
	.object({
		reportType: z.enum(REPORT_TYPES),
		periodStart: dateString,
		periodEnd: dateString,
		format: z.enum(["pdf", "csv"]).optional(),
		classroomId: uuidLikeSchema.optional(),
		childId: uuidLikeSchema.optional(),
		stateVariant: z.enum(["TX", "CA", "FL"]).optional(),
	})
	.strict()
	.refine((data) => data.periodStart <= data.periodEnd, {
		message: "periodStart must be on or before periodEnd",
		path: ["periodStart"],
	});

export const listReportsQuerySchema = z
	.object({
		reportType: z.enum(REPORT_TYPES).optional(),
		periodStartFrom: dateString.optional(),
		periodEndTo: dateString.optional(),
		generatedFrom: dateString.optional(),
		generatedTo: dateString.optional(),
	})
	.strict()
	.refine(
		(data) =>
			!data.periodStartFrom || !data.periodEndTo || data.periodStartFrom <= data.periodEndTo,
		{
			message: "periodStartFrom must be on or before periodEndTo",
			path: ["periodStartFrom"],
		},
	)
	.refine(
		(data) => !data.generatedFrom || !data.generatedTo || data.generatedFrom <= data.generatedTo,
		{
			message: "generatedFrom must be on or before generatedTo",
			path: ["generatedFrom"],
		},
	);

export const auditLogQuerySchema = z
	.object({
		action: z.string().trim().min(1).max(100).optional(),
		entityType: z.string().min(1).max(100).optional(),
		entityId: z.string().min(1).max(255).optional(),
		userId: uuidLikeSchema.optional(),
		from: dateString.optional(),
		to: dateString.optional(),
		limit: z.coerce.number().int().min(1).max(200).optional(),
		cursor: z.coerce.number().int().min(0).max(1_000_000).optional(),
	})
	.strict()
	.refine((data) => !data.from || !data.to || data.from <= data.to, {
		message: "from must be on or before to",
		path: ["from"],
	});

export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type ListReportsQueryInput = z.infer<typeof listReportsQuerySchema>;
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
