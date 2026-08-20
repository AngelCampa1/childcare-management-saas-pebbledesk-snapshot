export const ROLES = ["owner", "director", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
	"check-in:create",
	"check-in:read-own-room",
	"ratios:read-own-room",
	"ratios:read-all",
	"children:manage",
	"guardians:manage",
	"classrooms:manage",
	"messages:send-own-room",
	"messages:send-all",
	"schedules:manage",
	"subsidies:read",
	"subsidies:manage",
	"reports:generate",
	"audit-log:read",
	"invoices:manage",
	"payments:manage",
	"members:invite",
	"members:remove",
	"center:settings",
	"quickbooks:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER_PERMISSIONS: Permission[] = [...PERMISSIONS];

const DIRECTOR_PERMISSIONS: Permission[] = [
	"check-in:create",
	"check-in:read-own-room",
	"ratios:read-own-room",
	"ratios:read-all",
	"children:manage",
	"guardians:manage",
	"classrooms:manage",
	"messages:send-own-room",
	"messages:send-all",
	"schedules:manage",
	"subsidies:read",
	"subsidies:manage",
	"reports:generate",
	"audit-log:read",
	"invoices:manage",
	"payments:manage",
	"members:invite",
];

const STAFF_PERMISSIONS: Permission[] = [
	"check-in:create",
	"check-in:read-own-room",
	"ratios:read-own-room",
	"messages:send-own-room",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
	owner: OWNER_PERMISSIONS,
	director: DIRECTOR_PERMISSIONS,
	staff: STAFF_PERMISSIONS,
};

export function hasPermission(role: Role, permission: Permission): boolean {
	return ROLE_PERMISSIONS[role].includes(permission);
}
