import { describe, expect, it } from "vitest";
import { guidanceProgressPatchSchema } from "./guidance";

describe("guidanceProgressPatchSchema", () => {
	it("accepts partial progress updates", () => {
		const result = guidanceProgressPatchSchema.parse({
			completedStepIds: ["dashboard.start", "attendance.check-in"],
			completeStepId: "reports.download-pdf",
			lastOpenedGuideId: "attendance-basics",
		});

		expect(result.completedStepIds).toEqual(["dashboard.start", "attendance.check-in"]);
		expect(result.completeStepId).toBe("reports.download-pdf");
		expect(result.lastOpenedGuideId).toBe("attendance-basics");
	});

	it("accepts atomic add and remove operations", () => {
		const result = guidanceProgressPatchSchema.parse({
			uncompleteStepId: "attendance.check-in",
			dismissGuideId: "welcome",
			undismissGuideId: "welcome",
		});

		expect(result.uncompleteStepId).toBe("attendance.check-in");
		expect(result.dismissGuideId).toBe("welcome");
		expect(result.undismissGuideId).toBe("welcome");
	});

	it("allows clearing the last opened guide", () => {
		expect(guidanceProgressPatchSchema.parse({ lastOpenedGuideId: null })).toEqual({
			lastOpenedGuideId: null,
		});
	});

	it("rejects unknown fields so progress updates stay predictable", () => {
		expect(() =>
			guidanceProgressPatchSchema.parse({ completedStepIds: [], surprise: true }),
		).toThrow();
	});
});
