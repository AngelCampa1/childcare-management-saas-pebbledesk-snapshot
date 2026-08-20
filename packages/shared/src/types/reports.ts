import type { AuditAction, ReportType } from "../constants/enums.js";

export interface ReportRecord {
	id: string;
	centerId: string;
	reportType: ReportType;
	periodStart: string;
	periodEnd: string;
	generatedBy: string;
	fileUrl?: string | null;
	fileName?: string | null;
	fileSizeBytes?: number | null;
	contentType?: string | null;
	generatedAt: string;
}

export interface AuditLogDiff {
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
	changedFields: string[];
}

export interface AuditLogRecord {
	id: string;
	centerId?: string | null;
	userId?: string | null;
	userName?: string | null;
	action: AuditAction;
	entityType: string;
	entityId: string;
	changes?: AuditLogDiff | null;
	ipAddress?: string | null;
	createdAt: string;
}
