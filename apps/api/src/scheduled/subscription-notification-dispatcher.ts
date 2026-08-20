import type { Database } from "@pebbledesk/db";
import { subscriptionNotifications } from "@pebbledesk/db";
import { renderSubscriptionEmail, type SubscriptionEmailTemplateKey } from "@pebbledesk/emails";
import { SUBSCRIPTION_PLAN_CONFIG } from "@pebbledesk/shared/constants";
import { eq, sql } from "drizzle-orm";
import type { Bindings } from "../lib/context.js";
import { sendEmail } from "../lib/email.js";

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50;

type NotificationRow = {
	id: string;
	kind: "trial_started" | "trial_ending_soon";
	recipientEmail: string;
	recipientName: string | null;
	subscriptionPlan: keyof typeof SUBSCRIPTION_PLAN_CONFIG;
	trialStartedAt: Date;
	trialEndsAt: Date;
	attempts: number;
};

function formatDate(value: Date): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(value);
}

function toTemplateKey(kind: NotificationRow["kind"]): SubscriptionEmailTemplateKey {
	return kind === "trial_started" ? "subscription-trial-started" : "subscription-trial-ending-soon";
}

export async function runSubscriptionNotificationDispatcher(
	env: Pick<Bindings, "APP_URL" | "RESEND_API_KEY" | "RESEND_FROM_EMAIL">,
	db: Database,
): Promise<void> {
	const rawRows = await db.execute<NotificationRow>(sql`
		UPDATE subscription_notifications
		SET
			status = 'processing',
			processing_started_at = NOW()
		WHERE id IN (
			SELECT id FROM subscription_notifications
			WHERE
				(
					status = 'pending'
					OR (
						status = 'processing'
						AND processing_started_at <= NOW() - INTERVAL '15 minutes'
					)
				)
				AND due_at <= NOW()
			ORDER BY due_at
			LIMIT ${BATCH_SIZE}
			FOR UPDATE SKIP LOCKED
		)
		RETURNING
			id,
			kind,
			recipient_email AS "recipientEmail",
			recipient_name AS "recipientName",
			subscription_plan AS "subscriptionPlan",
			trial_started_at AS "trialStartedAt",
			trial_ends_at AS "trialEndsAt",
			attempts
	`);

	const rows = Array.isArray(rawRows) ? rawRows : (rawRows.rows ?? []);

	for (const row of rows) {
		try {
			const planConfig = SUBSCRIPTION_PLAN_CONFIG[row.subscriptionPlan];
			if (!planConfig) {
				await db
					.update(subscriptionNotifications)
					.set({
						status: "skipped",
						lastError: "Unknown subscription plan",
						processingStartedAt: null,
					})
					.where(eq(subscriptionNotifications.id, row.id));
				continue;
			}

			const rendered = await renderSubscriptionEmail(toTemplateKey(row.kind), {
				firstName: row.recipientName?.split(" ")[0] ?? undefined,
				planLabel: planConfig.label,
				monthlyPriceLabel: `$${(planConfig.monthlyAmountCents / 100).toFixed(0)}/month`,
				trialStartedAt: formatDate(new Date(row.trialStartedAt)),
				trialEndsAt: formatDate(new Date(row.trialEndsAt)),
				billingUrl: `${env.APP_URL}/billing`,
			});

			await sendEmail({
				to: row.recipientEmail,
				from: env.RESEND_FROM_EMAIL,
				subject: rendered.subject,
				html: rendered.html,
				text: rendered.text,
				apiKey: env.RESEND_API_KEY,
				tags: [
					{ name: "campaign", value: "subscription" },
					{ name: "template", value: row.kind },
				],
			});

			await db
				.update(subscriptionNotifications)
				.set({
					status: "sent",
					sentAt: new Date(),
					lastError: null,
					processingStartedAt: null,
				})
				.where(eq(subscriptionNotifications.id, row.id));
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const attempts = row.attempts + 1;
			await db
				.update(subscriptionNotifications)
				.set({
					attempts,
					lastError: message,
					processingStartedAt: null,
					status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
				})
				.where(eq(subscriptionNotifications.id, row.id));
		}
	}
}
