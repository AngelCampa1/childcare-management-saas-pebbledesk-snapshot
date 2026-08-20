import { describe, expect, it } from "vitest";
import { idParamsSchema, idSchema } from "./id-schema.js";

describe("idSchema", () => {
	it("accepts a valid UUID v4", () => {
		const result = idSchema.safeParse("550e8400-e29b-41d4-a716-446655440000");
		expect(result.success).toBe(true);
	});

	it("accepts UUID-shaped GUIDs that do not have RFC variant bits", () => {
		const result = idSchema.safeParse("00000000-0000-0000-0000-000000000002");
		expect(result.success).toBe(true);
	});

	it("rejects a non-UUID string", () => {
		const result = idSchema.safeParse("not-a-uuid");
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("Invalid ID format");
		}
	});

	it("rejects an empty string", () => {
		const result = idSchema.safeParse("");
		expect(result.success).toBe(false);
	});

	it("rejects a number", () => {
		const result = idSchema.safeParse(123);
		expect(result.success).toBe(false);
	});

	it("rejects undefined", () => {
		const result = idSchema.safeParse(undefined);
		expect(result.success).toBe(false);
	});
});

describe("idParamsSchema", () => {
	it("accepts an object with a valid UUID id", () => {
		const result = idParamsSchema.safeParse({ id: "550e8400-e29b-41d4-a716-446655440000" });
		expect(result.success).toBe(true);
	});

	it("rejects an object with a non-UUID id", () => {
		const result = idParamsSchema.safeParse({ id: "bad-id" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe("Invalid ID format");
		}
	});

	it("rejects an object missing the id field", () => {
		const result = idParamsSchema.safeParse({});
		expect(result.success).toBe(false);
	});
});
