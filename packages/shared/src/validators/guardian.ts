import { z } from "zod";
import { uuidLikeSchema } from "./id.js";

const guardianEmail = z.string().email();
const guardianPhone = z
	.string()
	.min(7)
	.max(20)
	.regex(/^[\d\s().+\-x#]+$/, "Phone must contain only digits and common separators");

export const createGuardianSchema = z.object({
	firstName: z.string().min(1).max(100),
	lastName: z.string().min(1).max(100),
	email: guardianEmail.optional(),
	phone: guardianPhone.optional(),
});

// Update allows `null` for email/phone so a director can clear previously-stored
// contact info (both columns are nullable). Omitting a field leaves it unchanged.
export const updateGuardianSchema = createGuardianSchema.partial().extend({
	email: guardianEmail.nullable().optional(),
	phone: guardianPhone.nullable().optional(),
});

export const linkGuardianSchema = z.object({
	guardianId: uuidLikeSchema,
	isPrimary: z.boolean().default(false),
	authorizedPickup: z.boolean().default(true),
	relationship: z.string().max(100).optional(),
});

export const updateGuardianLinkSchema = z.object({
	isPrimary: z.boolean().optional(),
	authorizedPickup: z.boolean().optional(),
	relationship: z.string().max(100).optional(),
});

export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type LinkGuardianInput = z.infer<typeof linkGuardianSchema>;
export type UpdateGuardianLinkInput = z.infer<typeof updateGuardianLinkSchema>;
