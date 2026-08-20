import { z } from "zod";

/**
 * Permissive response validators for the ratio API surface.
 *
 * These gate the web query hooks (P1-001). Records validate only the minimal
 * stable keys the UI relies on; all other fields pass through unchanged.
 */

const ratioStatusRecordSchema = z.object({ classroomId: z.string() }).passthrough();

const ratioSnapshotRecordSchema = z.object({ id: z.string() }).passthrough();

const ratioViolationRecordSchema = z.object({ id: z.string() }).passthrough();

export const ratiosResponseSchema = z
	.object({ ratios: z.array(ratioStatusRecordSchema) })
	.passthrough();

export const ratioSnapshotsResponseSchema = z
	.object({ snapshots: z.array(ratioSnapshotRecordSchema) })
	.passthrough();

export const ratioViolationsResponseSchema = z
	.object({ violations: z.array(ratioViolationRecordSchema) })
	.passthrough();

export const ratioViolationResponseSchema = z
	.object({ violation: ratioViolationRecordSchema })
	.passthrough();
