import { centers, children } from "@pebbledesk/db";
import {
	isServiceAllowedSubscriptionStatus,
	PLAN_ENTITLEMENTS,
	type PlanFeature,
	planHasFeature,
} from "@pebbledesk/shared";
import { and, count, eq } from "drizzle-orm";
import type { AppEnv } from "./context.js";
import { forbidden } from "./errors.js";

type DbClient = AppEnv["Variables"]["db"];
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export async function assertCanAddActiveChildren(
	db: DbClient | DbTransaction,
	centerId: string,
	increment: number,
) {
	if (increment <= 0) return;
	if (typeof db.select !== "function") return;

	const [center] = await db
		.select({
			subscriptionPlan: centers.subscriptionPlan,
			subscriptionStatus: centers.subscriptionStatus,
		})
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);

	if (!center || !("subscriptionPlan" in center)) return;

	if (!center?.subscriptionPlan || !isServiceAllowedSubscriptionStatus(center.subscriptionStatus)) {
		forbidden("Subscription plan required");
	}

	const maxActiveChildren = PLAN_ENTITLEMENTS[center.subscriptionPlan].maxActiveChildren;
	if (maxActiveChildren === null) return;

	const [activeCountRow] = await db
		.select({ value: count() })
		.from(children)
		.where(and(eq(children.centerId, centerId), eq(children.enrollmentStatus, "active")));

	const activeCount = activeCountRow?.value ?? 0;
	if (activeCount + increment > maxActiveChildren) {
		forbidden(`Plan allows up to ${maxActiveChildren} active children`);
	}
}

export async function assertCenterHasFeature(
	db: DbClient | DbTransaction,
	centerId: string,
	feature: PlanFeature,
) {
	if (typeof db.select !== "function") return;

	if (await centerHasFeature(db, centerId, feature)) return;
	forbidden("Subscription plan required");
}

export async function centerHasFeature(
	db: DbClient | DbTransaction,
	centerId: string,
	feature: PlanFeature,
) {
	if (typeof db.select !== "function") return true;

	const [center] = await db
		.select({
			subscriptionPlan: centers.subscriptionPlan,
			subscriptionStatus: centers.subscriptionStatus,
		})
		.from(centers)
		.where(eq(centers.id, centerId))
		.limit(1);

	return Boolean(
		center?.subscriptionPlan &&
			isServiceAllowedSubscriptionStatus(center.subscriptionStatus) &&
			planHasFeature(center.subscriptionPlan, feature),
	);
}
