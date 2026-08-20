import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import { readReportArtifact, storeReportArtifact } from "./report-storage.js";

describe("report-storage", () => {
	it("stores report artifacts in R2 and returns metadata", async () => {
		const put = vi.fn().mockResolvedValue(undefined);
		const artifact = await storeReportArtifact(
			{ centerId: "center-1", reportType: "licensing" },
			{
				fileName: "bundle.zip",
				contentType: "application/zip",
				body: new Uint8Array([1, 2, 3, 4]),
			},
			{
				REPORTS_BUCKET: {
					put,
				},
			} as never,
		);

		expect(put).toHaveBeenCalled();
		expect(artifact.storageKey).toContain("center-1/licensing/");
		expect(artifact.fileUrl).toContain("r2://");
		expect(artifact.fileSizeBytes).toBe(4);
	});

	it("reads report artifacts from R2", async () => {
		const artifact = await readReportArtifact("r2://center-1/attendance/report.csv", {
			REPORTS_BUCKET: {
				get: vi.fn().mockResolvedValue({
					arrayBuffer: async () => new TextEncoder().encode("header\nvalue").buffer,
					httpMetadata: {
						contentType: "text/csv",
						contentDisposition: 'attachment; filename="attendance.csv"',
					},
				}),
			},
		} as never);

		expect(new TextDecoder().decode(artifact.body)).toContain("header");
		expect(artifact.contentType).toBe("text/csv");
		expect(artifact.fileName).toBe("attendance.csv");
	});

	it("sanitizes filename with quotes and semicolons in content-disposition (Bug D)", async () => {
		const put = vi.fn().mockResolvedValue(undefined);
		await storeReportArtifact(
			{ centerId: "center-1", reportType: "licensing" },
			{
				fileName: 'report"evil;name\nfile.zip',
				contentType: "application/zip",
				body: new Uint8Array([1, 2, 3]),
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);
		const calledWith = put.mock.calls[0][2] as { httpMetadata: { contentDisposition: string } };
		const disposition = calledWith.httpMetadata.contentDisposition;
		// Must not contain the original dangerous chars in the filename portion
		expect(disposition).not.toContain('"evil');
		expect(disposition).not.toContain(";name");
		expect(disposition).not.toContain("\n");
		// Must still be a valid content-disposition header
		expect(disposition).toMatch(/^attachment; filename="/);
	});

	it("sanitizes non-ASCII characters from filename (Bug D)", async () => {
		const put = vi.fn().mockResolvedValue(undefined);
		await storeReportArtifact(
			{ centerId: "center-1", reportType: "licensing" },
			{
				fileName: "report-\u00e9coles.csv",
				contentType: "text/csv",
				body: "data",
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);
		const calledWith = put.mock.calls[0][2] as { httpMetadata: { contentDisposition: string } };
		const disposition = calledWith.httpMetadata.contentDisposition;
		// Non-ASCII chars must be replaced with dashes
		expect(disposition).not.toContain("\u00e9");
		expect(disposition).toMatch(/^attachment; filename="/);
	});

	it("falls back to 'report' for empty or all-invalid filename (Bug D)", async () => {
		const put = vi.fn().mockResolvedValue(undefined);
		await storeReportArtifact(
			{ centerId: "center-1", reportType: "licensing" },
			{
				fileName: "\n\r\0",
				contentType: "text/csv",
				body: "data",
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);
		const calledWith = put.mock.calls[0][2] as { httpMetadata: { contentDisposition: string } };
		const disposition = calledWith.httpMetadata.contentDisposition;
		expect(disposition).toContain('"report"');
	});

	it("truncates filename to 100 characters (Bug D)", async () => {
		const put = vi.fn().mockResolvedValue(undefined);
		const longName = `${"a".repeat(200)}.csv`;
		await storeReportArtifact(
			{ centerId: "center-1", reportType: "licensing" },
			{
				fileName: longName,
				contentType: "text/csv",
				body: "data",
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);
		const calledWith = put.mock.calls[0][2] as { httpMetadata: { contentDisposition: string } };
		const disposition = calledWith.httpMetadata.contentDisposition;
		// Extract filename from disposition
		const match = /filename="([^"]*)"/.exec(disposition);
		const filename = match?.[1] ?? "";
		expect(filename.length).toBeLessThanOrEqual(100);
	});

	it("falls back to application/octet-stream and report-export when httpMetadata is missing", async () => {
		const artifact = await readReportArtifact("r2://center-1/attendance/report.csv", {
			REPORTS_BUCKET: {
				get: vi.fn().mockResolvedValue({
					arrayBuffer: async () => new TextEncoder().encode("data").buffer,
					httpMetadata: undefined,
				}),
			},
		} as never);

		expect(artifact.contentType).toBe("application/octet-stream");
		expect(artifact.fileName).toBe("report-export");
	});

	it("falls back to report-export when contentDisposition has no filename match", async () => {
		const artifact = await readReportArtifact("r2://center-1/attendance/report.csv", {
			REPORTS_BUCKET: {
				get: vi.fn().mockResolvedValue({
					arrayBuffer: async () => new TextEncoder().encode("data").buffer,
					httpMetadata: {
						contentType: "text/csv",
						contentDisposition: "attachment",
					},
				}),
			},
		} as never);

		expect(artifact.contentType).toBe("text/csv");
		expect(artifact.fileName).toBe("report-export");
	});

	it("stores a ReadableStream body and returns size from R2 object", async () => {
		const encoder = new TextEncoder();
		const csvData = "name,age\nAlice,30\n";
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(encoder.encode(csvData));
				controller.close();
			},
		});

		const put = vi.fn().mockResolvedValue({ size: 18 });
		const artifact = await storeReportArtifact(
			{ centerId: "center-1", reportType: "attendance" },
			{
				fileName: "attendance.csv",
				contentType: "text/csv",
				body: stream,
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);

		expect(put).toHaveBeenCalledWith(
			expect.stringContaining("center-1/attendance/"),
			stream,
			expect.objectContaining({ httpMetadata: expect.any(Object) }),
		);
		expect(artifact.fileSizeBytes).toBe(18);
	});

	it("returns 0 for fileSizeBytes when ReadableStream put returns no size", async () => {
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.close();
			},
		});

		const put = vi.fn().mockResolvedValue(null);
		const artifact = await storeReportArtifact(
			{ centerId: "center-1", reportType: "attendance" },
			{
				fileName: "empty.csv",
				contentType: "text/csv",
				body: stream,
			},
			{
				REPORTS_BUCKET: { put },
			} as never,
		);

		expect(artifact.fileSizeBytes).toBe(0);
	});

	it("throws when storage is not configured or the object is missing", async () => {
		await expect(
			storeReportArtifact(
				{ centerId: "center-1", reportType: "attendance" },
				{
					fileName: "attendance.csv",
					contentType: "text/csv",
					body: "header\nvalue",
				},
				{} as never,
			),
		).rejects.toBeInstanceOf(HTTPException);

		await expect(
			readReportArtifact("r2://missing/report.csv", {
				REPORTS_BUCKET: {
					get: vi.fn().mockResolvedValue(null),
				},
			} as never),
		).rejects.toBeInstanceOf(HTTPException);
	});

	it("returns not found when a stored report artifact object is missing", async () => {
		await expect(
			readReportArtifact("r2://center-1/attendance/missing.csv", {
				REPORTS_BUCKET: {
					get: vi.fn().mockResolvedValue(null),
				},
			} as never),
		).rejects.toMatchObject({ status: 404 });
	});
});
