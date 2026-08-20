import { z } from "zod";
import { AGE_GROUPS, ENROLLMENT_STATUSES } from "../constants/enums.js";

/**
 * Oldest plausible date of birth for an enrolled child. Childcare licensing tops
 * out at school-age (~12), so 18 years is a generous ceiling that still catches
 * data-entry typos (e.g. transposed years) without rejecting legitimate records.
 */
const MAX_CHILD_AGE_YEARS = 18;

/**
 * Range check for a `YYYY-MM-DD` date of birth already validated by `.date()`.
 * Compares whole days in UTC so the result does not flake across timezones:
 * rejects future dates and dates older than {@link MAX_CHILD_AGE_YEARS}.
 */
function isPlausibleBirthDate(value: string): boolean {
	const [year, month, day] = value.split("-").map(Number);
	const dob = Date.UTC(year, month - 1, day);
	const now = new Date();
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const oldestAllowed = Date.UTC(
		now.getUTCFullYear() - MAX_CHILD_AGE_YEARS,
		now.getUTCMonth(),
		now.getUTCDate(),
	);
	return dob <= today && dob >= oldestAllowed;
}

/**
 * Reusable date-of-birth schema for a child: a `YYYY-MM-DD` string that must be
 * on or before today and within the last {@link MAX_CHILD_AGE_YEARS}. Shared so
 * every child-creating path (create, update, enroll, import) enforces the same
 * range rather than re-declaring a bare `.date()`.
 */
export const childDateOfBirthSchema = z
	.string({ error: "dateOfBirth is required" })
	.date()
	.refine(isPlausibleBirthDate, {
		error: "dateOfBirth must be a past date within the last 18 years",
	});

export const createChildSchema = z.object({
	firstName: z.string({ error: "firstName is required" }).min(1).max(100),
	lastName: z.string({ error: "lastName is required" }).min(1).max(100),
	dateOfBirth: childDateOfBirthSchema,
	ageGroup: z.enum(AGE_GROUPS, { error: "ageGroup is required" }),
	enrollmentStatus: z.enum(ENROLLMENT_STATUSES).default("active"),
	subsidyEligible: z.boolean().default(false),
	allergies: z.string().max(5000).optional(),
	immunizations: z.string().max(5000).optional(),
	notes: z.string().max(5000).optional(),
});

export const updateChildSchema = createChildSchema
	.extend({
		enrollmentStatus: z.enum(ENROLLMENT_STATUSES),
		subsidyEligible: z.boolean(),
	})
	.partial();

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
