import { describe, expect, it } from "vitest";
import { createMessageSchema } from "./messaging.js";

const UUID = "550e8400-e29b-41d4-a716-446655440000";
const makeIds = (n: number) => Array.from({ length: n }, () => UUID);

describe("createMessageSchema — recipient array bounds", () => {
	it("accepts exactly 500 guardian IDs", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "Hello families.",
			messageType: "direct",
			recipientMode: "guardian_ids",
			recipientGuardianIds: makeIds(500),
		});
		expect(result.success).toBe(true);
	});

	it("rejects 501 guardian IDs", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "Hello families.",
			messageType: "direct",
			recipientMode: "guardian_ids",
			recipientGuardianIds: makeIds(501),
		});
		expect(result.success).toBe(false);
	});

	it("accepts exactly 500 child IDs", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "Hello families.",
			messageType: "direct",
			recipientMode: "child_ids",
			recipientChildIds: makeIds(500),
		});
		expect(result.success).toBe(true);
	});

	it("rejects 501 child IDs", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "Hello families.",
			messageType: "direct",
			recipientMode: "child_ids",
			recipientChildIds: makeIds(501),
		});
		expect(result.success).toBe(false);
	});
});

describe("createMessageSchema — body length bounds", () => {
	it("accepts a body of exactly 10000 characters", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "a".repeat(10_000),
			messageType: "direct",
			recipientMode: "classroom",
			classroomId: UUID,
		});
		expect(result.success).toBe(true);
	});

	it("rejects a body of 10001 characters", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "a".repeat(10_001),
			messageType: "direct",
			recipientMode: "classroom",
			classroomId: UUID,
		});
		expect(result.success).toBe(false);
	});

	it("accepts a normal short body", () => {
		const result = createMessageSchema.safeParse({
			subject: "Update",
			body: "Hello",
			messageType: "direct",
			recipientMode: "classroom",
			classroomId: UUID,
		});
		expect(result.success).toBe(true);
	});
});

describe("createMessageSchema — subject length (existing cap)", () => {
	it("rejects a subject longer than 255 characters", () => {
		const result = createMessageSchema.safeParse({
			subject: "x".repeat(256),
			body: "Hello",
			messageType: "direct",
			recipientMode: "classroom",
			classroomId: UUID,
		});
		expect(result.success).toBe(false);
	});

	it("accepts a subject of exactly 255 characters", () => {
		const result = createMessageSchema.safeParse({
			subject: "x".repeat(255),
			body: "Hello",
			messageType: "direct",
			recipientMode: "classroom",
			classroomId: UUID,
		});
		expect(result.success).toBe(true);
	});
});
