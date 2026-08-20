/**
 * Tests for scheduling validators.
 * Covers createTimeEntryAdjustmentSchema integrity constraints.
 */
import { describe, expect, it } from "vitest";
import { createTimeEntryAdjustmentSchema } from "./scheduling.js";

// ─── createTimeEntryAdjustmentSchema ────────────────────────────────────────

describe("createTimeEntryAdjustmentSchema", () => {
	const valid = {
		hoursWorked: 8,
		hoursScheduled: 8,
		overtimeHours: 0,
		status: "manual" as const,
	};

	it("accepts a valid adjustment", () => {
		expect(createTimeEntryAdjustmentSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts status approved", () => {
		expect(
			createTimeEntryAdjustmentSchema.safeParse({ ...valid, status: "approved" }).success,
		).toBe(true);
	});

	it("accepts overtimeHours equal to hoursWorked (boundary)", () => {
		expect(
			createTimeEntryAdjustmentSchema.safeParse({
				...valid,
				hoursWorked: 8,
				overtimeHours: 8,
			}).success,
		).toBe(true);
	});

	it("rejects hoursWorked greater than 24", () => {
		const result = createTimeEntryAdjustmentSchema.safeParse({ ...valid, hoursWorked: 25 });
		expect(result.success).toBe(false);
	});

	it("rejects hoursScheduled greater than 24", () => {
		const result = createTimeEntryAdjustmentSchema.safeParse({ ...valid, hoursScheduled: 24.1 });
		expect(result.success).toBe(false);
	});

	it("rejects overtimeHours greater than 24", () => {
		const result = createTimeEntryAdjustmentSchema.safeParse({ ...valid, overtimeHours: 25 });
		expect(result.success).toBe(false);
	});

	it("rejects overtimeHours exceeding hoursWorked", () => {
		const result = createTimeEntryAdjustmentSchema.safeParse({
			...valid,
			hoursWorked: 6,
			overtimeHours: 7,
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			const paths = result.error.issues.map((i) => i.path.join("."));
			expect(paths).toContain("overtimeHours");
		}
	});

	it("rejects status auto", () => {
		const result = createTimeEntryAdjustmentSchema.safeParse({ ...valid, status: "auto" });
		expect(result.success).toBe(false);
	});
});
