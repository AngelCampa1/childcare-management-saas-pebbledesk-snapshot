import { sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth.js";
import { centers } from "./centers.js";
import { classrooms } from "./classrooms.js";
import { guardians } from "./guardians.js";

export const messageTypeEnum = pgEnum("message_type", ["announcement", "direct", "alert"]);

export const messages = pgTable(
	"messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		senderId: uuid("sender_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		subject: text("subject").notNull(),
		body: text("body").notNull(),
		messageType: messageTypeEnum("message_type").notNull(),
		classroomId: uuid("classroom_id").references(() => classrooms.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		unique("messages_id_center_unique").on(t.id, t.centerId),
		foreignKey({
			name: "messages_classroom_center_fk",
			columns: [t.classroomId, t.centerId],
			foreignColumns: [classrooms.id, classrooms.centerId],
		}),
		index("messages_center_id_idx").on(t.centerId),
	],
);

export const messageRecipients = pgTable(
	"message_recipients",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		messageId: uuid("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		guardianId: uuid("guardian_id")
			.notNull()
			.references(() => guardians.id, { onDelete: "cascade" }),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		readAt: timestamp("read_at", { withTimezone: true }),
	},
	(t) => [
		foreignKey({
			name: "message_recipients_message_center_fk",
			columns: [t.messageId, t.centerId],
			foreignColumns: [messages.id, messages.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "message_recipients_guardian_center_fk",
			columns: [t.guardianId, t.centerId],
			foreignColumns: [guardians.id, guardians.centerId],
		}).onDelete("cascade"),
	],
);

export const messageReplies = pgTable(
	"message_replies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		centerId: uuid("center_id")
			.notNull()
			.references(() => centers.id, { onDelete: "cascade" }),
		messageId: uuid("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		guardianId: uuid("guardian_id").references(() => guardians.id, { onDelete: "set null" }),
		fromEmail: text("from_email").notNull(),
		fromName: text("from_name"),
		body: text("body").notNull(),
		providerEmailId: text("provider_email_id"),
		providerMessageId: text("provider_message_id"),
		receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(t) => [
		index("message_replies_center_received_idx").on(t.centerId, t.receivedAt),
		index("message_replies_message_received_idx").on(t.messageId, t.receivedAt),
		index("message_replies_guardian_idx").on(t.guardianId),
		foreignKey({
			name: "message_replies_message_center_fk",
			columns: [t.messageId, t.centerId],
			foreignColumns: [messages.id, messages.centerId],
		}).onDelete("cascade"),
		foreignKey({
			name: "message_replies_guardian_center_fk",
			columns: [t.guardianId, t.centerId],
			foreignColumns: [guardians.id, guardians.centerId],
		}),
		uniqueIndex("message_replies_provider_email_id_unique")
			.on(t.providerEmailId)
			.where(sql`${t.providerEmailId} IS NOT NULL`),
	],
);
