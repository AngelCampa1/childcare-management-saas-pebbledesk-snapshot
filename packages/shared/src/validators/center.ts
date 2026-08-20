import { z } from "zod";
import { PAYABLE_PLANS } from "../constants/billing.js";
import { CENTER_TIMEZONE_VALUES, DEFAULT_CENTER_TIMEZONE } from "../constants/timezones.js";

export const selfServeSubscriptionPlanSchema = z.enum(PAYABLE_PLANS);

export const createCenterSchema = z.object({
	name: z.string().min(1).max(255),
	address: z.string().min(1).max(255),
	city: z.string().min(1).max(100),
	state: z.string().length(2),
	zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Invalid ZIP code"),
	phone: z.string().min(7).max(20),
	licenseNumber: z.string().min(1).optional(),
	licensedCapacity: z.number().int().positive().optional(),
	timezone: z.enum(CENTER_TIMEZONE_VALUES).default(DEFAULT_CENTER_TIMEZONE),
	subscriptionPlan: selfServeSubscriptionPlanSchema.optional(),
});

export const updateCenterSchema = createCenterSchema
	.extend({
		timezone: z.enum(CENTER_TIMEZONE_VALUES),
	})
	.partial();

export type CreateCenterInput = z.infer<typeof createCenterSchema>;
export type UpdateCenterInput = z.infer<typeof updateCenterSchema>;
