import { describe, expect, it } from "vitest";
import { PAGE_DEFAULT, PAGE_MAX, paginationSchema, resolvePagination } from "./pagination.js";

describe("paginationSchema", () => {
	it("accepts valid limit and cursor", () => {
		const result = paginationSchema.safeParse({ limit: 10, cursor: 5 });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(10);
			expect(result.data.cursor).toBe(5);
		}
	});

	it("accepts empty input (both optional)", () => {
		const result = paginationSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBeUndefined();
			expect(result.data.cursor).toBeUndefined();
		}
	});

	it("coerces string numbers to integers", () => {
		const result = paginationSchema.safeParse({ limit: "25", cursor: "0" });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(25);
			expect(result.data.cursor).toBe(0);
		}
	});

	it("rejects limit below 1", () => {
		const result = paginationSchema.safeParse({ limit: 0 });
		expect(result.success).toBe(false);
	});

	it("rejects limit above PAGE_MAX", () => {
		const result = paginationSchema.safeParse({ limit: PAGE_MAX + 1 });
		expect(result.success).toBe(false);
	});

	it("accepts limit equal to PAGE_MAX", () => {
		const result = paginationSchema.safeParse({ limit: PAGE_MAX });
		expect(result.success).toBe(true);
	});

	it("rejects cursor below 0", () => {
		const result = paginationSchema.safeParse({ cursor: -1 });
		expect(result.success).toBe(false);
	});

	it("rejects non-integer limit", () => {
		const result = paginationSchema.safeParse({ limit: 5.5 });
		expect(result.success).toBe(false);
	});
});

describe("resolvePagination", () => {
	it("returns PAGE_DEFAULT limit and 0 offset when nothing is provided", () => {
		const result = resolvePagination({});
		expect(result.limit).toBe(PAGE_DEFAULT);
		expect(result.offset).toBe(0);
	});

	it("uses the provided limit and cursor", () => {
		const result = resolvePagination({ limit: 10, cursor: 20 });
		expect(result.limit).toBe(10);
		expect(result.offset).toBe(20);
	});

	it("caps the limit at PAGE_MAX", () => {
		const result = resolvePagination({ limit: PAGE_MAX + 100 });
		expect(result.limit).toBe(PAGE_MAX);
	});

	it("uses 0 offset when cursor is 0", () => {
		const result = resolvePagination({ cursor: 0 });
		expect(result.offset).toBe(0);
	});
});
