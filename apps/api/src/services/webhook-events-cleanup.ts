import type { Database } from "@pebbledesk/db";
import { webhookEvents } from "@pebbledesk/db";
import { lt } from "drizzle-orm";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const TTL_DAYS = 30;

export async function deleteExpiredWebhookEvents(
	db: Database | Tx,
	now: Date = new Date(),
): Promise<number> {
	const cutoff = new Date(now.getTime() - TTL_DAYS * 24 * 60 * 60 * 1000);
	const result = await db.delete(webhookEvents).where(lt(webhookEvents.processedAt, cutoff));
	return (result as { rowCount?: number | null }).rowCount ?? 0;
}
