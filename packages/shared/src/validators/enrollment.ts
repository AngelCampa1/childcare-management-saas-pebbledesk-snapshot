import { z } from "zod";
import { AGE_GROUPS } from "../constants/enums.js";
import { childDateOfBirthSchema } from "./child.js";
import { uuidLikeSchema } from "./id.js";

export const WAITLIST_CLASSROOM_ERROR = "Waitlisted children cannot be assigned to a classroom yet";
export const MULTIPLE_PRIMARY_GUARDIANS_ERROR = "Only one guardian can be marked primary";

const newGuardianSchema = z.object({
	type: z.literal("new"),
	firstName: z.string().min(1).max(100),
	lastName: z.string().min(1).max(100),
	email: z.string().email().optional(),
	phone: z.string().min(7).max(20).optional(),
	isPrimary: z.boolean().default(false),
	authorizedPickup: z.boolean().default(true),
	relationship: z.string().max(100).optional(),
});

const existingGuardianSchema = z.object({
	type: z.literal("existing"),
	guardianId: uuidLikeSchema,
	isPrimary: z.boolean().default(false),
	authorizedPickup: z.boolean().default(true),
	relationship: z.string().max(100).optional(),
});

export const enrollChildSchema = z
	.object({
		child: z.object({
			firstName: z.string().min(1).max(100),
			lastName: z.string().min(1).max(100),
			dateOfBirth: childDateOfBirthSchema,
			ageGroup: z.enum(AGE_GROUPS),
			enrollmentStatus: z.enum(["active", "waitlist"] as const).default("active"),
			subsidyEligible: z.boolean().default(false),
		}),
		guardians: z
			.array(z.discriminatedUnion("type", [newGuardianSchema, existingGuardianSchema]))
			.min(1),
		classroom: z
			.object({
				classroomId: uuidLikeSchema,
				effectiveDate: z.string().date(),
			})
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.child.enrollmentStatus === "waitlist" && data.classroom) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["classroom"],
				message: WAITLIST_CLASSROOM_ERROR,
			});
		}

		if (data.guardians.filter((guardian) => guardian.isPrimary).length > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["guardians"],
				message: MULTIPLE_PRIMARY_GUARDIANS_ERROR,
			});
		}
	});

export type EnrollChildInput = z.infer<typeof enrollChildSchema>;
