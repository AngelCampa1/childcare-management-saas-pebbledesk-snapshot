import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Separator } from "@pebbledesk/ui/components/separator";
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
import { BookUser, Link2, Pencil, Search } from "lucide-react";
import { useState } from "react";
import { ComplianceSummary } from "../../../components/design-system";
import { EmptyState } from "../../../components/empty-state";
import { StatusBadge } from "../../../components/status-badge";
import { useChildren, useLinkGuardian } from "../../../hooks/use-children";
import { useGuardian, useUpdateGuardian } from "../../../hooks/use-guardians";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatPhoneNumber } from "../../../lib/format-phone";

export const Route = createFileRoute("/_auth/guardians/$id")({
	component: GuardianDetailPage,
});

function GuardianDetailPage() {
	const { id } = Route.useParams();
	const navigate = useNavigate();
	const { data, isLoading } = useGuardian(id);
	const updateGuardian = useUpdateGuardian(id);

	const [editMode, setEditMode] = useState(false);
	const [linkChildOpen, setLinkChildOpen] = useState(false);

	const [editEmail, setEditEmail] = useState("");
	const [editPhone, setEditPhone] = useState("");
	const [editError, setEditError] = useState<string | null>(null);
	const [emailTouched, setEmailTouched] = useState(false);
	const [phoneTouched, setPhoneTouched] = useState(false);

	if (isLoading) {
		return <GuardianDetailSkeleton />;
	}

	if (!data) {
		return (
			<EmptyState
				tone="people"
				icon={<BookUser className="h-6 w-6" aria-hidden="true" />}
				title="Guardian not found"
				description="The guardian you're looking for doesn't exist or has been removed."
				actionLabel="Back to guardians"
				onAction={() => navigate({ to: "/guardians" })}
			/>
		);
	}

	const { guardian, children } = data;
	const linkedChildCount = children?.length ?? 0;
	const pickupCount = children?.filter((child) => child.authorizedPickup).length ?? 0;
	const primaryCount = children?.filter((child) => child.isPrimary).length ?? 0;
	const hasContact = Boolean(guardian.email?.trim() || guardian.phone?.trim());

	function validateEmail(value: string): string | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? null : "Enter a valid email address.";
	}

	function validatePhone(value: string): string | null {
		const trimmed = value.trim();
		if (!trimmed) return null;
		const hasOnlyAllowedChars = /^[\d\s+\-().]+$/.test(trimmed);
		const digitCount = (trimmed.match(/\d/g) ?? []).length;
		if (!hasOnlyAllowedChars || digitCount < 10) {
			return "Enter a valid phone number (digits, spaces, +, -, or parentheses; minimum 10 digits).";
		}
		return null;
	}

	const emailError = emailTouched ? validateEmail(editEmail) : null;
	const phoneError = phoneTouched ? validatePhone(editPhone) : null;
	const hasContactValidationErrors = emailError !== null || phoneError !== null;

	const handleStartEdit = () => {
		setEditEmail(guardian.email ?? "");
		setEditPhone(guardian.phone ?? "");
		setEditError(null);
		setEmailTouched(false);
		setPhoneTouched(false);
		setEditMode(true);
	};

	const handleCancelEdit = () => {
		setEditError(null);
		setEmailTouched(false);
		setPhoneTouched(false);
		setEditMode(false);
	};

	const handleSaveEdit = async () => {
		setEmailTouched(true);
		setPhoneTouched(true);
		if (validateEmail(editEmail) !== null || validatePhone(editPhone) !== null) return;
		try {
			await updateGuardian.mutateAsync({
				// Send null (not undefined) when a field is emptied so the API clears the stored
				// value — omitting it would leave the old email/phone in place (silent no-op).
				email: editEmail.trim() || null,
				phone: editPhone.trim() || null,
			});
			setEditError(null);
			setEmailTouched(false);
			setPhoneTouched(false);
			setEditMode(false);
		} catch (err) {
			setEditError(extractErrorMessage(err, "Could not update contact info."));
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<h1 className="text-2xl font-bold text-foreground">
					{guardian.firstName} {guardian.lastName}
				</h1>
				{!editMode && (
					<Button variant="outline" onClick={handleStartEdit}>
						<Pencil className="mr-2 h-4 w-4" />
						Edit
					</Button>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contact Information</CardTitle>
				</CardHeader>
				<CardContent>
					<ComplianceSummary
						title="Reachability and pickup summary"
						tone={hasContact && linkedChildCount > 0 ? "success" : "warning"}
						items={[
							{ label: "Contact", value: hasContact ? "Reachable" : "Missing" },
							{
								label: "Linked",
								value: `${linkedChildCount} child${linkedChildCount === 1 ? "" : "ren"}`,
							},
							{ label: "Pickup", value: `${pickupCount} pickup` },
							{ label: "Primary", value: `${primaryCount} primary` },
						]}
						className="mb-4"
					/>
					{editMode ? (
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="edit-guardian-email">Email</Label>
								<Input
									id="edit-guardian-email"
									type="email"
									value={editEmail}
									onChange={(e) => setEditEmail(e.target.value)}
									onBlur={() => setEmailTouched(true)}
									aria-invalid={emailError !== null}
									aria-describedby={emailError ? "edit-guardian-email-error" : undefined}
								/>
								{emailError ? (
									<p
										id="edit-guardian-email-error"
										role="alert"
										className="text-xs text-destructive"
									>
										{emailError}
									</p>
								) : null}
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-guardian-phone">Phone</Label>
								<Input
									id="edit-guardian-phone"
									type="tel"
									inputMode="tel"
									value={editPhone}
									onChange={(e) => setEditPhone(e.target.value)}
									onBlur={() => setPhoneTouched(true)}
									aria-invalid={phoneError !== null}
									aria-describedby={phoneError ? "edit-guardian-phone-error" : undefined}
								/>
								{phoneError ? (
									<p
										id="edit-guardian-phone-error"
										role="alert"
										className="text-xs text-destructive"
									>
										{phoneError}
									</p>
								) : null}
							</div>
							<Separator />
							{editError ? (
								<p role="alert" className="text-sm text-destructive">
									{editError}
								</p>
							) : null}
							<div className="flex justify-end gap-2">
								<Button variant="outline" onClick={handleCancelEdit}>
									Cancel
								</Button>
								<Button
									onClick={handleSaveEdit}
									disabled={updateGuardian.isPending || hasContactValidationErrors}
								>
									{updateGuardian.isPending ? "Saving..." : "Save Changes"}
								</Button>
							</div>
						</div>
					) : (
						<div className="space-y-3">
							<DetailRow label="Email" value={guardian.email ?? "Not provided"} />
							<DetailRow
								label="Phone"
								value={guardian.phone ? formatPhoneNumber(guardian.phone) : "Not provided"}
							/>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle>Children</CardTitle>
						<Button variant="outline" size="sm" onClick={() => setLinkChildOpen(true)}>
							<Link2 className="mr-2 h-4 w-4" />
							Link to Child
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{!children || children.length === 0 ? (
						<EmptyState
							tone="people"
							title="Connect this guardian to a child"
							description={`Link ${data.guardian.firstName} to a child so pickup, billing, and emergency contacts all route correctly.`}
							actionLabel="Link to Child"
							onAction={() => setLinkChildOpen(true)}
						/>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Enrollment Status</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Relationship</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{children.map((child) => (
									<TableRow key={child.id}>
										<TableCell>
											<Link
												to="/children/$id"
												params={{ id: child.id }}
												className="font-medium text-primary hover:underline"
											>
												{child.firstName} {child.lastName}
											</Link>
										</TableCell>
										<TableCell>
											<StatusBadge status={child.enrollmentStatus} />
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												{child.isPrimary && <StatusBadge status="primary" label="Primary" />}
												{child.authorizedPickup && (
													<StatusBadge status="authorized" label="Authorized Pickup" />
												)}
											</div>
										</TableCell>
										<TableCell>
											<span className="text-sm text-foreground">
												{child.relationship ?? "Not specified"}
											</span>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<LinkChildDialog
				guardianId={id}
				existingChildIds={children?.map((c) => c.id) ?? []}
				open={linkChildOpen}
				onOpenChange={setLinkChildOpen}
			/>
		</div>
	);
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium text-foreground">{value}</span>
		</div>
	);
}

function LinkChildDialog({
	guardianId,
	existingChildIds,
	open,
	onOpenChange,
}: {
	guardianId: string;
	existingChildIds: string[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [childSearch, setChildSearch] = useState("");
	const { data: allChildren } = useChildren({
		search: childSearch || undefined,
	});

	const existingSet = new Set(existingChildIds);
	const availableChildren = allChildren?.filter((c) => !existingSet.has(c.id)) ?? [];

	const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
	const [authorizedPickup, setAuthorizedPickup] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);
	const linkGuardian = useLinkGuardian(selectedChildId ?? "");

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen) {
			setSelectedChildId(null);
			setChildSearch("");
			setAuthorizedPickup(false);
			setLinkError(null);
		}

		onOpenChange(nextOpen);
	};

	const handleLink = async () => {
		if (!selectedChildId) return;
		try {
			await linkGuardian.mutateAsync({
				guardianId,
				isPrimary: false,
				authorizedPickup,
			});
			setSelectedChildId(null);
			setChildSearch("");
			setAuthorizedPickup(false);
			setLinkError(null);
			onOpenChange(false);
		} catch (err) {
			setLinkError(extractErrorMessage(err, "Could not link child."));
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Link to Child</DialogTitle>
					<DialogDescription className="sr-only">
						Search for a child to link to this guardian.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Search children..."
							value={childSearch}
							onChange={(e) => setChildSearch(e.target.value)}
							className="pl-9"
						/>
					</div>
					<div className="max-h-48 overflow-y-auto space-y-1">
						{availableChildren.length === 0 ? (
							<p className="py-4 text-center text-sm text-muted-foreground">
								{childSearch ? "No matching children found" : "No available children to link"}
							</p>
						) : (
							availableChildren.map((child) => (
								<button
									key={child.id}
									type="button"
									aria-label={`${child.firstName} ${child.lastName} ${child.enrollmentStatus}`}
									className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
										selectedChildId === child.id
											? "border border-primary/20 bg-primary/10 text-primary"
											: "hover:bg-muted/40"
									}`}
									onClick={() => setSelectedChildId(child.id)}
								>
									<span className="font-medium">
										{child.firstName} {child.lastName}
									</span>
									<span className="ml-2 text-muted-foreground">{child.enrollmentStatus}</span>
								</button>
							))
						)}
					</div>
					<div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3">
						<Checkbox
							id="authorized-pickup"
							checked={authorizedPickup}
							onCheckedChange={(checked) => setAuthorizedPickup(checked === true)}
						/>
						<div className="space-y-1">
							<Label htmlFor="authorized-pickup">Authorized for pickup</Label>
							<p className="text-xs text-muted-foreground">
								Only enable this when this guardian should be allowed to pick the child up.
							</p>
						</div>
					</div>
					{linkError ? (
						<p role="alert" className="text-sm text-destructive">
							{linkError}
						</p>
					) : null}
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => handleOpenChange(false)}>
							Cancel
						</Button>
						<Button onClick={handleLink} disabled={!selectedChildId || linkGuardian.isPending}>
							{linkGuardian.isPending ? "Linking..." : "Link"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function GuardianDetailSkeleton() {
	return (
		<div className="space-y-6">
			<div className="flex justify-between">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-9 w-20" />
			</div>
			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-40" />
				</CardHeader>
				<CardContent className="space-y-3">
					{["detail-a", "detail-b"].map((key) => (
						<div key={key} className="flex justify-between">
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-40" />
						</div>
					))}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<Skeleton className="h-5 w-24" />
				</CardHeader>
				<CardContent className="space-y-3">
					{["child-a", "child-b"].map((key) => (
						<Skeleton key={key} className="h-12 w-full rounded-lg" />
					))}
				</CardContent>
			</Card>
		</div>
	);
}
