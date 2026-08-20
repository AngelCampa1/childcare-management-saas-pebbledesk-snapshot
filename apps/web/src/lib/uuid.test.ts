import { describe, expect, it, vi } from "vitest";
import { generateId } from "./uuid.js";

describe("generateId", () => {
	it("returns a valid UUID v4 format string when crypto.randomUUID is available", () => {
		const id = generateId();
		// UUID v4 pattern
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
	});

	it("returns a different ID each call", () => {
		const ids = new Set(Array.from({ length: 20 }, () => generateId()));
		expect(ids.size).toBe(20);
	});

	it("falls back to manual UUID when crypto.randomUUID is not available", () => {
		const original = crypto.randomUUID;
		// @ts-expect-error - intentionally removing to test fallback
		crypto.randomUUID = undefined;
		try {
			const id = generateId();
			expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
			expect(id.length).toBe(36);
		} finally {
			crypto.randomUUID = original;
		}
	});

	it("generates a UUID with correct version bits in fallback", () => {
		const original = crypto.randomUUID;
		// @ts-expect-error - intentionally removing to test fallback
		crypto.randomUUID = undefined;
		try {
			const id = generateId();
			const parts = id.split("-");
			// version nibble should be 4
			expect(parts[2]?.[0]).toBe("4");
			// variant nibble should be 8, 9, a, or b
			expect(parts[3]?.[0]).toMatch(/[89ab]/);
		} finally {
			crypto.randomUUID = original;
		}
	});

	it("returns a string of length 36", () => {
		const id = generateId();
		expect(id).toHaveLength(36);
	});

	it("uses crypto.randomUUID when available", () => {
		const spy = vi.spyOn(crypto, "randomUUID");
		generateId();
		expect(spy).toHaveBeenCalled();
		spy.mockRestore();
	});
});
