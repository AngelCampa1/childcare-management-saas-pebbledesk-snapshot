import { z } from "zod";
import { uuidLikeSchema } from "./id.js";

export const checkInSchema = z.object({
	childId: uuidLikeSchema,
	classroomId: uuidLikeSchema,
	notes: z.string().max(1000).optional(),
	isLate: z.boolean().optional(),
	signatureData: z.string().startsWith("data:image/").optional(),
});

export const checkOutSchema = z.object({
	notes: z.string().max(1000).optional(),
	signatureData: z.string().startsWith("data:image/").optional(),
});

export const staffCheckInSchema = z.object({
	classroomId: uuidLikeSchema,
	membershipId: uuidLikeSchema.optional(),
});

const calendarDateSchema = z.string().refine((value) => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}

	const date = new Date(`${value}T00:00:00.000Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const optionalDateRangeRefine = {
	check: (data: { from?: string; to?: string }) => !data.from || !data.to || data.from <= data.to,
	params: { message: "from must be on or before to", path: ["from"] },
};

export const attendanceQuerySchema = z.object({
	classroomId: uuidLikeSchema.optional(),
	date: calendarDateSchema.optional(),
	childId: uuidLikeSchema.optional(),
});

export const checkInHistoryQuerySchema = z
	.object({
		childId: uuidLikeSchema,
		from: calendarDateSchema,
		to: calendarDateSchema,
	})
	.refine(optionalDateRangeRefine.check, optionalDateRangeRefine.params);

export const staffAttendanceQuerySchema = z.object({
	classroomId: uuidLikeSchema.optional(),
	date: calendarDateSchema.optional(),
});

export const violationQuerySchema = z
	.object({
		classroomId: uuidLikeSchema.optional(),
		status: z.enum(["open", "resolved"]).optional(),
		from: calendarDateSchema.optional(),
		to: calendarDateSchema.optional(),
	})
	.refine(optionalDateRangeRefine.check, optionalDateRangeRefine.params);

export const snapshotQuerySchema = z
	.object({
		classroomId: uuidLikeSchema.optional(),
		from: calendarDateSchema.optional(),
		to: calendarDateSchema.optional(),
	})
	.refine(optionalDateRangeRefine.check, optionalDateRangeRefine.params);

export const violationNotesSchema = z.object({
	resolutionNotes: z.string().min(1).max(2000),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type StaffCheckInInput = z.infer<typeof staffCheckInSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type CheckInHistoryQuery = z.infer<typeof checkInHistoryQuerySchema>;
export type StaffAttendanceQuery = z.infer<typeof staffAttendanceQuerySchema>;
export type ViolationQuery = z.infer<typeof violationQuerySchema>;
export type SnapshotQuery = z.infer<typeof snapshotQuerySchema>;
export type ViolationNotesInput = z.infer<typeof violationNotesSchema>;
