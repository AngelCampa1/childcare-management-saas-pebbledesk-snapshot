import { z } from "zod";

const guidanceIdSchema = z.string().min(1).max(120);

export const guidanceProgressPatchSchema = z
	.object({
		completedStepIds: z.array(guidanceIdSchema).max(200).optional(),
		completeStepId: guidanceIdSchema.optional(),
		uncompleteStepId: guidanceIdSchema.optional(),
		dismissedGuideIds: z.array(guidanceIdSchema).max(100).optional(),
		dismissGuideId: guidanceIdSchema.optional(),
		undismissGuideId: guidanceIdSchema.optional(),
		lastOpenedGuideId: guidanceIdSchema.nullable().optional(),
	})
	.strict();

export type GuidanceProgressPatchInput = z.infer<typeof guidanceProgressPatchSchema>;

/**
 * Response shape for GET/PATCH /api/guidance/progress.
 * The progress record is wrapped in a `progress` envelope.
 */
export const guidanceProgressSchema = z.object({
	id: z.string(),
	centerId: z.string(),
	membershipId: z.string(),
	completedStepIds: z.array(z.string()),
	dismissedGuideIds: z.array(z.string()),
	lastOpenedGuideId: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export const guidanceProgressResponseSchema = z.object({
	progress: guidanceProgressSchema,
});

export type GuidanceProgressPayload = z.infer<typeof guidanceProgressSchema>;
