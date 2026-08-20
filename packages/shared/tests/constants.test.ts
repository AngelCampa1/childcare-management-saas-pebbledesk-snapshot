import { describe, expect, it } from "vitest";
import {
	AGE_GROUPS,
	AUDIT_ACTIONS,
	CLAIM_STATUSES,
	ENROLLMENT_STATUSES,
	INVOICE_STATUSES,
	MESSAGE_TYPES,
	PAYMENT_METHODS,
	PAYMENT_PROVIDERS,
	PAYMENT_STATUSES,
	QB_ENTITY_TYPES,
	QB_RECONCILIATION_ORIGINS,
	QB_SYNC_DIRECTIONS,
	QB_SYNC_STATUSES,
	REPORT_TYPES,
	STRIPE_ACCOUNT_STATUSES,
	SUBSIDY_CASE_STATUSES,
	SUBSIDY_PROGRAMS,
	TIME_ENTRY_STATUSES,
} from "../src/constants/enums.js";
import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from "../src/constants/roles.js";
import {
	CENTER_TIMEZONE_OPTIONS,
	DEFAULT_CENTER_TIMEZONE,
	isSupportedCenterTimezone,
} from "../src/constants/timezones.js";

// ─── Roles ─────────────────────────────────────────────────────────────────

describe("ROLES", () => {
	it("has exactly 3 roles", () => {
		expect(ROLES).toHaveLength(3);
	});

	it("contains owner, director, staff", () => {
		expect(ROLES).toContain("owner");
		expect(ROLES).toContain("director");
		expect(ROLES).toContain("staff");
	});
});

describe("PERMISSIONS", () => {
	it("has 20 permissions", () => {
		expect(PERMISSIONS).toHaveLength(20);
	});

	it("contains key permissions", () => {
		expect(PERMISSIONS).toContain("check-in:create");
		expect(PERMISSIONS).toContain("center:settings");
		expect(PERMISSIONS).toContain("quickbooks:manage");
	});
});

describe("hasPermission", () => {
	// owner has all permissions
	it("owner has all permissions", () => {
		for (const permission of PERMISSIONS) {
			expect(hasPermission("owner", permission)).toBe(true);
		}
	});

	// director operational permissions
	it("director can create check-ins", () => {
		expect(hasPermission("director", "check-in:create")).toBe(true);
	});

	it("director can manage children", () => {
		expect(hasPermission("director", "children:manage")).toBe(true);
	});

	it("director can manage subsidies", () => {
		expect(hasPermission("director", "subsidies:manage")).toBe(true);
	});

	it("director can invite members", () => {
		expect(hasPermission("director", "members:invite")).toBe(true);
	});

	it("director cannot access center settings", () => {
		expect(hasPermission("director", "center:settings")).toBe(false);
	});

	it("director cannot manage QuickBooks", () => {
		expect(hasPermission("director", "quickbooks:manage")).toBe(false);
	});

	it("director cannot remove members", () => {
		expect(hasPermission("director", "members:remove")).toBe(false);
	});

	it("director can read audit log", () => {
		expect(hasPermission("director", "audit-log:read")).toBe(true);
	});

	// staff limited permissions
	it("staff can create check-ins", () => {
		expect(hasPermission("staff", "check-in:create")).toBe(true);
	});

	it("staff can read own room ratios", () => {
		expect(hasPermission("staff", "ratios:read-own-room")).toBe(true);
	});

	it("staff can send messages to own room", () => {
		expect(hasPermission("staff", "messages:send-own-room")).toBe(true);
	});

	it("staff cannot manage children", () => {
		expect(hasPermission("staff", "children:manage")).toBe(false);
	});

	it("staff cannot manage schedules", () => {
		expect(hasPermission("staff", "schedules:manage")).toBe(false);
	});

	it("staff cannot read all ratios", () => {
		expect(hasPermission("staff", "ratios:read-all")).toBe(false);
	});

	it("staff cannot send messages to all", () => {
		expect(hasPermission("staff", "messages:send-all")).toBe(false);
	});

	it("staff cannot manage subsidies", () => {
		expect(hasPermission("staff", "subsidies:manage")).toBe(false);
	});
});

describe("ROLE_PERMISSIONS", () => {
	it("owner has more permissions than director", () => {
		expect(ROLE_PERMISSIONS.owner.length).toBeGreaterThan(ROLE_PERMISSIONS.director.length);
	});

	it("director has more permissions than staff", () => {
		expect(ROLE_PERMISSIONS.director.length).toBeGreaterThan(ROLE_PERMISSIONS.staff.length);
	});

	it("staff has exactly 4 permissions", () => {
		expect(ROLE_PERMISSIONS.staff).toHaveLength(4);
	});
});

// ─── Enums ─────────────────────────────────────────────────────────────────

describe("AGE_GROUPS", () => {
	it("has 6 entries", () => {
		expect(AGE_GROUPS).toHaveLength(6);
	});

	it("contains expected values", () => {
		expect(AGE_GROUPS).toContain("infant");
		expect(AGE_GROUPS).toContain("young_toddler");
		expect(AGE_GROUPS).toContain("toddler");
		expect(AGE_GROUPS).toContain("preschool");
		expect(AGE_GROUPS).toContain("pre_k");
		expect(AGE_GROUPS).toContain("school_age");
	});
});

describe("ENROLLMENT_STATUSES", () => {
	it("has 4 entries", () => {
		expect(ENROLLMENT_STATUSES).toHaveLength(4);
	});

	it("contains active", () => {
		expect(ENROLLMENT_STATUSES).toContain("active");
	});
});

describe("SUBSIDY_PROGRAMS", () => {
	it("has 5 entries", () => {
		expect(SUBSIDY_PROGRAMS).toHaveLength(5);
	});

	it("contains the db-backed program values", () => {
		expect(SUBSIDY_PROGRAMS).toContain("ccdf");
		expect(SUBSIDY_PROGRAMS).toContain("head_start");
		expect(SUBSIDY_PROGRAMS).toContain("early_head_start");
		expect(SUBSIDY_PROGRAMS).toContain("state_pre_k");
	});
});

describe("SUBSIDY_CASE_STATUSES", () => {
	it("has 4 entries", () => {
		expect(SUBSIDY_CASE_STATUSES).toHaveLength(4);
	});

	it("contains active, pending, expired, terminated", () => {
		expect(SUBSIDY_CASE_STATUSES).toContain("active");
		expect(SUBSIDY_CASE_STATUSES).toContain("pending");
		expect(SUBSIDY_CASE_STATUSES).toContain("expired");
		expect(SUBSIDY_CASE_STATUSES).toContain("terminated");
	});
});

describe("CLAIM_STATUSES", () => {
	it("has 5 entries", () => {
		expect(CLAIM_STATUSES).toHaveLength(5);
	});

	it("contains the db-backed claim statuses", () => {
		expect(CLAIM_STATUSES).toContain("draft");
		expect(CLAIM_STATUSES).toContain("submitted");
		expect(CLAIM_STATUSES).toContain("approved");
		expect(CLAIM_STATUSES).toContain("rejected");
		expect(CLAIM_STATUSES).toContain("paid");
	});
});

describe("INVOICE_STATUSES", () => {
	it("has 5 entries", () => {
		expect(INVOICE_STATUSES).toHaveLength(5);
	});
});

describe("PAYMENT_METHODS", () => {
	it("has 5 entries", () => {
		expect(PAYMENT_METHODS).toHaveLength(5);
	});
});

describe("PAYMENT_PROVIDERS", () => {
	it("has 3 entries", () => {
		expect(PAYMENT_PROVIDERS).toHaveLength(3);
	});

	it("contains manual, stripe, quickbooks", () => {
		expect(PAYMENT_PROVIDERS).toContain("manual");
		expect(PAYMENT_PROVIDERS).toContain("stripe");
		expect(PAYMENT_PROVIDERS).toContain("quickbooks");
	});
});

describe("STRIPE_ACCOUNT_STATUSES", () => {
	it("has 5 entries", () => {
		expect(STRIPE_ACCOUNT_STATUSES).toHaveLength(5);
	});

	it("contains the connected state values", () => {
		expect(STRIPE_ACCOUNT_STATUSES).toContain("not_connected");
		expect(STRIPE_ACCOUNT_STATUSES).toContain("connected");
		expect(STRIPE_ACCOUNT_STATUSES).toContain("restricted");
	});
});

describe("MESSAGE_TYPES", () => {
	it("has 3 entries", () => {
		expect(MESSAGE_TYPES).toHaveLength(3);
	});

	it("contains only outbound phase-5 message types", () => {
		expect(MESSAGE_TYPES).toEqual(["announcement", "direct", "alert"]);
	});
});

describe("REPORT_TYPES", () => {
	it("matches the compliance report catalog", () => {
		expect(REPORT_TYPES).toEqual(["attendance", "ratio", "subsidy", "licensing"]);
	});
});

describe("AUDIT_ACTIONS", () => {
	it("matches the persisted audit action catalog", () => {
		expect(AUDIT_ACTIONS).toEqual([
			"create",
			"update",
			"delete",
			"login",
			"logout",
			"export",
			"import",
		]);
	});

	it("contains create, update, delete", () => {
		expect(AUDIT_ACTIONS).toContain("create");
		expect(AUDIT_ACTIONS).toContain("update");
		expect(AUDIT_ACTIONS).toContain("delete");
	});
});

describe("TIME_ENTRY_STATUSES", () => {
	it("matches the scheduling workflow states", () => {
		expect(TIME_ENTRY_STATUSES).toEqual(["auto", "manual", "approved"]);
	});
});

describe("TIME_ENTRY_STATUSES", () => {
	it("has 3 entries", () => {
		expect(TIME_ENTRY_STATUSES).toHaveLength(3);
	});
});

describe("CENTER_TIMEZONE_OPTIONS", () => {
	it("includes the default center timezone as a visible option", () => {
		expect(CENTER_TIMEZONE_OPTIONS.some((option) => option.value === DEFAULT_CENTER_TIMEZONE)).toBe(
			true,
		);
	});
});

describe("isSupportedCenterTimezone", () => {
	it("returns true for a valid supported timezone", () => {
		expect(isSupportedCenterTimezone("America/Chicago")).toBe(true);
	});

	it("returns false for an unsupported timezone string", () => {
		expect(isSupportedCenterTimezone("Europe/London")).toBe(false);
	});
});

describe("QB_SYNC_DIRECTIONS", () => {
	it("has 2 entries", () => {
		expect(QB_SYNC_DIRECTIONS).toHaveLength(2);
	});
});

describe("PAYMENT_STATUSES", () => {
	it("has 2 entries", () => {
		expect(PAYMENT_STATUSES).toHaveLength(2);
	});

	it("contains posted and reversed", () => {
		expect(PAYMENT_STATUSES).toEqual(["posted", "reversed"]);
	});
});

describe("QB_SYNC_STATUSES", () => {
	it("has 4 entries", () => {
		expect(QB_SYNC_STATUSES).toHaveLength(4);
	});
});

describe("QB_ENTITY_TYPES", () => {
	it("has 3 entries", () => {
		expect(QB_ENTITY_TYPES).toHaveLength(3);
	});

	it("includes customer", () => {
		expect(QB_ENTITY_TYPES).toContain("customer");
	});
});

describe("QB_RECONCILIATION_ORIGINS", () => {
	it("has local and quickbooks origins", () => {
		expect(QB_RECONCILIATION_ORIGINS).toEqual(["local", "quickbooks"]);
	});
});
