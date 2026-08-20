import type { Database } from "@pebbledesk/db";
import { centers } from "@pebbledesk/db";
import { and, eq, isNull, lt } from "drizzle-orm";

type ReturningCenterIdsQuery = {
	returning(fields: { id: typeof centers.id }): Promise<{ id: string }[]>;
};

/**
 * Flips all expired free-trial centers to `canceled` so the existing
 * <SubscriptionRequired> gate in the frontend blocks access automatically.
 *
 * Conditions: status=trialing, no stripe sub, trial_ends_at < NOW()
 * Safe to run multiple times — already-canceled rows are excluded by the
 * `status = 'trialing'` predicate.
 */
export async function runTrialExpirer(
	db: Database,
): Promise<{ expiredCount: number; expiredCenterIds: string[] }> {
	const updateQuery = db
		.update(centers)
		.set({ subscriptionStatus: "canceled" })
		.where(
			and(
				eq(centers.subscriptionStatus, "trialing"),
				isNull(centers.stripeSubscriptionId),
				lt(centers.trialEndsAt, new Date()),
			),
		);

	// createDb() returns a driver union, and that union drops Drizzle's projected
	// returning overload even though both PG drivers support it at runtime.
	const result = await (updateQuery as unknown as ReturningCenterIdsQuery).returning({
		id: centers.id,
	});

	return { expiredCount: result.length, expiredCenterIds: result.map((row) => row.id) };
}
