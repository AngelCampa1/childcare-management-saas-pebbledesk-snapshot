import {
	ROLES,
	type Role,
	SUBSCRIPTION_PLANS_LIST,
	SUBSCRIPTION_STATUSES,
	type SubscriptionPlan,
	type SubscriptionStatus,
} from "@pebbledesk/shared";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";

const AUTH_QUERY_STALE_TIME_MS = 0;

const PendingInvitationSchema = z.object({
	membershipId: z.string(),
	centerId: z.string(),
	centerName: z.string(),
	role: z.enum(ROLES),
});

export const AuthSessionDataSchema = z.object({
	user: z.object({
		id: z.string(),
		name: z.string(),
		email: z.string(),
	}),
	membership: z.object({
		id: z.string(),
		centerId: z.string(),
		role: z.enum(ROLES),
	}),
	center: z.object({
		id: z.string(),
		name: z.string(),
		state: z.string(),
		timezone: z.string(),
		subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
		subscriptionPlan: z.enum(SUBSCRIPTION_PLANS_LIST).nullable().optional(),
		trialEndsAt: z.string().nullable().optional(),
		currentPeriodEnd: z.string().nullable().optional(),
		canOpenBillingPortal: z.boolean().optional(),
	}),
	classroomIds: z.array(z.string()),
	pendingInvitation: PendingInvitationSchema.nullish(),
	centerInvalid: z.boolean().optional(),
});

const AuthSessionResponseSchema = z.object({
	session: AuthSessionDataSchema,
	pendingInvitation: PendingInvitationSchema.nullish(),
});

function isTransientAuthFailure(error: unknown): boolean {
	if (error instanceof ApiError) {
		return error.status === 429 || error.status >= 500;
	}

	if (error instanceof DOMException) {
		return error.name === "AbortError";
	}

	return error instanceof TypeError;
}

export interface AuthSessionData {
	user: {
		id: string;
		name: string;
		email: string;
	};
	membership: {
		id: string;
		centerId: string;
		role: Role;
	};
	center: {
		id: string;
		name: string;
		state: string;
		timezone: string;
		subscriptionStatus?: SubscriptionStatus;
		subscriptionPlan?: SubscriptionPlan | null;
		trialEndsAt?: string | null;
		currentPeriodEnd?: string | null;
		canOpenBillingPortal?: boolean;
	};
	classroomIds: string[];
	pendingInvitation?: PendingInvitation | null;
	/** True when the session centerId is not found in the user's current membership list. */
	centerInvalid?: boolean;
}

export interface PendingInvitation {
	membershipId: string;
	centerId: string;
	centerName: string;
	role: Role;
}

export class AuthSessionError extends Error {
	code: "unauthenticated" | "onboarding_required" | "invite_pending";
	invitation?: PendingInvitation;

	constructor(
		code: "unauthenticated" | "onboarding_required" | "invite_pending",
		message: string,
		invitation?: PendingInvitation,
	) {
		super(message);
		this.name = "AuthSessionError";
		this.code = code;
		this.invitation = invitation;
	}
}

export class AuthVerificationError extends Error {
	status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "AuthVerificationError";
		this.status = status;
	}
}

async function fetchAuthSession(): Promise<AuthSessionData> {
	try {
		const res = await apiFetch("/api/auth/me");
		const rawPayload: unknown = await res.json();
		const payload = AuthSessionResponseSchema.parse(rawPayload);
		const sessionData: AuthSessionData = {
			...payload.session,
			pendingInvitation: payload.pendingInvitation,
		};

		// Validate that the session centerId appears in the user's active memberships.
		// A stale centerId (e.g. removed from the center) must be detected and flagged
		// so the layout can redirect to a clean sign-out state.
		const centerId = sessionData.membership.centerId;
		if (centerId) {
			try {
				const membershipsRes = await apiFetch("/api/memberships/mine");
				const membershipsPayload: { memberships: Array<{ centerId: string }> } =
					await membershipsRes.json();
				const membershipIds = membershipsPayload.memberships.map((m) => m.centerId);
				if (!membershipIds.includes(centerId)) {
					return { ...sessionData, centerInvalid: true };
				}
			} catch {
				// If the memberships check fails transiently, don't block the session —
				// the user stays signed in and the layout handles a future retry.
			}
		}

		return sessionData;
	} catch (error) {
		if (error instanceof ApiError) {
			const invitation =
				typeof error.body.invitation === "object" && error.body.invitation !== null
					? (error.body.invitation as PendingInvitation)
					: undefined;

			if (error.status === 401) {
				throw new AuthSessionError("unauthenticated", "Failed to fetch auth session");
			}

			if (error.status === 403 && error.body.code === "onboarding_required") {
				throw new AuthSessionError("onboarding_required", "Onboarding required");
			}

			if (error.status === 403 && error.body.code === "invite_pending" && invitation) {
				throw new AuthSessionError("invite_pending", "Invitation pending", invitation);
			}
		}

		if (isTransientAuthFailure(error)) {
			throw new AuthVerificationError(
				"Failed to verify auth session",
				error instanceof ApiError ? error.status : undefined,
			);
		}

		throw error instanceof Error ? error : new Error("Failed to fetch auth session");
	}
}

export const authSessionQuery = {
	queryKey: ["authSession"] as const,
	queryFn: fetchAuthSession,
	staleTime: AUTH_QUERY_STALE_TIME_MS,
	refetchOnMount: true,
	refetchOnWindowFocus: true,
	retry: false,
} as const;

interface UseAuthSessionOptions {
	enabled?: boolean;
}

export function useAuthSession(options: UseAuthSessionOptions = {}) {
	const { enabled = true } = options;

	return useQuery({
		...authSessionQuery,
		enabled,
	});
}
