import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { Separator } from "@pebbledesk/ui/components/separator";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { Textarea } from "@pebbledesk/ui/components/textarea";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import { FieldHelp, HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useClassrooms } from "../../../hooks/use-classrooms";
import { useGuardians } from "../../../hooks/use-guardians";
import { useMessageInbox, useMessages, useSendMessage } from "../../../hooks/use-phase5";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatDateTime as formatDateTimeShared } from "../../../lib/format-date";
import { getRequiredAppInlineHelpById } from "../../../lib/guidance-content";

export const Route = createFileRoute("/_auth/messages/")({
	component: MessagesPage,
});

const SUPPORT_MAILTO_HREF = `mailto:${PUBLIC_BRAND_KNOWLEDGE.supportEmail}`;
const messagesSendToHelp = getRequiredAppInlineHelpById("messages.send-to");
const messagesGuardiansHelp = getRequiredAppInlineHelpById("messages.guardians");

export function MessagesPage() {
	const { data: messages, isLoading, isError } = useMessages();
	const { data: inboxReplies, isLoading: inboxLoading } = useMessageInbox();
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? undefined;
	// The API (POST /messages) forbids staff from sending announcements/alerts and from any
	// recipient mode other than their own classroom. Mirror that here so staff are never offered
	// options that would always 403 on submit.
	const isStaff = session?.membership?.role === "staff";
	const visibleMessages = messages ?? [];
	const visibleInboxReplies = inboxReplies ?? [];
	const formatDateTime = (value: string) => formatDateTimeShared(value, { centerTimezone });

	const [inboxFilter, setInboxFilter] = useState<"all" | "unread">("all");
	const [composeOpen, setComposeOpen] = useState(false);
	const [composeError, setComposeError] = useState<string | null>(null);
	const [sendSuccess, setSendSuccess] = useState(false);
	const [subject, setSubject] = useState("");
	const [messageType, setMessageType] = useState<"announcement" | "direct" | "alert" | "">("");
	const [body, setBody] = useState("");
	const [recipientMode, setRecipientMode] = useState<"classroom" | "guardian_ids" | "">("");
	const [classroomId, setClassroomId] = useState("");
	const [selectedGuardianIds, setSelectedGuardianIds] = useState<string[]>([]);
	const sendMessage = useSendMessage();

	// Derive unread count per inbox thread item: count replies with no readAt
	const inboxUnreadCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const item of visibleInboxReplies) {
			const key = item.message.id;
			if (!item.reply.readAt) {
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
		}
		return counts;
	}, [visibleInboxReplies]);

	// Deduplicate inbox items by message.id (one row per thread), keeping the latest reply
	const inboxThreads = useMemo(() => {
		const seen = new Map<string, (typeof visibleInboxReplies)[number]>();
		for (const item of visibleInboxReplies) {
			const existing = seen.get(item.message.id);
			if (!existing || item.reply.receivedAt > existing.reply.receivedAt) {
				seen.set(item.message.id, item);
			}
		}
		return Array.from(seen.values());
	}, [visibleInboxReplies]);

	const filteredInboxThreads = useMemo(() => {
		if (inboxFilter === "unread") {
			return inboxThreads.filter((item) => (inboxUnreadCounts.get(item.message.id) ?? 0) > 0);
		}
		return inboxThreads;
	}, [inboxThreads, inboxFilter, inboxUnreadCounts]);

	const { data: classrooms } = useClassrooms();
	// GET /api/guardians is Owner/Director only, and the guardian-recipient mode
	// is itself hidden from staff (they can only message their own classroom).
	// Gate the fetch so a staff viewer of the compose form never fires a 403.
	const { data: guardians } = useGuardians(undefined, { enabled: !isStaff });
	const hasRequiredText = subject.trim().length > 0 && body.trim().length > 0 && !!messageType;
	const hasSelectedRecipients =
		(recipientMode === "classroom" && classroomId.length > 0) ||
		(recipientMode === "guardian_ids" && selectedGuardianIds.length > 0);
	const canSendMessage = hasRequiredText && hasSelectedRecipients;

	function toggleGuardian(id: string) {
		setSelectedGuardianIds((prev) =>
			prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id],
		);
	}

	async function handleCompose(e: React.FormEvent) {
		e.preventDefault();
		if (!canSendMessage) {
			setComposeError("Complete the message and choose recipients before sending.");
			return;
		}

		setComposeError(null);
		setSendSuccess(false);
		const base = { subject, body, messageType };
		const input =
			recipientMode === "classroom"
				? { ...base, recipientMode: "classroom" as const, classroomId }
				: {
						...base,
						recipientMode: "guardian_ids" as const,
						recipientGuardianIds: selectedGuardianIds,
					};

		try {
			await sendMessage.mutateAsync(input);
			setComposeOpen(false);
			setSubject("");
			setMessageType("");
			setBody("");
			setRecipientMode("");
			setClassroomId("");
			setSelectedGuardianIds([]);
			setSendSuccess(true);
		} catch (err) {
			setComposeError(extractErrorMessage(err, "Failed to send message. Please try again."));
		}
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<MessagesHeader />
				<MessagesSkeleton />
			</div>
		);
	}

	if (isError) {
		return (
			<div role="alert" className="rounded-xl border border-primary/20 bg-card p-6 text-center">
				<p className="font-semibold text-foreground">We couldn't load your messages</p>
				<p className="mt-1 text-sm text-muted-foreground">
					Your data is safe — this is a temporary display issue. Refresh to try again.
				</p>
				<div className="mt-4 flex justify-center gap-3">
					<Button variant="default" onClick={() => window.location.reload()}>
						Refresh page
					</Button>
					<Button variant="outline" asChild>
						<a href={SUPPORT_MAILTO_HREF}>Contact support</a>
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<MessagesHeader />
			<PageHelpPanel route="/messages" />

			<Card className="border-border shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle className="text-base text-foreground">Inbox</CardTitle>
					<div className="flex items-center gap-1 rounded-md border border-border bg-muted p-0.5">
						<button
							type="button"
							aria-pressed={inboxFilter === "all"}
							onClick={() => setInboxFilter("all")}
							className={[
								"rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
								inboxFilter === "all"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							].join(" ")}
						>
							All
						</button>
						<button
							type="button"
							aria-pressed={inboxFilter === "unread"}
							onClick={() => setInboxFilter("unread")}
							className={[
								"rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
								inboxFilter === "unread"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							].join(" ")}
						>
							Unread only
						</button>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					{inboxLoading ? (
						<Skeleton className="h-20 rounded-lg" />
					) : filteredInboxThreads.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							{inboxFilter === "unread"
								? "No unread replies."
								: "New guardian replies will appear here."}
						</p>
					) : (
						filteredInboxThreads.map((item) => {
							const unreadCount = inboxUnreadCounts.get(item.message.id) ?? 0;
							return (
								<Link
									key={item.message.id}
									to="/messages/$id"
									params={{ id: item.message.id }}
									className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
								>
									<div className="flex items-start justify-between gap-2">
										<p className="font-medium text-foreground">
											{getReplySenderName(item)} replied to {item.message.subject}
										</p>
										{unreadCount > 0 && (
											<span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
												{unreadCount}
											</span>
										)}
									</div>
									<p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
										{item.reply.body}
									</p>
									<p className="mt-2 text-xs text-muted-foreground">
										{formatDateTime(item.reply.receivedAt)}
									</p>
								</Link>
							);
						})
					)}
				</CardContent>
			</Card>

			<Card className="border-border shadow-sm">
				<CardHeader className="flex flex-row items-center justify-between">
					<CardTitle id="sent-messages" className="text-base text-foreground">
						Sent messages
					</CardTitle>
					<Dialog
						open={composeOpen}
						onOpenChange={(open) => {
							setComposeOpen(open);
							if (!open) setComposeError(null);
						}}
					>
						<DialogTrigger asChild>
							<Button size="sm" variant="outline" onClick={() => setSendSuccess(false)}>
								<Plus className="h-4 w-4 mr-1" />
								Compose
							</Button>
						</DialogTrigger>
						<DialogContent
							onOpenAutoFocus={(event) => {
								event.preventDefault();
								document.getElementById("compose-recipient-mode")?.focus();
							}}
						>
							<DialogHeader>
								<DialogTitle>New message</DialogTitle>
								<DialogDescription>
									Compose and send a message to classrooms or individual guardians.
								</DialogDescription>
							</DialogHeader>
							<form onSubmit={handleCompose} className="space-y-5" noValidate>
								<div className="space-y-3">
									<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
										To
									</p>
									<div className="space-y-1.5">
										<FieldHelp
											htmlFor="compose-recipient-mode"
											label={messagesSendToHelp.label}
											help={messagesSendToHelp.text}
										/>
										<Select
											value={recipientMode}
											onValueChange={(v) => {
												setRecipientMode(v as "classroom" | "guardian_ids");
												setClassroomId("");
												setSelectedGuardianIds([]);
											}}
										>
											<SelectTrigger id="compose-recipient-mode">
												<SelectValue placeholder="Select recipients" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="classroom">A classroom</SelectItem>
												{!isStaff && (
													<SelectItem value="guardian_ids">Selected guardians</SelectItem>
												)}
											</SelectContent>
										</Select>
									</div>

									{recipientMode === "classroom" && (
										<div className="space-y-1.5">
											<FieldHelp
												htmlFor="compose-classroom"
												label="Classroom"
												help="Everyone linked to this classroom can receive the update."
											/>
											<Select value={classroomId} onValueChange={setClassroomId}>
												<SelectTrigger id="compose-classroom">
													<SelectValue placeholder="Select classroom" />
												</SelectTrigger>
												<SelectContent>
													{(classrooms ?? []).map((classroom) => (
														<SelectItem key={classroom.id} value={classroom.id}>
															{classroom.name}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									)}

									{recipientMode === "guardian_ids" && (
										<fieldset className="space-y-1.5">
											<legend className="flex items-center gap-1.5 text-sm font-medium leading-none text-foreground">
												Guardians
												<HelpTip label={messagesGuardiansHelp.label}>
													{messagesGuardiansHelp.text}
												</HelpTip>
											</legend>
											<div className="max-h-48 overflow-y-auto space-y-2">
												{(guardians ?? []).map((guardian) => (
													<div key={guardian.id} className="flex items-center gap-2">
														<Checkbox
															id={`guardian-${guardian.id}`}
															checked={selectedGuardianIds.includes(guardian.id)}
															onCheckedChange={() => toggleGuardian(guardian.id)}
														/>
														<Label htmlFor={`guardian-${guardian.id}`}>
															{guardian.firstName} {guardian.lastName}
														</Label>
													</div>
												))}
											</div>
										</fieldset>
									)}
								</div>

								<Separator />

								<div className="space-y-3">
									<p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
										Message
									</p>
									<div className="space-y-1.5">
										<FieldHelp
											htmlFor="compose-subject"
											label="Subject"
											help="Use a short subject families can understand from a phone notification."
										/>
										<Input
											id="compose-subject"
											value={subject}
											onChange={(e) => setSubject(e.target.value)}
											required
										/>
									</div>

									<div className="space-y-1.5">
										<FieldHelp
											htmlFor="compose-type"
											label="Type"
											help="Announcement is routine, direct is for selected families, and alert is urgent."
										/>
										<Select
											value={messageType}
											onValueChange={(v) =>
												setMessageType(v as "announcement" | "direct" | "alert")
											}
										>
											<SelectTrigger id="compose-type">
												<SelectValue placeholder="Select type" />
											</SelectTrigger>
											<SelectContent>
												{!isStaff && <SelectItem value="announcement">Announcement</SelectItem>}
												<SelectItem value="direct">Direct</SelectItem>
												{!isStaff && <SelectItem value="alert">Alert</SelectItem>}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-1.5">
										<FieldHelp
											htmlFor="compose-body"
											label="Message"
											help="Write the note in everyday language. Avoid including private child details unless needed."
										/>
										<Textarea
											id="compose-body"
											value={body}
											onChange={(e) => setBody(e.target.value)}
											className="min-h-[120px]"
											required
										/>
									</div>
								</div>

								<Button type="submit" className="w-full" disabled={sendMessage.isPending}>
									Send message
								</Button>
								{composeError ? (
									<p role="alert" className="text-sm text-destructive">
										{composeError}
									</p>
								) : null}
							</form>
						</DialogContent>
					</Dialog>
				</CardHeader>
				<CardContent className="space-y-3">
					{sendSuccess ? (
						<div
							role="status"
							className="rounded-lg border border-success/20 bg-success/10 px-4 py-3"
						>
							<p className="text-sm font-semibold text-success">Message sent</p>
							<p className="mt-1 text-sm text-muted-foreground">
								Next, review delivery status and watch the inbox for guardian replies.
							</p>
							<a
								href="#sent-messages"
								className="mt-2 inline-flex text-sm font-medium text-primary hover:underline"
							>
								Review sent messages
							</a>
						</div>
					) : null}
					{visibleMessages.length === 0 && !sendSuccess ? (
						<EmptyState
							shape="inline"
							tone="people"
							icon={<MailOpen className="h-5 w-5" aria-hidden="true" />}
							title="No sent messages yet"
							description="This page only lists messages after they have been sent."
							action={
								<Button asChild size="sm" variant="outline">
									<Link to="/guardians">Review family contacts</Link>
								</Button>
							}
						/>
					) : (
						visibleMessages.map((message) => (
							<Link
								key={message.id}
								to="/messages/$id"
								params={{ id: message.id }}
								className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent hover:text-accent-foreground"
							>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="font-medium text-foreground">{message.subject}</p>
										<p className="mt-1 text-sm text-muted-foreground">
											{formatDateTime(message.createdAt)}
										</p>
									</div>
									<Badge variant="secondary" className="w-fit capitalize">
										{message.messageType}
									</Badge>
								</div>
							</Link>
						))
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function MessagesSkeleton() {
	return (
		<div className="space-y-6">
			<Skeleton className="h-72 rounded-lg" />
		</div>
	);
}

function MessagesHeader() {
	return (
		<section className="rounded-xl border border-border bg-background p-6 shadow-sm">
			<h1 className="text-2xl font-semibold tracking-tight text-foreground">Messages</h1>
			<p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
				Review sent messages and delivery status. Open a message to inspect recipients or retry
				delivery.
			</p>
		</section>
	);
}

function getReplySenderName(item: {
	reply: { fromEmail: string; fromName?: string | null };
	guardian: { firstName: string; lastName: string } | null;
}) {
	if (item.guardian) {
		return `${item.guardian.firstName} ${item.guardian.lastName}`.trim();
	}
	return item.reply.fromName?.trim() || item.reply.fromEmail;
}
