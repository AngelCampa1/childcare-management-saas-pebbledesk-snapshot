import { describe, expect, it } from "vitest";
import {
	classroomChildrenResponseSchema,
	classroomResponseSchema,
	classroomStaffResponseSchema,
	classroomsResponseSchema,
} from "./classroom-responses.js";

describe("classroom response validators", () => {
	it("accepts a classrooms list and preserves unknown fields", () => {
		const parsed = classroomsResponseSchema.parse({
			classrooms: [{ id: "room-1", name: "Toddlers" }],
		});
		expect(parsed.classrooms[0]?.id).toBe("room-1");
		expect((parsed.classrooms[0] as { name?: string }).name).toBe("Toddlers");
	});

	it("rejects a classrooms payload missing the list key", () => {
		expect(classroomsResponseSchema.safeParse({ rooms: [] }).success).toBe(false);
	});

	it("rejects a classroom record without an id", () => {
		expect(classroomsResponseSchema.safeParse({ classrooms: [{ name: "x" }] }).success).toBe(false);
	});

	it("accepts a single classroom response", () => {
		expect(classroomResponseSchema.parse({ classroom: { id: "room-1" } }).classroom.id).toBe(
			"room-1",
		);
	});

	it("accepts a classroom children response and preserves extra fields", () => {
		const parsed = classroomChildrenResponseSchema.parse({
			children: [{ assignmentId: "a-1", childId: "c-1" }],
		});
		expect(parsed.children[0]?.childId).toBe("c-1");
		expect((parsed.children[0] as { assignmentId?: string }).assignmentId).toBe("a-1");
	});

	it("rejects classroom children records missing childId", () => {
		expect(
			classroomChildrenResponseSchema.safeParse({ children: [{ assignmentId: "a-1" }] }).success,
		).toBe(false);
	});

	it("accepts a classroom staff response and preserves extra fields", () => {
		const parsed = classroomStaffResponseSchema.parse({
			staff: [{ assignmentId: "a-1", membershipId: "m-1" }],
		});
		expect(parsed.staff[0]?.membershipId).toBe("m-1");
		expect((parsed.staff[0] as { assignmentId?: string }).assignmentId).toBe("a-1");
	});

	it("rejects classroom staff records missing membershipId", () => {
		expect(
			classroomStaffResponseSchema.safeParse({ staff: [{ assignmentId: "a-1" }] }).success,
		).toBe(false);
	});
});
