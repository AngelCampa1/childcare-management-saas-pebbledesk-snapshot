import { describe, expect, it } from "vitest";
import { createGuardianSchema, updateGuardianSchema } from "./guardian.js";

describe("createGuardianSchema", () => {
	it("accepts a valid guardian with optional contact fields omitted", () => {
		expect(createGuardianSchema.safeParse({ firstName: "Mia", lastName: "Johnson" }).success).toBe(
			true,
		);
	});

	it("rejects null email — create has no stored value to clear", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Mia", lastName: "Johnson", email: null })
				.success,
		).toBe(false);
	});

	it("rejects null phone — create has no stored value to clear", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Mia", lastName: "Johnson", phone: null })
				.success,
		).toBe(false);
	});
});

describe("updateGuardianSchema", () => {
	it("accepts null email and phone so a director can clear stored contact info", () => {
		const result = updateGuardianSchema.safeParse({ email: null, phone: null });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.email).toBeNull();
			expect(result.data.phone).toBeNull();
		}
	});

	it("still accepts a valid replacement email and phone", () => {
		expect(
			updateGuardianSchema.safeParse({ email: "mia@example.com", phone: "5125550111" }).success,
		).toBe(true);
	});

	it("still rejects a malformed email", () => {
		expect(updateGuardianSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
	});

	it("still rejects a too-short phone", () => {
		expect(updateGuardianSchema.safeParse({ phone: "12" }).success).toBe(false);
	});

	it("accepts an omitted field to leave the stored value unchanged", () => {
		expect(updateGuardianSchema.safeParse({ firstName: "Mia" }).success).toBe(true);
	});
});
