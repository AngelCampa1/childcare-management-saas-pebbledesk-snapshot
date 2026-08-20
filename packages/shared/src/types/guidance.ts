import type { GuidanceProgressPatchInput } from "../validators/guidance.js";

export interface GuidanceProgress {
	id: string;
	centerId: string;
	membershipId: string;
	completedStepIds: string[];
	dismissedGuideIds: string[];
	lastOpenedGuideId: string | null;
	createdAt: string;
	updatedAt: string;
}

export type GuidanceProgressPatch = GuidanceProgressPatchInput;
