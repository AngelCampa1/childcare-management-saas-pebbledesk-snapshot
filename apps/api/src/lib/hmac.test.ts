import { describe, expect, it } from "vitest";
import { computeHmac } from "./hmac.js";

describe("computeHmac", () => {
	it("returns a lowercase hex string", async () => {
		const result = await computeHmac("hello@example.com", "test-secret");
		expect(result).toMatch(/^[0-9a-f]+$/);
	});

	it("returns a 64-character SHA-256 hex digest", async () => {
		const result = await computeHmac("hello@example.com", "test-secret");
		expect(result).toHaveLength(64);
	});

	it("is deterministic — same inputs produce the same output", async () => {
		const a = await computeHmac("user@example.com", "my-secret");
		const b = await computeHmac("user@example.com", "my-secret");
		expect(a).toBe(b);
	});

	it("different messages produce different digests", async () => {
		const a = await computeHmac("alice@example.com", "secret");
		const b = await computeHmac("bob@example.com", "secret");
		expect(a).not.toBe(b);
	});

	it("different secrets produce different digests for the same message", async () => {
		const a = await computeHmac("user@example.com", "secret-one");
		const b = await computeHmac("user@example.com", "secret-two");
		expect(a).not.toBe(b);
	});

	it("produces a known-good HMAC-SHA256 value", async () => {
		// Verified: HMAC-SHA256("test-message", "test-key")
		// node -e "require('crypto').createHmac('sha256','test-key').update('test-message').digest('hex')"
		const result = await computeHmac("test-message", "test-key");
		expect(result).toBe("f8c2bb87c17608c9038eab4e92ef2775e42629c939d6fd3390d42f80af6bb712");
	});
});
