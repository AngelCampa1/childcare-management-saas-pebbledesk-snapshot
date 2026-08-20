import { z } from "zod";

/**
 * Permissive response validators for the attendance (check-in) API surface.
 *
 * These gate the web query hooks (P1-001) so a backend shape regression
 * surfaces as a parse error instead of propagating `undefined` downstream.
 * Records validate only the minimal stable key the UI relies on; all other
 * fields pass through unchanged via `.passthrough()`.
 */

const checkInRecordSchema = z.object({ id: z.string() }).passthrough();

const staffCheckInRecordSchema = z.object({ id: z.string() }).passthrough();

export const checkInsResponseSchema = z
	.object({ checkIns: z.array(checkInRecordSchema) })
	.passthrough();

export const checkInResponseSchema = z.object({ checkIn: checkInRecordSchema }).passthrough();

export const staffCheckInsResponseSchema = z
	.object({ staffCheckIns: z.array(staffCheckInRecordSchema) })
	.passthrough();

export const staffCheckInResponseSchema = z
	.object({ staffCheckIn: staffCheckInRecordSchema })
	.passthrough();
