import { authStatusSchema, type Role } from "@pebbledesk/shared";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "../api";
import { AuthVerificationError, type PendingInvitation } from "./use-auth-session";

export type AuthStatus =
	| { status: "unauthenticated" }
	| { status: "authenticated"; emailVerified?: boolean; email?: string }
	| { status: "onboarding_required"; emailVerified?: boolean; email?: string }
	| {
			status: "center_selection_required";
			centers: Array<{ centerId: string; membershipId: string; role: Role }>;
			emailVerified?: boolean;
			email?: string;
	  }
	| {
			status: "invite_pending";
			invitation: PendingInvitation;
			emailVerified?: boolean;
			email?: string;
	  };

export function useAuthStatus() {
	return useQuery({
		queryKey: ["authStatus"],
		staleTime: 5 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		retry: false,
		queryFn: async () => {
			try {
				const res = await apiFetch("/api/auth/status");
				const raw: unknown = await res.json();
				// Validate the response shape — this endpoint drives the entire
				// app shell's routing, so a backend shape regression must
				// surface as a parse error rather than silent `undefined`.
				return authStatusSchema.parse(raw) as AuthStatus;
			} catch (error) {
				if (error instanceof ApiError && (error.status === 429 || error.status >= 500)) {
					throw new AuthVerificationError("Failed to verify auth session", error.status);
				}

				if (error instanceof DOMException && error.name === "AbortError") {
					throw new AuthVerificationError("Failed to verify auth session");
				}

				if (error instanceof TypeError) {
					throw new AuthVerificationError("Failed to verify auth session");
				}

				throw error instanceof Error ? error : new Error("Failed to fetch auth status");
			}
		},
	});
}
