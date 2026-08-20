import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";
import { auditMiddleware, sanitizeAuditChanges } from "./audit.js";

vi.mock("../lib/sentry.js", () => ({
	captureApiException: vi.fn(),
}));

const { captureApiException } = await import("../lib/sentry.js");

const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("sanitizeAuditChanges", () => {
	it("redacts sensitive field values but keeps changed field names", () => {
		const result = sanitizeAuditChanges({
			email: "director@example.com",
			password: "super-secret",
			notes: "Ratio breach resolved",
		});

		expect(result.changedFields).toEqual(["email", "password", "notes"]);
		expect(result.after).toEqual({
			email: "[REDACTED]",
			password: "[REDACTED]",
			notes: "Ratio breach resolved",
		});
	});

	it("redacts child and family PII values but keeps changed field names", () => {
		const result = sanitizeAuditChanges(
			{
				firstName: "Mia",
				lastName: "Rivera",
				staffName: "Avery Chen",
				staffEmail: "avery@example.com",
				guardianPhone: "555-111-2222",
				relationship: "parent",
				dateOfBirth: "2021-01-01",
				allergies: "Peanut allergy",
				immunizations: "MMR complete",
				notes: "Parent asked about custody schedule",
			},
			{ entityType: "children" },
		);

		expect(result.changedFields).toEqual([
			"firstName",
			"lastName",
			"staffName",
			"staffEmail",
			"guardianPhone",
			"relationship",
			"dateOfBirth",
			"allergies",
			"immunizations",
			"notes",
		]);
		expect(result.after).toEqual({
			firstName: "[REDACTED]",
			lastName: "[REDACTED]",
			staffName: "[REDACTED]",
			staffEmail: "[REDACTED]",
			guardianPhone: "[REDACTED]",
			relationship: "[REDACTED]",
			dateOfBirth: "[REDACTED]",
			allergies: "[REDACTED]",
			immunizations: "[REDACTED]",
			notes: "[REDACTED]",
		});
	});

	it("keeps safe operational audit context for non-child/family entities", () => {
		const result = sanitizeAuditChanges({
			classroomName: "Blue Room",
			centerName: "North Center",
			reportName: "Licensing packet",
			notes: "Ratio breach resolved",
		});

		expect(result.after).toEqual({
			classroomName: "Blue Room",
			centerName: "North Center",
			reportName: "Licensing packet",
			notes: "Ratio breach resolved",
		});
	});

	it("sanitizes arrays and nested objects", () => {
		const result = sanitizeAuditChanges({
			tags: ["licensing", { nested: true }],
			profile: { note: "private" },
		});

		expect(result.after).toEqual({
			tags: ["licensing", "[OBJECT]"],
			profile: "[OBJECT]",
		});
	});
});

const VALID_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const XSS_STRING = "<script>alert(1)</script>";

function mountAuditMiddleware(app: Hono<AppEnv>) {
	app.use("*", auditMiddleware);
	app.post(`/api/children/${VALID_UUID}`, (c) => c.json({ ok: true }));
	app.post("/api/children/withdraw", (c) => c.json({ ok: true }));
	app.post("/api/children/reject", (c) => c.json({ error: "Invalid child" }, 400));
	app.patch(`/api/children/${VALID_UUID}/reject`, (c) => c.json({ error: "Invalid update" }, 422));
	app.post(`/api/children/${XSS_STRING}`, (c) => c.json({ ok: true }));
	app.post("/api/children/child-1", (c) => c.json({ ok: true }));
	app.get("/api/children/child-1", (c) => c.json({ ok: true }));
	app.post("/api/auth/login", (c) => c.json({ ok: true }));
	app.post("/api/reports/generate", (c) => c.json({ ok: true }));
	app.patch("/api/payments/70000000-0000-0000-0000-000000000001/reverse", (c) =>
		c.json({ ok: true }),
	);
}

describe("auditMiddleware", () => {
	it("records sanitized create audit entries for JSON mutations", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		const res = await app.request(
			`/api/children/${VALID_UUID}`,
			jsonBody({
				email: "family@example.com",
				tags: ["licensing", { nested: true }],
			}),
		);

		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "create",
				entityType: "children",
				entityId: VALID_UUID,
				changes: {
					after: {
						email: "[REDACTED]",
						tags: ["licensing", "[OBJECT]"],
					},
					changedFields: ["email", "tags"],
				},
			}),
		);
	});

	it("skips audit inserts for non-mutation requests and auth routes", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "owner" });

		const getRes = await app.request("/api/children/child-1");
		const authRes = await app.request("/api/auth/login", jsonBody({ email: "a@b.com" }));

		expect(getRes.status).toBe(200);
		expect(authRes.status).toBe(200);
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("does not record failed mutations as successful audit actions", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		const res = await app.request(
			"/api/children/reject",
			jsonBody({
				firstName: "Mia",
				lastName: "Rivera",
			}),
		);

		expect(res.status).toBe(400);
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("does not record failed mutation updates as successful audit actions", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		const res = await app.request(
			`/api/children/${VALID_UUID}/reject`,
			patchBody({
				notes: "Bad update",
			}),
		);

		expect(res.status).toBe(422);
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("skips audit middleware for /api/reports/generate (handler writes its own richer row)", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "owner" });

		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);

		expect(res.status).toBe(200);
		// The middleware must NOT write a row — the handler's explicit audit insert is richer
		expect(insertValues).not.toHaveBeenCalled();
	});

	it("sets entityId to 'unknown' when path segment is a non-UUID action name", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		await app.request("/api/children/withdraw", jsonBody({ reason: "moved" }));

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: "children",
				entityId: "unknown",
			}),
		);
	});

	it("skips payment reversal because the handler writes a durable audit row", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		await app.request(
			"/api/payments/70000000-0000-0000-0000-000000000001/reverse",
			jsonBody({ reason: "Duplicate entry" }),
		);

		expect(insertValues).not.toHaveBeenCalled();
	});

	it("sets entityId to 'unknown' when path segment contains XSS-like content", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		await app.request(`/api/children/${XSS_STRING}`, jsonBody({ foo: "bar" }));

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				// XSS content is sanitized to "unknown"
				entityId: "unknown",
			}),
		);
	});

	it("sets entityId to 'unknown' when path second segment is not a UUID", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		// POST to collection endpoint — no entity ID in path
		await app.request("/api/children/child-1", jsonBody({ name: "test" }));

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				entityType: "children",
				// child-1 is not a UUID → should be "unknown"
				entityId: "unknown",
			}),
		);
	});

	it("logs a valid UUID as entityId", async () => {
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		await app.request(`/api/children/${VALID_UUID}`, jsonBody({ name: "test" }));

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				entityId: VALID_UUID,
			}),
		);
	});

	it("logs error to console when audit insert throws, without failing the request", async () => {
		consoleError.mockClear();
		const dbError = new Error("DB connection lost");
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values: vi.fn().mockRejectedValue(dbError) }),
		});
		const app = createTestApp(mountAuditMiddleware, db, { role: "director" });

		const res = await app.request(`/api/children/${VALID_UUID}`, jsonBody({ name: "test" }));

		// Request still succeeds
		expect(res.status).toBe(200);
		// Error is surfaced to console, not swallowed silently
		expect(consoleError).toHaveBeenCalledWith("[audit] Failed to write audit log:", dbError);
		expect(captureApiException).toHaveBeenCalledWith(dbError, expect.anything(), {
			task: "audit-log",
		});
	});
});
