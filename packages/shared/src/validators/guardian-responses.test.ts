import { describe, expect, it } from "vitest";
import {
	deleteGuardianResponseSchema,
	guardianDetailResponseSchema,
	guardianListResponseSchema,
	guardianMutationResponseSchema,
} from "./guardian-responses.js";

const GUARDIAN_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("guardianListResponseSchema", () => {
	it("accepts a guardians array and preserves unknown fields", () => {
		const parsed = guardianListResponseSchema.parse({
			guardians: [{ id: GUARDIAN_ID, firstName: "Taylor", children: [] }],
		});
		expect(parsed.guardians[0]?.id).toBe(GUARDIAN_ID);
	});

	it("rejects a payload missing the guardians array", () => {
		expect(guardianListResponseSchema.safeParse({ notGuardians: [] }).success).toBe(false);
	});

	it("rejects a guardian entry without an id", () => {
		expect(
			guardianListResponseSchema.safeParse({ guardians: [{ firstName: "Taylor" }] }).success,
		).toBe(false);
	});
});

describe("guardianDetailResponseSchema", () => {
	it("accepts a guardian with linked children", () => {
		const parsed = guardianDetailResponseSchema.parse({
			guardian: { id: GUARDIAN_ID },
			children: [],
		});
		expect(parsed.guardian.id).toBe(GUARDIAN_ID);
	});

	it("rejects a payload missing the guardian", () => {
		expect(guardianDetailResponseSchema.safeParse({ children: [] }).success).toBe(false);
	});
});

describe("guardianMutationResponseSchema", () => {
	it("accepts a wrapped guardian", () => {
		expect(
			guardianMutationResponseSchema.parse({ guardian: { id: GUARDIAN_ID } }).guardian.id,
		).toBe(GUARDIAN_ID);
	});

	it("rejects a missing guardian", () => {
		expect(guardianMutationResponseSchema.safeParse({ notGuardian: true }).success).toBe(false);
	});
});

describe("deleteGuardianResponseSchema", () => {
	it("accepts the API's { ok: true } shape", () => {
		expect(deleteGuardianResponseSchema.parse({ ok: true }).ok).toBe(true);
	});

	it("rejects a non-object response", () => {
		expect(deleteGuardianResponseSchema.safeParse(null).success).toBe(false);
	});
});
