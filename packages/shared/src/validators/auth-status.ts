import { z } from "zod";
import { ROLES } from "../constants/roles.js";

/**
 * Response shape for GET /api/auth/status — the single source of truth that
 * drives the entire app shell's routing. A backend shape regression here is a
 * silent app-wide breakage; validate strictly.
 */
const roleSchema = z.enum(ROLES);

const pendingInvitationSchema = z
	.object({
		membershipId: z.string(),
		centerId: z.string(),
		centerName: z.string(),
		role: roleSchema,
	})
	.passthrough();

export const authStatusSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("unauthenticated") }),
	z.object({
		status: z.literal("authenticated"),
		emailVerified: z.boolean().optional(),
		email: z.string().optional(),
	}),
	z.object({
		status: z.literal("onboarding_required"),
		emailVerified: z.boolean().optional(),
		email: z.string().optional(),
	}),
	z.object({
		status: z.literal("center_selection_required"),
		centers: z.array(
			z.object({
				centerId: z.string(),
				membershipId: z.string(),
				role: roleSchema,
			}),
		),
		emailVerified: z.boolean().optional(),
		email: z.string().optional(),
	}),
	z.object({
		status: z.literal("invite_pending"),
		invitation: pendingInvitationSchema,
		emailVerified: z.boolean().optional(),
		email: z.string().optional(),
	}),
]);

export type AuthStatusPayload = z.infer<typeof authStatusSchema>;
