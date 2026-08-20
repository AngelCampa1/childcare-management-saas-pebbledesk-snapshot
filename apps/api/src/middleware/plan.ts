import { centers, trialFeatureUsage } from "@pebbledesk/db";
import {
	isServiceAllowedSubscriptionStatus,
	type PlanFeature,
	planHasFeature,
	type SubscriptionPlan,
	type SubscriptionStatus,
} from "@pebbledesk/shared";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/context.js";
import { forbidden } from "../lib/errors.js";

interface RequirePlanAccessOptions {
	plans?: readonly SubscriptionPlan[];
	features?: readonly PlanFeature[];
	statuses?: readonly SubscriptionStatus[];
}

export function requirePlanAccess({ plans, features, statuses }: RequirePlanAccessOptions) {
	return createMiddleware<AppEnv>(async (c, next) => {
		const centerId = c.get("centerId");
		if (!centerId) {
			return forbidden("Subscription plan required");
		}

		const db = c.get("db");
		const rows = await db
			.select({
				subscriptionPlan: centers.subscriptionPlan,
				subscriptionStatus: centers.subscriptionStatus,
			})
			.from(centers)
			.where(eq(centers.id, centerId))
			.limit(1);

		const row = rows[0];
		if (!row?.subscriptionPlan) {
			return forbidden("Subscription plan required");
		}
		const subscriptionPlan = row.subscriptionPlan;

		const allowedStatuses = statuses ?? [];
		const hasAllowedStatus =
			allowedStatuses.length > 0
				? allowedStatuses.includes(row.subscriptionStatus)
				: isServiceAllowedSubscriptionStatus(row.subscriptionStatus);
		if (!hasAllowedStatus) {
			return forbidden("Subscription plan required");
		}

		const requiredFeatures = features ?? [];
		const isTrialing = row.subscriptionStatus === "trialing";
		const hasLegacyFullAccessTrial = isTrialing && subscriptionPlan === "trial";

		if (!hasLegacyFullAccessTrial && plans && !plans.includes(subscriptionPlan)) {
			return forbidden("Subscription plan required");
		}

		if (
			!hasLegacyFullAccessTrial &&
			requiredFeatures.some((feature) => !planHasFeature(subscriptionPlan, feature))
		) {
			return forbidden("Subscription plan required");
		}

		if (isTrialing && requiredFeatures.length > 0) {
			// Fire-and-forget. Promise.allSettled absorbs individual rejections.
			void Promise.allSettled(
				requiredFeatures.map((feature) =>
					db.insert(trialFeatureUsage).values({ centerId, feature }).onConflictDoNothing(),
				),
			);
		}

		await next();
	});
}

export function requirePlan(...plans: SubscriptionPlan[]) {
	return requirePlanAccess({ plans });
}

export function requireEntitlement(feature: PlanFeature) {
	return requirePlanAccess({ features: [feature] });
}
