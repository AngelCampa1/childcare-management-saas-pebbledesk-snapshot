import { centers, memberships, users } from "@pebbledesk/db";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { AppEnv } from "./context.js";

export interface PendingInvitation {
	membershipId: string;
	centerId: string;
	centerName: string;
	role: "owner" | "director" | "staff";
}

export async function findPendingInvitation(
	db: AppEnv["Variables"]["db"],
	userId: string,
): Promise<PendingInvitation | null> {
	return findLatestPendingInvitation(db, userId, false);
}

export async function findVerifiedPendingInvitation(
	db: AppEnv["Variables"]["db"],
	userId: string,
): Promise<PendingInvitation | null> {
	return findLatestPendingInvitation(db, userId, true);
}

async function findLatestPendingInvitation(
	db: AppEnv["Variables"]["db"],
	userId: string,
	requireVerifiedEmail: boolean,
): Promise<PendingInvitation | null> {
	const pendingInvitations = await db
		.select({
			membershipId: memberships.id,
			centerId: memberships.centerId,
			role: memberships.role,
			centerName: centers.name,
			invitedAt: memberships.invitedAt,
			createdAt: memberships.createdAt,
			emailVerified: users.emailVerified,
		})
		.from(memberships)
		.innerJoin(centers, eq(centers.id, memberships.centerId))
		.innerJoin(users, eq(users.id, userId))
		.where(
			and(
				or(eq(memberships.userId, userId), sql`${memberships.inviteEmail} = lower(${users.email})`),
				isNull(memberships.acceptedAt),
				isNull(memberships.deactivatedAt),
				...(requireVerifiedEmail ? [eq(users.emailVerified, true)] : []),
			),
		);

	const [latestInvitation] = pendingInvitations
		.filter((invitation) => !requireVerifiedEmail || invitation.emailVerified)
		.sort((left, right) => {
			const rightTimestamp = new Date(right.invitedAt ?? right.createdAt).getTime();
			const leftTimestamp = new Date(left.invitedAt ?? left.createdAt).getTime();
			return rightTimestamp - leftTimestamp;
		})
		.slice(0, 1);

	if (!latestInvitation) {
		return null;
	}

	return {
		membershipId: latestInvitation.membershipId,
		centerId: latestInvitation.centerId,
		centerName: latestInvitation.centerName,
		role: latestInvitation.role,
	};
}
