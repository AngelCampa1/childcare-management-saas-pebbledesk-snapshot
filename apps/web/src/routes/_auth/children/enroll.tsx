import type { Guardian } from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import type { AgeGroup } from "@pebbledesk/shared/constants";
import { AGE_GROUPS } from "@pebbledesk/shared/constants";
import { createGuardianSchema } from "@pebbledesk/shared/validators";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
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
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Check,
	ChevronRight,
	Info,
	Link,
	Pencil,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CapacityBar } from "../../../components/capacity-bar";
import { DateInput } from "../../../components/date-input";
import { EmptyState } from "../../../components/empty-state";
import { FieldHelp, PageHelpPanel } from "../../../components/help-tip";
import { StatusBadge } from "../../../components/status-badge";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useEnrollChild } from "../../../hooks/use-children";
import { useClassrooms } from "../../../hooks/use-classrooms";
import { useGuardians } from "../../../hooks/use-guardians";
import { track } from "../../../lib/analytics";
import { formatLocalDate } from "../../../lib/dates";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { formatPhoneNumber } from "../../../lib/format-phone";
import { requireDirectorOrOwner } from "../../../lib/role-guards";
import { toast } from "../../../lib/toast";

export const Route = createFileRoute("/_auth/children/enroll")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: EnrollPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WizardGuardian = {
	/** Stable identity for React keys — assigned once on row creation, never mutated. */
	_rowId: string;
	type: "new" | "existing";
	guardianId?: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string;
	relationship: string;
	isPrimary: boolean;
	authorizedPickup: boolean;
};

type DraftAgeGroup = AgeGroup | "";

type WizardState = {
	step: 1 | 2 | 3 | 4;
	child: {
		firstName: string;
		lastName: string;
		dateOfBirth: string;
		ageGroup: DraftAgeGroup;
		enrollmentStatus: "active" | "waitlist";
		subsidyEligible: boolean;
	};
	guardians: WizardGuardian[];
	classroom: {
		classroomId: string;
		effectiveDate: string;
	} | null;
};

const ENROLL_DRAFT_STORAGE_KEY = "pebbledesk:enroll-child-draft";
const DRAFT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
	infant: "Infant",
	young_toddler: "Young Toddler",
	toddler: "Toddler",
	preschool: "Preschool",
	pre_k: "Pre K",
	school_age: "School Age",
};

export function suggestAgeGroup(dateOfBirth: string): AgeGroup | null {
	if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) return null;
	const today = new Date();
	const [yearStr, monthStr, dayStr] = dateOfBirth.split("-");
	const year = Number(yearStr);
	const month = Number(monthStr);
	const day = Number(dayStr);
	if (!year) return null;
	const dob = new Date(year, month - 1, day);
	let ageInMonths =
		(today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());

	if (today.getDate() < dob.getDate()) {
		ageInMonths -= 1;
	}

	if (ageInMonths < 12) return "infant";
	if (ageInMonths < 24) return "young_toddler";
	if (ageInMonths < 36) return "toddler";
	if (ageInMonths < 48) return "preschool";
	if (ageInMonths < 60) return "pre_k";
	return "school_age";
}

function todayISO(timezone: string): string {
	// Anchor "today" to the center's calendar day, not the browser's, so the
	// default effective date can't land on the wrong day in a far-offset timezone.
	return formatLocalDate(timezone);
}

const STEP_LABELS = ["Child", "Guardians", "Classroom", "Review"] as const;

function isDraftAgeGroup(value: unknown): value is DraftAgeGroup {
	return value === "" || (typeof value === "string" && AGE_GROUPS.includes(value as AgeGroup));
}

function getDraftStorageKey(
	scope?: {
		center?: { id: string };
		user?: { id: string };
	} | null,
) {
	const centerId = scope?.center?.id;
	const userId = scope?.user?.id;

	if (!centerId || !userId) {
		return null;
	}

	return `${ENROLL_DRAFT_STORAGE_KEY}:${centerId}:${userId}`;
}

function normalizeDraftStep({
	requestedStep,
	child,
	guardians,
	classroom,
}: {
	requestedStep: number;
	child: WizardState["child"];
	guardians: WizardGuardian[];
	classroom: WizardState["classroom"];
}): WizardState["step"] {
	const canReachGuardians =
		child.firstName.trim() !== "" &&
		child.lastName.trim() !== "" &&
		child.dateOfBirth !== "" &&
		child.ageGroup !== "";
	const canReachClassroom = canReachGuardians && guardians.length >= 1;
	const canReachReview =
		canReachClassroom && (child.enrollmentStatus === "waitlist" || classroom !== null);

	if (requestedStep === 4 && canReachReview) return 4;
	if (requestedStep >= 3 && canReachClassroom) return 3;
	if (requestedStep >= 2 && canReachGuardians) return 2;
	return 1;
}

function createEmptyWizardState(): WizardState {
	return {
		step: 1,
		child: {
			firstName: "",
			lastName: "",
			dateOfBirth: "",
			ageGroup: "",
			enrollmentStatus: "active",
			subsidyEligible: false,
		},
		guardians: [],
		classroom: null,
	};
}

function readDraftState(storageKey: string | null): WizardState {
	if (typeof window === "undefined" || !storageKey) {
		return createEmptyWizardState();
	}

	try {
		const stored = window.sessionStorage.getItem(storageKey);
		if (!stored) {
			return createEmptyWizardState();
		}

		const parsed = JSON.parse(stored) as Partial<WizardState & { schemaVersion?: number }>;
		if (parsed.schemaVersion !== DRAFT_SCHEMA_VERSION) {
			return createEmptyWizardState();
		}
		const guardians: WizardGuardian[] = [];

		if (Array.isArray(parsed.guardians)) {
			for (const guardian of parsed.guardians) {
				if (!guardian || typeof guardian !== "object") {
					continue;
				}

				const baseGuardian = {
					firstName: typeof guardian.firstName === "string" ? guardian.firstName : "",
					lastName: typeof guardian.lastName === "string" ? guardian.lastName : "",
					email: typeof guardian.email === "string" ? guardian.email : "",
					phone: typeof guardian.phone === "string" ? guardian.phone : "",
					relationship: typeof guardian.relationship === "string" ? guardian.relationship : "",
					isPrimary: guardian.isPrimary === true,
					authorizedPickup: guardian.authorizedPickup !== false,
				};

				if (guardian.type === "existing" && typeof guardian.guardianId === "string") {
					guardians.push({
						...baseGuardian,
						_rowId: typeof guardian._rowId === "string" ? guardian._rowId : crypto.randomUUID(),
						type: "existing",
						guardianId: guardian.guardianId,
					});
					continue;
				}

				if (guardian.type === "new") {
					guardians.push({
						...baseGuardian,
						_rowId: typeof guardian._rowId === "string" ? guardian._rowId : crypto.randomUUID(),
						type: "new",
					});
				}
			}
		}

		const classroom =
			parsed.classroom &&
			typeof parsed.classroom.classroomId === "string" &&
			typeof parsed.classroom.effectiveDate === "string"
				? {
						classroomId: parsed.classroom.classroomId,
						effectiveDate: parsed.classroom.effectiveDate,
					}
				: null;

		const child = {
			firstName: typeof parsed.child?.firstName === "string" ? parsed.child.firstName : "",
			lastName: typeof parsed.child?.lastName === "string" ? parsed.child.lastName : "",
			dateOfBirth: typeof parsed.child?.dateOfBirth === "string" ? parsed.child.dateOfBirth : "",
			ageGroup: isDraftAgeGroup(parsed.child?.ageGroup) ? parsed.child.ageGroup : "",
			enrollmentStatus: parsed.child?.enrollmentStatus === "waitlist" ? "waitlist" : "active",
			subsidyEligible: parsed.child?.subsidyEligible === true,
		} satisfies WizardState["child"];

		return {
			step: normalizeDraftStep({
				requestedStep: parsed.step ?? 1,
				child,
				guardians,
				classroom,
			}),
			child,
			guardians,
			classroom,
		};
	} catch {
		try {
			window.sessionStorage.removeItem(storageKey);
		} catch {
			// Ignore storage cleanup failures so broken storage cannot crash enrollment.
		}
		return createEmptyWizardState();
	}
}

function hasWizardProgress(state: WizardState) {
	return (
		state.step !== 1 ||
		state.child.firstName.trim() !== "" ||
		state.child.lastName.trim() !== "" ||
		state.child.dateOfBirth !== "" ||
		state.child.ageGroup !== "" ||
		state.child.enrollmentStatus !== "active" ||
		state.child.subsidyEligible ||
		state.guardians.length > 0 ||
		state.classroom !== null
	);
}

function persistDraftState(state: WizardState, storageKey: string | null) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		window.sessionStorage.setItem(
			storageKey,
			JSON.stringify({ ...state, schemaVersion: DRAFT_SCHEMA_VERSION }),
		);
	} catch {
		// Ignore storage failures so draft persistence cannot break enrollment.
	}
}

function clearDraftState(storageKey: string | null) {
	if (typeof window === "undefined" || !storageKey) {
		return;
	}

	try {
		window.sessionStorage.removeItem(storageKey);
	} catch {
		// Ignore storage failures so draft persistence cannot break enrollment.
	}
}

// ---------------------------------------------------------------------------
// Stepper Bar
// ---------------------------------------------------------------------------

function StepperBar({ currentStep }: { currentStep: number }) {
	return (
		<nav aria-label="Enrollment progress" className="mx-auto w-full max-w-lg mb-8">
			<ol className="flex items-center justify-between">
				{STEP_LABELS.map((label, i) => {
					const stepNum = i + 1;
					const isCompleted = stepNum < currentStep;
					const isCurrent = stepNum === currentStep;
					return (
						<li
							key={label}
							className="flex items-center flex-1 last:flex-none"
							aria-current={isCurrent ? "step" : undefined}
						>
							<div className="flex flex-col items-center">
								<div
									className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
										isCompleted
											? "border border-border bg-secondary text-secondary-foreground"
											: isCurrent
												? "bg-primary text-primary-foreground"
												: "bg-muted text-muted-foreground"
									}`}
								>
									{isCompleted ? <Check className="h-4 w-4" /> : stepNum}
								</div>
								<span
									className={`mt-1.5 text-xs font-medium ${
										isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"
									}`}
								>
									{label}
								</span>
							</div>
							{i < STEP_LABELS.length - 1 && (
								<div
									className={`mx-2 h-0.5 flex-1 rounded transition-colors ${
										stepNum < currentStep ? "bg-primary/30" : "bg-border"
									}`}
								/>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}

// ---------------------------------------------------------------------------
// Step 1 - Child Details
// ---------------------------------------------------------------------------

function StepChildDetails({
	child,
	timezone,
	onChange,
}: {
	child: WizardState["child"];
	timezone: string;
	onChange: (child: WizardState["child"]) => void;
}) {
	const suggestedAgeGroup = child.dateOfBirth ? suggestAgeGroup(child.dateOfBirth) : null;
	const suggestedAgeGroupLabel =
		suggestedAgeGroup && suggestedAgeGroup !== child.ageGroup
			? AGE_GROUP_LABELS[suggestedAgeGroup]
			: null;

	const handleDobChange = (dob: string) => {
		onChange({ ...child, dateOfBirth: dob });
	};

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<FieldHelp
						htmlFor="firstName"
						label="First name"
						help="Use the child's legal or enrollment record first name."
					/>
					<Input
						id="firstName"
						value={child.firstName}
						onChange={(e) => onChange({ ...child, firstName: e.target.value })}
						placeholder="First name"
					/>
				</div>
				<div className="space-y-2">
					<FieldHelp
						htmlFor="lastName"
						label="Last name"
						help="Use the last name that should appear on reports and records."
					/>
					<Input
						id="lastName"
						value={child.lastName}
						onChange={(e) => onChange({ ...child, lastName: e.target.value })}
						placeholder="Last name"
					/>
				</div>
			</div>

			<div className="space-y-2">
				<FieldHelp
					htmlFor="dateOfBirth"
					label="Date of birth"
					help="PebbleDesk uses this to suggest the child's age group."
				/>
				<DateInput
					id="dateOfBirth"
					value={child.dateOfBirth}
					onChange={(e) => handleDobChange(e.target.value)}
					maxDate={formatLocalDate(timezone)}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="ageGroup">Age group</Label>
				<Select
					value={child.ageGroup}
					onValueChange={(v) => {
						const parsed = AGE_GROUPS.includes(v as AgeGroup) ? (v as AgeGroup) : null;
						if (parsed) onChange({ ...child, ageGroup: parsed });
					}}
				>
					<SelectTrigger id="ageGroup">
						<SelectValue placeholder="Select age group" />
					</SelectTrigger>
					<SelectContent>
						{AGE_GROUPS.map((ag) => (
							<SelectItem key={ag} value={ag}>
								{AGE_GROUP_LABELS[ag]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{suggestedAgeGroupLabel && (
					<button
						type="button"
						aria-label={`Apply suggested age group: ${suggestedAgeGroupLabel}`}
						className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
						onClick={() => suggestedAgeGroup && onChange({ ...child, ageGroup: suggestedAgeGroup })}
					>
						<span aria-hidden="true">✦</span>
						Suggested based on date of birth: {suggestedAgeGroupLabel}
					</button>
				)}
			</div>

			<div className="space-y-2">
				<Label htmlFor="enrollmentStatus">Enrollment status</Label>
				<Select
					value={child.enrollmentStatus}
					onValueChange={(v) =>
						onChange({ ...child, enrollmentStatus: v as "active" | "waitlist" })
					}
				>
					<SelectTrigger id="enrollmentStatus">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="waitlist">Waitlist</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="flex items-center gap-2 pt-1">
				<Checkbox
					id="subsidyEligible"
					checked={child.subsidyEligible}
					onCheckedChange={(c) => onChange({ ...child, subsidyEligible: c === true })}
				/>
				<Label htmlFor="subsidyEligible" className="cursor-pointer">
					Subsidy eligible
				</Label>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 2 - Guardians
// ---------------------------------------------------------------------------

function emptyGuardianForm(): WizardGuardian {
	return {
		_rowId: crypto.randomUUID(),
		type: "new",
		firstName: "",
		lastName: "",
		email: "",
		phone: "",
		relationship: "",
		isPrimary: false,
		authorizedPickup: true,
	};
}

function GuardianInlineForm({
	guardian,
	onChange,
	onSave,
	onCancel,
}: {
	guardian: WizardGuardian;
	onChange: (g: WizardGuardian) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	const parsedGuardian = createGuardianSchema.safeParse({
		firstName: guardian.firstName.trim(),
		lastName: guardian.lastName.trim(),
		email: guardian.email.trim() || undefined,
		phone: guardian.phone.trim() || undefined,
	});
	const fieldErrors = {
		email: parsedGuardian.success
			? undefined
			: parsedGuardian.error.issues.find((issue) => issue.path[0] === "email")
				? "Enter a valid email address."
				: undefined,
		phone: parsedGuardian.success
			? undefined
			: parsedGuardian.error.issues.find((issue) => issue.path[0] === "phone")
				? "Enter a valid phone number."
				: undefined,
	};
	const isValid = parsedGuardian.success;

	return (
		<Card className="border-border bg-muted/30">
			<CardContent className="pt-4 space-y-3">
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="g-firstName">First name</Label>
						<Input
							id="g-firstName"
							value={guardian.firstName}
							onChange={(e) => onChange({ ...guardian, firstName: e.target.value })}
							placeholder="First name"
						/>
					</div>
					<div className="space-y-1">
						<Label htmlFor="g-lastName">Last name</Label>
						<Input
							id="g-lastName"
							value={guardian.lastName}
							onChange={(e) => onChange({ ...guardian, lastName: e.target.value })}
							placeholder="Last name"
						/>
					</div>
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<div className="space-y-1">
						<Label htmlFor="g-email">Email</Label>
						<Input
							id="g-email"
							type="email"
							value={guardian.email}
							onChange={(e) => onChange({ ...guardian, email: e.target.value })}
							placeholder="Email"
						/>
						{fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
					</div>
					<div className="space-y-1">
						<Label htmlFor="g-phone">Phone</Label>
						<Input
							id="g-phone"
							type="tel"
							value={guardian.phone}
							onChange={(e) => onChange({ ...guardian, phone: e.target.value })}
							placeholder="Phone"
						/>
						{fieldErrors.phone && <p className="text-xs text-destructive">{fieldErrors.phone}</p>}
					</div>
				</div>
				<div className="space-y-1">
					<Label htmlFor="g-relationship">Relationship (optional)</Label>
					<Input
						id="g-relationship"
						value={guardian.relationship}
						onChange={(e) => onChange({ ...guardian, relationship: e.target.value })}
						placeholder="e.g. Mother, Father, Grandparent"
					/>
				</div>
				<div className="flex items-center gap-6 pt-1">
					<div className="flex items-center gap-2">
						<Checkbox
							id="g-isPrimary"
							checked={guardian.isPrimary}
							onCheckedChange={(c) => onChange({ ...guardian, isPrimary: c === true })}
						/>
						<Label htmlFor="g-isPrimary" className="cursor-pointer text-sm">
							Primary contact
						</Label>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="g-authorizedPickup"
							checked={guardian.authorizedPickup}
							onCheckedChange={(c) => onChange({ ...guardian, authorizedPickup: c === true })}
						/>
						<Label htmlFor="g-authorizedPickup" className="cursor-pointer text-sm">
							Authorized pickup
						</Label>
					</div>
				</div>
				<div className="flex gap-2 pt-2">
					<Button size="sm" onClick={onSave} disabled={!isValid}>
						Save
					</Button>
					<Button size="sm" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

function LinkExistingGuardianForm({
	onAdd,
	onAddNewGuardian,
	onCancel,
}: {
	onAdd: (g: WizardGuardian) => void;
	onAddNewGuardian: () => void;
	onCancel: () => void;
}) {
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Guardian | null>(null);
	const [isPrimary, setIsPrimary] = useState(false);
	const [authorizedPickup, setAuthorizedPickup] = useState(true);
	const [relationship, setRelationship] = useState("");

	const { data: guardians, isLoading } = useGuardians(search || undefined);
	const availableGuardians = guardians ?? [];
	const showEmptyState = !isLoading && availableGuardians.length === 0 && !search && !selected;

	const handleSelect = (g: Guardian) => {
		setSelected(g);
	};

	const handleAdd = () => {
		/* c8 ignore next */ // button is disabled when nothing is selected — not reachable via the UI
		if (!selected) return;
		onAdd({
			_rowId: crypto.randomUUID(),
			type: "existing",
			guardianId: selected.id,
			firstName: selected.firstName,
			lastName: selected.lastName,
			email: selected.email ?? "",
			phone: selected.phone ?? "",
			relationship,
			isPrimary,
			authorizedPickup,
		});
	};

	return (
		<Card className="border-border bg-muted/30">
			<CardContent className="pt-4 space-y-3">
				{showEmptyState ? (
					<div className="space-y-3 rounded-lg border border-dashed border-border bg-background p-4">
						<p className="text-sm font-medium text-foreground">
							No saved guardians are available to link.
						</p>
						<p className="text-sm text-muted-foreground">
							Add this child's first guardian here, then you can link saved guardians later.
						</p>
						<div>
							<Button size="sm" variant="outline" onClick={onAddNewGuardian}>
								Add a new guardian instead
							</Button>
						</div>
					</div>
				) : (
					<>
						<div className="space-y-1">
							<Label htmlFor="guardian-search">Search guardians</Label>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									id="guardian-search"
									value={search}
									onChange={(e) => {
										setSearch(e.target.value);
										setSelected(null);
									}}
									placeholder="Search by name..."
									className="pl-9"
								/>
							</div>
						</div>

						{search && !selected && (
							<div className="max-h-40 overflow-y-auto rounded border border-border bg-background">
								{isLoading ? (
									<div className="p-3 space-y-2">
										<Skeleton className="h-4 w-40" />
										<Skeleton className="h-4 w-32" />
									</div>
								) : availableGuardians.length === 0 ? (
									<div className="space-y-3 p-3">
										<p className="text-sm text-muted-foreground">No guardians match that search.</p>
										<Button size="sm" variant="outline" onClick={onAddNewGuardian}>
											Add a new guardian instead
										</Button>
									</div>
								) : (
									availableGuardians.map((g) => (
										<button
											key={g.id}
											type="button"
											className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
											onClick={() => handleSelect(g)}
										>
											<span className="font-medium">
												{g.firstName} {g.lastName}
											</span>
											{g.email && <span className="ml-2 text-muted-foreground">{g.email}</span>}
										</button>
									))
								)}
							</div>
						)}
					</>
				)}

				{selected && (
					<>
						<div className="rounded border border-border bg-background px-3 py-2">
							<p className="text-sm font-medium">
								{selected.firstName} {selected.lastName}
							</p>
							{selected.email && <p className="text-xs text-muted-foreground">{selected.email}</p>}
							{selected.phone && <p className="text-xs text-muted-foreground">{selected.phone}</p>}
						</div>
						<div className="space-y-1">
							<Label htmlFor="link-relationship">Relationship (optional)</Label>
							<Input
								id="link-relationship"
								value={relationship}
								onChange={(e) => setRelationship(e.target.value)}
								placeholder="e.g. Mother, Father"
							/>
						</div>
						<div className="flex items-center gap-6 pt-1">
							<div className="flex items-center gap-2">
								<Checkbox
									id="link-isPrimary"
									checked={isPrimary}
									onCheckedChange={(c) => setIsPrimary(c === true)}
								/>
								<Label htmlFor="link-isPrimary" className="cursor-pointer text-sm">
									Primary contact
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<Checkbox
									id="link-authorizedPickup"
									checked={authorizedPickup}
									onCheckedChange={(c) => setAuthorizedPickup(c === true)}
								/>
								<Label htmlFor="link-authorizedPickup" className="cursor-pointer text-sm">
									Authorized pickup
								</Label>
							</div>
						</div>
					</>
				)}

				{!showEmptyState && (
					<div className="flex gap-2 pt-2">
						<Button size="sm" onClick={handleAdd} disabled={!selected}>
							Add Guardian
						</Button>
						<Button size="sm" variant="ghost" onClick={onCancel}>
							Cancel
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export function GuardianCard({
	guardian,
	onEdit,
	onRemove,
}: {
	guardian: WizardGuardian;
	onEdit: () => void;
	onRemove: () => void;
}) {
	return (
		<Card>
			<CardContent className="pt-4">
				<div className="flex items-start justify-between">
					<div>
						<p className="font-medium text-foreground">
							{guardian.firstName} {guardian.lastName}
						</p>
						{guardian.email && <p className="text-sm text-muted-foreground">{guardian.email}</p>}
						{guardian.phone && (
							<p className="text-sm text-muted-foreground">{formatPhoneNumber(guardian.phone)}</p>
						)}
						{guardian.relationship && (
							<p className="mt-0.5 text-xs text-muted-foreground">{guardian.relationship}</p>
						)}
						<div className="mt-2 flex gap-2">
							{guardian.isPrimary && <StatusBadge status="primary" label="Primary" />}
							{guardian.authorizedPickup && (
								<StatusBadge status="authorized" label="Authorized Pickup" />
							)}
						</div>
					</div>
					<div className="flex gap-1">
						<Button
							size="sm"
							variant="ghost"
							onClick={onEdit}
							aria-label={`Edit ${guardian.firstName} ${guardian.lastName}`}
						>
							<Pencil aria-hidden="true" className="h-4 w-4" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={onRemove}
							aria-label={`Remove ${guardian.firstName} ${guardian.lastName}`}
						>
							<Trash2 aria-hidden="true" className="h-4 w-4 text-destructive" />
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function StepGuardians({
	guardians,
	onChange,
}: {
	guardians: WizardGuardian[];
	onChange: (guardians: WizardGuardian[]) => void;
}) {
	const [showNewForm, setShowNewForm] = useState(false);
	const [showLinkForm, setShowLinkForm] = useState(false);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [formData, setFormData] = useState<WizardGuardian>(emptyGuardianForm());

	const handleSaveNew = () => {
		onChange([...guardians, formData]);
		setFormData(emptyGuardianForm());
		setShowNewForm(false);
	};

	const handleSaveEdit = () => {
		/* c8 ignore next */ // editingIndex is always set before this form renders — not reachable via the UI
		if (editingIndex === null) return;
		const updated = [...guardians];
		updated[editingIndex] = formData;
		onChange(updated);
		setEditingIndex(null);
		setFormData(emptyGuardianForm());
	};

	const handleRemove = (index: number) => {
		onChange(guardians.filter((_, i) => i !== index));
	};

	const handleStartEdit = (index: number) => {
		setEditingIndex(index);
		setFormData({ ...guardians[index] });
		setShowNewForm(false);
		setShowLinkForm(false);
	};

	const handleLinkAdd = (g: WizardGuardian) => {
		onChange([...guardians, g]);
		setShowLinkForm(false);
	};

	return (
		<div className="space-y-4">
			{guardians.length === 0 && !showNewForm && !showLinkForm && (
				<EmptyState
					tone="people"
					align="left"
					title="A guardian is required to continue"
					description="Guardians handle pickup authorization, billing, and emergency contact. Add one to this child's record before proceeding."
					action={
						<Button
							className="mt-4"
							onClick={() => {
								setFormData(emptyGuardianForm());
								setShowNewForm(true);
							}}
						>
							Add new guardian
						</Button>
					}
					secondaryAction={
						<Button variant="outline" onClick={() => setShowLinkForm(true)}>
							<Link className="mr-1.5 h-4 w-4" />
							Link existing guardian
						</Button>
					}
				/>
			)}

			{guardians.map((g, i) => {
				return editingIndex === i ? (
					<GuardianInlineForm
						key={`edit-${g._rowId}`}
						guardian={formData}
						onChange={setFormData}
						onSave={handleSaveEdit}
						onCancel={() => {
							setEditingIndex(null);
							setFormData(emptyGuardianForm());
						}}
					/>
				) : (
					<GuardianCard
						key={`card-${g._rowId}`}
						guardian={g}
						onEdit={() => handleStartEdit(i)}
						onRemove={() => handleRemove(i)}
					/>
				);
			})}

			{showNewForm && (
				<GuardianInlineForm
					guardian={formData}
					onChange={setFormData}
					onSave={handleSaveNew}
					onCancel={() => {
						setShowNewForm(false);
						setFormData(emptyGuardianForm());
					}}
				/>
			)}

			{showLinkForm && (
				<LinkExistingGuardianForm
					onAdd={handleLinkAdd}
					onAddNewGuardian={() => {
						setShowLinkForm(false);
						setFormData(emptyGuardianForm());
						setShowNewForm(true);
					}}
					onCancel={() => setShowLinkForm(false)}
				/>
			)}

			{!showNewForm && !showLinkForm && editingIndex === null && guardians.length > 0 && (
				<div className="flex gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							setFormData(emptyGuardianForm());
							setShowNewForm(true);
						}}
					>
						<Plus className="mr-1.5 h-4 w-4" />
						Add New Guardian
					</Button>
					<Button variant="outline" size="sm" onClick={() => setShowLinkForm(true)}>
						<Link className="mr-1.5 h-4 w-4" />
						Link Existing Guardian
					</Button>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 3 - Classroom Assignment
// ---------------------------------------------------------------------------

function StepClassroom({
	child,
	classroom,
	timezone,
	onChange,
	onMarkWaitlist,
	onSetUpClassrooms,
}: {
	child: WizardState["child"];
	classroom: WizardState["classroom"];
	timezone: string;
	onChange: (classroom: WizardState["classroom"]) => void;
	onMarkWaitlist: () => void;
	onSetUpClassrooms: () => void;
}) {
	// child.ageGroup is required to reach step 3 via the normal wizard flow
	/* c8 ignore next */
	const classroomAgeGroupFilter = child.ageGroup || undefined;
	const { data: classrooms, isLoading } = useClassrooms({
		ageGroup: classroomAgeGroupFilter,
	});
	// child.ageGroup is always set here — the "matching" fallback is a defensive default
	/* c8 ignore next */
	const ageGroupLabel = child.ageGroup ? AGE_GROUP_LABELS[child.ageGroup] : "matching";
	const availableClassrooms =
		classrooms?.filter((c) => !c.archivedAt && c.childCount < c.maxCapacity) ?? [];
	// child.firstName is required to reach step 3 via the normal wizard flow
	/* c8 ignore next */
	const childFirstNameDisplay = child.firstName || "this child";

	return (
		<div className="space-y-4">
			<div className="space-y-1 text-sm text-muted-foreground">
				<p>
					Pick a room for <span className="font-medium">{childFirstNameDisplay}</span>.
				</p>
				<p>Showing {ageGroupLabel} rooms with open space.</p>
			</div>

			{child.enrollmentStatus === "waitlist" && (
				<div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
					<Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
					<p className="text-sm text-foreground">You can skip this step for waitlisted children.</p>
				</div>
			)}

			{isLoading ? (
				<div className="space-y-3">
					{["skel-a", "skel-b", "skel-c"].map((key) => (
						<Skeleton key={key} className="h-24 w-full rounded-lg" />
					))}
				</div>
			) : availableClassrooms.length === 0 ? (
				child.enrollmentStatus === "waitlist" ? (
					<p className="py-6 text-center text-sm text-muted-foreground">
						No classrooms available for this age group.
					</p>
				) : (
					<div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-5 text-center">
						<p className="text-sm font-medium text-foreground">
							No classrooms available for this age group.
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
							Mark this child as waitlisted to finish enrollment now, or set up a classroom first.
						</p>
						<div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
							<Button type="button" variant="secondary" onClick={onMarkWaitlist}>
								Mark child as waitlist
							</Button>
							<Button type="button" variant="outline" onClick={onSetUpClassrooms}>
								Set up classrooms
							</Button>
						</div>
					</div>
				)
			) : (
				<div className="space-y-3">
					{availableClassrooms.map((c) => {
						const isSelected = classroom?.classroomId === c.id;
						const ratio = `${c.minRatioStaff}:${c.minRatioChildren}`;
						const openSlots = Math.max(c.maxCapacity - c.childCount, 0);
						return (
							<button
								key={c.id}
								type="button"
								className={`w-full rounded-lg border-2 p-4 text-left transition-all hover:shadow-md motion-safe:hover:scale-[1.01] ${
									isSelected
										? "border-primary bg-primary/5 ring-2 ring-primary"
										: "border-border hover:border-primary/40 hover:bg-muted/20"
								}`}
								onClick={() =>
									onChange(
										isSelected
											? null
											: {
													classroomId: c.id,
													effectiveDate: classroom?.effectiveDate || todayISO(timezone),
												},
									)
								}
							>
								<div className="flex items-start justify-between">
									<div>
										<p className="font-medium text-foreground">{c.name}</p>
										<p className="mt-0.5 text-sm text-muted-foreground">
											Ratio {ratio} · {c.staffCount} staff
										</p>
										<p className="mt-1 text-sm font-medium text-foreground">
											{openSlots} open slot{openSlots === 1 ? "" : "s"}
										</p>
									</div>
									{isSelected && (
										<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
											<Check className="h-3.5 w-3.5 text-primary-foreground" />
										</div>
									)}
								</div>
								<CapacityBar current={c.childCount} max={c.maxCapacity} className="mt-3" />
							</button>
						);
					})}
				</div>
			)}

			<div className="space-y-2 pt-2">
				<Label htmlFor="effectiveDate">Effective date</Label>
				<DateInput
					id="effectiveDate"
					value={classroom?.effectiveDate ?? todayISO(timezone)}
					onChange={(e) =>
						onChange(classroom ? { ...classroom, effectiveDate: e.target.value } : null)
					}
					disabled={!classroom}
				/>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Step 4 - Review & Confirm
// ---------------------------------------------------------------------------

function StepReview({
	state,
	onGoToStep,
}: {
	state: WizardState;
	onGoToStep: (step: 1 | 2 | 3) => void;
}) {
	// state.child.ageGroup is required to reach step 4 via the normal wizard flow
	/* c8 ignore next */
	const { data: classrooms } = useClassrooms({
		ageGroup: state.child.ageGroup || undefined,
	});
	const selectedClassroom = classrooms?.find((c) => c.id === state.classroom?.classroomId);

	return (
		<div className="space-y-4">
			{/* Child summary */}
			<Card>
				<CardContent className="pt-4">
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-semibold text-foreground">Child</h3>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onGoToStep(1)}
							className="text-muted-foreground hover:text-foreground"
						>
							<Pencil className="mr-1 h-3.5 w-3.5" />
							Edit
						</Button>
					</div>
					<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
						<div>
							<dt className="text-muted-foreground">Name</dt>
							<dd className="font-medium">
								{state.child.firstName} {state.child.lastName}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Date of birth</dt>
							<dd className="font-medium">{state.child.dateOfBirth}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Age group</dt>
							<dd className="font-medium">
								{/* c8 ignore next -- ageGroup is required to reach step 4 */}
								{state.child.ageGroup ? AGE_GROUP_LABELS[state.child.ageGroup] : "Not selected"}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">Status</dt>
							<dd>
								<StatusBadge status={state.child.enrollmentStatus} />
							</dd>
						</div>
						{state.child.subsidyEligible && (
							<div className="col-span-2">
								<dt className="text-muted-foreground">Subsidy</dt>
								<dd className="font-medium">Eligible</dd>
							</div>
						)}
					</dl>
				</CardContent>
			</Card>

			{/* Guardians summary */}
			<Card>
				<CardContent className="pt-4">
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-semibold text-foreground">
							Guardian{state.guardians.length !== 1 ? "s" : ""}
						</h3>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onGoToStep(2)}
							className="text-muted-foreground hover:text-foreground"
						>
							<Pencil className="mr-1 h-3.5 w-3.5" />
							Edit
						</Button>
					</div>
					<div className="space-y-3">
						{state.guardians.map((g, i) => (
							<div key={`review-g-${g._rowId}`}>
								{i > 0 && <Separator className="mb-3" />}
								<div className="text-sm">
									<p className="font-medium">
										{g.firstName} {g.lastName}
										{g.type === "existing" && (
											<span className="ml-1.5 text-xs text-muted-foreground">(existing)</span>
										)}
									</p>
									{g.relationship && <p className="text-muted-foreground">{g.relationship}</p>}
									{g.email && <p className="text-muted-foreground">{g.email}</p>}
									{g.phone && <p className="text-muted-foreground">{formatPhoneNumber(g.phone)}</p>}
									<div className="mt-1 flex gap-2">
										{g.isPrimary && <StatusBadge status="primary" label="Primary" />}
										{g.authorizedPickup && (
											<StatusBadge status="authorized" label="Authorized Pickup" />
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Classroom summary */}
			<Card>
				<CardContent className="pt-4">
					<div className="flex items-center justify-between mb-3">
						<h3 className="font-semibold text-foreground">Classroom</h3>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onGoToStep(3)}
							className="text-muted-foreground hover:text-foreground"
						>
							<Pencil className="mr-1 h-3.5 w-3.5" />
							Edit
						</Button>
					</div>
					{selectedClassroom ? (
						<div className="text-sm">
							<p className="font-medium">{selectedClassroom.name}</p>
							<p className="text-muted-foreground">Effective {state.classroom?.effectiveDate}</p>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No classroom assigned</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EnrollPage() {
	const navigate = useNavigate();
	const enrollChild = useEnrollChild();
	const { data: session } = useAuthSession();
	const draftStorageKey = getDraftStorageKey(session);

	const enrollmentStartTrackedRef = useRef(false);
	useEffect(() => {
		if (enrollmentStartTrackedRef.current) {
			return;
		}
		enrollmentStartTrackedRef.current = true;
		track(ANALYTICS_EVENTS.enrollmentStarted);
	}, []);

	const [state, setState] = useState<WizardState>(() => readDraftState(draftStorageKey));
	const { data: classrooms } = useClassrooms({
		ageGroup: state.child.ageGroup || undefined,
	});

	const [error, setError] = useState<string | null>(null);

	const hydratedKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (!draftStorageKey || hydratedKeyRef.current === draftStorageKey) {
			return;
		}
		hydratedKeyRef.current = draftStorageKey;
		const draft = readDraftState(draftStorageKey);
		if (hasWizardProgress(draft)) {
			setState(draft);
		}
	}, [draftStorageKey]);

	useEffect(() => {
		if (hasWizardProgress(state)) {
			persistDraftState(state, draftStorageKey);
			return;
		}

		clearDraftState(draftStorageKey);
	}, [draftStorageKey, state]);

	const hasValidClassroomSelection =
		state.classroom !== null &&
		(classrooms?.some(
			(classroom) => !classroom.archivedAt && classroom.id === state.classroom?.classroomId,
		) ??
			false);

	useEffect(() => {
		if (state.child.enrollmentStatus !== "waitlist" || state.classroom === null) {
			return;
		}

		setState((prev) => ({
			...prev,
			classroom: null,
		}));
	}, [state.child.enrollmentStatus, state.classroom]);

	useEffect(() => {
		if (state.classroom === null || state.child.enrollmentStatus === "waitlist" || !classrooms) {
			return;
		}

		const selectionStillExists = classrooms.some(
			(classroom) => !classroom.archivedAt && classroom.id === state.classroom?.classroomId,
		);

		if (!selectionStillExists) {
			setState((prev) => ({
				...prev,
				classroom: null,
				step: prev.step === 4 ? 3 : prev.step,
			}));
		}
	}, [classrooms, state.child.enrollmentStatus, state.classroom]);

	const setStep = useCallback((step: 1 | 2 | 3 | 4) => {
		setState((prev) => ({ ...prev, step }));
	}, []);

	const canProceedStep1 =
		state.child.firstName.trim() !== "" &&
		state.child.lastName.trim() !== "" &&
		state.child.dateOfBirth !== "" &&
		state.child.ageGroup !== "";

	const canProceedStep2 = state.guardians.length >= 1;
	const canProceedStep3 = state.child.enrollmentStatus === "waitlist" || hasValidClassroomSelection;

	const handleNext = () => {
		if (state.step === 1 && canProceedStep1) setStep(2);
		else if (state.step === 2 && canProceedStep2) setStep(3);
		else if (state.step === 3 && canProceedStep3) setStep(4);
		/* c8 ignore next */ // Next button is disabled when step conditions are not met — no-op path unreachable via UI
	};

	const handleBack = () => {
		if (state.step === 2) setStep(1);
		else if (state.step === 3) setStep(2);
		else if (state.step === 4) setStep(3);
		/* c8 ignore next */ // Back button is only shown on steps 2–4 — no-op path unreachable via UI
	};

	const handleCancel = () => {
		clearDraftState(draftStorageKey);
		navigate({ to: "/children" });
	};

	const handleSubmit = async () => {
		setError(null);
		let enrolledChildId: string | null = null;
		try {
			/* c8 ignore next */ // canProceedStep1 gate prevents reaching step 4 without an age group
			if (!state.child.ageGroup) {
				/* c8 ignore next */
				throw new Error("Select an age group before finishing enrollment");
			}

			const payload = {
				child: {
					...state.child,
					ageGroup: state.child.ageGroup,
				},
				guardians: state.guardians.map((g) => {
					if (g.type === "existing") {
						return {
							type: "existing" as const,
							guardianId: g.guardianId as string,
							isPrimary: g.isPrimary,
							authorizedPickup: g.authorizedPickup,
							relationship: g.relationship || undefined,
						};
					}
					return {
						type: "new" as const,
						firstName: g.firstName,
						lastName: g.lastName,
						email: g.email || undefined,
						phone: g.phone || undefined,
						isPrimary: g.isPrimary,
						authorizedPickup: g.authorizedPickup,
						relationship: g.relationship || undefined,
					};
				}),
				classroom: state.classroom ?? undefined,
			};

			const result = await enrollChild.mutateAsync(payload);
			enrolledChildId = result.child.id;
			clearDraftState(draftStorageKey);
		} catch (err: unknown) {
			const message = extractErrorMessage(err, "Failed to enroll child");
			// If enrollment succeeded but post-create work failed, direct the user to their record.
			if (enrolledChildId) {
				setError(
					`Enrollment succeeded but a follow-up step failed. View the child at /children/${enrolledChildId}.`,
				);
			} else {
				setError(message);
			}
			return;
		}
		// enrolledChildId is guaranteed non-null here: catch block returns early, so we only
		// reach this point if enrollment succeeded and enrolledChildId was set.
		if (!enrolledChildId) return;
		toast.success("Child enrolled successfully.");
		navigate({
			to: "/children/$id",
			params: { id: enrolledChildId },
		});
	};

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold text-foreground">Enroll Child</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Complete each step to enroll a new child.
				</p>
			</div>

			<PageHelpPanel route="/children/enroll" />

			<StepperBar currentStep={state.step} />

			<div className="mx-auto max-w-lg">
				{state.step === 1 && (
					<StepChildDetails
						child={state.child}
						timezone={session?.center.timezone ?? "UTC"}
						onChange={(child) => setState((prev) => ({ ...prev, child }))}
					/>
				)}

				{state.step === 2 && (
					<StepGuardians
						guardians={state.guardians}
						onChange={(guardians) => setState((prev) => ({ ...prev, guardians }))}
					/>
				)}

				{state.step === 3 && (
					<StepClassroom
						child={state.child}
						classroom={state.classroom}
						timezone={session?.center.timezone ?? "UTC"}
						onChange={(classroom) => setState((prev) => ({ ...prev, classroom }))}
						onMarkWaitlist={() =>
							setState((prev) => ({
								...prev,
								child: { ...prev.child, enrollmentStatus: "waitlist" },
								classroom: null,
							}))
						}
						onSetUpClassrooms={() => navigate({ to: "/classrooms" })}
					/>
				)}

				{state.step === 4 && <StepReview state={state} onGoToStep={setStep} />}

				{error && (
					<div
						role="alert"
						className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					>
						{error}
					</div>
				)}

				<Separator className="my-6" />

				{/* Footer */}
				<div className="flex items-center justify-between">
					<div>
						{state.step === 1 ? (
							<Button variant="ghost" onClick={handleCancel}>
								Cancel
							</Button>
						) : (
							<Button variant="ghost" onClick={handleBack}>
								<ArrowLeft className="mr-1.5 h-4 w-4" />
								Back
							</Button>
						)}
					</div>
					<div>
						{state.step < 4 ? (
							<Button
								onClick={handleNext}
								disabled={
									(state.step === 1 && !canProceedStep1) ||
									(state.step === 2 && !canProceedStep2) ||
									(state.step === 3 && !canProceedStep3)
								}
							>
								Next: {STEP_LABELS[state.step as 1 | 2 | 3]}
								<ChevronRight className="ml-1.5 h-4 w-4" />
							</Button>
						) : (
							<Button onClick={handleSubmit} disabled={enrollChild.isPending}>
								{enrollChild.isPending ? (
									"Enrolling..."
								) : (
									<>
										<Check className="mr-1.5 h-4 w-4" />
										Enroll Child
									</>
								)}
							</Button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
