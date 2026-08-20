import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock Playwright ──────────────────────────────────────────────────────────
const mockPdf = vi.fn().mockResolvedValue(Buffer.from("%PDF-test"));
const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from("PNG-test"));
const mockGoto = vi.fn().mockResolvedValue(null);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockCloseBrowser = vi.fn().mockResolvedValue(undefined);
const mockEmulateMedia = vi.fn().mockResolvedValue(undefined);
const mockPage = {
	goto: mockGoto,
	pdf: mockPdf,
	screenshot: mockScreenshot,
	close: mockClose,
	emulateMedia: mockEmulateMedia,
};
const mockNewPage = vi.fn().mockResolvedValue(mockPage);
const mockBrowser = { newPage: mockNewPage, close: mockCloseBrowser };
const mockLaunch = vi.fn().mockResolvedValue(mockBrowser);
const validPdfBuffer = () => Buffer.from(`%PDF-1.7\n${"x".repeat(20_000)}`);
const validPngBuffer = () =>
	Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		Buffer.alloc(2_000),
	]);

vi.mock("playwright", () => ({
	chromium: { launch: mockLaunch },
}));

// ── Mock fs/promises ─────────────────────────────────────────────────────────
vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		mkdir: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockRejectedValue(new Error("missing file")),
		writeFile: vi.fn().mockResolvedValue(undefined),
	};
});

// ── Import SUT ───────────────────────────────────────────────────────────────
const {
	SLUGS,
	getSlugUrl,
	getOutputPath,
	generateAssetsForSlug,
	buildAllAssets,
	verifyLeadMagnetAssets,
	resolveDefaultOutputDir,
	main,
} = await import("./build-lead-magnet-pdfs.js");

describe("getSlugUrl", () => {
	it("returns the page URL by default", () => {
		expect(getSlugUrl("http://localhost:4321", "ratio-tracking-cheatsheet")).toBe(
			"http://localhost:4321/free/ratio-tracking-cheatsheet",
		);
	});

	it("returns the page URL when variant is page", () => {
		expect(getSlugUrl("http://localhost:4321", "ratio-tracking-cheatsheet", "page")).toBe(
			"http://localhost:4321/free/ratio-tracking-cheatsheet",
		);
	});

	it("returns the /print URL when variant is print", () => {
		expect(getSlugUrl("http://localhost:4321", "ratio-tracking-cheatsheet", "print")).toBe(
			"http://localhost:4321/free/ratio-tracking-cheatsheet/print",
		);
	});

	it("handles base URL with trailing slash", () => {
		expect(getSlugUrl("http://localhost:4321/", "brightwheel-cost-calculator")).toBe(
			"http://localhost:4321/free/brightwheel-cost-calculator",
		);
	});

	it("handles HTTPS production URL with print variant", () => {
		expect(getSlugUrl("https://pebbledesk.app", "licensing-compliance-checklist", "print")).toBe(
			"https://pebbledesk.app/free/licensing-compliance-checklist/print",
		);
	});
});

describe("getOutputPath", () => {
	it("returns .pdf path when ext is pdf", () => {
		const result = getOutputPath("/output/dir", "ratio-tracking-cheatsheet", "pdf");
		expect(result).toBe(join("/output/dir", "ratio-tracking-cheatsheet.pdf"));
	});

	it("returns -cover.png path when ext is png", () => {
		const result = getOutputPath("/output/dir", "brightwheel-cost-calculator", "png");
		expect(result).toBe(join("/output/dir", "brightwheel-cost-calculator-cover.png"));
	});

	it("uses the provided outputDir as base", () => {
		const result = getOutputPath("/custom/path", "some-slug", "pdf");
		// join normalises separators — check that the path contains the dir
		expect(result).toContain("some-slug.pdf");
		expect(result).toContain("custom");
		expect(result).toContain("path");
	});
});

describe("SLUGS", () => {
	it("contains all 16 lead magnet slugs", () => {
		expect(SLUGS).toHaveLength(16);
	});

	it("includes all expected slugs", () => {
		expect(SLUGS).toContain("brightwheel-cost-calculator");
		expect(SLUGS).toContain("cacfp-compliance-checklist");
		expect(SLUGS).toContain("ccdf-billing-error-prevention");
		expect(SLUGS).toContain("childcare-enrollment-agreement-template");
		expect(SLUGS).toContain("childcare-fee-policy-template");
		expect(SLUGS).toContain("childcare-software-pricing-comparison");
		expect(SLUGS).toContain("childcare-software-scorecard");
		expect(SLUGS).toContain("childcare-staff-handbook-template");
		expect(SLUGS).toContain("head-start-self-assessment-checklist");
		expect(SLUGS).toContain("incident-report-log-template");
		expect(SLUGS).toContain("licensing-compliance-checklist");
		expect(SLUGS).toContain("parent-handbook-template");
		expect(SLUGS).toContain("ratio-tracking-cheatsheet");
		expect(SLUGS).toContain("staff-credential-tracker");
		expect(SLUGS).toContain("state-audit-preparation-toolkit");
		expect(SLUGS).toContain("state-subsidy-billing-guide");
	});

	it("has no duplicate slugs", () => {
		expect(new Set(SLUGS).size).toBe(SLUGS.length);
	});
});

describe("generateAssetsForSlug", () => {
	const baseUrl = "http://localhost:4321";
	const outputDir = "/tmp/test-output";

	beforeEach(() => {
		vi.mocked(mockPdf).mockClear();
		vi.mocked(mockScreenshot).mockClear();
		vi.mocked(mockGoto).mockClear();
		vi.mocked(mockClose).mockClear();
		vi.mocked(mockEmulateMedia).mockClear();
		vi.mocked(writeFile).mockClear();
		vi.mocked(mkdir).mockClear();
		vi.mocked(readFile).mockImplementation(async (path) =>
			String(path).endsWith(".pdf") ? validPdfBuffer() : validPngBuffer(),
		);
	});

	it("navigates to the /print URL for PDF generation", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"ratio-tracking-cheatsheet",
			baseUrl,
			outputDir,
		);
		expect(mockGoto).toHaveBeenCalledWith(
			"http://localhost:4321/free/ratio-tracking-cheatsheet/print",
			expect.objectContaining({ waitUntil: "networkidle" }),
		);
	});

	it("navigates to the regular page URL for PNG screenshot", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"ratio-tracking-cheatsheet",
			baseUrl,
			outputDir,
		);
		expect(mockGoto).toHaveBeenCalledWith(
			"http://localhost:4321/free/ratio-tracking-cheatsheet",
			expect.objectContaining({ waitUntil: "networkidle" }),
		);
	});

	it("generates a PDF in Letter format with print background and 0.75in margins", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"brightwheel-cost-calculator",
			baseUrl,
			outputDir,
		);
		expect(mockPdf).toHaveBeenCalledWith(
			expect.objectContaining({
				format: "Letter",
				printBackground: true,
				margin: expect.objectContaining({
					top: "0.75in",
					right: "0.75in",
					bottom: "0.75in",
					left: "0.75in",
				}),
			}),
		);
	});

	it("emulates print media before generating the PDF", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"brightwheel-cost-calculator",
			baseUrl,
			outputDir,
		);
		expect(mockEmulateMedia).toHaveBeenCalledWith(expect.objectContaining({ media: "print" }));
	});

	it("emulates print media BEFORE the first goto(printUrl) so @media print + networkidle apply correctly", async () => {
		const callOrder: string[] = [];
		vi.mocked(mockEmulateMedia).mockImplementation(async (opts: { media: string }) => {
			callOrder.push(`emulateMedia:${opts.media}`);
		});
		vi.mocked(mockGoto).mockImplementation(async (url: string) => {
			callOrder.push(`goto:${url}`);
			return null;
		});

		await generateAssetsForSlug(
			mockBrowser as never,
			"ratio-tracking-cheatsheet",
			baseUrl,
			outputDir,
		);

		const printEmulateIdx = callOrder.indexOf("emulateMedia:print");
		const printGotoIdx = callOrder.indexOf(`goto:${baseUrl}/free/ratio-tracking-cheatsheet/print`);
		const screenEmulateIdx = callOrder.indexOf("emulateMedia:screen");
		const pageGotoIdx = callOrder.indexOf(`goto:${baseUrl}/free/ratio-tracking-cheatsheet`);

		expect(printEmulateIdx).toBeGreaterThanOrEqual(0);
		expect(printGotoIdx).toBeGreaterThan(printEmulateIdx);
		expect(screenEmulateIdx).toBeGreaterThan(printGotoIdx);
		expect(pageGotoIdx).toBeGreaterThan(screenEmulateIdx);

		// Reset for other tests
		vi.mocked(mockEmulateMedia).mockReset().mockResolvedValue(undefined);
		vi.mocked(mockGoto).mockReset().mockResolvedValue(null);
	});

	it("calls emulateMedia exactly twice per slug (print then screen)", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"ratio-tracking-cheatsheet",
			baseUrl,
			outputDir,
		);
		expect(mockEmulateMedia).toHaveBeenCalledTimes(2);
		expect(mockEmulateMedia).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ media: "print" }),
		);
		expect(mockEmulateMedia).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ media: "screen" }),
		);
	});

	it("takes a first-fold screenshot (not full page)", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"licensing-compliance-checklist",
			baseUrl,
			outputDir,
		);
		expect(mockScreenshot).toHaveBeenCalledWith(
			expect.objectContaining({ fullPage: false, type: "png" }),
		);
	});

	it("writes the PDF to the correct output path", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"parent-handbook-template",
			baseUrl,
			outputDir,
		);
		expect(writeFile).toHaveBeenCalledWith(
			join(outputDir, "parent-handbook-template.pdf"),
			expect.any(Buffer),
		);
	});

	it("writes the cover PNG to the correct output path", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"state-audit-preparation-toolkit",
			baseUrl,
			outputDir,
		);
		expect(writeFile).toHaveBeenCalledWith(
			join(outputDir, "state-audit-preparation-toolkit-cover.png"),
			expect.any(Buffer),
		);
	});

	it("closes the page after generating assets", async () => {
		await generateAssetsForSlug(
			mockBrowser as never,
			"ratio-tracking-cheatsheet",
			baseUrl,
			outputDir,
		);
		expect(mockClose).toHaveBeenCalledOnce();
	});

	it("closes the page even if pdf() throws", async () => {
		vi.mocked(mockPdf).mockRejectedValueOnce(new Error("pdf failed"));
		await expect(
			generateAssetsForSlug(mockBrowser as never, "ratio-tracking-cheatsheet", baseUrl, outputDir),
		).rejects.toThrow("pdf failed");
		expect(mockClose).toHaveBeenCalledOnce();
	});
});

describe("buildAllAssets", () => {
	const baseUrl = "http://localhost:4321";
	const outputDir = "/tmp/test-output";

	beforeEach(() => {
		vi.mocked(mockLaunch).mockClear();
		vi.mocked(mockNewPage).mockClear();
		vi.mocked(mockPdf).mockClear();
		vi.mocked(mockScreenshot).mockClear();
		vi.mocked(mockGoto).mockReset().mockResolvedValue(null);
		vi.mocked(mockClose).mockClear();
		vi.mocked(mockCloseBrowser).mockClear();
		vi.mocked(mockEmulateMedia).mockClear();
		vi.mocked(writeFile).mockClear();
		vi.mocked(mkdir).mockClear();
		vi.mocked(readFile).mockImplementation(async (path) =>
			String(path).endsWith(".pdf") ? validPdfBuffer() : validPngBuffer(),
		);
	});

	it("creates the output directory before writing files", async () => {
		await buildAllAssets(baseUrl, outputDir);
		expect(mkdir).toHaveBeenCalledWith(outputDir, { recursive: true });
	});

	it("launches a Chromium browser", async () => {
		await buildAllAssets(baseUrl, outputDir);
		expect(mockLaunch).toHaveBeenCalledOnce();
	});

	it("processes all 16 slugs", async () => {
		await buildAllAssets(baseUrl, outputDir);
		// Each slug: 1 goto + 1 pdf + 1 screenshot = newPage called 16 times
		expect(mockNewPage).toHaveBeenCalledTimes(16);
	});

	it("writes 2 files per slug (pdf + cover png)", async () => {
		await buildAllAssets(baseUrl, outputDir);
		// 16 slugs × 2 files = 32 writeFile calls
		expect(writeFile).toHaveBeenCalledTimes(32);
	});

	it("closes the browser after all slugs are processed", async () => {
		await buildAllAssets(baseUrl, outputDir);
		expect(mockCloseBrowser).toHaveBeenCalledOnce();
	});

	it("closes the browser even if a slug fails", async () => {
		vi.mocked(mockGoto).mockRejectedValueOnce(new Error("navigation failed"));
		await expect(buildAllAssets(baseUrl, outputDir)).rejects.toThrow();
		expect(mockCloseBrowser).toHaveBeenCalledOnce();
	});

	it("continues processing remaining slugs when one fails", async () => {
		// Make the first slug fail, rest succeed
		vi.mocked(mockGoto).mockRejectedValueOnce(new Error("navigation failed"));
		await expect(buildAllAssets(baseUrl, outputDir)).rejects.toThrow();
		// All 16 slugs attempted — even though first failed
		expect(mockNewPage).toHaveBeenCalledTimes(16);
	});

	it("throws a summary error listing all failed slugs when all fail", async () => {
		vi.mocked(mockGoto).mockRejectedValue(new Error("navigation failed"));
		await expect(buildAllAssets(baseUrl, outputDir)).rejects.toThrow(
			`${SLUGS.length} slug(s) failed: ${SLUGS.join(", ")}`,
		);
	});

	it("closes the browser on partial failure", async () => {
		vi.mocked(mockGoto).mockRejectedValueOnce(new Error("navigation failed"));
		await expect(buildAllAssets(baseUrl, outputDir)).rejects.toThrow();
		expect(mockCloseBrowser).toHaveBeenCalledOnce();
	});

	it("launches browser in headless mode", async () => {
		await buildAllAssets(baseUrl, outputDir);
		expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
	});

	it("verifies generated lead magnet PDFs and cover PNGs before completing", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return validPdfBuffer();
			}
			return validPngBuffer();
		});

		await buildAllAssets(baseUrl, outputDir);

		expect(readFile).toHaveBeenCalledWith(join(outputDir, "licensing-compliance-checklist.pdf"));
		expect(readFile).toHaveBeenCalledWith(
			join(outputDir, "licensing-compliance-checklist-cover.png"),
		);
	});
});

describe("verifyLeadMagnetAssets", () => {
	const outputDir = "/tmp/test-output";

	beforeEach(() => {
		vi.mocked(readFile).mockReset();
	});

	it("passes when every slug has a valid-looking PDF and cover PNG", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return validPdfBuffer();
			}
			return validPngBuffer();
		});

		await expect(verifyLeadMagnetAssets(outputDir)).resolves.toBeUndefined();
	});

	it("fails with a useful message when a PDF is missing", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.includes("licensing-compliance-checklist.pdf")) {
				throw new Error("ENOENT");
			}
			if (pathString.endsWith(".pdf")) {
				return validPdfBuffer();
			}
			return validPngBuffer();
		});

		await expect(verifyLeadMagnetAssets(outputDir)).rejects.toThrow(
			"licensing-compliance-checklist.pdf",
		);
	});

	it("fails when a generated PDF is too small to be a real resource", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return Buffer.from("%PDF-1.7\nshort");
			}
			return validPngBuffer();
		});

		await expect(verifyLeadMagnetAssets(outputDir)).rejects.toThrow("too small");
	});

	it("fails when a generated PDF has the wrong file header", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return Buffer.from(`NOTPDF\n${"x".repeat(20_000)}`);
			}
			return validPngBuffer();
		});

		await expect(verifyLeadMagnetAssets(outputDir)).rejects.toThrow("expected PDF header");
	});

	it("fails when a generated PDF contains a localhost URL", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return Buffer.from(
					`%PDF-1.7\nhttp://localhost:4321/free/example/print/${"x".repeat(20_000)}`,
				);
			}
			return validPngBuffer();
		});

		await expect(verifyLeadMagnetAssets(outputDir)).rejects.toThrow("localhost URL");
	});

	it("fails when a generated PNG has the wrong file header", async () => {
		vi.mocked(readFile).mockImplementation(async (path) => {
			const pathString = String(path);
			if (pathString.endsWith(".pdf")) {
				return validPdfBuffer();
			}
			return Buffer.concat([Buffer.from("NOTPNG!!"), Buffer.alloc(2_000)]);
		});

		await expect(verifyLeadMagnetAssets(outputDir)).rejects.toThrow("expected PNG header");
	});
});

describe("resolveDefaultOutputDir", () => {
	it("resolves relative to dirname when provided", () => {
		const result = resolveDefaultOutputDir("/some/scripts/dir", "/fallback/cwd");
		expect(result).toContain("public");
		expect(result).toContain("lead-magnets");
	});

	it("falls back to cwd when dirname is undefined", () => {
		const result = resolveDefaultOutputDir(undefined, "/fallback/cwd");
		expect(result).toContain("public");
		expect(result).toContain("lead-magnets");
	});
});

describe("main", () => {
	beforeEach(() => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.mocked(mockLaunch).mockClear();
		vi.mocked(mockNewPage).mockClear();
		vi.mocked(mockPdf).mockClear();
		vi.mocked(mockScreenshot).mockClear();
		vi.mocked(mockGoto).mockReset().mockResolvedValue(null);
		vi.mocked(mockClose).mockClear();
		vi.mocked(mockCloseBrowser).mockClear();
		vi.mocked(mockEmulateMedia).mockClear();
		vi.mocked(writeFile).mockClear();
		vi.mocked(mkdir).mockClear();
		vi.mocked(readFile).mockImplementation(async (path) =>
			String(path).endsWith(".pdf") ? validPdfBuffer() : validPngBuffer(),
		);
	});

	it("uses BASE_URL from env when provided", async () => {
		await main({ BASE_URL: "http://custom-host:9000" }, "/scripts", process.cwd());
		expect(mockGoto).toHaveBeenCalledWith(
			expect.stringContaining("http://custom-host:9000"),
			expect.any(Object),
		);
	});

	it("defaults to http://localhost:4321 when BASE_URL is not set", async () => {
		await main({}, "/scripts", process.cwd());
		expect(mockGoto).toHaveBeenCalledWith(
			expect.stringContaining("http://localhost:4321"),
			expect.any(Object),
		);
	});

	it("runs buildAllAssets and generates files for all slugs", async () => {
		await main({}, "/scripts", process.cwd());
		expect(mockNewPage).toHaveBeenCalledTimes(16);
		expect(writeFile).toHaveBeenCalledTimes(32);
	});
});
