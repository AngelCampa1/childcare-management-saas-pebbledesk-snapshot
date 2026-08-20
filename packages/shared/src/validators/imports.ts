import { z } from "zod";

/**
 * Response shape for POST /api/imports/{children,guardians,invoices,enroll}.
 * The API returns row-level errors in `errors[]` even on 2xx responses, so
 * callers must always inspect this array — partial failure is expected.
 */
export const importRowErrorSchema = z.object({
	rowIndex: z.number().int().nonnegative(),
	message: z.string(),
});

export const importResultSchema = z.object({
	inserted: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	errors: z.array(importRowErrorSchema),
});

export type ImportRowErrorPayload = z.infer<typeof importRowErrorSchema>;
export type ImportResultPayload = z.infer<typeof importResultSchema>;
