/**
 * Tests for attendance validators.
 * Covers all schemas: valid inputs, invalid inputs, edge cases.
 */
import { describe, expect, it } from "vitest";
import {
	attendanceQuerySchema,
	checkInHistoryQuerySchema,
	checkInSchema,
	checkOutSchema,
	snapshotQuerySchema,
	staffAttendanceQuerySchema,
	staffCheckInSchema,
	violationNotesSchema,
	violationQuerySchema,
} from "./attendance.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const UUID2 = "550e8400-e29b-41d4-a716-446655440001";
const DATE = "2026-04-07";

// ─── checkInSchema ─────────────────────────────────────────────────────────

describe("checkInSchema", () => {
	const valid = { childId: UUID, classroomId: UUID2 };

	it("accepts valid check-in with required fields only", () => {
		expect(checkInSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts check-in with optional notes", () => {
		expect(checkInSchema.safeParse({ ...valid, notes: "Dropped off by dad" }).success).toBe(true);
	});

	it("accepts notes at the max length boundary (1000 chars)", () => {
		const notes = "a".repeat(1000);
		expect(checkInSchema.safeParse({ ...valid, notes }).success).toBe(true);
	});

	it("rejects notes exceeding 1000 characters", () => {
		const notes = "a".repeat(1001);
		expect(checkInSchema.safeParse({ ...valid, notes }).success).toBe(false);
	});

	it("rejects non-UUID childId", () => {
		expect(checkInSchema.safeParse({ ...valid, childId: "not-a-uuid" }).success).toBe(false);
	});

	it("rejects non-UUID classroomId", () => {
		expect(checkInSchema.safeParse({ ...valid, classroomId: "123" }).success).toBe(false);
	});

	it("rejects missing childId", () => {
		expect(checkInSchema.safeParse({ classroomId: UUID2 }).success).toBe(false);
	});

	it("rejects missing classroomId", () => {
		expect(checkInSchema.safeParse({ childId: UUID }).success).toBe(false);
	});

	it("rejects empty object", () => {
		expect(checkInSchema.safeParse({}).success).toBe(false);
	});

	it("infers correct output type", () => {
		const result = checkInSchema.safeParse(valid);
		if (result.success) {
			expect(result.data.childId).toBe(UUID);
			expect(result.data.classroomId).toBe(UUID2);
			expect(result.data.notes).toBeUndefined();
		}
	});
});

// ─── checkOutSchema ────────────────────────────────────────────────────────

describe("checkOutSchema", () => {
	it("accepts empty object (no fields required)", () => {
		expect(checkOutSchema.safeParse({}).success).toBe(true);
	});

	it("accepts optional notes", () => {
		expect(checkOutSchema.safeParse({ notes: "Early pickup" }).success).toBe(true);
	});

	it("accepts notes at the max length boundary (1000 chars)", () => {
		const notes = "b".repeat(1000);
		expect(checkOutSchema.safeParse({ notes }).success).toBe(true);
	});

	it("rejects notes exceeding 1000 characters", () => {
		const notes = "b".repeat(1001);
		expect(checkOutSchema.safeParse({ notes }).success).toBe(false);
	});

	it("infers correct output type with notes", () => {
		const result = checkOutSchema.safeParse({ notes: "Picked up early" });
		if (result.success) {
			expect(result.data.notes).toBe("Picked up early");
		}
	});
});

// ─── staffCheckInSchema ────────────────────────────────────────────────────

describe("staffCheckInSchema", () => {
	it("accepts valid classroomId", () => {
		expect(staffCheckInSchema.safeParse({ classroomId: UUID }).success).toBe(true);
	});

	it("accepts classroomId with optional membershipId", () => {
		expect(staffCheckInSchema.safeParse({ classroomId: UUID, membershipId: UUID2 }).success).toBe(
			true,
		);
	});

	it("accepts without membershipId (optional)", () => {
		const result = staffCheckInSchema.safeParse({ classroomId: UUID });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.membershipId).toBeUndefined();
		}
	});

	it("rejects missing classroomId", () => {
		expect(staffCheckInSchema.safeParse({}).success).toBe(false);
	});

	it("rejects non-UUID classroomId", () => {
		expect(staffCheckInSchema.safeParse({ classroomId: "not-a-uuid" }).success).toBe(false);
	});

	it("rejects non-UUID membershipId", () => {
		expect(
			staffCheckInSchema.safeParse({ classroomId: UUID, membershipId: "bad-id" }).success,
		).toBe(false);
	});
});

// ─── attendanceQuerySchema ─────────────────────────────────────────────────

describe("attendanceQuerySchema", () => {
	it("accepts empty object (all optional)", () => {
		expect(attendanceQuerySchema.safeParse({}).success).toBe(true);
	});

	it("accepts valid classroomId", () => {
		expect(attendanceQuerySchema.safeParse({ classroomId: UUID }).success).toBe(true);
	});

	it("accepts valid date in YYYY-MM-DD format", () => {
		expect(attendanceQuerySchema.safeParse({ date: DATE }).success).toBe(true);
	});

	it("accepts valid childId", () => {
		expect(attendanceQuerySchema.safeParse({ childId: UUID }).success).toBe(true);
	});

	it("accepts all fields together", () => {
		expect(
			attendanceQuerySchema.safeParse({ classroomId: UUID, date: DATE, childId: UUID2 }).success,
		).toBe(true);
	});

	it("rejects non-UUID classroomId", () => {
		expect(attendanceQuerySchema.safeParse({ classroomId: "not-uuid" }).success).toBe(false);
	});

	it("rejects date in wrong format (MM/DD/YYYY)", () => {
		expect(attendanceQuerySchema.safeParse({ date: "04/07/2026" }).success).toBe(false);
	});

	it("rejects date without leading zeros", () => {
		expect(attendanceQuerySchema.safeParse({ date: "2026-4-7" }).success).toBe(false);
	});

	it("rejects invalid calendar dates", () => {
		expect(attendanceQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
	});

	it("rejects non-UUID childId", () => {
		expect(attendanceQuerySchema.safeParse({ childId: "child-abc" }).success).toBe(false);
	});
});

// ─── checkInHistoryQuerySchema ─────────────────────────────────────────────

describe("checkInHistoryQuerySchema", () => {
	const valid = { childId: UUID, from: "2026-04-01", to: "2026-04-30" };

	it("accepts valid history query", () => {
		expect(checkInHistoryQuerySchema.safeParse(valid).success).toBe(true);
	});

	it("rejects missing childId", () => {
		expect(
			checkInHistoryQuerySchema.safeParse({ from: "2026-04-01", to: "2026-04-30" }).success,
		).toBe(false);
	});

	it("rejects missing from date", () => {
		expect(checkInHistoryQuerySchema.safeParse({ childId: UUID, to: "2026-04-30" }).success).toBe(
			false,
		);
	});

	it("rejects missing to date", () => {
		expect(checkInHistoryQuerySchema.safeParse({ childId: UUID, from: "2026-04-01" }).success).toBe(
			false,
		);
	});

	it("rejects non-UUID childId", () => {
		expect(checkInHistoryQuerySchema.safeParse({ ...valid, childId: "not-uuid" }).success).toBe(
			false,
		);
	});

	it("rejects from date in wrong format", () => {
		expect(checkInHistoryQuerySchema.safeParse({ ...valid, from: "April 1, 2026" }).success).toBe(
			false,
		);
	});

	it("rejects to date in wrong format", () => {
		expect(checkInHistoryQuerySchema.safeParse({ ...valid, to: "04-30-2026" }).success).toBe(false);
	});

	it("rejects empty object", () => {
		expect(checkInHistoryQuerySchema.safeParse({}).success).toBe(false);
	});

	it("rejects inverted date range (from > to)", () => {
		const result = checkInHistoryQuerySchema.safeParse({
			childId: "550e8400-e29b-41d4-a716-446655440000",
			from: "2026-12-31",
			to: "2026-01-01",
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid calendar dates", () => {
		expect(checkInHistoryQuerySchema.safeParse({ ...valid, from: "2026-02-30" }).success).toBe(
			false,
		);
		expect(checkInHistoryQuerySchema.safeParse({ ...valid, to: "2026-04-31" }).success).toBe(false);
	});
});

// ─── staffAttendanceQuerySchema ────────────────────────────────────────────

describe("staffAttendanceQuerySchema", () => {
	it("accepts empty object (all optional)", () => {
		expect(staffAttendanceQuerySchema.safeParse({}).success).toBe(true);
	});

	it("accepts valid classroomId", () => {
		expect(staffAttendanceQuerySchema.safeParse({ classroomId: UUID }).success).toBe(true);
	});

	it("accepts valid date", () => {
		expect(staffAttendanceQuerySchema.safeParse({ date: DATE }).success).toBe(true);
	});

	it("accepts both classroomId and date", () => {
		expect(staffAttendanceQuerySchema.safeParse({ classroomId: UUID, date: DATE }).success).toBe(
			true,
		);
	});

	it("rejects non-UUID classroomId", () => {
		expect(staffAttendanceQuerySchema.safeParse({ classroomId: "bad" }).success).toBe(false);
	});

	it("rejects invalid date format", () => {
		expect(staffAttendanceQuerySchema.safeParse({ date: "7/4/2026" }).success).toBe(false);
	});

	it("rejects invalid calendar dates", () => {
		expect(staffAttendanceQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
	});
});

// ─── violationQuerySchema ──────────────────────────────────────────────────

describe("violationQuerySchema", () => {
	it("accepts empty object (all optional)", () => {
		expect(violationQuerySchema.safeParse({}).success).toBe(true);
	});

	it('accepts status "open"', () => {
		expect(violationQuerySchema.safeParse({ status: "open" }).success).toBe(true);
	});

	it('accepts status "resolved"', () => {
		expect(violationQuerySchema.safeParse({ status: "resolved" }).success).toBe(true);
	});

	it("accepts valid classroomId", () => {
		expect(violationQuerySchema.safeParse({ classroomId: UUID }).success).toBe(true);
	});

	it("accepts valid from and to dates", () => {
		expect(violationQuerySchema.safeParse({ from: "2026-04-01", to: "2026-04-30" }).success).toBe(
			true,
		);
	});

	it("accepts all fields together", () => {
		expect(
			violationQuerySchema.safeParse({
				classroomId: UUID,
				status: "open",
				from: "2026-04-01",
				to: "2026-04-30",
			}).success,
		).toBe(true);
	});

	it("rejects invalid status value", () => {
		expect(violationQuerySchema.safeParse({ status: "pending" }).success).toBe(false);
	});

	it("rejects non-UUID classroomId", () => {
		expect(violationQuerySchema.safeParse({ classroomId: "not-uuid" }).success).toBe(false);
	});

	it("rejects from date in wrong format", () => {
		expect(violationQuerySchema.safeParse({ from: "04/01/2026" }).success).toBe(false);
	});

	it("rejects to date in wrong format", () => {
		expect(violationQuerySchema.safeParse({ to: "2026/04/30" }).success).toBe(false);
	});

	it("rejects invalid calendar dates", () => {
		expect(violationQuerySchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
		expect(violationQuerySchema.safeParse({ to: "2026-04-31" }).success).toBe(false);
	});

	it("rejects inverted date ranges when from and to are both present", () => {
		expect(violationQuerySchema.safeParse({ from: "2026-04-30", to: "2026-04-01" }).success).toBe(
			false,
		);
	});
});

describe("snapshotQuerySchema", () => {
	it("accepts empty object (all optional)", () => {
		expect(snapshotQuerySchema.safeParse({}).success).toBe(true);
	});

	it("accepts valid from and to dates", () => {
		expect(snapshotQuerySchema.safeParse({ from: "2026-04-01", to: "2026-04-30" }).success).toBe(
			true,
		);
	});

	it("rejects invalid calendar dates", () => {
		expect(snapshotQuerySchema.safeParse({ from: "2026-02-30" }).success).toBe(false);
		expect(snapshotQuerySchema.safeParse({ to: "2026-04-31" }).success).toBe(false);
	});

	it("rejects inverted date ranges when from and to are both present", () => {
		expect(snapshotQuerySchema.safeParse({ from: "2026-04-30", to: "2026-04-01" }).success).toBe(
			false,
		);
	});
});

// ─── violationNotesSchema ──────────────────────────────────────────────────

describe("violationNotesSchema", () => {
	it("accepts valid resolution notes", () => {
		expect(
			violationNotesSchema.safeParse({ resolutionNotes: "Staff reassigned from lunch room" })
				.success,
		).toBe(true);
	});

	it("accepts notes at the max length boundary (2000 chars)", () => {
		const notes = "c".repeat(2000);
		expect(violationNotesSchema.safeParse({ resolutionNotes: notes }).success).toBe(true);
	});

	it("rejects notes exceeding 2000 characters", () => {
		const notes = "c".repeat(2001);
		expect(violationNotesSchema.safeParse({ resolutionNotes: notes }).success).toBe(false);
	});

	it("rejects missing resolutionNotes", () => {
		expect(violationNotesSchema.safeParse({}).success).toBe(false);
	});

	it("rejects empty string", () => {
		const result = violationNotesSchema.safeParse({ resolutionNotes: "" });
		expect(result.success).toBe(false);
	});

	it("infers correct output type", () => {
		const result = violationNotesSchema.safeParse({ resolutionNotes: "Fixed" });
		if (result.success) {
			expect(result.data.resolutionNotes).toBe("Fixed");
		}
	});
});
