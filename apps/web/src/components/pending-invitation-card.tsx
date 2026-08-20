import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui/components/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiFetch } from "../api";
import type { PendingInvitation } from "../hooks/use-auth-session";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { toast } from "../lib/toast";
import { BrandMark } from "./brand-mark";

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));

type PendingInvitationCardProps = {
	invitation: PendingInvitation;
	variant?: "full-page" | "inline";
};

export function PendingInvitationCard({
	invitation,
	variant = "full-page",
}: PendingInvitationCardProps) {
	const HeadingTag = variant === "full-page" ? "h1" : "h2";
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [switchAccountError, setSwitchAccountError] = useState<string | null>(null);
	const acceptInvitation = useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/auth/invitations/${invitation.membershipId}/accept`, {
				method: "POST",
			});
			const data = (await res.json().catch(() => null)) as {
				error?: string;
			} | null;

			if (!res.ok) {
				throw new Error(data?.error ?? "Failed to accept invitation");
			}

			return data;
		},
		onMutate: async () => {
			// Cancel any in-flight authSession queries to avoid overwriting the optimistic update.
			await queryClient.cancelQueries({ queryKey: ["authSession"] });
			// Snapshot previous value for rollback on error.
			const previous = queryClient.getQueryData(["authSession"]);
			// Optimistically clear the pending invitation from the session so the card
			// disappears immediately without waiting for the server round-trip.
			queryClient.setQueryData(["authSession"], (old: Record<string, unknown> | undefined) => {
				if (!old) return old;
				return { ...old, pendingInvitation: undefined };
			});
			return { previous };
		},
		onError: (_err, _vars, ctx) => {
			// Roll back the optimistic update on failure.
			if (ctx?.previous !== undefined) {
				queryClient.setQueryData(["authSession"], ctx.previous);
			}
		},
		onSuccess: async () => {
			toast.success("Invitation accepted. Welcome to the center!");
			await queryClient.invalidateQueries({ queryKey: ["authSession"] });
			await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
			try {
				await navigate({ to: "/dashboard", replace: true });
			} catch (err) {
				// The invitation was accepted server-side, but automatic redirect failed.
				// Surface a recovery path so the user is not stranded on this screen.
				console.warn("[pending-invitation] post-accept navigation failed", err);
				toast.info("You're in! Reload the page to open your dashboard.");
			}
		},
	});

	async function handleUseDifferentAccount() {
		setSwitchAccountError(null);
		try {
			await authClient.signOut();
		} catch {
			setSwitchAccountError("Failed to sign out. Please try again.");
			return;
		}
		queryClient.setQueryData(["authStatus"], { status: "unauthenticated" });
		queryClient.removeQueries({ queryKey: ["authSession"] });
		// Sign-out already succeeded — navigation is a nice-to-have; never surface a
		// navigation error as if the account switch itself failed.
		try {
			const maybePromise = navigate({ to: "/login" }) as unknown;
			if (maybePromise && typeof (maybePromise as { catch?: unknown }).catch === "function") {
				(maybePromise as Promise<unknown>).catch(() => {
					// intentionally swallow — signout was successful
				});
			}
		} catch {
			// navigate threw synchronously — signout still succeeded
		}
	}

	const content = (
		<div
			className={
				variant === "full-page"
					? "w-full max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm"
					: "rounded-xl border border-border bg-muted/40 p-4 text-left shadow-sm"
			}
		>
			{variant === "full-page" ? (
				<BrandMark className="mb-5 justify-center" wordmarkClassName="text-foreground" />
			) : null}
			<HeadingTag className="text-lg font-semibold text-foreground">
				Accept your invitation
			</HeadingTag>
			<p className="mt-2 text-sm text-muted-foreground">
				You've been invited to join {invitation.centerName} as {invitation.role}.
			</p>
			{switchAccountError ? (
				<p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{switchAccountError}
				</p>
			) : null}
			{acceptInvitation.error && acceptInvitation.error instanceof Error ? (
				<p className="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{acceptInvitation.error.message}
				</p>
			) : null}
			<div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
				<Button
					type="button"
					disabled={acceptInvitation.isPending}
					onClick={() => acceptInvitation.mutate()}
				>
					{acceptInvitation.isPending ? "Accepting..." : "Accept invitation"}
				</Button>
				{variant === "full-page" ? (
					<Button type="button" variant="outline" onClick={handleUseDifferentAccount}>
						Use a different account
					</Button>
				) : null}
			</div>
		</div>
	);

	if (variant === "inline") {
		return content;
	}

	return <div className="flex h-screen items-center justify-center bg-muted/40 p-6">{content}</div>;
}
