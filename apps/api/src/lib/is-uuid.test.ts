import { describe, expect, it } from "vitest";
import { isUuid } from "./is-uuid.js";

describe("isUuid", () => {
	it("accepts valid UUID versions and supported variants", () => {
		expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
		expect(isUuid("550E8400-E29B-81D4-B716-446655440000")).toBe(true);
	});

	it("rejects malformed IDs and unsupported variants", () => {
		expect(isUuid("not-a-uuid")).toBe(false);
		expect(isUuid("550e8400-e29b-91d4-a716-446655440000")).toBe(false);
		expect(isUuid("550e8400-e29b-41d4-7716-446655440000")).toBe(false);
	});
});
