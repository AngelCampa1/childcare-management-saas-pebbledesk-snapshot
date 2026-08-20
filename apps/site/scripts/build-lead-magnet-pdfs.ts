/**
 * Build script: render each /free/[slug] page as a PDF and cover PNG, then
 * write the outputs to apps/site/public/lead-magnets/ so Cloudflare Pages
 * serves them as static assets.
 *
 * Usage:
 *   BASE_URL=http://localhost:4321 pnpm build:assets
 *
 * The script expects the site to already be running (or built + previewed) at
 * BASE_URL.  If BASE_URL is not set it defaults to http://localhost:4321.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Browser } from "playwright";
import { chromium } from "playwright";

export const SLUGS = [
	"brightwheel-cost-calculator",
	"cacfp-compliance-checklist",
	"ccdf-billing-error-prevention",
	"childcare-enrollment-agreement-template",
	"childcare-fee-policy-template",
	"childcare-software-pricing-comparison",
	"childcare-software-scorecard",
	"childcare-staff-handbook-template",
	"head-start-self-assessment-checklist",
	"incident-report-log-template",
	"licensing-compliance-checklist",
	"parent-handbook-template",
	"ratio-tracking-cheatsheet",
	"staff-credential-tracker",
	"state-audit-preparation-toolkit",
	"state-subsidy-billing-guide",
] as const;

/**
 * Returns the URL for a given base URL and slug.
 * - variant "page"  → `/free/{slug}` (default, marketing landing page)
 * - variant "print" → `/free/{slug}/print` (clean print-optimized full body)
 */
export function getSlugUrl(
	baseUrl: string,
	slug: string,
	variant: "page" | "print" = "page",
): string {
	const normalised = baseUrl.replace(/\/$/, "");
	const suffix = variant === "print" ? "/print" : "";
	return `${normalised}/free/${slug}${suffix}`;
}

/**
 * Returns the output file path for a slug asset.
 * - ext "pdf"  → `{outputDir}/{slug}.pdf`
 * - ext "png"  → `{outputDir}/{slug}-cover.png`
 */
export function getOutputPath(outputDir: string, slug: string, ext: "pdf" | "png"): string {
	const filename = ext === "pdf" ? `${slug}.pdf` : `${slug}-cover.png`;
	return join(outputDir, filename);
}

const MIN_PDF_BYTES = 10_000;
const MIN_PNG_BYTES = 1_000;
const PDF_HEADER = "%PDF";
const PNG_HEADER = "\x89PNG\r\n\x1a\n";
const LOCALHOST_URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//;

async function verifyAssetFile(
	path: string,
	expectedHeader: string,
	minBytes: number,
): Promise<string | null> {
	try {
		const bytes = await readFile(path);
		if (bytes.byteLength < minBytes) {
			return `${path} is too small (${bytes.byteLength} bytes)`;
		}
		const header = bytes.subarray(0, expectedHeader.length).toString("latin1");
		if (header !== expectedHeader) {
			return `${path} does not start with expected ${expectedHeader === PDF_HEADER ? "PDF" : "PNG"} header`;
		}
		if (expectedHeader === PDF_HEADER) {
			const text = bytes.toString("latin1");
			if (LOCALHOST_URL_PATTERN.test(text)) {
				return `${path} contains a localhost URL`;
			}
		}
		return null;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return `${path} is missing or unreadable: ${message}`;
	}
}

export async function verifyLeadMagnetAssets(outputDir: string): Promise<void> {
	const failures: string[] = [];

	for (const slug of SLUGS) {
		const pdfPath = getOutputPath(outputDir, slug, "pdf");
		const pngPath = getOutputPath(outputDir, slug, "png");
		const pdfFailure = await verifyAssetFile(pdfPath, PDF_HEADER, MIN_PDF_BYTES);
		const pngFailure = await verifyAssetFile(pngPath, PNG_HEADER, MIN_PNG_BYTES);
		if (pdfFailure) failures.push(pdfFailure);
		if (pngFailure) failures.push(pngFailure);
	}

	if (failures.length > 0) {
		throw new Error(`Lead magnet asset verification failed:\n${failures.join("\n")}`);
	}
}

/**
 * Renders a single slug and writes the PDF + cover PNG to outputDir.
 * The page is always closed, even on error.
 */
export async function generateAssetsForSlug(
	browser: Browser,
	slug: string,
	baseUrl: string,
	outputDir: string,
): Promise<void> {
	const page = await browser.newPage();
	try {
		// Emulate print media BEFORE navigation so @media print CSS rules apply
		// during load and networkidle resolves under the correct media type.
		await page.emulateMedia({ media: "print" });

		// Render the dedicated print route to PDF — this has no site chrome and
		// shows the full lead magnet body with a cover page.
		const printUrl = getSlugUrl(baseUrl, slug, "print");
		await page.goto(printUrl, { waitUntil: "networkidle" });

		const pdfBuffer = await page.pdf({
			format: "Letter",
			printBackground: true,
			margin: { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" },
		});

		// Reset to screen media before navigating to the marketing landing page
		// so the PNG screenshot renders with the normal on-screen styles.
		await page.emulateMedia({ media: "screen" });

		// Screenshot the marketing landing page for the listing card image.
		const pageUrl = getSlugUrl(baseUrl, slug, "page");
		await page.goto(pageUrl, { waitUntil: "networkidle" });
		const screenshotBuffer = await page.screenshot({ fullPage: false, type: "png" });

		await writeFile(getOutputPath(outputDir, slug, "pdf"), pdfBuffer);
		await writeFile(getOutputPath(outputDir, slug, "png"), screenshotBuffer);
	} finally {
		await page.close();
	}
}

/**
 * Builds PDF and cover PNG assets for all 16 lead magnet slugs.
 * Writes to outputDir, creating it if it does not exist.
 */
export async function buildAllAssets(baseUrl: string, outputDir: string): Promise<void> {
	await mkdir(outputDir, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	try {
		const errors: Array<{ slug: string; error: unknown }> = [];
		for (const slug of SLUGS) {
			try {
				await generateAssetsForSlug(browser, slug, baseUrl, outputDir);
			} catch (err) {
				console.error(`Failed to generate assets for "${slug}":`, err);
				errors.push({ slug, error: err });
			}
		}
		if (errors.length > 0) {
			throw new Error(`${errors.length} slug(s) failed: ${errors.map((e) => e.slug).join(", ")}`);
		}
		await verifyLeadMagnetAssets(outputDir);
	} finally {
		await browser.close();
	}
}

/**
 * Resolve the default output directory relative to this script file.
 * Exported so tests can verify the resolved path logic in isolation.
 */
export function resolveDefaultOutputDir(dirname: string | undefined, cwd: string): string {
	return resolve(dirname ?? cwd, "../public/lead-magnets");
}

/**
 * CLI entry point — called when the script is run directly.
 * Extracted as a named export so tests can invoke it without running the file.
 */
export async function main(
	env: Record<string, string | undefined>,
	dirname: string | undefined,
	cwd: string,
): Promise<void> {
	const baseUrl = env.BASE_URL ?? "http://localhost:4321";
	const outputDir = resolveDefaultOutputDir(dirname, cwd);

	console.log(`Generating lead magnet assets from ${baseUrl}`);
	console.log(`Output directory: ${outputDir}`);

	await buildAllAssets(baseUrl, outputDir);
	console.log("Done — generated assets for all slugs.");
}

// ── CLI entry point ──────────────────────────────────────────────────────────
// Only runs when the file is executed directly (not when imported in tests).
/* v8 ignore start */
const isMain =
	typeof process !== "undefined" &&
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) ===
		resolve(
			import.meta.url
				.replace(/^file:\/\/\/?/, "")
				.replace(/\//g, process.platform === "win32" ? "\\" : "/"),
		);

if (isMain) {
	main(process.env, import.meta.dirname, process.cwd()).catch((err: unknown) => {
		console.error("Build failed:", err);
		process.exit(1);
	});
}
/* v8 ignore stop */
