import { ANALYTICS_EVENTS, ROLES, type Role } from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

export type MemberRole = Role;

/**
 * Permissive schema for a center member record. Only the fields the UI relies
 * on are validated; unknown fields pass through untouched so backend additions
 * don't break the client.
 */
const CenterMemberSchema = z
	.object({
		id: z.string(),
		role: z.enum(ROLES),
	})
	.passthrough();

const MembersResponseSchema = z.object({ members: z.array(CenterMemberSchema) }).passthrough();
const InviteMemberResponseSchema = z.object({ membership: CenterMemberSchema }).passthrough();
const RemoveMemberResponseSchema = z.object({ success: z.literal(true) }).passthrough();

export interface CenterMember {
	id: string;
	centerId: string;
	userId: string;
	role: MemberRole;
	joinedAt: string;
	acceptedAt: string | null;
	invitedAt: string | null;
	userName: string | null;
	userEmail: string | null;
}

export interface InviteMemberInput {
	email: string;
	role: MemberRole;
}

export interface RemoveMemberResult {
	success: true;
}

export function useMembers(options?: { enabled?: boolean }) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		enabled: options?.enabled ?? true,
		queryKey: [activeCenterId, "members"],
		queryFn: async () => {
			try {
				const res = await apiFetch("/api/members");
				const raw: unknown = await res.json();
				const data = MembersResponseSchema.parse(raw);
				return data.members as unknown as CenterMember[];
			} catch (error) {
				if (error instanceof ApiError) {
					throw new Error(error.message);
				}
				throw error instanceof Error ? error : new Error("Failed to fetch members");
			}
		},
	});
}

export function useRemoveMember() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (memberId: string) => {
			try {
				const res = await apiFetch(`/api/members/${encodeURIComponent(memberId)}`, {
					method: "DELETE",
				});
				const raw: unknown = await res.json();
				const data = RemoveMemberResponseSchema.parse(raw);
				return data as RemoveMemberResult;
			} catch (error) {
				if (error instanceof ApiError) {
					throw new Error(error.message);
				}
				throw error instanceof Error ? error : new Error("Failed to remove member");
			}
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.teamMemberRemoved, {});
			toast.success("Member removed.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "members"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useInviteMember() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();
	return useMutation({
		mutationFn: async (input: InviteMemberInput) => {
			try {
				const res = await apiFetch("/api/members/invites", {
					method: "POST",
					body: JSON.stringify(input),
				});
				const raw: unknown = await res.json();
				const data = InviteMemberResponseSchema.parse(raw);
				return data.membership as unknown as CenterMember;
			} catch (error) {
				if (
					error instanceof ApiError &&
					error.status === 400 &&
					(error.message === "Invitation could not be sent" ||
						error.body.error === "Invitation could not be sent")
				) {
					throw new Error(
						"We couldn't send that invite. Ask them to sign up first with PebbleDesk, or confirm they aren't already on your team.",
					);
				}

				if (error instanceof ApiError) {
					throw new Error(error.message);
				}

				throw error instanceof Error ? error : new Error("Failed to invite member");
			}
		},
		onSuccess: (membership) => {
			track(ANALYTICS_EVENTS.teamMemberInvited, { role: membership.role });
			toast.success("Invitation sent.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "members"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}
