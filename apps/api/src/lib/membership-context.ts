import { memberships } from "@pebbledesk/db";
import type { Role } from "@pebbledesk/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "./context.js";

export interface ActiveMembershipContext {
	centerId: string;
	membershipId: string;
	role: Role;
}

export interface CenterSelectionRequired {
	error: "CENTER_SELECTION_REQUIRED";
	centers: Array<{ centerId: string; membershipId: string; role: Role }>;
}

export const CENTER_COOKIE = "x-pebbledesk-center";

export async function resolveActiveMembershipContext(
	db: AppEnv["Variables"]["db"],
	userId: string,
	c: Context<AppEnv>,
): Promise<ActiveMembershipContext | CenterSelectionRequired | null> {
	const membershipRows = await db
		.select()
		.from(memberships)
		.where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt)));

	const accepted = membershipRows.filter((membership) => membership.acceptedAt);

	if (accepted.length === 0) {
		return null;
	}

	const cookieCenterId = getCookie(c, CENTER_COOKIE);

	if (cookieCenterId) {
		const cookieMembership = accepted.find((m) => m.centerId === cookieCenterId);
		if (cookieMembership) {
			return {
				centerId: cookieMembership.centerId,
				membershipId: cookieMembership.id,
				role: cookieMembership.role as Role,
			};
		}
	}

	// For single-membership users, resolve automatically without requiring cookie selection.
	if (accepted.length === 1) {
		const [membership] = accepted;
		/* v8 ignore next 3 -- length === 1 guarantees membership is defined */
		if (!membership) {
			return null;
		}
		return {
			centerId: membership.centerId,
			membershipId: membership.id,
			role: membership.role as Role,
		};
	}

	// Multi-center user with no valid cookie selection — require explicit center choice.
	return {
		error: "CENTER_SELECTION_REQUIRED",
		centers: accepted.map((m) => ({
			centerId: m.centerId,
			membershipId: m.id,
			role: m.role as Role,
		})),
	};
}
