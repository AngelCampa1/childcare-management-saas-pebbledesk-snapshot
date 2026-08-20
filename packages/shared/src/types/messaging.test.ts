import { describe, expect, it } from "vitest";
import type { Message, MessageRecipient } from "./messaging.js";

describe("Message interface", () => {
	it("matches the outbound message record shape", () => {
		const message: Message = {
			id: "message-1",
			centerId: "center-1",
			senderId: "user-1",
			subject: "Classroom update",
			body: "We will be outside after 3 PM.",
			messageType: "announcement",
			classroomId: "classroom-1",
			createdAt: "2026-04-07T12:00:00Z",
		};

		expect(message.senderId).toBe("user-1");
		expect(message.createdAt).toBeDefined();
	});
});

describe("MessageRecipient interface", () => {
	it("tracks delivery state separately from read state", () => {
		const recipient: MessageRecipient = {
			id: "recipient-1",
			messageId: "message-1",
			guardianId: "guardian-1",
			deliveredAt: "2026-04-07T12:01:00Z",
		};

		expect(recipient.deliveredAt).toBe("2026-04-07T12:01:00Z");
		expect(recipient.readAt).toBeUndefined();
	});
});
