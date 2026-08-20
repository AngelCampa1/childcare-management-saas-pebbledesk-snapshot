import { z } from "zod";

/**
 * Permissive response validators for the classroom API surface.
 *
 * These gate the web query hooks (P1-001). Records validate only the minimal
 * stable keys the UI relies on; all other fields pass through unchanged.
 */

const classroomRecordSchema = z.object({ id: z.string() }).passthrough();

const classroomChildRecordSchema = z.object({ childId: z.string() }).passthrough();

const classroomStaffRecordSchema = z.object({ membershipId: z.string() }).passthrough();

export const classroomsResponseSchema = z
	.object({ classrooms: z.array(classroomRecordSchema) })
	.passthrough();

export const classroomResponseSchema = z.object({ classroom: classroomRecordSchema }).passthrough();

export const classroomChildrenResponseSchema = z
	.object({ children: z.array(classroomChildRecordSchema) })
	.passthrough();

export const classroomStaffResponseSchema = z
	.object({ staff: z.array(classroomStaffRecordSchema) })
	.passthrough();
