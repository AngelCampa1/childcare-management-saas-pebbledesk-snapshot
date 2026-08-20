import { describe, expect, it } from "vitest";
import {
	formatAuditAbsoluteTimestamp,
	formatAuditActor,
	formatAuditChangedFields,
	formatAuditHeadline,
	formatAuditRecordLabel,
	formatAuditTimestamp,
	getAuditActionTone,
} from "./format-audit-log";

describe("formatAuditHeadline", () => {
	it("converts raw audit slugs into operator-friendly headlines", () => {
		expect(formatAuditHeadline("export", "reports")).toBe("Report exported");
		expect(formatAuditHeadline("update", "staff-check-ins")).toBe("Staff check-in updated");
		expect(formatAuditHeadline("create", "children")).toBe("Child created");
	});

	it("maps the ai-cs slug to a readable label instead of 'Ai c'", () => {
		// The hyphenated "ai-cs" entity must not be naively singularized (which
		// drops the "s" and yields "Ai c created"); it is a customer-facing label
		// in an audit log that big clients scrutinize.
		expect(formatAuditHeadline("create", "ai-cs")).toBe("AI support session created");
	});
});

describe("formatAuditRecordLabel", () => {
	it("hides unknown or internal UUID record references", () => {
		expect(formatAuditRecordLabel("unknown")).toBe("No snapshot captured");
		expect(formatAuditRecordLabel("6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f")).toBe(
			"Reference: 6be0e93f",
		);
		expect(formatAuditRecordLabel("report-1")).toBe("Reference saved in system history");
		expect(formatAuditRecordLabel("staff-check-ins")).toBe("Reference saved in system history");
		expect(formatAuditRecordLabel("enroll")).toBe("Reference: enroll");
	});

	it("distinguishes a missing snapshot from a deleted-join case", () => {
		expect(formatAuditRecordLabel({ entityId: undefined })).toBe("No snapshot captured");
		expect(formatAuditRecordLabel({ entityId: "unknown" })).toBe("No snapshot captured");
		// delete action with no changes → record is gone
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges: false,
				action: "delete",
			}),
		).toBe("Record removed after this entry was logged");
		// non-delete action with no changes (e.g. clock-out) → record still exists
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges: false,
				action: "update",
			}),
		).toBe("Reference: 6be0e93f");
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges: true,
			}),
		).toBe("Reference: 6be0e93f");
	});

	it("treats an empty changedFields array on a delete as a removal hint", () => {
		// A delete entry with an empty changedFields array still means the record is gone.
		const changes: { changedFields: string[] } = { changedFields: [] };
		const hasChanges = Boolean(changes.changedFields.length);
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges,
				action: "delete",
			}),
		).toBe("Record removed after this entry was logged");
	});

	it("does not show record-removed for non-delete actions with no field changes", () => {
		// A PATCH (clock-out) with no diff body should not claim the record was removed.
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges: false,
				action: "update",
			}),
		).toBe("Reference: 6be0e93f");
		expect(
			formatAuditRecordLabel({
				entityId: "6be0e93f-b0a4-4ae2-a2b8-d851dc8ee88f",
				hasChanges: false,
				// no action provided
			}),
		).toBe("Reference: 6be0e93f");
	});

	it("humanizes a broader range of audit actions", () => {
		expect(formatAuditHeadline("approve", "reports")).toBe("Report approved");
		expect(formatAuditHeadline("sync-complete", "reports")).toBe("Report sync complete");
		expect(formatAuditHeadline("login", "children")).toBe("Child logged in");
		expect(formatAuditHeadline("logout", "children")).toBe("Child logged out");
		expect(formatAuditHeadline("create", "time-entries")).toBe("Time entry created");
	});
});

describe("formatAuditChangedFields", () => {
	it("labels and humanizes changed field names", () => {
		expect(formatAuditChangedFields(["reportType", "periodStart", "fileUrl"])).toBe(
			"Changed: Report type, Period start, File link",
		);
	});

	it("falls back when no field-level changes are available", () => {
		expect(formatAuditChangedFields([])).toBe("No field-level details recorded");
		expect(formatAuditChangedFields(undefined)).toBe("No field-level details recorded");
	});
});

describe("formatAuditActor", () => {
	it("returns System when no user is recorded", () => {
		expect(formatAuditActor(undefined)).toBe("System");
		expect(formatAuditActor("")).toBe("System");
		expect(formatAuditActor(null)).toBe("System");
	});

	it("shortens raw uuids to readable user references", () => {
		expect(formatAuditActor("aaaaaaaa-1111-4111-8111-111111111111")).toBe("User aaaaaaaa");
	});

	it("uses friendly identifiers as-is", () => {
		expect(formatAuditActor("taylor@center.com")).toBe("taylor@center.com");
	});

	it("prefers the resolved user name over a raw uuid", () => {
		expect(formatAuditActor("aaaaaaaa-1111-4111-8111-111111111111", "Taylor Smith")).toBe(
			"Taylor Smith",
		);
	});

	it("falls back to uuid shortening when userName is blank", () => {
		expect(formatAuditActor("aaaaaaaa-1111-4111-8111-111111111111", "")).toBe("User aaaaaaaa");
		expect(formatAuditActor("aaaaaaaa-1111-4111-8111-111111111111", null)).toBe("User aaaaaaaa");
	});
});

describe("formatAuditTimestamp", () => {
	const now = new Date("2026-04-11T12:00:00.000Z");

	it("returns 'just now' for very recent events", () => {
		expect(formatAuditTimestamp("2026-04-11T11:59:50.000Z", now)).toBe("just now");
	});

	it("formats minute, hour, and day spans", () => {
		expect(formatAuditTimestamp("2026-04-11T11:55:00.000Z", now)).toBe("5m ago");
		expect(formatAuditTimestamp("2026-04-11T09:00:00.000Z", now)).toBe("3h ago");
		expect(formatAuditTimestamp("2026-04-09T12:00:00.000Z", now)).toBe("2d ago");
	});

	it("falls back to a calendar date for older events", () => {
		const result = formatAuditTimestamp("2026-03-01T00:00:00.000Z", now);
		expect(result).toMatch(/2026/);
	});

	it("renders the calendar fallback in the supplied center timezone", () => {
		// 2026-03-01T03:00:00Z is still Feb 28 in America/Los_Angeles (UTC-8).
		expect(formatAuditTimestamp("2026-03-01T03:00:00.000Z", now, "America/Los_Angeles")).toBe(
			"Feb 28, 2026",
		);
		// Same instant is Mar 1 in UTC.
		expect(formatAuditTimestamp("2026-03-01T03:00:00.000Z", now, "UTC")).toBe("Mar 1, 2026");
	});

	it("returns a sentinel for missing or invalid input", () => {
		expect(formatAuditTimestamp(undefined)).toBe("Unknown time");
		expect(formatAuditTimestamp("not-a-date")).toBe("Unknown time");
	});
});

describe("formatAuditAbsoluteTimestamp", () => {
	it("returns an empty string for missing input", () => {
		expect(formatAuditAbsoluteTimestamp(undefined)).toBe("");
		expect(formatAuditAbsoluteTimestamp("not-a-date")).toBe("");
	});

	it("formats valid timestamps", () => {
		expect(formatAuditAbsoluteTimestamp("2026-04-11T12:00:00.000Z")).toMatch(/2026/);
	});

	it("renders the timestamp in the supplied center timezone", () => {
		// 2026-04-11T02:00:00Z is Apr 10, 7:00 PM in America/Los_Angeles (UTC-7 in DST).
		const la = formatAuditAbsoluteTimestamp("2026-04-11T02:00:00.000Z", "America/Los_Angeles");
		expect(la).toContain("Apr 10");
		expect(la).toContain("7:00 PM");
		// Same instant is Apr 11, 2:00 AM in UTC.
		const utc = formatAuditAbsoluteTimestamp("2026-04-11T02:00:00.000Z", "UTC");
		expect(utc).toContain("Apr 11");
		expect(utc).toContain("2:00 AM");
	});
});

describe("getAuditActionTone", () => {
	it("classifies action verbs", () => {
		expect(getAuditActionTone("create")).toBe("success");
		expect(getAuditActionTone("import")).toBe("success");
		expect(getAuditActionTone("delete")).toBe("destructive");
		expect(getAuditActionTone("archive")).toBe("destructive");
		expect(getAuditActionTone("update")).toBe("neutral");
		expect(getAuditActionTone("export")).toBe("neutral");
	});
});
