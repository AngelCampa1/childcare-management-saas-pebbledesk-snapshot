import { z } from "zod";
import { CLAIM_STATUSES, SUBSIDY_CASE_STATUSES, SUBSIDY_PROGRAMS } from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

const subsidyCaseDateRefine = {
	check: (data: { effectiveDate?: string; expirationDate?: string }) =>
		!data.effectiveDate || !data.expirationDate || data.effectiveDate <= data.expirationDate,
	params: {
		message: "effectiveDate must be on or before expirationDate",
		path: ["effectiveDate"],
	},
};

const subsidyCaseShape = {
	childId: uuidLikeSchema,
	program: z.enum(SUBSIDY_PROGRAMS),
	caseNumber: z.string().min(1).max(100),
	agencyName: z.string().min(1).max(255),
	authorizedHoursWeekly: z.number().nonnegative().optional(),
	rateDaily: z.number().nonnegative().optional(),
	rateWeekly: z.number().nonnegative().optional(),
	effectiveDate: z.string().date(),
	expirationDate: z.string().date().optional(),
	status: z.enum(SUBSIDY_CASE_STATUSES),
};

const createSubsidyCaseBaseSchema = z
	.object({
		...subsidyCaseShape,
		status: subsidyCaseShape.status.default("active"),
	})
	.strict();

export const createSubsidyCaseSchema = createSubsidyCaseBaseSchema.refine(
	subsidyCaseDateRefine.check,
	subsidyCaseDateRefine.params,
);

export const updateSubsidyCaseSchema = createSubsidyCaseBaseSchema
	.extend(subsidyCaseShape)
	.partial()
	.refine(subsidyCaseDateRefine.check, subsidyCaseDateRefine.params);

const subsidyClaimPeriodRefine = {
	check: (data: { periodStart?: string; periodEnd?: string }) =>
		!data.periodStart || !data.periodEnd || data.periodStart <= data.periodEnd,
	params: { message: "periodStart must be on or before periodEnd", path: ["periodStart"] },
};

function inclusiveDayCount(periodStart: string, periodEnd: string) {
	const startTime = Date.UTC(
		Number(periodStart.slice(0, 4)),
		Number(periodStart.slice(5, 7)) - 1,
		Number(periodStart.slice(8, 10)),
	);
	const endTime = Date.UTC(
		Number(periodEnd.slice(0, 4)),
		Number(periodEnd.slice(5, 7)) - 1,
		Number(periodEnd.slice(8, 10)),
	);

	return Math.floor((endTime - startTime) / 86_400_000) + 1;
}

function addSubsidyClaimStateIssues(
	data: {
		periodStart?: string;
		periodEnd?: string;
		daysAttended?: number;
		amountClaimed?: number;
		amountApproved?: number;
		amountPaid?: number;
	},
	ctx: z.RefinementCtx,
) {
	if (
		data.amountApproved !== undefined &&
		data.amountClaimed !== undefined &&
		data.amountApproved > data.amountClaimed
	) {
		ctx.addIssue({
			code: "custom",
			message: "amountApproved must not exceed amountClaimed",
			path: ["amountApproved"],
		});
	}

	if (
		data.amountPaid !== undefined &&
		data.amountApproved !== undefined &&
		data.amountPaid > data.amountApproved
	) {
		ctx.addIssue({
			code: "custom",
			message: "amountPaid must not exceed amountApproved",
			path: ["amountPaid"],
		});
	}

	if (
		data.daysAttended !== undefined &&
		data.periodStart !== undefined &&
		data.periodEnd !== undefined &&
		data.periodStart <= data.periodEnd &&
		data.daysAttended > inclusiveDayCount(data.periodStart, data.periodEnd)
	) {
		ctx.addIssue({
			code: "custom",
			message: "daysAttended must not exceed the inclusive claim period",
			path: ["daysAttended"],
		});
	}
}

const subsidyClaimShape = {
	subsidyCaseId: uuidLikeSchema,
	periodStart: z.string().date(),
	periodEnd: z.string().date(),
	daysAttended: z.number().int().nonnegative(),
	hoursAttended: z.number().nonnegative(),
	amountClaimed: z.number().nonnegative(),
	amountApproved: z.number().nonnegative().optional(),
	amountPaid: z.number().nonnegative().optional(),
	status: z.enum(CLAIM_STATUSES),
	submittedAt: z.string().datetime().optional(),
	paidAt: z.string().datetime().optional(),
};

const createSubsidyClaimBaseSchema = z
	.object({
		...subsidyClaimShape,
		status: subsidyClaimShape.status.default("draft"),
	})
	.strict();

export const createSubsidyClaimSchema = createSubsidyClaimBaseSchema
	.refine(subsidyClaimPeriodRefine.check, subsidyClaimPeriodRefine.params)
	.superRefine(addSubsidyClaimStateIssues);

export const updateSubsidyClaimSchema = createSubsidyClaimBaseSchema
	.extend(subsidyClaimShape)
	.partial()
	.refine(subsidyClaimPeriodRefine.check, subsidyClaimPeriodRefine.params)
	.superRefine(addSubsidyClaimStateIssues);

export type CreateSubsidyCaseInput = z.infer<typeof createSubsidyCaseSchema>;
export type UpdateSubsidyCaseInput = z.infer<typeof updateSubsidyCaseSchema>;
export type CreateSubsidyClaimInput = z.infer<typeof createSubsidyClaimSchema>;
export type UpdateSubsidyClaimInput = z.infer<typeof updateSubsidyClaimSchema>;
