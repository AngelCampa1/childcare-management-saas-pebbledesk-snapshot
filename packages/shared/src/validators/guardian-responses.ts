import { z } from "zod";

/**
 * Response validators for the `/api/guardians` endpoints.
 *
 * Each schema uses `.passthrough()` so unknown fields the API adds are
 * preserved — only the fields the web app relies on are validated. Shapes are
 * derived from `apps/api/src/routes/guardians.ts` (the source of truth).
 */

/** A single guardian record. Only the `id` is validated; everything else passes through. */
const guardianRecordSchema = z.object({ id: z.string() }).passthrough();

/** GET /api/guardians → `{ guardians: [...] }` (directory entries). */
export const guardianListResponseSchema = z
	.object({ guardians: z.array(guardianRecordSchema) })
	.passthrough();

/** GET /api/guardians/:id → `{ guardian, children }`. */
export const guardianDetailResponseSchema = z
	.object({
		guardian: guardianRecordSchema,
		children: z.array(z.unknown()),
	})
	.passthrough();

/** Wrapper `{ guardian }` used by create/update mutations. */
export const guardianMutationResponseSchema = z
	.object({ guardian: guardianRecordSchema })
	.passthrough();

/** DELETE /api/guardians/:id → `{ ok: true }`. */
export const deleteGuardianResponseSchema = z.object({ ok: z.literal(true) }).passthrough();
