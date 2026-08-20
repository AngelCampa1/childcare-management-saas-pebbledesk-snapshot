import type { MessageType } from "../constants/enums.js";

export interface Message {
	id: string;
	centerId: string;
	senderId: string;
	classroomId?: string;
	subject: string;
	body: string;
	messageType: MessageType;
	createdAt: string;
}

export interface MessageRecipient {
	id: string;
	messageId: string;
	guardianId: string;
	deliveredAt?: string;
	readAt?: string;
}

export interface MessageReply {
	id: string;
	centerId: string;
	messageId: string;
	guardianId?: string | null;
	fromEmail: string;
	fromName?: string | null;
	body: string;
	providerEmailId?: string | null;
	providerMessageId?: string | null;
	receivedAt: string;
	readAt?: string | null;
	createdAt: string;
}

export interface MessageInboxItem {
	reply: MessageReply;
	message: Message;
	guardian?: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
	} | null;
}
