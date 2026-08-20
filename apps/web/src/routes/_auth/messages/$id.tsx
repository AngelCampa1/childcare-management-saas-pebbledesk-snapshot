import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuthSession } from "../../../hooks/use-auth-session";
import {
	useMarkMessageRepliesRead,
	useMessage,
	useRedeliverMessage,
} from "../../../hooks/use-phase5";
import { track } from "../../../lib/analytics";
import { formatDateTime as formatDateTimeShared } from "../../../lib/format-date";

export const Route = createFileRoute("/_auth/messages/$id")({
	component: MessageDetailRoute,
});

export function MessageDetailRoute() {
	const { id } = Route.useParams();
	return <MessageDetailPage messageId={id} />;
}

export function MessageDetailPage({ messageId }: { messageId: string }) {
	const { data, isLoading } = useMessage(messageId);
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? undefined;
	const redeliverMutation = useRedeliverMessage(messageId);
	const markReadMutation = useMarkMessageRepliesRead(messageId);
	const [redeliverFeedback, setRedeliverFeedback] = useState<"success" | "error" | null>(null);
	const formatDateTime = (value: string) => formatDateTimeShared(value, { centerTimezone });
	const markReadFiredRef = useRef(false);
	const threadOpenTrackedIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (!redeliverFeedback) return;
		const id = setTimeout(() => setRedeliverFeedback(null), 4000);
		return () => clearTimeout(id);
	}, [redeliverFeedback]);

	useEffect(() => {
		if (!data || threadOpenTrackedIdRef.current === messageId) return;
		threadOpenTrackedIdRef.current = messageId;
		const props: Record<string, unknown> = {};
		if (data.message.messageType && typeof data.message.messageType === "string") {
			props.message_type = data.message.messageType;
		}
		if (Array.isArray(data.recipients)) {
			props.recipient_count = data.recipients.length;
		}
		track(ANALYTICS_EVENTS.messageThreadOpened, props);
	}, [data, messageId]);

	useEffect(() => {
		if (markReadFiredRef.current) return;
		const hasUnread = (data?.replies ?? []).some((r) => !r.messageReplies.readAt);
		if (hasUnread && !markReadMutation.isPending) {
			markReadFiredRef.current = true;
			markReadMutation.mutate();
		}
	}, [data, markReadMutation]);

	if (isLoading) {
		return <MessageDetailSkeleton />;
	}

	if (!data) {
		return (
			<div className="space-y-2">
				<h1 className="text-2xl font-bold text-foreground">Message</h1>
				<p className="text-sm text-muted-foreground">Message not found.</p>
			</div>
		);
	}

	const undeliveredCount = data.recipients.filter(
		(recipient) => !recipient.messageRecipients.deliveredAt,
	).length;
	const deliveredCount = data.recipients.length - undeliveredCount;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">{data.message.subject}</h1>
					<p className="mt-1 text-sm text-muted-foreground capitalize">
						{data.message.messageType}
					</p>
				</div>
				<div className="flex items-center gap-3">
					{redeliverFeedback === "success" && (
						<span role="status" className="text-sm font-medium text-success">
							Queued for delivery
						</span>
					)}
					{redeliverFeedback === "error" && (
						<span role="alert" className="text-sm font-medium text-destructive">
							Delivery failed
						</span>
					)}
					<Button
						variant="outline"
						onClick={() =>
							redeliverMutation.mutate(undefined, {
								onSuccess: () => setRedeliverFeedback("success"),
								onError: () => setRedeliverFeedback("error"),
							})
						}
						disabled={undeliveredCount === 0 || redeliverMutation.isPending}
					>
						Retry delivery
					</Button>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Message body</CardTitle>
				</CardHeader>
				<CardContent
					aria-label="Message body content"
					className="max-h-96 overflow-y-auto overscroll-contain"
				>
					<p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.message.body}</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Inbox replies</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{(data.replies ?? []).length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Guardian replies to this thread will appear here.
						</p>
					) : (
						(data.replies ?? []).map((reply) => (
							<div
								key={reply.messageReplies.id}
								className="rounded-lg border border-border bg-muted/30 p-4"
							>
								<div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
									<div>
										<p className="font-medium text-foreground">{getReplySenderName(reply)}</p>
										<p className="text-sm text-muted-foreground">
											{reply.messageReplies.fromEmail}
										</p>
									</div>
									<p className="text-sm text-muted-foreground">
										{formatDateTime(reply.messageReplies.receivedAt)}
									</p>
								</div>
								<p className="mt-3 whitespace-pre-wrap text-sm text-foreground">
									{reply.messageReplies.body}
								</p>
							</div>
						))
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Delivery health</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 sm:grid-cols-2">
					<div className="rounded-lg border border-border bg-muted/30 p-4">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Delivered
						</p>
						<p className="mt-1 text-lg font-semibold text-foreground">
							{deliveredCount} of {data.recipients.length} delivered
						</p>
					</div>
					<div className="rounded-lg border border-border bg-muted/30 p-4">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Needs attention
						</p>
						<p
							className={`mt-1 text-lg font-semibold ${
								undeliveredCount > 0 ? "text-destructive" : "text-success"
							}`}
						>
							{undeliveredCount > 0
								? `${undeliveredCount} needs retry`
								: "All recipients delivered"}
						</p>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recipients</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{data.recipients.map((recipient) => (
						<div
							key={recipient.messageRecipients.id}
							className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div>
								<p className="font-medium text-foreground">
									{recipient.guardians.firstName} {recipient.guardians.lastName}
								</p>
								<p className="mt-1 text-sm text-muted-foreground">
									{recipient.guardians.email ?? "No email on file"}
								</p>
							</div>
							<p className="text-sm text-muted-foreground">
								{recipient.messageRecipients.deliveredAt
									? `Delivered ${formatDateTime(recipient.messageRecipients.deliveredAt)}`
									: "Pending delivery"}
							</p>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

function MessageDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<Skeleton className="h-8 w-56" />
				<Skeleton className="h-4 w-24" />
			</div>
			<Skeleton className="h-40 rounded-lg" />
			<Skeleton className="h-64 rounded-lg" />
		</div>
	);
}

function getReplySenderName(reply: {
	messageReplies: { fromEmail: string; fromName?: string | null };
	guardians?: { firstName: string; lastName: string } | null;
}) {
	if (reply.guardians) {
		return `${reply.guardians.firstName} ${reply.guardians.lastName}`.trim();
	}
	return reply.messageReplies.fromName?.trim() || reply.messageReplies.fromEmail;
}
