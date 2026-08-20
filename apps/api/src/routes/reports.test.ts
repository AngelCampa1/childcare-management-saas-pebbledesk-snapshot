import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

vi.mock("../services/report-artifacts.js", () => ({
	generateReportArtifact: vi.fn(),
}));

vi.mock("../services/report-storage.js", async (importOriginal) => {
	const original = await importOriginal<typeof import("../services/report-storage.js")>();
	return {
		...original,
		storeReportArtifact: vi.fn(),
		readReportArtifact: vi.fn(),
	};
});

const { reportsRoutes } = await import("./reports.js");
const { generateReportArtifact } = await import("../services/report-artifacts.js");
const { readReportArtifact, storeReportArtifact } = await import("../services/report-storage.js");

function mountReports(app: Hono<AppEnv>) {
	app.route("/api/reports", reportsRoutes);
}

describe("reports routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("generates a report, stores it, and records audit history", async () => {
		const generatedAt = new Date("2026-04-08T12:00:00.000Z");
		vi.mocked(generateReportArtifact).mockResolvedValue({
			fileName: "attendance-2026-04-01-2026-04-07.csv",
			contentType: "text/csv",
			body: "header\nvalue",
		});
		vi.mocked(storeReportArtifact).mockResolvedValue({
			storageKey: "center-1/attendance/report.csv",
			fileUrl: "r2://center-1/attendance/report.csv",
			fileSizeBytes: 12,
		});

		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "aaaa1234-0000-0000-0000-000000000001",
					centerId: "center-1",
					reportType: "attendance",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-07",
					generatedBy: "membership-1",
					fileUrl: "r2://center-1/attendance/report.csv",
					fileName: "attendance-2026-04-01-2026-04-07.csv",
					fileSizeBytes: 12,
					contentType: "text/csv",
					generatedAt,
				},
			]),
		});
		const auditInsertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			insert: vi
				.fn()
				.mockReturnValueOnce({ values: insertValues })
				.mockReturnValueOnce({ values: auditInsertValues }),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);

		expect(res.status).toBe(201);
		expect(generateReportArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
			expect.objectContaining({
				centerId: "center-1",
			}),
			expect.anything(),
		);
		expect(storeReportArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				centerId: "center-1",
				reportType: "attendance",
			}),
			expect.objectContaining({
				fileName: "attendance-2026-04-01-2026-04-07.csv",
			}),
			expect.anything(),
		);
		expect(db.insert).toHaveBeenCalledTimes(2);
	});

	it("accepts the frontend report format option when generating", async () => {
		vi.mocked(generateReportArtifact).mockResolvedValue({
			fileName: "attendance-2026-04-01-2026-04-07.pdf",
			contentType: "application/pdf",
			body: new Uint8Array([37, 80, 68, 70]),
		});
		vi.mocked(storeReportArtifact).mockResolvedValue({
			storageKey: "center-1/attendance/report.pdf",
			fileUrl: "r2://center-1/attendance/report.pdf",
			fileSizeBytes: 4,
		});

		const insertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "aaaa1234-0000-0000-0000-000000000001",
					centerId: "center-1",
					reportType: "attendance",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-07",
					fileName: "attendance-2026-04-01-2026-04-07.pdf",
					contentType: "application/pdf",
				},
			]),
		});
		const db = createMockDb({
			insert: vi
				.fn()
				.mockReturnValueOnce({ values: insertValues })
				.mockReturnValueOnce({ values: vi.fn().mockResolvedValue([]) }),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				format: "pdf",
			}),
		);

		expect(res.status).toBe(201);
		expect(generateReportArtifact).toHaveBeenCalledWith(
			expect.objectContaining({ format: "pdf" }),
			expect.anything(),
			expect.anything(),
		);
	});

	it("lists saved report history for directors", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([
								{
									id: "aaaa1234-0000-0000-0000-000000000001",
									reportType: "attendance",
									fileName: "attendance.csv",
								},
							]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request("/api/reports");

		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			reports: [
				{
					id: "aaaa1234-0000-0000-0000-000000000001",
					reportType: "attendance",
					fileName: "attendance.csv",
				},
			],
		});
	});

	it("applies report history filters", async () => {
		const limit = vi.fn().mockResolvedValue([]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports?reportType=ratio&periodStartFrom=2026-04-01&periodEndTo=2026-04-07&generatedFrom=2026-04-01&generatedTo=2026-04-07",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalled();
		expect(orderBy).toHaveBeenCalled();
	});

	it("caps the report history list to a bounded row limit", async () => {
		const limit = vi.fn().mockResolvedValue([]);
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({ where }),
			}),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request("/api/reports");

		expect(res.status).toBe(200);
		expect(limit).toHaveBeenCalledWith(500);
	});

	it("streams a stored artifact download", async () => {
		vi.mocked(readReportArtifact).mockResolvedValue({
			body: new TextEncoder().encode("header\nvalue"),
			contentType: "text/csv",
			fileName: "attendance.csv",
		});
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "aaaa1234-0000-0000-0000-000000000001",
								centerId: "center-1",
								reportType: "attendance",
								fileUrl: "r2://center-1/attendance/report.csv",
								fileName: "attendance.csv",
							},
						]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});

		const app = createTestApp(mountReports, db, { role: "owner" });
		const res = await app.request("/api/reports/aaaa1234-0000-0000-0000-000000000001/download");

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/csv");
		expect(res.headers.get("content-disposition")).toContain("attendance.csv");
		expect(await res.text()).toContain("header");
	});

	it("writes a download audit entry when a report is successfully downloaded", async () => {
		vi.mocked(readReportArtifact).mockResolvedValue({
			body: new TextEncoder().encode("data"),
			contentType: "text/csv",
			fileName: "attendance.csv",
		});
		const insertValues = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "aaaa1234-0000-0000-0000-000000000001",
								centerId: "center-1",
								reportType: "attendance",
								fileUrl: "r2://center-1/attendance/report.csv",
								fileName: "attendance.csv",
							},
						]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({ values: insertValues }),
		});

		const app = createTestApp(mountReports, db, { role: "owner" });
		await app.request("/api/reports/aaaa1234-0000-0000-0000-000000000001/download");

		expect(insertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "export",
				entityType: "reports",
				entityId: "aaaa1234-0000-0000-0000-000000000001",
			}),
		);
	});

	it("returns 403 when fileUrl prefix does not match centerId", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "aaaa1234-0000-0000-0000-000000000001",
								centerId: "center-1",
								reportType: "attendance",
								// Belongs to a different center
								fileUrl: "r2://other-center-id/attendance/report.csv",
								fileName: "attendance.csv",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountReports, db, { role: "owner" });
		const res = await app.request("/api/reports/aaaa1234-0000-0000-0000-000000000001/download");

		expect(res.status).toBe(403);
		expect(vi.mocked(readReportArtifact)).not.toHaveBeenCalled();
	});

	it("returns 404 when the report artifact cannot be found", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "aaaa1234-0000-0000-0000-000000000001", centerId: "center-1" },
							]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountReports, db, { role: "owner" });
		const res = await app.request("/api/reports/aaaa1234-0000-0000-0000-000000000001/download");

		expect(res.status).toBe(404);
	});

	it("rejects staff access to reports", async () => {
		const app = createTestApp(mountReports, createMockDb(), { role: "staff" });
		const res = await app.request("/api/reports");

		expect(res.status).toBe(403);
	});

	it("requires a center membership for list, generate, and download", async () => {
		const app = createTestApp(mountReports, createMockDb(), {
			role: "director",
			centerId: undefined as never,
			membershipId: undefined as never,
		});

		const listRes = await app.request("/api/reports");
		const generateRes = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);
		const downloadRes = await app.request(
			"/api/reports/aaaa1234-0000-0000-0000-000000000001/download",
		);

		expect(listRes.status).toBe(403);
		expect(generateRes.status).toBe(403);
		expect(downloadRes.status).toBe(403);
	});

	it("generates a report and records the custom audit log entry", async () => {
		vi.mocked(generateReportArtifact).mockResolvedValue({
			fileName: "attendance.csv",
			contentType: "text/csv",
			body: "header\nvalue",
		});
		vi.mocked(storeReportArtifact).mockResolvedValue({
			storageKey: "center-1/attendance/report.csv",
			fileUrl: "r2://center-1/attendance/report.csv",
			fileSizeBytes: 12,
		});

		const auditInsertValues = vi.fn().mockResolvedValue([]);
		const reportInsertValues = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "report-gen-1",
					centerId: "center-1",
					reportType: "attendance",
					periodStart: "2026-04-01",
					periodEnd: "2026-04-07",
					generatedBy: "membership-1",
					fileUrl: "r2://center-1/attendance/report.csv",
					fileName: "attendance.csv",
					fileSizeBytes: 12,
					contentType: "text/csv",
					generatedAt: new Date(),
				},
			]),
		});
		const db = createMockDb({
			insert: vi
				.fn()
				.mockReturnValueOnce({ values: reportInsertValues })
				.mockReturnValueOnce({ values: auditInsertValues }),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}),
		);

		expect(res.status).toBe(201);
		// Audit entry must be written for the generate action too
		expect(auditInsertValues).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "export",
				entityType: "reports",
			}),
		);
	});

	it("rejects report generation when the requested classroom is outside the current center", async () => {
		vi.mocked(generateReportArtifact).mockClear();
		vi.mocked(storeReportArtifact).mockClear();
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "11111111-1111-1111-1111-111111111111",
			}),
		);

		expect(res.status).toBe(404);
		expect(generateReportArtifact).not.toHaveBeenCalled();
		expect(storeReportArtifact).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects report generation when the requested child is outside the current center", async () => {
		vi.mocked(generateReportArtifact).mockClear();
		vi.mocked(storeReportArtifact).mockClear();
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn(),
		});

		const app = createTestApp(mountReports, db, { role: "director" });
		const res = await app.request(
			"/api/reports/generate",
			jsonBody({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				childId: "22222222-2222-2222-2222-222222222222",
			}),
		);

		expect(res.status).toBe(404);
		expect(generateReportArtifact).not.toHaveBeenCalled();
		expect(storeReportArtifact).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});
});
