import type { AuditAction } from "../constants/enums.js";
import type { AuditLogDiff } from "./reports.js";

export interface AuditLog {
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
