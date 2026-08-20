import { z } from "zod";
import { MESSAGE_TYPES } from "../constants/enums.js";
import { uuidLikeSchema } from "./id.js";

const messageBaseSchema = z.object({
	subject: z.string().min(1).max(255),
	body: z.string().min(1).max(10_000),
	messageType: z.enum(MESSAGE_TYPES),
});

const guardianRecipientSchema = messageBaseSchema.extend({
	recipientMode: z.literal("guardian_ids"),
	recipientGuardianIds: z.array(uuidLikeSchema).min(1).max(500),
});

const classroomRecipientSchema = messageBaseSchema.extend({
	recipientMode: z.literal("classroom"),
	classroomId: uuidLikeSchema,
});

const childRecipientSchema = messageBaseSchema.extend({
	recipientMode: z.literal("child_ids"),
	recipientChildIds: z.array(uuidLikeSchema).min(1).max(500),
});

export const createMessageSchema = z.discriminatedUnion("recipientMode", [
	guardianRecipientSchema,
	classroomRecipientSchema,
	childRecipientSchema,
]);

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
