import { describe, expect, it } from "vitest";
import { analyticsDistinctId } from "./analytics";

describe("analyticsDistinctId", () => {
	it("returns a stable non-reversible analytics identifier", async () => {
		const first = await analyticsDistinctId("center", "center-1");
		const second = await analyticsDistinctId("center", "center-1");

		expect(first).toBe(second);
		expect(first).toMatch(/^center:[a-f0-9]{64}$/);
		expect(first).not.toContain("center-1");
	});

	it("keeps the subject namespace in the visible prefix", async () => {
		await expect(analyticsDistinctId("user", "user-1")).resolves.toMatch(/^user:/);
		await expect(analyticsDistinctId("center", "user-1")).resolves.toMatch(/^center:/);
	});
});
