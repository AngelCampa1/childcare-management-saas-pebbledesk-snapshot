import { describe, expect, it } from "vitest";
import {
	ratioSnapshotsResponseSchema,
	ratiosResponseSchema,
	ratioViolationResponseSchema,
	ratioViolationsResponseSchema,
} from "./ratio-responses.js";

describe("ratio response validators", () => {
	it("accepts a ratios list and preserves unknown fields", () => {
		const parsed = ratiosResponseSchema.parse({
			ratios: [{ classroomId: "room-1", status: "ok" }],
		});
		expect(parsed.ratios[0]?.classroomId).toBe("room-1");
		expect((parsed.ratios[0] as { status?: string }).status).toBe("ok");
	});

	it("rejects a ratios payload missing the list key", () => {
		expect(ratiosResponseSchema.safeParse({ wrong: [] }).success).toBe(false);
	});

	it("rejects a ratio record without a classroomId", () => {
		expect(ratiosResponseSchema.safeParse({ ratios: [{ status: "ok" }] }).success).toBe(false);
	});

	it("accepts an empty ratios list", () => {
		expect(ratiosResponseSchema.parse({ ratios: [] }).ratios).toHaveLength(0);
	});

	it("accepts a ratio snapshots response", () => {
		expect(
			ratioSnapshotsResponseSchema.parse({ snapshots: [{ id: "snap-1" }] }).snapshots,
		).toHaveLength(1);
	});

	it("accepts a ratio violations response", () => {
		expect(
			ratioViolationsResponseSchema.parse({ violations: [{ id: "v-1" }] }).violations,
		).toHaveLength(1);
	});

	it("rejects violation records without an id", () => {
		expect(ratioViolationsResponseSchema.safeParse({ violations: [{}] }).success).toBe(false);
	});

	it("accepts a single violation response", () => {
		expect(ratioViolationResponseSchema.parse({ violation: { id: "v-1" } }).violation.id).toBe(
			"v-1",
		);
	});
});
