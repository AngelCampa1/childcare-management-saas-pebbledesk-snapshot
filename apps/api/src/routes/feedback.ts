import { zValidator } from "@hono/zod-validator";
import { feedback, users } from "@pebbledesk/db";
import { escapeHtml } from "@pebbledesk/shared";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { sendEmail } from "../lib/email.js";
import { captureApiException } from "../lib/sentry.js";
import { requireAuth } from "../middleware/auth.js";

export const feedbackRoutes = new Hono<AppEnv>();

const feedbackSchema = z.object({
	message: z.string().min(1).max(5000),
	reporterEmail: z.string().email(),
	pageUrl: z.string().max(2000).optional(),
	userAgent: z.string().max(1000).optional(),
	viewport: z.string().max(50).optional(),
});

feedbackRoutes.post("/", requireAuth, zValidator("json", feedbackSchema), async (c) => {
	const userId = c.get("userId");
	const centerId = c.get("centerId");
	const role = c.get("role");
	const db = c.get("db");
	const data = c.req.valid("json");

	// Override body email with the authenticated user's email to prevent spoofing
	const [userRow] = await db
		.select({ email: users.email })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	const reporterEmail = userRow?.email ?? data.reporterEmail;

	await db
		.insert(feedback)
		.values({
			centerId: centerId || null,
			userId,
			reporterEmail,
			message: data.message,
			pageUrl: data.pageUrl ?? null,
			userAgent: data.userAgent ?? null,
			viewport: data.viewport ?? null,
			role: role || null,
		})
		.returning();

	const subject = `[PebbleDesk Feedback] ${data.message.length > 80 ? `${data.message.slice(0, 80)}…` : data.message}`;

	const centerLabel = centerId || "—";
	const roleLabel = role || "—";

	const html = `
<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
  <tbody>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Message</th><td style="padding:6px 12px">${escapeHtml(data.message)}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Reporter Email</th><td style="padding:6px 12px">${escapeHtml(reporterEmail)}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Page URL</th><td style="padding:6px 12px">${escapeHtml(data.pageUrl ?? "—")}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">User Agent</th><td style="padding:6px 12px">${escapeHtml(data.userAgent ?? "—")}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Viewport</th><td style="padding:6px 12px">${escapeHtml(data.viewport ?? "—")}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">User ID</th><td style="padding:6px 12px">${escapeHtml(userId)}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Center ID</th><td style="padding:6px 12px">${escapeHtml(centerLabel)}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Role</th><td style="padding:6px 12px">${escapeHtml(roleLabel)}</td></tr>
    <tr><th style="text-align:left;padding:6px 12px;background:#f5f5f5">Timestamp</th><td style="padding:6px 12px">${new Date().toISOString()}</td></tr>
  </tbody>
</table>
`.trim();

	const text = [
		`Message: ${data.message}`,
		`Reporter Email: ${reporterEmail}`,
		`Page URL: ${data.pageUrl ?? "—"}`,
		`User Agent: ${data.userAgent ?? "—"}`,
		`Viewport: ${data.viewport ?? "—"}`,
		`User ID: ${userId}`,
		`Center ID: ${centerLabel}`,
		`Role: ${roleLabel}`,
		`Timestamp: ${new Date().toISOString()}`,
	].join("\n");

	let emailed = true;
	try {
		await sendEmail({
			to: c.env.FEEDBACK_TO_EMAIL ?? PUBLIC_BRAND_KNOWLEDGE.supportEmail,
			replyTo: reporterEmail,
			subject,
			html,
			text,
			apiKey: c.env.RESEND_API_KEY,
			fromEmail: c.env.RESEND_FROM_EMAIL,
		});
	} catch (err) {
		console.error("Feedback email failed:", err);
		captureApiException(err, c, { task: "feedback-email" });
		emailed = false;
	}

	return c.json({ ok: true, emailed }, 201);
});
