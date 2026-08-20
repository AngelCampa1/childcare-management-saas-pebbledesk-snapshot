import { z } from "zod";

/**
 * Response validators for the `/api/children` endpoints.
 *
 * Each schema uses `.passthrough()` so unknown fields the API adds are
 * preserved — only the fields the web app relies on are validated. Shapes are
 * derived from `apps/api/src/routes/children.ts` (the source of truth) so a
 * backend regression surfaces as a parse error instead of silent `undefined`
 * propagation in the web client.
 */

/** A single child record. Only the `id` is validated; everything else passes through. */
const childRecordSchema = z.object({ id: z.string() }).passthrough();

/** Wrapper `{ child }` used by create/update/withdraw/reactivate mutations. */
export const childMutationResponseSchema = z.object({ child: childRecordSchema }).passthrough();

/** GET /api/children → `{ children: [...] }`. */
export const childListResponseSchema = z
	.object({ children: z.array(childRecordSchema) })
	.passthrough();

/** GET /api/children/:id → child detail with classroom + guardians. */
export const childDetailResponseSchema = z
	.object({
		child: childRecordSchema,
		currentClassroom: z.unknown(),
		guardians: z.array(z.unknown()),
		primaryGuardianName: z.string().nullable(),
	})
	.passthrough();

/** POST /api/children/enroll → `{ child, guardians, classroomAssignment }`. */
export const enrollChildResponseSchema = z.object({ child: childRecordSchema }).passthrough();

/** POST /api/children/:id/guardians → `{ linked: true }`. */
export const linkGuardianResponseSchema = z.object({ linked: z.literal(true) }).passthrough();

/** PATCH /api/children/:id/guardians/:guardianId → `{ link }`. */
export const updateGuardianLinkResponseSchema = z.object({ link: z.unknown() }).passthrough();

/** DELETE /api/children/:id/guardians/:guardianId → `{ unlinked: true }`. */
export const unlinkGuardianResponseSchema = z.object({ unlinked: z.literal(true) }).passthrough();
