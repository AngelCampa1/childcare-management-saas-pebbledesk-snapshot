import { isUuid } from "./is-uuid";

const ENTITY_DISPLAY_LABELS: Record<string, string> = {
	children: "Child",
	classrooms: "Classroom",
	"check-ins": "Check-in",
	"staff-check-ins": "Staff check-in",
	reports: "Report",
	// "ai-cs" must be mapped explicitly: the generic singularizer strips the
	// trailing "s" and would otherwise render the internal slug as "Ai c".
	"ai-cs": "AI support session",
};

const FIELD_LABELS: Record<string, string> = {
	ageGroup: "Age group",
	childId: "Child",
	classroomId: "Classroom",
	fileUrl: "File link",
	guardians: "Guardians",
	maxCapacity: "Capacity",
	minRatioChildren: "Minimum children",
	minRatioStaff: "Minimum staff",
	name: "Name",
	periodEnd: "Period end",
	periodStart: "Period start",
	reportType: "Report type",
};

function startCase(value: string): string {
	return value
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/[-_]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\b\w/g, (character) => character.toUpperCase());
}

function singularizeEntity(entityType: string): string {
	const normalized = entityType.trim().toLowerCase();
	if (!normalized) return "record";

	if (normalized.endsWith("ies")) {
		return `${normalized.slice(0, -3)}y`;
	}

	if (normalized.endsWith("s")) {
		return normalized.slice(0, -1);
	}

	return normalized;
}

function sentenceCase(value: string): string {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatAuditEntityLabel(entityType: string): string {
	const normalized = entityType.trim().toLowerCase();

	if (ENTITY_DISPLAY_LABELS[normalized]) {
		return ENTITY_DISPLAY_LABELS[normalized];
	}

	return sentenceCase(startCase(singularizeEntity(entityType)).toLowerCase());
}

const ACTION_LABELS: Record<string, string> = {
	approve: "approved",
	archive: "archived",
	assign: "assigned",
	create: "created",
	delete: "deleted",
	export: "exported",
	import: "imported",
	invite: "invited",
	link: "linked",
	login: "logged in",
	logout: "logged out",
	publish: "published",
	review: "reviewed",
	send: "sent",
	sync: "synced",
	unlink: "unlinked",
	update: "updated",
};

function toPastTense(verb: string): string {
	if (ACTION_LABELS[verb]) {
		return ACTION_LABELS[verb];
	}

	if (verb.endsWith("e")) {
		return `${verb}d`;
	}

	if (verb.endsWith("y")) {
		return `${verb.slice(0, -1)}ied`;
	}

	return `${verb}ed`;
}

function formatAuditAction(action: string): string {
	const normalized = action.trim().toLowerCase().replace(/[-_]+/g, " ");
	if (!normalized) {
		return "updated";
	}

	const words = normalized.split(/\s+/);
	if (words.length === 1) {
		return toPastTense(words[0] ?? normalized);
	}

	return normalized;
}

export function formatAuditHeadline(action: string, entityType: string): string {
	return `${formatAuditEntityLabel(entityType)} ${formatAuditAction(action)}`.trim();
}

interface AuditRecordLabelContext {
	entityId?: string | null;
	hasChanges?: boolean;
	action?: string | null;
}

export function formatAuditRecordLabel(input?: string | null | AuditRecordLabelContext): string {
	const context: AuditRecordLabelContext =
		typeof input === "string" || input === null || input === undefined
			? { entityId: input ?? undefined }
			: input;

	const normalized = context.entityId?.trim();
	const hasUsableId = Boolean(normalized && normalized.toLowerCase() !== "unknown");

	if (!hasUsableId) {
		// No id at all: the audit writer did not capture any snapshot metadata.
		return "No snapshot captured";
	}

	// A delete with no field changes means the record is gone.
	// Other mutations with no field changes (e.g. clock-out PATCH with no body)
	// fall through to show the entity reference — the record still exists.
	if (context.hasChanges === false && context.action === "delete") {
		return "Record removed after this entry was logged";
	}

	if (isUuid(normalized ?? "")) {
		return `Reference: ${(normalized ?? "").slice(0, 8)}`;
	}

	if (/\d/.test(normalized ?? "") || /[-_]/.test(normalized ?? "")) {
		return "Reference saved in system history";
	}

	return `Reference: ${normalized}`;
}

function formatAuditFieldName(field: string): string {
	return FIELD_LABELS[field] ?? startCase(field);
}

export function formatAuditChangedFields(changedFields?: string[]): string {
	if (!changedFields?.length) {
		return "No field-level details recorded";
	}

	return `Changed: ${changedFields.map(formatAuditFieldName).join(", ")}`;
}

export function formatAuditActor(userId?: string | null, userName?: string | null): string {
	if (userName?.trim()) return userName.trim();
	const normalized = userId?.trim();
	if (!normalized) return "System";
	if (isUuid(normalized)) return `User ${normalized.slice(0, 8)}`;
	return normalized;
}

export function formatAuditTimestamp(
	value?: string | null,
	now: Date = new Date(),
	timeZone?: string,
): string {
	if (!value) return "Unknown time";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Unknown time";
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.round(diffMs / 1000);
	if (diffSec < 45) return "just now";
	const diffMin = Math.round(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffHr = Math.round(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;
	const diffDay = Math.round(diffHr / 24);
	if (diffDay < 7) return `${diffDay}d ago`;
	// Render the calendar fallback in the center's timezone so the day does not
	// shift to the viewer's browser zone.
	return date.toLocaleDateString("en-US", {
		timeZone,
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatAuditAbsoluteTimestamp(value?: string | null, timeZone?: string): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	// Render in the center's timezone so the timestamp reflects the center's
	// local time rather than the viewer's browser zone.
	return date.toLocaleString("en-US", {
		timeZone,
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export type AuditActionTone = "success" | "destructive" | "neutral";

export function getAuditActionTone(action: string): AuditActionTone {
	const normalized = action.trim().toLowerCase();
	if (normalized === "create" || normalized === "import" || normalized === "approve") {
		return "success";
	}
	if (normalized === "delete" || normalized === "archive") {
		return "destructive";
	}
	return "neutral";
}
