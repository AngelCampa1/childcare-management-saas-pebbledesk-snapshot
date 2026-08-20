import { Button } from "@pebbledesk/ui/components/button";
import { Card } from "@pebbledesk/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@pebbledesk/ui/components/table";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookUser, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ComplianceSummary } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { FieldHelp, HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { StatusBadge } from "../../../components/status-badge";
import { useCreateGuardian, useGuardians } from "../../../hooks/use-guardians";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatPhoneNumber } from "../../../lib/format-phone";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/guardians/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: GuardiansPage,
});

function ContactCompleteness({ phone, email }: { phone?: string | null; email?: string | null }) {
	const hasPhone = Boolean(phone?.trim());
	const hasEmail = Boolean(email?.trim());
	const both = hasPhone && hasEmail;
	const neither = !hasPhone && !hasEmail;

	const label = both
		? "Complete"
		: neither
			? "No contact info"
			: hasEmail
				? "Missing phone"
				: "Missing email";

	return (
		<span className="flex items-center gap-1">
			<span
				aria-hidden="true"
				data-testid={
					both ? "completeness-complete" : neither ? "completeness-none" : "completeness-partial"
				}
				className={[
					"inline-block h-2 w-2 shrink-0 rounded-full",
					both ? "bg-success" : neither ? "bg-muted" : "bg-warning",
				].join(" ")}
			/>
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
		</span>
	);
}

export function GuardiansPage() {
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const [addOpen, setAddOpen] = useState(false);

	const { data: guardians, isLoading, isError, refetch } = useGuardians(search || undefined);
	const reachableCount =
		guardians?.filter((guardian) => guardian.email?.trim() || guardian.phone?.trim()).length ?? 0;
	const missingContactCount = (guardians?.length ?? 0) - reachableCount;
	const emailCount = guardians?.filter((guardian) => guardian.email?.trim()).length ?? 0;
	const phoneCount = guardians?.filter((guardian) => guardian.phone?.trim()).length ?? 0;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Guardians</h1>
					{!isLoading && guardians && (
						<p className="mt-1 text-sm text-muted-foreground">
							{guardians.length} guardian
							{guardians.length !== 1 ? "s" : ""}
						</p>
					)}
				</div>
				<Button className="self-start sm:self-auto" onClick={() => setAddOpen(true)}>
					<Plus className="mr-2 h-4 w-4" />
					Add Guardian
				</Button>
			</div>

			<div className="relative max-w-sm">
				<Label htmlFor="guardians-search" className="sr-only">
					Search guardians
				</Label>
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					id="guardians-search"
					aria-label="Search guardians"
					placeholder="Search by name, email, or phone..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="pl-9"
				/>
			</div>

			<PageHelpPanel route="/guardians" />

			{!isLoading && guardians ? (
				<ComplianceSummary
					title="Reachability summary"
					tone={missingContactCount > 0 ? "warning" : "success"}
					items={[
						{ label: "Reachable", value: `${reachableCount} reachable` },
						{ label: "Missing", value: `${missingContactCount} missing contact` },
						{ label: "Email", value: `${emailCount} email` },
						{ label: "Phone", value: `${phoneCount} phone` },
					]}
				/>
			) : null}

			{isLoading ? (
				<GuardiansTableSkeleton />
			) : isError ? (
				<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
					<p className="text-sm text-destructive">Failed to load family contacts.</p>
					<button
						type="button"
						onClick={() => void refetch()}
						className="mt-3 text-sm font-medium text-primary hover:underline"
					>
						Try again
					</button>
				</div>
			) : !guardians || guardians.length === 0 ? (
				<EmptyState
					tone="people"
					icon={<BookUser className="h-6 w-6" aria-hidden="true" />}
					title="Add your first family contact"
					description="Once a guardian is on file, pickup, billing, and emergency contacts route correctly."
					actionLabel="Add Guardian"
					onAction={() => setAddOpen(true)}
				/>
			) : (
				<Card>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<div className="flex items-center gap-1">
										Name
										<HelpTip label="Help: guardian name">
											Open a guardian to review contact and linked children.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Contact
										<HelpTip label="Help: guardian contact">
											Green means phone and email are both on file.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Children
										<HelpTip label="Help: linked children">
											Linked children open their child profile for pickup and enrollment review.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead>
									<div className="flex items-center gap-1">
										Pickup
										<HelpTip label="Help: pickup authorization">
											Shows whether this guardian is approved to pick up at least one linked child.
										</HelpTip>
									</div>
								</TableHead>
								<TableHead className="w-[180px] text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{guardians.map((guardian) => {
								const linkedChildren = guardian.children ?? [];
								const pickupCount = linkedChildren.filter((child) => child.authorizedPickup).length;

								return (
									<TableRow
										key={guardian.id}
										className="cursor-pointer hover:bg-muted/40"
										onClick={() =>
											navigate({
												to: "/guardians/$id",
												params: { id: guardian.id },
											})
										}
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<ContactCompleteness phone={guardian.phone} email={guardian.email} />
												<Link
													to="/guardians/$id"
													params={{ id: guardian.id }}
													className="font-medium text-primary hover:underline"
													onClick={(e) => e.stopPropagation()}
												>
													{guardian.firstName} {guardian.lastName}
												</Link>
											</div>
										</TableCell>
										<TableCell>
											<div className="space-y-2 text-sm">
												{guardian.email && (
													<div>
														<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
															Email on file
														</p>
														<p className="text-foreground">{guardian.email}</p>
													</div>
												)}
												{guardian.phone && (
													<div>
														<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
															Phone on file
														</p>
														<p className="text-muted-foreground">
															{formatPhoneNumber(guardian.phone)}
														</p>
													</div>
												)}
												{!guardian.email && !guardian.phone && (
													<p className="text-muted-foreground">No contact info</p>
												)}
											</div>
										</TableCell>
										<TableCell>
											{linkedChildren.length > 0 ? (
												<div className="flex flex-col items-start gap-1">
													{linkedChildren.map((child) => (
														<Link
															key={child.id}
															to="/children/$id"
															params={{ id: child.id }}
															className="text-sm font-medium text-primary hover:underline"
															onClick={(e) => e.stopPropagation()}
														>
															{child.firstName} {child.lastName}
														</Link>
													))}
												</div>
											) : (
												<span className="text-sm text-muted-foreground">No children linked</span>
											)}
										</TableCell>
										<TableCell>
											<StatusBadge
												status={pickupCount > 0 ? "authorized" : "not-authorized"}
												label={
													pickupCount > 0 ? `${pickupCount} pickup approved` : "No pickup approval"
												}
											/>
										</TableCell>
										<TableCell className="text-right">
											<Button
												type="button"
												variant="ghost"
												size="sm"
												aria-label={`View details for ${guardian.firstName} ${guardian.lastName}`}
												onClick={(event) => {
													event.stopPropagation();
													navigate({
														to: "/guardians/$id",
														params: { id: guardian.id },
													});
												}}
											>
												View
											</Button>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</Card>
			)}

			<AddGuardianDialog open={addOpen} onOpenChange={setAddOpen} />
		</div>
	);
}

function AddGuardianDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const navigate = useNavigate();
	const createGuardian = useCreateGuardian();

	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [formError, setFormError] = useState<string | null>(null);

	const isValid = firstName.trim() && lastName.trim();

	const handleSubmit = async () => {
		if (!isValid) return;
		try {
			const guardian = await createGuardian.mutateAsync({
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
			});
			setFirstName("");
			setLastName("");
			setEmail("");
			setPhone("");
			setFormError(null);
			onOpenChange(false);
			navigate({
				to: "/guardians/$id",
				params: { id: guardian.id },
			});
		} catch (err) {
			setFormError(extractErrorMessage(err, "Could not create guardian."));
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) {
					setFirstName("");
					setLastName("");
					setEmail("");
					setPhone("");
					setFormError(null);
				}
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Guardian</DialogTitle>
					<DialogDescription>
						Guardians are authorized for pickup, billing, and emergency contact. Only first and last
						name are required.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<FieldHelp
								htmlFor="add-guardian-first"
								label="First Name"
								help="Use the name staff will recognize during pickup or calls."
							/>
							<Input
								id="add-guardian-first"
								value={firstName}
								onChange={(e) => setFirstName(e.target.value)}
								placeholder="e.g. Mia"
							/>
						</div>
						<div className="space-y-2">
							<FieldHelp
								htmlFor="add-guardian-last"
								label="Last Name"
								help="Use the guardian's family or legal last name."
							/>
							<Input
								id="add-guardian-last"
								value={lastName}
								onChange={(e) => setLastName(e.target.value)}
								placeholder="e.g. Johnson"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<FieldHelp
							htmlFor="add-guardian-email"
							label="Email"
							help="Email is used for family messages, billing, and written follow-up."
						/>
						<Input
							id="add-guardian-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="name@example.com"
						/>
					</div>
					<div className="space-y-2">
						<FieldHelp
							htmlFor="add-guardian-phone"
							label="Phone"
							help="Phone helps staff reach the family quickly for urgent items."
						/>
						<Input
							id="add-guardian-phone"
							type="tel"
							inputMode="tel"
							value={phone}
							onChange={(e) => setPhone(e.target.value)}
							placeholder="(555) 123-4567"
						/>
					</div>
					{formError ? (
						<p role="alert" className="text-sm text-destructive">
							{formError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={!isValid || createGuardian.isPending}>
							{createGuardian.isPending ? "Saving..." : "Save guardian"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function GuardiansTableSkeleton() {
	return (
		<Card>
			<div className="p-4 space-y-3">
				{["row-a", "row-b", "row-c", "row-d", "row-e"].map((key) => (
					<div key={key} className="flex gap-4">
						<Skeleton className="h-4 w-36" />
						<div className="flex-1 space-y-1">
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-3 w-32" />
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
