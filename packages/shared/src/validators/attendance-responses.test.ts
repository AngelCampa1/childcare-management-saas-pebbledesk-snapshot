import { describe, expect, it } from "vitest";
import {
	checkInResponseSchema,
	checkInsResponseSchema,
	staffCheckInResponseSchema,
	staffCheckInsResponseSchema,
} from "./attendance-responses.js";

describe("attendance response validators", () => {
	it("accepts a check-ins list with unknown extra fields preserved", () => {
		const parsed = checkInsResponseSchema.parse({
			checkIns: [{ id: "ci-1", childId: "child-1", extra: "kept" }],
		});
		expect(parsed.checkIns[0]?.id).toBe("ci-1");
		expect((parsed.checkIns[0] as { extra?: string }).extra).toBe("kept");
	});

	it("rejects a check-ins payload missing the list key", () => {
		expect(checkInsResponseSchema.safeParse({ wrong: [] }).success).toBe(false);
	});

	it("rejects a check-in record without an id", () => {
		expect(checkInsResponseSchema.safeParse({ checkIns: [{ childId: "c" }] }).success).toBe(false);
	});

	it("accepts a single check-in response", () => {
		expect(checkInResponseSchema.parse({ checkIn: { id: "ci-1" } }).checkIn.id).toBe("ci-1");
	});

	it("accepts a staff check-ins list", () => {
		expect(
			staffCheckInsResponseSchema.parse({ staffCheckIns: [{ id: "s-1" }] }).staffCheckIns,
		).toHaveLength(1);
	});

	it("accepts a single staff check-in response", () => {
		expect(staffCheckInResponseSchema.parse({ staffCheckIn: { id: "s-1" } }).staffCheckIn.id).toBe(
			"s-1",
		);
	});
});
