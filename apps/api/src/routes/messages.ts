import { zValidator } from "@hono/zod-validator";
import {
	childGuardians,
	children,
	classroomAssignments,
	classrooms,
	guardians,
	messageRecipients,
	messageReplies,
	messages,
	staffAssignments,
} from "@pebbledesk/db";
import { createMessageSchema, escapeHtml } from "@pebbledesk/shared";
import { and, desc, eq, gt, ilike, inArray, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { buildBrandHeaderHtml } from "../lib/brand-email.js";
import { mapWithConcurrency, retryOn429 } from "../lib/concurrency.js";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { requireAuth, requireCenter } from "../middleware/auth.js";

const messagesRoutes = new Hono<AppEnv>();

const messageListQuerySchema = z.object({
	messageType: z.enum(["announcement", "direct", "alert"]).optional(),
	classroomId: idSchema.optional(),
	search: z.string().trim().min(1).optional(),
	limit: z.coerce.number().int().min(1).max(200).optional(),
	cursor: z.coerce.number().int().min(0).optional(),
});

const messageInboxQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).optional(),
});

const resendInboundWebhookSchema = z.object({
	type: z.string(),
	data: z.object({
		email_id: z.string().min(1),
		message_id: z.string().min(1).optional(),
		from: z.string().min(1),
		to: z.union([z.string(), z.array(z.string())]),
		subject: z.string().optional(),
		created_at: z.string().datetime({ offset: true }).optional(),
	}),
});

const resendEmailSchema = z.object({
	text: z.string().optional().nullable(),
	html: z.string().optional().nullable(),
});

const SVIX_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;
const MAX_INBOUND_REPLY_BODY_LENGTH = 10_000;
const REPLY_TRUNCATION_NOTICE = "\n\n[Reply truncated]";

type DbClient = AppEnv["Variables"]["db"];
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type Recipient = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
};

async function getStaffClassroomIds(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	membershipId: string,
) {
	const today = new Date().toISOString().split("T")[0];
	const assignments = await db
		.select({ classroomId: staffAssignments.classroomId })
		.from(staffAssignments)
		.where(
			and(
				eq(staffAssignments.centerId, centerId),
				eq(staffAssignments.membershipId, membershipId),
				lte(staffAssignments.effectiveDate, today),
				or(isNull(staffAssignments.endDate), gt(staffAssignments.endDate, today)),
			),
		);

	return assignments.map((assignment) => assignment.classroomId);
}

async function sendEmail(input: {
	apiKey: string;
	from: string;
	to: string;
	subject: string;
	firstName?: string | null;
	body: string;
	replyTo?: string;
}) {
	return fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from: input.from,
			to: input.to,
			subject: input.subject,
			reply_to: input.replyTo,
			html: `${buildBrandHeaderHtml()}<p>Hello ${escapeHtml(input.firstName ?? "there")},</p><p>${escapeHtml(input.body ?? "")}</p>`,
		}),
	});
}

function getReplyDomain(env: AppEnv["Bindings"]) {
	if (env.RESEND_INBOUND_REPLY_DOMAIN) return env.RESEND_INBOUND_REPLY_DOMAIN;

	const atIndex = env.RESEND_FROM_EMAIL.lastIndexOf("@");
	if (atIndex === -1) return "";
	return env.RESEND_FROM_EMAIL.slice(atIndex + 1);
}

function buildReplyTo(env: AppEnv["Bindings"], messageId: string, guardianId: string) {
	return `replies+${messageId}.${guardianId}@${getReplyDomain(env)}`;
}

function extractEmailAddress(value: string) {
	const match = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
	return (match?.[1] ?? value).trim().toLowerCase();
}

function extractEmailName(value: string) {
	const match = value.match(/^\s*"?([^"<]+?)"?\s*<[^<>@\s]+@[^<>@\s]+>\s*$/);
	const name = match?.[1]?.trim();
	return name && name.length > 0 ? name : null;
}

function normalizeEmail(value: string | null) {
	return value?.trim().toLowerCase() ?? "";
}

function stripHtml(value: string) {
	return value
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseReplyAddress(recipients: string[]) {
	for (const recipient of recipients) {
		const address = extractEmailAddress(recipient);
		const match = address.match(
			/^replies\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i,
		);
		if (match?.[1] && match[2]) {
			return { messageId: match[1], guardianId: match[2] };
		}
	}

	return null;
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array) {
	const buffer = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(buffer).set(bytes);
	return buffer;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
	if (left.length !== right.length) return false;

	let diff = 0;
	for (let i = 0; i < left.length; i += 1) {
		diff |= left[i] ^ right[i];
	}
	return diff === 0;
}

async function verifySvixSignature(input: {
	payload: string;
	secret: string;
	id: string | null;
	timestamp: string | null;
	signature: string | null;
}) {
	if (!input.id || !input.timestamp || !input.signature) return false;

	const timestampSeconds = Number(input.timestamp);
	if (!Number.isFinite(timestampSeconds)) return false;
	const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
	if (ageSeconds > SVIX_TIMESTAMP_TOLERANCE_SECONDS) return false;

	const signedPayload = `${input.id}.${input.timestamp}.${input.payload}`;
	let keyBytes: Uint8Array;
	try {
		keyBytes = base64ToBytes(input.secret.replace(/^whsec_/, ""));
	} catch {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		toArrayBuffer(keyBytes),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
	const expected = new Uint8Array(signature);

	for (const part of input.signature.split(" ")) {
		const [version, encodedSignature] = part.split(",");
		if (version !== "v1" || !encodedSignature) continue;
		try {
			if (timingSafeEqual(expected, base64ToBytes(encodedSignature))) return true;
		} catch {
			return false;
		}
	}

	return false;
}

async function fetchReceivedEmailBody(apiKey: string, emailId: string) {
	const response = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	if (!response.ok) {
		throw new Error("Failed to fetch received email");
	}

	const parsed = resendEmailSchema.safeParse(await response.json());
	if (!parsed.success) {
		throw new Error("Invalid received email payload");
	}

	const body = parsed.data.text?.trim() || (parsed.data.html ? stripHtml(parsed.data.html) : "");
	if (body.length <= MAX_INBOUND_REPLY_BODY_LENGTH) return body;

	return `${body.slice(
		0,
		MAX_INBOUND_REPLY_BODY_LENGTH - REPLY_TRUNCATION_NOTICE.length,
	)}${REPLY_TRUNCATION_NOTICE}`;
}

messagesRoutes.post("/inbound/resend", async (c) => {
	const secret = c.env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		return c.json({ error: "Inbound webhook is not configured" }, 503);
	}

	const payload = await c.req.text();
	const verified = await verifySvixSignature({
		payload,
		secret,
		id: c.req.header("svix-id") ?? null,
		timestamp: c.req.header("svix-timestamp") ?? null,
		signature: c.req.header("svix-signature") ?? null,
	});
	if (!verified) {
		return c.json({ error: "Invalid signature" }, 401);
	}

	let payloadJson: unknown;
	try {
		payloadJson = JSON.parse(payload);
	} catch {
		return c.json({ error: "Invalid webhook payload" }, 400);
	}

	const parsed = resendInboundWebhookSchema.safeParse(payloadJson);
	if (!parsed.success) {
		return c.json({ error: "Invalid webhook payload" }, 400);
	}

	if (parsed.data.type !== "email.received") {
		return c.json({ status: "ignored" }, 202);
	}

	const recipients = Array.isArray(parsed.data.data.to)
		? parsed.data.data.to
		: [parsed.data.data.to];
	const target = parseReplyAddress(recipients);
	if (!target) {
		return c.json({ error: "Reply address not recognized" }, 400);
	}

	const db = c.get("db");
	const [message] = await db
		.select({ id: messages.id, centerId: messages.centerId, classroomId: messages.classroomId })
		.from(messages)
		.where(eq(messages.id, target.messageId))
		.limit(1);

	if (!message) {
		notFound("Message not found");
	}

	const [guardian] = await db
		.select({ id: guardians.id, centerId: guardians.centerId, email: guardians.email })
		.from(guardians)
		.where(and(eq(guardians.id, target.guardianId), eq(guardians.centerId, message.centerId)))
		.limit(1);

	if (!guardian) {
		notFound("Guardian not found");
	}

	const fromEmail = extractEmailAddress(parsed.data.data.from);
	if (!guardian.email || normalizeEmail(guardian.email) !== fromEmail) {
		forbidden("Inbound reply sender does not match guardian");
	}

	const [recipient] = await db
		.select({ id: messageRecipients.id })
		.from(messageRecipients)
		.where(
			and(
				eq(messageRecipients.messageId, message.id),
				eq(messageRecipients.guardianId, guardian.id),
				eq(messageRecipients.centerId, message.centerId),
			),
		)
		.limit(1);

	if (!recipient) {
		forbidden("Inbound reply recipient is not on this message");
	}

	const body = await fetchReceivedEmailBody(c.env.RESEND_API_KEY, parsed.data.data.email_id);
	if (!body) {
		return c.json({ error: "Inbound email body is empty" }, 400);
	}

	const [reply] = await db
		.insert(messageReplies)
		.values({
			centerId: message.centerId,
			messageId: message.id,
			guardianId: guardian.id,
			fromEmail,
			fromName: extractEmailName(parsed.data.data.from),
			body,
			providerEmailId: parsed.data.data.email_id,
			providerMessageId: parsed.data.data.message_id,
			receivedAt: parsed.data.data.created_at ? new Date(parsed.data.data.created_at) : new Date(),
		})
		.onConflictDoNothing()
		.returning();

	if (reply) {
		return c.json({ status: "accepted", replyId: reply.id }, 202);
	}

	const [existingReply] = await db
		.select({ id: messageReplies.id })
		.from(messageReplies)
		.where(eq(messageReplies.providerEmailId, parsed.data.data.email_id))
		.limit(1);

	if (!existingReply) {
		throw new Error("Failed to store inbound reply");
	}

	return c.json({ status: "accepted", replyId: existingReply.id }, 202);
});

messagesRoutes.use("*", requireAuth, requireCenter);

async function resolveRecipients(
	db: DbClient | DbTransaction,
	centerId: string,
	data: z.infer<typeof createMessageSchema>,
): Promise<Recipient[]> {
	if (data.recipientMode === "guardian_ids") {
		return db
			.select({
				id: guardians.id,
				firstName: guardians.firstName,
				lastName: guardians.lastName,
				email: guardians.email,
			})
			.from(guardians)
			.where(
				and(eq(guardians.centerId, centerId), inArray(guardians.id, data.recipientGuardianIds)),
			);
	}

	if (data.recipientMode === "child_ids") {
		const rows = await db
			.select({
				guardian: {
					id: guardians.id,
					firstName: guardians.firstName,
					lastName: guardians.lastName,
					email: guardians.email,
				},
			})
			.from(childGuardians)
			.leftJoin(
				children,
				and(eq(childGuardians.childId, children.id), eq(children.centerId, centerId)),
			)
			.leftJoin(
				guardians,
				and(eq(childGuardians.guardianId, guardians.id), eq(guardians.centerId, centerId)),
			)
			.where(
				and(
					eq(childGuardians.centerId, centerId),
					inArray(childGuardians.childId, data.recipientChildIds),
					eq(children.centerId, centerId),
					eq(children.enrollmentStatus, "active"),
				),
			);

		const deduped = new Map<string, Recipient>();
		for (const guardian of rows
			.map((row) => row.guardian)
			.filter((value): value is NonNullable<typeof value> => Boolean(value))) {
			deduped.set(guardian.id, guardian);
		}

		return [...deduped.values()];
	}

	const today = new Date().toISOString().split("T")[0];
	const rows = await db
		.select({
			guardian: {
				id: guardians.id,
				firstName: guardians.firstName,
				lastName: guardians.lastName,
				email: guardians.email,
			},
		})
		.from(classroomAssignments)
		.leftJoin(
			childGuardians,
			and(
				eq(classroomAssignments.childId, childGuardians.childId),
				eq(childGuardians.centerId, centerId),
			),
		)
		.leftJoin(
			guardians,
			and(eq(childGuardians.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(
			and(
				eq(classroomAssignments.centerId, centerId),
				eq(classroomAssignments.classroomId, data.classroomId),
				lte(classroomAssignments.effectiveDate, today),
				or(isNull(classroomAssignments.endDate), gt(classroomAssignments.endDate, today)),
			),
		);

	const deduped = new Map<string, Recipient>();
	for (const row of rows) {
		if (row.guardian) {
			deduped.set(row.guardian.id, row.guardian);
		}
	}

	return [...deduped.values()];
}

async function ensureMessageAccess(
	db: AppEnv["Variables"]["db"],
	centerId: string,
	role: AppEnv["Variables"]["role"],
	membershipId: string,
	classroomId: string | null,
) {
	if (role !== "staff") return;

	const classroomIds = await getStaffClassroomIds(db, centerId, membershipId);
	if (!classroomId || !classroomIds.includes(classroomId)) {
		forbidden("Staff can only access messages for their own classroom");
	}
}

async function ensureCenterOwnedClassroom(
	db: DbClient | DbTransaction,
	centerId: string,
	classroomId: string,
) {
	const [classroom] = await db
		.select({ id: classrooms.id })
		.from(classrooms)
		.where(and(eq(classrooms.id, classroomId), eq(classrooms.centerId, centerId)))
		.limit(1);

	if (!classroom) {
		notFound("Classroom not found");
	}
}

messagesRoutes.get("/", zValidator("query", messageListQuerySchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const { messageType, classroomId, search, limit, cursor } = c.req.valid("query");
	const conditions = [eq(messages.centerId, centerId)];

	if (messageType) conditions.push(eq(messages.messageType, messageType));
	if (classroomId) conditions.push(eq(messages.classroomId, classroomId));
	if (search) {
		const searchCondition = or(
			ilike(messages.subject, `%${search}%`),
			ilike(messages.body, `%${search}%`),
		);
		if (searchCondition) {
			conditions.push(searchCondition);
		}
	}

	if (role === "staff") {
		// membershipId is guaranteed by requireAuth when role is set
		if (!membershipId) throw new Response(null, { status: 500 });
		const classroomIds = await getStaffClassroomIds(db, centerId, membershipId);
		if (classroomIds.length === 0) {
			return c.json({ messages: [], nextCursor: null });
		}
		conditions.push(inArray(messages.classroomId, classroomIds));
	}

	const PAGE_DEFAULT = 50;
	const PAGE_MAX = 200;
	const pageLimit = Math.min(limit ?? PAGE_DEFAULT, PAGE_MAX);
	const pageOffset = cursor ?? 0;

	const results = await db
		.select()
		.from(messages)
		.where(and(...conditions))
		.orderBy(desc(messages.createdAt))
		.limit(pageLimit)
		.offset(pageOffset);

	const nextCursor = results.length === pageLimit ? pageOffset + results.length : null;

	return c.json({ messages: results, nextCursor });
});

messagesRoutes.get("/inbox", zValidator("query", messageInboxQuerySchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const { limit } = c.req.valid("query");
	const conditions = [eq(messageReplies.centerId, centerId)];

	if (role === "staff") {
		if (!membershipId) throw new Response(null, { status: 500 });
		const classroomIds = await getStaffClassroomIds(db, centerId, membershipId);
		if (classroomIds.length === 0) {
			return c.json({ replies: [] });
		}
		conditions.push(inArray(messages.classroomId, classroomIds));
	}

	const rows = await db
		.select({
			messageReplies,
			messages,
			guardians,
		})
		.from(messageReplies)
		.leftJoin(
			messages,
			and(eq(messageReplies.messageId, messages.id), eq(messages.centerId, centerId)),
		)
		.leftJoin(
			guardians,
			and(eq(messageReplies.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(and(...conditions))
		.orderBy(desc(messageReplies.receivedAt))
		.limit(limit ?? 50);

	return c.json({
		replies: rows.map((row) => ({
			reply: row.messageReplies,
			message: row.messages,
			guardian: row.guardians,
		})),
	});
});

messagesRoutes.get("/:id", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parsed = idSchema.safeParse(c.req.param("id"));
	if (!parsed.success) return c.json({ error: "Invalid ID format" }, 400);
	const messageId = parsed.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const [message] = await db
		.select()
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.centerId, centerId)))
		.limit(1);

	if (!message) notFound("Message not found");
	if (!membershipId) throw new Response(null, { status: 500 });
	await ensureMessageAccess(db, centerId, role, membershipId, message.classroomId);

	const recipients = await db
		.select({
			messageRecipients,
			guardians,
		})
		.from(messageRecipients)
		.leftJoin(
			guardians,
			and(eq(messageRecipients.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(
			and(eq(messageRecipients.messageId, message.id), eq(messageRecipients.centerId, centerId)),
		);

	const replies = await db
		.select({
			messageReplies,
			guardians,
		})
		.from(messageReplies)
		.leftJoin(
			guardians,
			and(eq(messageReplies.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(and(eq(messageReplies.messageId, message.id), eq(messageReplies.centerId, centerId)))
		.orderBy(desc(messageReplies.receivedAt));

	return c.json({ message, recipients, replies });
});

messagesRoutes.post("/", zValidator("json", createMessageSchema), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");
	const scopedCenterId = centerId;

	const userId = c.get("userId");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const db = c.get("db");
	const data = c.req.valid("json");

	if (role === "staff") {
		if (["announcement", "alert"].includes(data.messageType)) {
			forbidden("Staff cannot send announcements or alerts");
		}

		if (data.recipientMode !== "classroom") {
			forbidden("Staff can only send messages to their own classroom");
		}

		// membershipId is guaranteed by requireAuth when role is set
		if (!membershipId) throw new Response(null, { status: 500 });
		const classroomIds = await getStaffClassroomIds(db, centerId, membershipId);
		if (!classroomIds.includes(data.classroomId)) {
			forbidden("Staff can only send messages to their own classroom");
		}
	}

	if (data.recipientMode === "classroom") {
		await ensureCenterOwnedClassroom(db, centerId, data.classroomId);
	}

	const result = await db.transaction(async (tx) => {
		const recipients = await resolveRecipients(tx, centerId, data);
		if (!recipients.some((recipient) => Boolean(recipient.email))) {
			return null;
		}

		const [message] = await tx
			.insert(messages)
			.values({
				centerId,
				senderId: userId,
				subject: data.subject,
				body: data.body,
				messageType: data.messageType,
				classroomId: data.recipientMode === "classroom" ? data.classroomId : undefined,
			})
			.returning();

		if (!message) {
			throw new Error("Failed to create message");
		}

		const insertedRecipients =
			recipients.length === 0
				? []
				: await tx
						.insert(messageRecipients)
						.values(
							recipients.map((recipient) => ({
								centerId: scopedCenterId,
								messageId: message.id,
								guardianId: recipient.id,
							})),
						)
						.returning();

		return {
			message,
			recipients: insertedRecipients,
			deliveryTargets: recipients,
		};
	});

	if (!result) {
		return c.json({ error: "Choose at least one recipient with an email address." }, 400);
	}

	const emailTargets = result.deliveryTargets.filter((recipient) => Boolean(recipient.email));
	const messageId = result.message.id;

	function chunkArray<T>(arr: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < arr.length; i += size) {
			chunks.push(arr.slice(i, i + size));
		}
		return chunks;
	}

	async function sendAllEmails() {
		const batches = chunkArray(emailTargets, 50);
		for (const batch of batches) {
			// Bound in-batch parallelism and preserve allSettled semantics: a thrown
			// error from one send must not halt siblings, so we catch per-recipient.
			await mapWithConcurrency(batch, 5, async (recipient) => {
				if (!recipient.email) return;
				try {
					const response = await retryOn429(() =>
						sendEmail({
							apiKey: c.env.RESEND_API_KEY,
							from: c.env.RESEND_FROM_EMAIL,
							to: recipient.email as string,
							subject: data.subject,
							firstName: recipient.firstName,
							body: data.body,
							replyTo: buildReplyTo(c.env, messageId, recipient.id),
						}),
					);
					if (response.ok) {
						await db
							.update(messageRecipients)
							.set({ deliveredAt: new Date() })
							.where(
								and(
									eq(messageRecipients.messageId, messageId),
									eq(messageRecipients.guardianId, recipient.id),
									eq(messageRecipients.centerId, scopedCenterId),
								),
							);
					}
				} catch {
					// Swallow: failed sends stay un-delivered and can be retried via /redeliver.
				}
			});
		}
	}

	const sendPromise = sendAllEmails();
	try {
		c.executionCtx.waitUntil(sendPromise);
	} catch {
		await sendPromise;
	}

	return c.json(
		{
			status: "queued",
			count: emailTargets.length,
		},
		202,
	);
});

messagesRoutes.post("/:id/replies/read", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parsed = idSchema.safeParse(c.req.param("id"));
	if (!parsed.success) return c.json({ error: "Invalid ID format" }, 400);
	const messageId = parsed.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");

	const [message] = await db
		.select()
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.centerId, centerId)))
		.limit(1);

	if (!message) notFound("Message not found");
	if (!membershipId) throw new Response(null, { status: 500 });
	await ensureMessageAccess(db, centerId, role, membershipId, message.classroomId);

	const updated = await db
		.update(messageReplies)
		.set({ readAt: new Date() })
		.where(
			and(
				eq(messageReplies.messageId, message.id),
				eq(messageReplies.centerId, centerId),
				isNull(messageReplies.readAt),
			),
		)
		.returning();

	return c.json({ markedRead: updated.length });
});

messagesRoutes.post("/:id/redeliver", async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const parsed = idSchema.safeParse(c.req.param("id"));
	if (!parsed.success) return c.json({ error: "Invalid ID format" }, 400);
	const messageId = parsed.data;
	const db = c.get("db");
	const role = c.get("role");
	const membershipId = c.get("membershipId");
	const [message] = await db
		.select()
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.centerId, centerId)))
		.limit(1);

	if (!message) notFound("Message not found");
	if (!membershipId) throw new Response(null, { status: 500 });
	await ensureMessageAccess(db, centerId, role, membershipId, message.classroomId);

	const recipientRows = await db
		.select({
			messageRecipients,
			guardians,
		})
		.from(messageRecipients)
		.leftJoin(
			guardians,
			and(eq(messageRecipients.guardianId, guardians.id), eq(guardians.centerId, centerId)),
		)
		.where(
			and(eq(messageRecipients.messageId, message.id), eq(messageRecipients.centerId, centerId)),
		);

	let delivered = 0;
	for (const row of recipientRows) {
		if (row.messageRecipients.deliveredAt || !row.guardians?.email) continue;

		const response = await sendEmail({
			apiKey: c.env.RESEND_API_KEY,
			from: c.env.RESEND_FROM_EMAIL,
			to: row.guardians.email,
			subject: message.subject,
			firstName: row.guardians.firstName,
			body: message.body,
			replyTo: buildReplyTo(c.env, message.id, row.messageRecipients.guardianId),
		});

		if (response.ok) {
			delivered += 1;
			await db
				.update(messageRecipients)
				.set({ deliveredAt: new Date() })
				.where(
					and(
						eq(messageRecipients.id, row.messageRecipients.id),
						eq(messageRecipients.centerId, centerId),
					),
				);
		}
	}

	return c.json({ delivered });
});

export { messagesRoutes };
