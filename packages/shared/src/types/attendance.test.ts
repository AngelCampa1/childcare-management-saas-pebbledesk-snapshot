/**
 * Type-checking tests for attendance types.
 * These tests verify the shape of the interfaces compiles correctly
 * and that optional fields are truly optional.
 */
import { describe, expect, it } from "vitest";
import type {
	CheckIn,
	RatioSnapshot,
	RatioViolation,
	RoomRatioStatus,
	StaffCheckIn,
} from "./attendance.js";

// ─── CheckIn ───────────────────────────────────────────────────────────────

describe("CheckIn interface", () => {
	it("accepts a fully populated CheckIn", () => {
		const record: CheckIn = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			childId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			checkedInAt: "2026-04-07T08:00:00Z",
			checkedOutAt: "2026-04-07T17:00:00Z",
			checkedInBy: "550e8400-e29b-41d4-a716-446655440004",
			checkedOutBy: "550e8400-e29b-41d4-a716-446655440005",
			notes: "Dropped off by mom",
		};
		expect(record.id).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(record.checkedInAt).toBe("2026-04-07T08:00:00Z");
		expect(record.checkedOutAt).toBe("2026-04-07T17:00:00Z");
		expect(record.notes).toBe("Dropped off by mom");
	});

	it("accepts a minimal CheckIn without optional fields", () => {
		const record: CheckIn = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			childId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			checkedInAt: "2026-04-07T08:00:00Z",
			checkedInBy: "550e8400-e29b-41d4-a716-446655440004",
		};
		expect(record.checkedOutAt).toBeUndefined();
		expect(record.checkedOutBy).toBeUndefined();
		expect(record.notes).toBeUndefined();
	});

	it("has the correct required fields", () => {
		const record: CheckIn = {
			id: "a",
			centerId: "b",
			childId: "c",
			classroomId: "d",
			checkedInAt: "2026-04-07T08:00:00Z",
			checkedInBy: "e",
		};
		expect(Object.keys(record)).toContain("id");
		expect(Object.keys(record)).toContain("centerId");
		expect(Object.keys(record)).toContain("childId");
		expect(Object.keys(record)).toContain("classroomId");
		expect(Object.keys(record)).toContain("checkedInAt");
		expect(Object.keys(record)).toContain("checkedInBy");
	});

	it("checkedOutAt is optional and can be undefined", () => {
		const record: CheckIn = {
			id: "a",
			centerId: "b",
			childId: "c",
			classroomId: "d",
			checkedInAt: "2026-04-07T08:00:00Z",
			checkedInBy: "e",
		};
		// TypeScript should allow assignment without checkedOutAt
		expect(record.checkedOutAt).toBeUndefined();
	});
});

// ─── StaffCheckIn ──────────────────────────────────────────────────────────

describe("StaffCheckIn interface", () => {
	it("accepts a fully populated StaffCheckIn", () => {
		const record: StaffCheckIn = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			membershipId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			clockedInAt: "2026-04-07T07:30:00Z",
			clockedOutAt: "2026-04-07T16:30:00Z",
		};
		expect(record.membershipId).toBe("550e8400-e29b-41d4-a716-446655440002");
		expect(record.clockedInAt).toBe("2026-04-07T07:30:00Z");
		expect(record.clockedOutAt).toBe("2026-04-07T16:30:00Z");
	});

	it("accepts a minimal StaffCheckIn without optional fields", () => {
		const record: StaffCheckIn = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			membershipId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			clockedInAt: "2026-04-07T07:30:00Z",
		};
		expect(record.clockedOutAt).toBeUndefined();
	});

	it("uses membershipId (not userId) field", () => {
		const record: StaffCheckIn = {
			id: "a",
			centerId: "b",
			membershipId: "c",
			classroomId: "d",
			clockedInAt: "2026-04-07T07:30:00Z",
		};
		expect(record.membershipId).toBe("c");
	});

	it("uses clockedInAt (not checkInAt) field", () => {
		const record: StaffCheckIn = {
			id: "a",
			centerId: "b",
			membershipId: "c",
			classroomId: "d",
			clockedInAt: "2026-04-07T07:30:00Z",
		};
		expect(record.clockedInAt).toBeDefined();
	});
});

// ─── RatioSnapshot ─────────────────────────────────────────────────────────

describe("RatioSnapshot interface", () => {
	it("accepts a valid RatioSnapshot", () => {
		const snapshot: RatioSnapshot = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			classroomId: "550e8400-e29b-41d4-a716-446655440002",
			snapshotAt: "2026-04-07T09:00:00Z",
			staffCount: 2,
			childrenCount: 8,
			ratioRequired: 4,
			ratioActual: 4,
			inCompliance: true,
		};
		expect(snapshot.staffCount).toBe(2);
		expect(snapshot.childrenCount).toBe(8);
		expect(snapshot.ratioRequired).toBe(4);
		expect(snapshot.ratioActual).toBe(4);
		expect(snapshot.inCompliance).toBe(true);
	});

	it("tracks compliance status as boolean", () => {
		const snapshot: RatioSnapshot = {
			id: "a",
			centerId: "b",
			classroomId: "c",
			snapshotAt: "2026-04-07T09:00:00Z",
			staffCount: 1,
			childrenCount: 10,
			ratioRequired: 4,
			ratioActual: 10,
			inCompliance: false,
		};
		expect(snapshot.inCompliance).toBe(false);
	});
});

// ─── RatioViolation ────────────────────────────────────────────────────────

describe("RatioViolation interface", () => {
	it("accepts a fully populated RatioViolation", () => {
		const violation: RatioViolation = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			classroomId: "550e8400-e29b-41d4-a716-446655440002",
			detectedAt: "2026-04-07T10:00:00Z",
			resolvedAt: "2026-04-07T10:15:00Z",
			resolvedBy: "550e8400-e29b-41d4-a716-446655440003",
			resolutionNotes: "Additional staff arrived",
		};
		expect(violation.resolvedAt).toBe("2026-04-07T10:15:00Z");
		expect(violation.resolvedBy).toBe("550e8400-e29b-41d4-a716-446655440003");
		expect(violation.resolutionNotes).toBe("Additional staff arrived");
	});

	it("accepts an open (unresolved) RatioViolation without optional fields", () => {
		const violation: RatioViolation = {
			id: "550e8400-e29b-41d4-a716-446655440000",
			centerId: "550e8400-e29b-41d4-a716-446655440001",
			classroomId: "550e8400-e29b-41d4-a716-446655440002",
			detectedAt: "2026-04-07T10:00:00Z",
		};
		expect(violation.resolvedAt).toBeUndefined();
		expect(violation.resolvedBy).toBeUndefined();
		expect(violation.resolutionNotes).toBeUndefined();
	});
});

// ─── RoomRatioStatus ───────────────────────────────────────────────────────

describe("RoomRatioStatus interface", () => {
	it("accepts a compliant RoomRatioStatus", () => {
		const status: RoomRatioStatus = {
			classroomId: "550e8400-e29b-41d4-a716-446655440000",
			classroomName: "Butterflies",
			ageGroup: "toddler",
			maxCapacity: 12,
			minRatioStaff: 1,
			minRatioChildren: 4,
			currentChildCount: 8,
			currentStaffCount: 2,
			ratioRequired: 4,
			ratioActual: 4,
			inCompliance: true,
			nearLimit: false,
			ratioRuleSource: "classroom",
		};
		expect(status.classroomName).toBe("Butterflies");
		expect(status.inCompliance).toBe(true);
		expect(status.nearLimit).toBe(false);
		expect(status.openViolationId).toBeUndefined();
	});

	it("accepts a non-compliant RoomRatioStatus with openViolationId", () => {
		const status: RoomRatioStatus = {
			classroomId: "550e8400-e29b-41d4-a716-446655440000",
			classroomName: "Sunflowers",
			ageGroup: "preschool",
			maxCapacity: 20,
			minRatioStaff: 1,
			minRatioChildren: 10,
			currentChildCount: 15,
			currentStaffCount: 1,
			ratioRequired: 10,
			ratioActual: 15,
			inCompliance: false,
			nearLimit: true,
			openViolationId: "550e8400-e29b-41d4-a716-446655440099",
			ratioRuleSource: "classroom",
		};
		expect(status.inCompliance).toBe(false);
		expect(status.nearLimit).toBe(true);
		expect(status.openViolationId).toBe("550e8400-e29b-41d4-a716-446655440099");
	});

	it("openViolationId is optional", () => {
		const status: RoomRatioStatus = {
			classroomId: "a",
			classroomName: "Room 1",
			ageGroup: "infant",
			maxCapacity: 8,
			minRatioStaff: 1,
			minRatioChildren: 3,
			currentChildCount: 3,
			currentStaffCount: 1,
			ratioRequired: 3,
			ratioActual: 3,
			inCompliance: true,
			nearLimit: false,
			ratioRuleSource: "classroom",
		};
		expect(status.openViolationId).toBeUndefined();
	});

	it("has all required numeric fields", () => {
		const status: RoomRatioStatus = {
			classroomId: "a",
			classroomName: "Room 1",
			ageGroup: "infant",
			maxCapacity: 8,
			minRatioStaff: 1,
			minRatioChildren: 3,
			currentChildCount: 3,
			currentStaffCount: 1,
			ratioRequired: 3,
			ratioActual: 3,
			inCompliance: true,
			nearLimit: false,
			ratioRuleSource: "classroom",
		};
		expect(typeof status.maxCapacity).toBe("number");
		expect(typeof status.minRatioStaff).toBe("number");
		expect(typeof status.minRatioChildren).toBe("number");
		expect(typeof status.currentChildCount).toBe("number");
		expect(typeof status.currentStaffCount).toBe("number");
		expect(typeof status.ratioRequired).toBe("number");
		expect(typeof status.ratioActual).toBe("number");
	});
});
