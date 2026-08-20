import { z } from "zod";
import { AGE_GROUPS } from "../constants/enums.js";

export const createClassroomSchema = z.object({
	name: z.string().min(1).max(255),
	ageGroup: z.enum(AGE_GROUPS),
	maxCapacity: z.number().int().positive(),
	minRatioStaff: z.number().int().positive(),
	minRatioChildren: z.number().int().positive(),
});

export const updateClassroomSchema = createClassroomSchema.partial();

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
