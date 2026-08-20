import type { Center, QuickBooksReconciliationItem } from "@pebbledesk/shared";
import { formatCurrency } from "@pebbledesk/shared";
import { CENTER_TIMEZONE_OPTIONS, isSupportedCenterTimezone } from "@pebbledesk/shared/constants";
import type { UpdateCenterInput } from "@pebbledesk/shared/validators";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
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
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@pebbledesk/ui/components/table";
import { createFileRoute } from "@tanstack/react-router";
import {
	ArrowDownToLine,
	ArrowUpToLine,
	Link2,
	RefreshCcw,
	Settings,
	Trash2,
	UserPlus,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ConfirmDestructiveDialog } from "../../components/design-system";
import { HelpTip, PageHelpPanel } from "../../components/help-tip";
import { useAuthSession } from "../../hooks/use-auth-session";
import { useCurrentCenter, useUpdateCenter } from "../../hooks/use-center";
import { useInvoices } from "../../hooks/use-finance";
import { useGuardians } from "../../hooks/use-guardians";
import {
	type MemberRole,
	useInviteMember,
	useMembers,
	useRemoveMember,
} from "../../hooks/use-members";
import {
	useApproveQuickBooksReconciliation,
	useDisconnectQuickBooks,
	useDismissQuickBooksReconciliation,
	useQuickBooksReconciliation,
	useQuickBooksStatus,
	useQuickBooksSyncHistory,
	useRunQuickBooksSync,
	useStartQuickBooksConnect,
} from "../../hooks/use-quickbooks";
import { useOpenBillingPortal } from "../../hooks/use-subscription";
import { extractErrorMessage } from "../../lib/extract-error-message";
import { formatDateTime as formatDateTimeShared, useCenterTimezone } from "../../lib/format-date";
import { usePlanCheck } from "../../lib/plan-gate";
import { requireOwner } from "../../lib/role-guards";

export interface SettingsSearch {
	quickbooks?: string;
	reason?: string;
}

export const Route = createFileRoute("/_auth/settings")({
	beforeLoad: ({ context }) => requireOwner(context),
	component: SettingsPage,
	validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
		quickbooks: typeof search.quickbooks === "string" ? search.quickbooks : undefined,
		reason: typeof search.reason === "string" ? search.reason : undefined,
	}),
});

export function SettingsPage() {
	const { quickbooks: quickbooksStatusParam, reason: quickbooksReason } = Route.useSearch();
	const centerTimezone = useCenterTimezone();
	const [entityLinkDrafts, setEntityLinkDrafts] = useState<Record<string, string>>({});
	const [localTargetDrafts, setLocalTargetDrafts] = useState<Record<string, string>>({});
	const { allowed: hasQuickBooksFeature } = usePlanCheck({ features: ["quickbooks"] });
	const { data: quickBooksStatus, isLoading: isStatusLoading } = useQuickBooksStatus({
		enabled: hasQuickBooksFeature,
	});
	const { data: syncHistory, isLoading: isHistoryLoading } = useQuickBooksSyncHistory({
		enabled: hasQuickBooksFeature,
	});
	const { data: reconciliationItems, isLoading: isReconciliationLoading } =
		useQuickBooksReconciliation("open", { enabled: hasQuickBooksFeature });
	const { data: invoices } = useInvoices();
	const { data: guardians } = useGuardians();
	const startQuickBooksConnect = useStartQuickBooksConnect();
	const disconnectQuickBooks = useDisconnectQuickBooks();
	const runQuickBooksSync = useRunQuickBooksSync();
	const approveReconciliation = useApproveQuickBooksReconciliation();
	const dismissReconciliation = useDismissQuickBooksReconciliation();

	const connection = quickBooksStatus?.connection ?? null;
	const openReconciliationCount = quickBooksStatus?.openReconciliationCount ?? 0;
	const quickBooksIsConfigured = quickBooksStatus?.isConfigured ?? true;
	const quickBooksConfigurationIssue = quickBooksStatus?.configurationIssue ?? null;
	const historyItems = syncHistory ?? [];
	const reviewItems = reconciliationItems ?? [];
	const invoiceOptions = invoices ?? [];
	const guardianOptions = guardians ?? [];

	const syncButtons = [
		{
			label: "Export",
			action: "export" as const,
			icon: ArrowUpToLine,
		},
		{
			label: "Import",
			action: "import" as const,
			icon: ArrowDownToLine,
		},
		{
			label: "Full sync",
			action: "full" as const,
			icon: RefreshCcw,
		},
	];

	const showQuickBooksNotConnectedBanner =
		hasQuickBooksFeature &&
		!isStatusLoading &&
		!connection &&
		quickbooksStatusParam !== "connected";

	return (
		<div className="space-y-6">
			{quickbooksStatusParam ? (
				<div
					className={
						quickbooksStatusParam === "connected"
							? "rounded-lg border border-success/20 bg-success/15 px-4 py-3 text-sm text-success"
							: "rounded-lg border border-warning/20 bg-warning/15 px-4 py-3 text-sm text-warning-foreground"
					}
				>
					{quickbooksStatusParam === "connected"
						? "QuickBooks connected successfully."
						: (quickbooksReason ?? "QuickBooks connection could not be completed.")}
				</div>
			) : showQuickBooksNotConnectedBanner ? (
				<div
					data-testid="quickbooks-not-connected-banner"
					className="rounded-lg border border-warning/20 bg-warning/15 px-4 py-3 text-sm text-warning-foreground"
				>
					QuickBooks isn't connected — set it up to sync invoices and payments.
				</div>
			) : null}

			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Settings</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Review connected services, sync history, and local bookkeeping links.
					</p>
				</div>
				<Badge variant="secondary" className="bg-primary text-primary-foreground">
					<Settings className="mr-1 h-3.5 w-3.5" />
					Owner only
				</Badge>
			</div>
			<PageHelpPanel route="/settings" />

			<nav
				aria-label="Settings sections"
				className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2"
			>
				{[
					["Bookkeeping", "#bookkeeping"],
					["Team", "#team"],
					["Center profile", "#center-profile"],
					["Billing", "#billing"],
				].map(([label, href]) => (
					<a
						key={href}
						href={href}
						className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
					>
						{label}
					</a>
				))}
			</nav>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)]">
				<div className="space-y-4">
					{hasQuickBooksFeature ? (
						<Card id="bookkeeping">
							<CardHeader className="flex-row items-start justify-between gap-4">
								<div>
									<CardTitle className="flex items-center gap-1.5">
										QuickBooks
										<HelpTip label="Help: QuickBooks">
											QuickBooks syncs invoices and payments with your bookkeeping account.
										</HelpTip>
									</CardTitle>
									<p className="mt-1 text-sm text-muted-foreground">
										Connect one QuickBooks account for this center, run manual syncs, and review
										imported differences before PebbleDesk changes.
									</p>
								</div>
								{connection ? (
									<Badge variant="secondary" className="bg-success/15 text-success">
										Connected
									</Badge>
								) : null}
							</CardHeader>
							<CardContent className="space-y-4">
								{isStatusLoading ? (
									<SettingsQuickBooksSkeleton />
								) : connection ? (
									<div className="space-y-4">
										<div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 md:grid-cols-3">
											<Detail label="Company">
												{connection.companyName ?? "Connected account"}
											</Detail>
											<Detail label="Realm ID">{connection.realmId}</Detail>
											<Detail label="Awaiting review">{String(openReconciliationCount)}</Detail>
											<Detail label="Connected">
												{formatDateTime(connection.connectedAt, centerTimezone)}
											</Detail>
											<Detail label="Last sync">
												{connection.lastSyncAt
													? formatDateTime(connection.lastSyncAt, centerTimezone)
													: "Not yet synced"}
											</Detail>
											<Detail label="Token expiry">
												{formatDateTime(connection.tokenExpiresAt, centerTimezone)}
											</Detail>
										</div>
										<div className="flex flex-wrap gap-2">
											{syncButtons.map(({ label, action, icon: Icon }) => (
												<Button
													key={action}
													type="button"
													variant={action === "full" ? "default" : "outline"}
													onClick={() => runQuickBooksSync.mutate(action)}
													disabled={runQuickBooksSync.isPending}
												>
													<Icon className="mr-2 h-4 w-4" />
													{label}
												</Button>
											))}
											<Button
												type="button"
												variant="outline"
												onClick={() => disconnectQuickBooks.mutate()}
												disabled={disconnectQuickBooks.isPending}
											>
												Disconnect
											</Button>
										</div>
									</div>
								) : (
									<div className="space-y-3">
										{!quickBooksIsConfigured ? (
											quickBooksConfigurationIssue ? (
												<p className="text-sm text-muted-foreground">
													{quickBooksConfigurationIssue}
												</p>
											) : (
												<p className="text-sm text-muted-foreground">
													QuickBooks isn't configured in this environment. Set{" "}
													<code>QUICKBOOKS_CLIENT_ID</code>, <code>QUICKBOOKS_CLIENT_SECRET</code>,
													and <code>QUICKBOOKS_REDIRECT_URI</code> in{" "}
													<code>apps/api/.dev.vars</code>, then restart the API.
												</p>
											)
										) : null}
										<Button
											type="button"
											variant={quickBooksIsConfigured ? "default" : "outline"}
											disabled={startQuickBooksConnect.isPending || !quickBooksIsConfigured}
											onClick={() => {
												startQuickBooksConnect.mutate(undefined, {
													onSuccess: ({ url }) => {
														window.location.assign(url);
													},
												});
											}}
										>
											<Link2 className="mr-2 h-4 w-4" />
											Connect QuickBooks
										</Button>
									</div>
								)}
							</CardContent>
						</Card>
					) : null}

					{hasQuickBooksFeature ? (
						<Card>
							<CardHeader>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
									<CardTitle>QuickBooks review queue</CardTitle>
									<Badge
										variant="secondary"
										className={
											openReconciliationCount > 0
												? "bg-destructive/10 text-destructive"
												: "bg-muted text-muted-foreground"
										}
									>
										{openReconciliationCount} waiting
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								{isReconciliationLoading ? (
									<Skeleton className="h-40 w-full rounded-lg" />
								) : reviewItems.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No reconciliation items are waiting for review.
									</p>
								) : (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Item</TableHead>
												<TableHead>Review details</TableHead>
												<TableHead>Detected</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{reviewItems.map((item) => (
												<TableRow key={item.id}>
													<TableCell>
														<div className="space-y-1">
															<p className="font-medium text-foreground">{item.title}</p>
															<p className="text-sm text-muted-foreground">{item.description}</p>
															{renderReconciliationSummary(item)}
														</div>
													</TableCell>
													<TableCell className="align-top">
														<div className="space-y-2">
															<div className="text-sm text-foreground">
																QuickBooks ID: {item.qbEntityId ?? "Pending link"}
															</div>
															{item.origin === "quickbooks" && item.entityType === "customer" ? (
																<Select
																	value={localTargetDrafts[item.id] || undefined}
																	onValueChange={(val) =>
																		setLocalTargetDrafts((current) => ({
																			...current,
																			[item.id]: val,
																		}))
																	}
																>
																	<SelectTrigger aria-label={`Local guardian for ${item.id}`}>
																		<SelectValue placeholder="Match to local guardian" />
																	</SelectTrigger>
																	<SelectContent>
																		{guardianOptions.map((guardian) => (
																			<SelectItem key={guardian.id} value={guardian.id}>
																				{guardian.firstName} {guardian.lastName}
																				{guardian.email ? ` / ${guardian.email}` : ""}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															) : null}
															{item.origin === "quickbooks" &&
															(item.entityType === "invoice" || item.entityType === "payment") ? (
																<Select
																	value={localTargetDrafts[item.id] || undefined}
																	onValueChange={(val) =>
																		setLocalTargetDrafts((current) => ({
																			...current,
																			[item.id]: val,
																		}))
																	}
																>
																	<SelectTrigger aria-label={`Local invoice for ${item.id}`}>
																		<SelectValue placeholder="Match to local invoice" />
																	</SelectTrigger>
																	<SelectContent>
																		{invoiceOptions.map((invoice) => (
																			<SelectItem key={invoice.id} value={invoice.id}>
																				{invoice.id} / {invoice.status} /{" "}
																				{formatCurrency(invoice.amountDue)}
																			</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															) : null}
															{!item.qbEntityId && item.origin !== "quickbooks" ? (
																<Input
																	aria-label={`QuickBooks entity id for ${item.id}`}
																	placeholder="qb-entity-id"
																	value={entityLinkDrafts[item.id] ?? ""}
																	onChange={(event) =>
																		setEntityLinkDrafts((current) => ({
																			...current,
																			[item.id]: event.target.value,
																		}))
																	}
																/>
															) : null}
														</div>
													</TableCell>
													<TableCell className="align-top text-sm text-muted-foreground">
														{formatDateTime(item.createdAt, centerTimezone)}
													</TableCell>
													<TableCell className="align-top">
														<div className="flex justify-end gap-2">
															<Button
																type="button"
																size="sm"
																onClick={() =>
																	approveReconciliation.mutate(
																		buildApprovalPayload(
																			item,
																			entityLinkDrafts[item.id],
																			localTargetDrafts[item.id],
																		),
																	)
																}
																disabled={
																	approveReconciliation.isPending ||
																	!canApproveReconciliation(
																		item,
																		entityLinkDrafts[item.id],
																		localTargetDrafts[item.id],
																	)
																}
															>
																Approve
															</Button>
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => dismissReconciliation.mutate(item.id)}
																disabled={dismissReconciliation.isPending}
															>
																Dismiss
															</Button>
														</div>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>
					) : null}
				</div>

				<div className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
						<section id="team">
							<TeamCard />
						</section>
						<section id="center-profile">
							<CenterProfileCard />
						</section>
						<section id="billing">
							<BillingPlanCard />
						</section>
					</div>

					{hasQuickBooksFeature ? (
						<Card>
							<CardHeader>
								<CardTitle>Recent sync history</CardTitle>
							</CardHeader>
							<CardContent className="space-y-3">
								{isHistoryLoading ? (
									<>
										<Skeleton className="h-12 w-full rounded-lg" />
										<Skeleton className="h-12 w-full rounded-lg" />
									</>
								) : historyItems.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										This center hasn't synced with QuickBooks.
									</p>
								) : (
									historyItems.map((item) => (
										<div key={item.id} className="rounded-lg border border-border bg-muted/40 p-4">
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="text-sm font-medium text-foreground">
														{item.entityType} {item.entityId}
													</p>
													<p className="text-sm text-muted-foreground">
														{item.direction} {item.status}
														{item.qbEntityId ? ` to ${item.qbEntityId}` : ""}
													</p>
												</div>
												<p className="text-xs text-muted-foreground">
													{formatDateTime(item.syncedAt, centerTimezone)}
												</p>
											</div>
										</div>
									))
								)}
							</CardContent>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}

function renderReconciliationSummary(item: QuickBooksReconciliationItem) {
	if (!item.proposedChanges) return null;
	const lineItems = Array.isArray(item.proposedChanges.lineItems)
		? (item.proposedChanges.lineItems as unknown[])
		: null;

	const entries = Object.entries(item.proposedChanges)
		.filter(([key]) => key !== "lineItems")
		.slice(0, 3);
	if (entries.length === 0 && !lineItems) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-2 pt-1">
			{entries.map(([key, value]) => (
				<Badge key={key} variant="secondary" className="bg-muted text-muted-foreground">
					{key}: {String(value)}
				</Badge>
			))}
			{lineItems ? (
				<Badge variant="secondary" className="bg-primary/10 text-primary">
					{lineItems.length} line item
					{lineItems.length === 1 ? "" : "s"}
				</Badge>
			) : null}
		</div>
	);
}

function buildApprovalPayload(
	item: QuickBooksReconciliationItem,
	qbEntityDraft?: string,
	localTargetDraft?: string,
) {
	return {
		id: item.id,
		qbEntityId: item.qbEntityId ?? qbEntityDraft,
		qbEntityType: item.qbEntityType,
		localTargetId: item.origin === "quickbooks" ? localTargetDraft : undefined,
	};
}

function canApproveReconciliation(
	item: QuickBooksReconciliationItem,
	qbEntityDraft?: string,
	localTargetDraft?: string,
) {
	if (
		item.origin === "quickbooks" &&
		(item.entityType === "customer" ||
			item.entityType === "invoice" ||
			item.entityType === "payment")
	) {
		return Boolean(localTargetDraft);
	}

	return Boolean(item.qbEntityId ?? qbEntityDraft);
}

function SettingsQuickBooksSkeleton() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-24 w-full rounded-lg" />
			<div className="flex gap-2">
				<Skeleton className="h-10 w-24 rounded-lg" />
				<Skeleton className="h-10 w-24 rounded-lg" />
				<Skeleton className="h-10 w-24 rounded-lg" />
			</div>
		</div>
	);
}

function Detail({ label, children }: { label: string; children: string }) {
	return (
		<div>
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 text-sm text-foreground">{children}</p>
		</div>
	);
}

function TeamCard() {
	const { data: members, isLoading, isError } = useMembers();
	const invite = useInviteMember();
	const removeMember = useRemoveMember();
	const { data: session } = useAuthSession();
	const currentMembershipId = session?.membership.id;
	const currentRole = session?.membership.role;
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<MemberRole>("staff");
	const [inviteError, setInviteError] = useState<string | null>(null);

	async function handleInvite(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setInviteError(null);
		try {
			// Success toast is emitted by the useInviteMember hook's onSuccess.
			await invite.mutateAsync({ email, role });
			setEmail("");
			setRole("staff");
			setOpen(false);
		} catch (err) {
			setInviteError(extractErrorMessage(err, "Could not invite member."));
		}
	}

	return (
		<Card>
			<CardHeader className="flex-row items-start justify-between gap-2">
				<CardTitle>Team</CardTitle>
				<Dialog
					open={open}
					onOpenChange={(next) => {
						setOpen(next);
						if (!next) setInviteError(null);
					}}
				>
					<DialogTrigger asChild>
						<Button type="button" size="sm" variant="outline">
							<UserPlus className="mr-2 h-4 w-4" />
							Invite
						</Button>
					</DialogTrigger>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle>Invite a member</DialogTitle>
							<DialogDescription>
								Members must already have a PebbleDesk account. Ask them to sign up first, then
								invite them by the same email here.
							</DialogDescription>
						</DialogHeader>
						<form className="space-y-4" onSubmit={handleInvite}>
							<div className="space-y-2">
								<Label htmlFor="invite-email">Email</Label>
								<Input
									id="invite-email"
									type="email"
									required
									autoComplete="off"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="invite-role">Role</Label>
								<Select value={role} onValueChange={(value) => setRole(value as MemberRole)}>
									<SelectTrigger id="invite-role">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="director">Director</SelectItem>
										<SelectItem value="staff">Staff</SelectItem>
									</SelectContent>
								</Select>
							</div>
							{inviteError ? (
								<p role="alert" className="text-sm text-destructive">
									{inviteError}
								</p>
							) : null}
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="outline"
									onClick={() => setOpen(false)}
									disabled={invite.isPending}
								>
									Cancel
								</Button>
								<Button type="submit" disabled={invite.isPending || !email}>
									{invite.isPending ? "Sending…" : "Send invite"}
								</Button>
							</div>
						</form>
					</DialogContent>
				</Dialog>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<Skeleton className="h-24 w-full rounded-lg" />
				) : isError ? (
					<p className="text-sm text-muted-foreground">Could not load the team roster.</p>
				) : !members || members.length === 0 ? (
					<p className="text-sm text-muted-foreground">No members yet.</p>
				) : (
					<ul className="divide-y divide-border">
						{members.map((member) => {
							const accepted = Boolean(member.acceptedAt);
							return (
								<li
									key={member.id}
									className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
								>
									<div>
										<p className="text-sm font-medium text-foreground">
											{member.userName ?? member.userEmail ?? "Pending invite"}
										</p>
										{member.userName && member.userEmail ? (
											<p className="text-xs text-muted-foreground">{member.userEmail}</p>
										) : null}
									</div>
									<div className="flex items-center gap-2">
										<Badge variant="secondary" className="capitalize">
											{member.role}
										</Badge>
										<Badge
											variant="secondary"
											className={
												accepted
													? "bg-success/15 text-success"
													: "bg-warning/15 text-warning-foreground"
											}
										>
											{accepted ? "Active" : "Invited"}
										</Badge>
										{currentRole === "owner" && member.id !== currentMembershipId ? (
											<ConfirmDestructiveDialog
												trigger={
													<Button
														type="button"
														size="sm"
														variant="outline"
														className="text-destructive hover:text-destructive"
													>
														<Trash2 className="h-4 w-4" />
														<span className="sr-only">Remove member</span>
													</Button>
												}
												title="Remove member?"
												description={`Remove ${member.userName ?? member.userEmail ?? "this member"} from your center? They will lose access immediately.`}
												confirmLabel="Remove"
												onConfirm={() => removeMember.mutate(member.id)}
											/>
										) : null}
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

type CenterFormState = {
	name: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	phone: string;
	licenseNumber: string;
	timezone: string;
};

function centerToFormState(center: Center): CenterFormState {
	return {
		name: center.name,
		address: center.address,
		city: center.city,
		state: center.state,
		zip: center.zip,
		phone: center.phone,
		licenseNumber: center.licenseNumber ?? "",
		timezone: center.timezone,
	};
}

function diffCenterForm(original: CenterFormState, next: CenterFormState): UpdateCenterInput {
	const out: UpdateCenterInput = {};
	if (next.name !== original.name) out.name = next.name;
	if (next.address !== original.address) out.address = next.address;
	if (next.city !== original.city) out.city = next.city;
	if (next.state !== original.state) out.state = next.state;
	if (next.zip !== original.zip) out.zip = next.zip;
	if (next.phone !== original.phone) out.phone = next.phone;
	if (next.licenseNumber !== original.licenseNumber && next.licenseNumber !== "") {
		out.licenseNumber = next.licenseNumber;
	}
	if (next.timezone !== original.timezone && isSupportedCenterTimezone(next.timezone)) {
		out.timezone = next.timezone;
	}
	return out;
}

function CenterProfileCard() {
	const { data: session, isLoading: isSessionLoading } = useAuthSession();
	const centerId = session?.membership.centerId;
	const { data: center, isLoading: isCenterLoading } = useCurrentCenter(centerId);
	const isLoading = isSessionLoading || isCenterLoading;
	const update = useUpdateCenter(centerId ?? "");

	const [editing, setEditing] = useState(false);
	const [form, setForm] = useState<CenterFormState | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (center && !editing) {
			setForm(centerToFormState(center));
		}
	}, [center, editing]);

	function startEdit() {
		if (!center) return;
		setForm(centerToFormState(center));
		setError(null);
		setEditing(true);
	}

	function cancelEdit() {
		if (center) setForm(centerToFormState(center));
		setError(null);
		setEditing(false);
	}

	async function handleSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!center || !form) return;
		const diff = diffCenterForm(centerToFormState(center), form);
		if (Object.keys(diff).length === 0) {
			setEditing(false);
			return;
		}
		setError(null);
		try {
			// Success toast is emitted by the useUpdateCenter hook's onSuccess.
			await update.mutateAsync(diff);
			setEditing(false);
		} catch (err) {
			setError(extractErrorMessage(err, "Could not update center."));
		}
	}

	return (
		<Card>
			<CardHeader className="flex-row items-start justify-between gap-2">
				<CardTitle>Center profile</CardTitle>
				{!editing && center ? (
					<Button type="button" size="sm" variant="outline" onClick={startEdit}>
						Edit
					</Button>
				) : null}
			</CardHeader>
			<CardContent>
				{isLoading || !center ? (
					<Skeleton className="h-40 w-full rounded-lg" />
				) : editing && form ? (
					<form className="space-y-4" onSubmit={handleSave}>
						<div className="space-y-2">
							<Label htmlFor="center-name">Center name</Label>
							<Input
								id="center-name"
								value={form.name}
								onChange={(e) => setForm({ ...form, name: e.target.value })}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="center-address">Address</Label>
							<Input
								id="center-address"
								value={form.address}
								onChange={(e) => setForm({ ...form, address: e.target.value })}
								required
							/>
						</div>
						<div className="grid gap-3 sm:grid-cols-2">
							<div className="space-y-2">
								<Label htmlFor="center-city">City</Label>
								<Input
									id="center-city"
									value={form.city}
									onChange={(e) => setForm({ ...form, city: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="center-state">State</Label>
								<Input
									id="center-state"
									value={form.state}
									maxLength={2}
									onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="center-zip">ZIP</Label>
								<Input
									id="center-zip"
									value={form.zip}
									onChange={(e) => setForm({ ...form, zip: e.target.value })}
									required
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="center-phone">Phone</Label>
								<Input
									id="center-phone"
									value={form.phone}
									onChange={(e) => setForm({ ...form, phone: e.target.value })}
									required
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="center-license">License number</Label>
							<Input
								id="center-license"
								value={form.licenseNumber}
								onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="center-timezone">Timezone</Label>
							<Select
								value={form.timezone}
								onValueChange={(value) => setForm({ ...form, timezone: value })}
							>
								<SelectTrigger id="center-timezone">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CENTER_TIMEZONE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{error ? (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						) : null}
						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={cancelEdit}
								disabled={update.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={update.isPending}>
								{update.isPending ? "Saving…" : "Save"}
							</Button>
						</div>
					</form>
				) : (
					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<CenterField label="Name">{center.name}</CenterField>
						<CenterField label="Phone">{center.phone}</CenterField>
						<CenterField label="Address">{center.address}</CenterField>
						<CenterField label="City">{center.city}</CenterField>
						<CenterField label="State">{center.state}</CenterField>
						<CenterField label="ZIP">{center.zip}</CenterField>
						<CenterField label="License number">{center.licenseNumber ?? "—"}</CenterField>
						<CenterField label="Timezone">{center.timezone}</CenterField>
					</dl>
				)}
			</CardContent>
		</Card>
	);
}

function CenterField({ label, children }: { label: string; children: string }) {
	return (
		<div>
			<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
			<dd className="mt-1 text-foreground">{children}</dd>
		</div>
	);
}

function BillingPlanCard() {
	const openPortal = useOpenBillingPortal();
	const [error, setError] = useState<string | null>(null);

	async function handleOpenPortal() {
		setError(null);
		try {
			await openPortal.mutateAsync();
		} catch (err) {
			setError(extractErrorMessage(err, "Could not open the billing portal."));
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Billing</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<p className="text-sm text-muted-foreground">
					Manage your PebbleDesk plan, payment method, and invoices in Stripe.
				</p>
				<Button
					type="button"
					variant="outline"
					onClick={handleOpenPortal}
					disabled={openPortal.isPending}
				>
					{openPortal.isPending ? "Opening…" : "Manage billing"}
				</Button>
				{error ? (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

function formatDateTime(value: string, centerTimezone: string | undefined) {
	return formatDateTimeShared(value, { centerTimezone });
}
