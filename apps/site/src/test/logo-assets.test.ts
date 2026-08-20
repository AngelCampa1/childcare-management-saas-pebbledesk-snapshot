import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const configDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(configDir, "..");
const publicDir = join(siteRoot, "..", "public");
const assetDir = join(siteRoot, "assets");
const ogImagePath = join(publicDir, "og-default.png");
const emailLogoPath = join(publicDir, "logo-email.png");

const logoFiles = [
	join(publicDir, "logo-light.svg"),
	join(publicDir, "logo-dark.svg"),
	join(publicDir, "favicon.svg"),
	join(assetDir, "logo-light.svg"),
	join(assetDir, "logo-dark.svg"),
	join(assetDir, "logo-icon.svg"),
	join(assetDir, "logo-wordmark.svg"),
];

describe("site logo assets", () => {
	it("replace the old house logo colors with the approved PebbleDesk palette", () => {
		const svgSources = logoFiles.map((file) => readFileSync(file, "utf8"));
		const combined = svgSources.join("\n");

		expect(combined).not.toContain("#4f46e5");
		expect(combined).not.toContain("#f59e0b");
		expect(combined).not.toContain("door-mask");
		expect(combined).not.toContain("L10 32 L32 12 L54 32");
	});

	it("keeps the icon and wordmark split into the expected SVG assets", () => {
		const iconSvg = readFileSync(join(assetDir, "logo-icon.svg"), "utf8");
		const wordmarkSvg = readFileSync(join(assetDir, "logo-wordmark.svg"), "utf8");
		const lightSvg = readFileSync(join(assetDir, "logo-light.svg"), "utf8");
		const darkSvg = readFileSync(join(assetDir, "logo-dark.svg"), "utf8");

		expect(iconSvg).not.toContain("PebbleDesk");
		expect(iconSvg).toContain("#6f8b72");
		expect(iconSvg).toContain("#243446");
		expect(iconSvg).toContain("#f3e7d6");
		expect(iconSvg).toContain("#d97b67");
		expect(wordmarkSvg).toContain("PebbleDesk");
		expect(wordmarkSvg).toContain("#243446");
		expect(wordmarkSvg).toContain("#d97b67");
		expect(lightSvg).toContain("PebbleDesk");
		expect(lightSvg).toContain("#243446");
		expect(lightSvg).toContain("#d97b67");
		expect(darkSvg).toContain("PebbleDesk");
		expect(darkSvg).toContain("#f3e7d6");
		expect(darkSvg).toContain("#d97b67");
	});

	it("keeps the default social preview image at the expected OG dimensions", () => {
		const png = readFileSync(ogImagePath);
		const signature = png.subarray(0, 8).toString("hex");
		const width = png.readUInt32BE(16);
		const height = png.readUInt32BE(20);

		expect(signature).toBe("89504e470d0a1a0a");
		expect(width).toBe(1200);
		expect(height).toBe(630);
	});

	it("provides a small PNG logo for email clients that do not render SVG", () => {
		const png = readFileSync(emailLogoPath);
		const signature = png.subarray(0, 8).toString("hex");
		const width = png.readUInt32BE(16);
		const height = png.readUInt32BE(20);

		expect(signature).toBe("89504e470d0a1a0a");
		expect(width).toBe(32);
		expect(height).toBe(32);
	});
});
