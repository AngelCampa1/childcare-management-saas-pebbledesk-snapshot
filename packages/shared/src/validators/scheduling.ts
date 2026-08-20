import { z } from "zod";
import { TIME_ENTRY_STATUSES } from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const scheduleDateRefine = {
	check: (data: { effectiveFrom?: string; effectiveUntil?: string }) =>
		!data.effectiveFrom || !data.effectiveUntil || data.effectiveFrom <= data.effectiveUntil,
	params: { message: "effectiveFrom must be on or before effectiveUntil", path: ["effectiveFrom"] },
};

const createScheduleBaseSchema = z.object({
	name: z.string().trim().min(1).max(255),
	effectiveFrom: z.string().date(),
	effectiveUntil: z.string().date().optional(),
});

export const createScheduleSchema = createScheduleBaseSchema.refine(
	scheduleDateRefine.check,
	scheduleDateRefine.params,
);

export const updateScheduleSchema = createScheduleBaseSchema
	.partial()
	.refine(scheduleDateRefine.check, scheduleDateRefine.params);

const shiftTimeRefine = {
	check: (data: { startTime?: string; endTime?: string }) =>
		!data.startTime || !data.endTime || data.startTime < data.endTime,
	params: { message: "startTime must be before endTime", path: ["startTime"] },
};

const createShiftBaseSchema = z.object({
	scheduleId: uuidLikeSchema,
	membershipId: uuidLikeSchema,
	classroomId: uuidLikeSchema,
	dayOfWeek: z.number().int().min(0).max(6),
	startTime: z.string().regex(timeRegex, "Time must be in HH:MM format"),
	endTime: z.string().regex(timeRegex, "Time must be in HH:MM format"),
});

export const createShiftSchema = createShiftBaseSchema.refine(
	shiftTimeRefine.check,
	shiftTimeRefine.params,
);

export const updateShiftSchema = createShiftBaseSchema
	.partial()
	.refine(shiftTimeRefine.check, shiftTimeRefine.params);

export const createTimeEntryAdjustmentSchema = z
	.object({
		hoursWorked: z.number().min(0).max(24),
		hoursScheduled: z.number().min(0).max(24),
		overtimeHours: z.number().min(0).max(24),
		status: z.enum(["manual", "approved"]),
	})
	.refine((data) => data.overtimeHours <= data.hoursWorked, {
		message: "overtimeHours cannot exceed hoursWorked",
		path: ["overtimeHours"],
	});

export const scheduleQuerySchema = z.object({
	activeOn: z.string().date().optional(),
});

export const shiftQuerySchema = z.object({
	scheduleId: uuidLikeSchema.optional(),
	membershipId: uuidLikeSchema.optional(),
	classroomId: uuidLikeSchema.optional(),
	dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
});

export const timeEntryQuerySchema = z
	.object({
		from: z.string().date().optional(),
		to: z.string().date().optional(),
		membershipId: uuidLikeSchema.optional(),
		classroomId: uuidLikeSchema.optional(),
		status: z.enum(TIME_ENTRY_STATUSES).optional(),
	})
	.refine((data) => !data.from || !data.to || data.from <= data.to, {
		message: "from must be on or before to",
		path: ["from"],
	});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type CreateTimeEntryAdjustmentInput = z.infer<typeof createTimeEntryAdjustmentSchema>;
export type ScheduleQueryInput = z.infer<typeof scheduleQuerySchema>;
export type ShiftQueryInput = z.infer<typeof shiftQuerySchema>;
export type TimeEntryQueryInput = z.infer<typeof timeEntryQuerySchema>;
