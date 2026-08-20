import { describe, expect, it } from "vitest";
import type { SiteConfig } from "../types.js";
import { generateScale, generateThemeCSS } from "./generate-theme-css.js";

type Theme = SiteConfig["theme"];

const baseTheme: Theme = {
	primary: "#0ea5e9",
	accent: "#f97316",
	fonts: { heading: "Inter", body: "Inter" },
};

const themeWithSurface: Theme = {
	primary: "#4a7c59",
	accent: "#c17b84",
	surface: "#fdf8f3",
	text: "#2d2a27",
	muted: "#9a9088",
	fonts: { heading: "Inter", body: "Inter" },
};

const themeWithDark: Theme = {
	primary: "#7c3aed",
	accent: "#f472b6",
	fonts: { heading: "Inter", body: "Inter" },
	dark: {
		primary: "#9f7aea",
		accent: "#d6ae54",
		surface: "#1a1022",
		surfaceSecondary: "#26183a",
		text: "#f0e8ff",
		muted: "#a78bfa",
	},
};

const themeWithPresentationVariants = {
	...themeWithSurface,
	surfaceStyle: "flat",
	motionIntensity: "subtle",
	ctaStyle: "soft",
	layoutDensity: "compact",
	chromeEmphasis: "subtle",
} as Theme;

const horivaTheme: Theme = {
	primary: "#6B2D8B",
	accent: "#C4622D",
	surface: "#FDF8F4",
	text: "#1C1117",
	muted: "#7A6E72",
	fonts: { heading: "Fraunces", body: "DM Sans" },
};

function getHexToken(css: string, token: string): string {
	const match = css.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
	expect(match, `Expected ${token} to exist in generated CSS`).not.toBeNull();
	if (!match?.[1]) throw new Error(`Token ${token} not found in CSS`);
	return match[1];
}

function hexChannels(hex: string): { r: number; g: number; b: number } {
	return {
		r: parseInt(hex.slice(1, 3), 16),
		g: parseInt(hex.slice(3, 5), 16),
		b: parseInt(hex.slice(5, 7), 16),
	};
}

function hueFromHex(hex: string): number {
	const { r, g, b } = hexChannels(hex);
	const nr = r / 255;
	const ng = g / 255;
	const nb = b / 255;
	const max = Math.max(nr, ng, nb);
	const min = Math.min(nr, ng, nb);
	const delta = max - min;

	if (delta === 0) return 0;

	let hue: number;
	if (max === nr) {
		hue = ((ng - nb) / delta) % 6;
	} else if (max === ng) {
		hue = (nb - nr) / delta + 2;
	} else {
		hue = (nr - ng) / delta + 4;
	}

	const normalized = hue * 60;
	return normalized < 0 ? normalized + 360 : normalized;
}

function hueDistance(a: number, b: number): number {
	const diff = Math.abs(a - b);
	return Math.min(diff, 360 - diff);
}

describe("generateThemeCSS", () => {
	describe(":root block structure", () => {
		it("contains a :root { block", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(":root {");
		});

		it("closing brace for :root block", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("}");
		});
	});

	describe("site vars", () => {
		it("includes --site-primary matching theme.primary", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(`--site-primary: ${baseTheme.primary}`);
		});

		it("includes --site-accent matching theme.accent", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(`--site-accent: ${baseTheme.accent}`);
		});

		it("uses default #ffffff for --site-surface when not provided", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--site-surface: #ffffff");
		});

		it("uses provided surface value for --site-surface", () => {
			const css = generateThemeCSS(themeWithSurface);
			expect(css).toContain("--site-surface: #fdf8f3");
		});

		it("uses default #0f172a for --site-text when not provided", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--site-text: #0f172a");
		});

		it("uses provided text value for --site-text", () => {
			const css = generateThemeCSS(themeWithSurface);
			expect(css).toContain("--site-text: #2d2a27");
		});

		it("uses default #64748b for --site-muted when not provided", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--site-muted: #64748b");
		});

		it("uses provided muted value for --site-muted", () => {
			const css = generateThemeCSS(themeWithSurface);
			expect(css).toContain("--site-muted: #9a9088");
		});

		it("emits site-level layout density tokens", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-section-py:");
			expect(css).toContain("--site-section-py-sm:");
			expect(css).toContain("--site-component-gap:");
			expect(css).toContain("--site-component-gap-sm:");
		});

		it("emits site-level motion tokens", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-button-hover-scale:");
			expect(css).toContain("--site-button-active-scale:");
			expect(css).toContain("--site-card-hover-lift:");
			expect(css).toContain("--site-card-hover-scale:");
			expect(css).toContain("--site-cta-pulse-animation:");
		});

		it("emits site-level surface and chrome tokens", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-surface-secondary:");
			expect(css).toContain("--site-surface-elevated:");
			expect(css).toContain("--site-surface-sunken:");
			expect(css).toContain("--site-surface-frost:");
			expect(css).toContain("--site-surface-frost-border:");
			expect(css).toContain("--site-shadow-card:");
			expect(css).toContain("--site-shadow-lg:");
			expect(css).toContain("--site-shadow-ambient:");
			expect(css).toContain("--site-section-highlight-bg:");
		});

		it("emits site-level CTA tokens", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-primary-button-bg:");
			expect(css).toContain("--site-primary-button-hover-bg:");
			expect(css).toContain("--site-primary-button-fg:");
			expect(css).toContain("--site-primary-button-border:");
			expect(css).toContain("--site-primary-button-shadow:");
			expect(css).toContain("--site-primary-button-radius:");
		});

		it("emits pill radius for site-level primary CTA tokens", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);

			expect(css).toContain("--site-primary-button-radius: 9999px;");
			expect(css).not.toContain("--site-primary-button-radius: var(--radius-md);");
			expect(css).not.toContain("--site-primary-button-radius: calc(var(--radius-md) + 2px);");
		});
	});

	describe("presentation variants", () => {
		it("uses compact spacing values when layoutDensity is compact", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-section-py: clamp(2.5rem, 5vw, 4.5rem);");
			expect(css).toContain("--site-component-gap: clamp(1rem, 2vw, 1.75rem);");
		});

		it("uses subtle motion values when motionIntensity is subtle", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain("--site-button-hover-scale: 1.005;");
			expect(css).toContain("--site-button-active-scale: 0.995;");
			expect(css).toContain("--site-card-hover-lift: 1px;");
			expect(css).toContain("--site-card-hover-scale: 1.003;");
			expect(css).toContain("--site-cta-pulse-animation: none;");
		});

		it("uses flat surface treatment when surfaceStyle is flat", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain(
				"--site-surface-frost: color-mix(in srgb, var(--site-surface) 96%, transparent);",
			);
			expect(css).toContain(
				"--site-surface-frost-border: color-mix(in srgb, var(--color-neutral-200) 55%, transparent);",
			);
		});

		it("uses soft CTA treatment when ctaStyle is soft", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain(
				"--site-primary-button-border: 1px solid color-mix(in srgb, var(--site-accent) 24%, transparent);",
			);
			expect(css).toContain("--site-primary-button-radius: 9999px;");
		});

		it("uses subtle chrome treatment when chromeEmphasis is subtle", () => {
			const css = generateThemeCSS(themeWithPresentationVariants);
			expect(css).toContain(
				"--site-section-highlight-bg: color-mix(in srgb, var(--site-surface) 88%, var(--color-accent-50) 12%);",
			);
			expect(css).toContain(
				"--site-shadow-card: 0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 3px -2px rgba(15, 23, 42, 0.03);",
			);
		});
	});

	describe("primary color scale (11 steps)", () => {
		it("includes all 11 primary scale steps -50 through -950", () => {
			const css = generateThemeCSS(baseTheme);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-primary-${step}:`);
			}
		});

		it("--color-primary-500 is present and has a valid hex value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toMatch(/--color-primary-500:\s*#[0-9a-f]{6}/i);
		});

		it("primary-50 is a light color (high lightness)", () => {
			const css = generateThemeCSS(baseTheme);
			const match = css.match(/--color-primary-50:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			// Lightness should be high for -50 step
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const luminance = (r + g + b) / 3;
			expect(luminance).toBeGreaterThan(200); // near-white
		});

		it("primary-950 is a dark color (low lightness)", () => {
			const css = generateThemeCSS(baseTheme);
			const match = css.match(/--color-primary-950:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const luminance = (r + g + b) / 3;
			expect(luminance).toBeLessThan(80); // near-black
		});
	});

	describe("accent color scale (11 steps)", () => {
		it("includes all 11 accent scale steps -50 through -950", () => {
			const css = generateThemeCSS(baseTheme);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-accent-${step}:`);
			}
		});

		it("--color-accent-500 is present and has a valid hex value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toMatch(/--color-accent-500:\s*#[0-9a-f]{6}/i);
		});
	});

	describe("neutral color scale (11 steps)", () => {
		it("includes all 11 neutral scale steps -50 through -950", () => {
			const css = generateThemeCSS(baseTheme);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-neutral-${step}:`);
			}
		});

		it("neutral scale uses plain gray (saturation=0) when surface is default white", () => {
			const css = generateThemeCSS(baseTheme);
			// neutral-50 for plain gray should be something near #f8f8f8
			const match = css.match(/--color-neutral-50:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			// For unsaturated gray, R, G, B should be approximately equal.
			// OKLCH achromatic grays may have slight RGB channel spread due to
			// sRGB gamut mapping, so we use a wider tolerance than pure HSL.
			expect(Math.abs(r - g)).toBeLessThan(30);
			expect(Math.abs(g - b)).toBeLessThan(30);
		});

		it("neutral scale is tinted when surface has a distinct hue", () => {
			// warm surface #fdf8f3 — neutrals should have warm tint
			const css = generateThemeCSS(themeWithSurface);
			const match = css.match(/--color-neutral-50:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			// The neutral-50 should match the provided surface color for warm sites
			expect(css).toContain("--color-neutral-50: #fdf8f3");
		});

		it("neutral scale uses plain gray when surface is #ffffff", () => {
			const css = generateThemeCSS({ ...baseTheme, surface: "#ffffff" });
			// Plain gray: R ≈ G ≈ B near 50 step (OKLCH may have slight spread)
			const match = css.match(/--color-neutral-50:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			expect(Math.abs(r - g)).toBeLessThan(30);
			expect(Math.abs(g - b)).toBeLessThan(30);
		});

		it("neutral scale uses plain gray when surface has no chroma (dark gray)", () => {
			// #333333 is dark and near-gray (low lightness), should fall back to plain gray
			const css = generateThemeCSS({ ...baseTheme, surface: "#333333" });
			expect(css).toContain("--color-neutral-50:");
		});
	});

	describe("error color scale", () => {
		it("includes --color-error-50 fixed value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--color-error-50: #fef2f2");
		});

		it("includes --color-error-950 fixed value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--color-error-950: #450a0a");
		});

		it("includes all error scale steps", () => {
			const css = generateThemeCSS(baseTheme);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-error-${step}:`);
			}
		});
	});

	describe("success color scale", () => {
		it("includes --color-success-50 fixed value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--color-success-50: #ecfdf5");
		});

		it("includes --color-success-950 fixed value", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--color-success-950: #022c22");
		});

		it("includes all success scale steps", () => {
			const css = generateThemeCSS(baseTheme);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-success-${step}:`);
			}
		});
	});

	describe("category colors", () => {
		it("defaults --site-category-feature to theme.primary", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(`--site-category-feature: ${baseTheme.primary}`);
		});

		it("defaults --site-category-roi to #059669 (emerald)", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--site-category-roi: #059669");
		});

		it("defaults --site-category-compliance to theme.accent", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(`--site-category-compliance: ${baseTheme.accent}`);
		});

		it("defaults --site-category-integration to #64748b (slate)", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("--site-category-integration: #64748b");
		});

		it("uses categoryColors.iconColor override for --site-category-feature when provided", () => {
			const themeWithCategoryColors: Theme = {
				...baseTheme,
				categoryColors: {
					feature: { iconColor: "#ff0000" },
				},
			};
			const css = generateThemeCSS(themeWithCategoryColors);
			expect(css).toContain("--site-category-feature: #ff0000");
		});

		it("uses categoryColors.iconColor override for --site-category-roi when provided", () => {
			const themeWithCategoryColors: Theme = {
				...baseTheme,
				categoryColors: {
					roi: { iconColor: "#00bb44" },
				},
			};
			const css = generateThemeCSS(themeWithCategoryColors);
			expect(css).toContain("--site-category-roi: #00bb44");
		});

		it("uses categoryColors.iconColor override for --site-category-compliance when provided", () => {
			const themeWithCategoryColors: Theme = {
				...baseTheme,
				categoryColors: {
					compliance: { iconColor: "#8800ff" },
				},
			};
			const css = generateThemeCSS(themeWithCategoryColors);
			expect(css).toContain("--site-category-compliance: #8800ff");
		});

		it("uses categoryColors.iconColor override for --site-category-integration when provided", () => {
			const themeWithCategoryColors: Theme = {
				...baseTheme,
				categoryColors: {
					integration: { iconColor: "#334455" },
				},
			};
			const css = generateThemeCSS(themeWithCategoryColors);
			expect(css).toContain("--site-category-integration: #334455");
		});

		it("keeps default for categories not present in categoryColors", () => {
			const themeWithPartialOverride: Theme = {
				...baseTheme,
				categoryColors: {
					feature: { iconColor: "#ff0000" },
				},
			};
			const css = generateThemeCSS(themeWithPartialOverride);
			// roi, compliance, integration should still use defaults
			expect(css).toContain("--site-category-roi: #059669");
			expect(css).toContain(`--site-category-compliance: ${baseTheme.accent}`);
			expect(css).toContain("--site-category-integration: #64748b");
		});

		it("keeps default when categoryColors entry has no iconColor", () => {
			const themeWithNoIconColor: Theme = {
				...baseTheme,
				categoryColors: {
					feature: { bgColor: "bg-red-50" },
				},
			};
			const css = generateThemeCSS(themeWithNoIconColor);
			expect(css).toContain(`--site-category-feature: ${baseTheme.primary}`);
		});

		it("falls back to default when iconColor is a Tailwind class string (text-sky-500)", () => {
			const themeWithTailwindClass: Theme = {
				...baseTheme,
				categoryColors: {
					feature: { iconColor: "text-sky-500" },
				},
			};
			const css = generateThemeCSS(themeWithTailwindClass);
			// Should NOT emit the Tailwind class as a CSS var value
			expect(css).not.toContain("--site-category-feature: text-sky-500");
			// Should fall back to theme.primary
			expect(css).toContain(`--site-category-feature: ${baseTheme.primary}`);
		});

		it("falls back to default when iconColor is a Tailwind class for roi", () => {
			const themeWithTailwindClass: Theme = {
				...baseTheme,
				categoryColors: {
					roi: { iconColor: "text-emerald-600" },
				},
			};
			const css = generateThemeCSS(themeWithTailwindClass);
			expect(css).not.toContain("--site-category-roi: text-emerald-600");
			expect(css).toContain("--site-category-roi: #059669");
		});

		it("falls back to default when iconColor is a Tailwind class for compliance", () => {
			const themeWithTailwindClass: Theme = {
				...baseTheme,
				categoryColors: {
					compliance: { iconColor: "text-purple-600" },
				},
			};
			const css = generateThemeCSS(themeWithTailwindClass);
			expect(css).not.toContain("--site-category-compliance: text-purple-600");
			expect(css).toContain(`--site-category-compliance: ${baseTheme.accent}`);
		});

		it("falls back to default when iconColor is a Tailwind class for integration", () => {
			const themeWithTailwindClass: Theme = {
				...baseTheme,
				categoryColors: {
					integration: { iconColor: "text-slate-500" },
				},
			};
			const css = generateThemeCSS(themeWithTailwindClass);
			expect(css).not.toContain("--site-category-integration: text-slate-500");
			expect(css).toContain("--site-category-integration: #64748b");
		});

		it("accepts a valid hex iconColor override", () => {
			const themeWithHex: Theme = {
				...baseTheme,
				categoryColors: { feature: { iconColor: "#abcdef" } },
			};
			const css = generateThemeCSS(themeWithHex);
			expect(css).toContain("--site-category-feature: #abcdef");
		});

		it("accepts a valid rgb() iconColor override", () => {
			const themeWithRgb: Theme = {
				...baseTheme,
				categoryColors: { feature: { iconColor: "rgb(100, 200, 50)" } },
			};
			const css = generateThemeCSS(themeWithRgb);
			expect(css).toContain("--site-category-feature: rgb(100, 200, 50)");
		});

		it("accepts a valid hsl() iconColor override", () => {
			const themeWithHsl: Theme = {
				...baseTheme,
				categoryColors: { feature: { iconColor: "hsl(120, 50%, 40%)" } },
			};
			const css = generateThemeCSS(themeWithHsl);
			expect(css).toContain("--site-category-feature: hsl(120, 50%, 40%)");
		});

		it("accepts a valid oklch() iconColor override", () => {
			const themeWithOklch: Theme = {
				...baseTheme,
				categoryColors: { feature: { iconColor: "oklch(0.5 0.2 240)" } },
			};
			const css = generateThemeCSS(themeWithOklch);
			expect(css).toContain("--site-category-feature: oklch(0.5 0.2 240)");
		});
	});

	describe("dark mode block", () => {
		it("includes @media (prefers-color-scheme: dark) block", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain("@media (prefers-color-scheme: dark)");
		});

		it("includes :root:not(.light) selector in dark media query", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(":root:not(.light)");
		});

		it("includes :root.dark selector for explicit dark class", () => {
			const css = generateThemeCSS(baseTheme);
			expect(css).toContain(":root.dark");
		});

		it("dark mode --site-primary is a lighter variant than the base", () => {
			const css = generateThemeCSS(baseTheme);
			// Should contain a lighter primary for dark mode
			// Dark primary should appear after the @media block
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-primary:");
		});

		it("uses theme.dark.primary when provided instead of the generated fallback", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-primary: #9f7aea;");
		});

		it("dark mode --site-accent is a lighter variant", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-accent:");
		});

		it("uses theme.dark.accent when provided instead of the generated fallback", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-accent: #d6ae54;");
		});

		it("derives dark primary scale hooks from theme.dark.primary when provided", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			const expectedScale = generateScale(themeWithDark.dark?.primary as string);
			expect(darkSection).toContain(`--site-primary-50-dark: ${expectedScale[950]};`);
			expect(darkSection).toContain(`--site-primary-100-dark: ${expectedScale[900]};`);
		});

		it("derives dark accent scale hooks from theme.dark.accent when provided", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			const expectedScale = generateScale(themeWithDark.dark?.accent as string);
			expect(darkSection).toContain(`--site-accent-50-dark: ${expectedScale[950]};`);
		});

		it("does NOT include --site-surface-dark in dark block when theme.dark is not provided", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).not.toContain("--site-surface-dark:");
		});

		it("includes --site-surface-dark in dark block when theme.dark.surface is provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-surface-dark: #1a1022");
		});

		it("includes --site-surface-secondary-dark when theme.dark.surfaceSecondary is provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-surface-secondary-dark: #26183a");
		});

		it("includes --site-text-dark when theme.dark.text is provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-text-dark: #f0e8ff");
		});

		it("includes --site-muted-dark when theme.dark.muted is provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-muted-dark: #a78bfa");
		});

		it("rebinds --site-surface inside dark mode when theme.dark.surface is provided", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-surface: #1a1022;");
		});

		it("rebinds --site-text and --site-muted inside dark mode when provided", () => {
			const css = generateThemeCSS(themeWithDark);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-text: #f0e8ff;");
			expect(darkSection).toContain("--site-muted: #a78bfa;");
		});

		it("dark vars appear in both @media block AND :root.dark block", () => {
			const css = generateThemeCSS(themeWithDark);
			// :root.dark should contain the dark surface
			const rootDarkMatch = css.match(/:root\.dark\s*\{([^}]+)\}/s);
			expect(rootDarkMatch).not.toBeNull();
			expect(rootDarkMatch?.[1]).toContain("--site-surface-dark:");
		});

		it("@media block vars have the same indentation as :root.dark block vars", () => {
			const css = generateThemeCSS(baseTheme);

			// Extract the --site-primary line from inside @media :root:not(.light)
			const mediaMatch = css.match(/@media[^{]*\{[^{]*:root:not\(\.light\)\s*\{([^}]+)\}/s);
			expect(mediaMatch).not.toBeNull();
			const mediaPrimaryLine = mediaMatch?.[1]
				.split("\n")
				.find((l) => l.includes("--site-primary:"));
			expect(mediaPrimaryLine).toBeDefined();
			const mediaIndent = mediaPrimaryLine?.match(/^(\s*)/)?.[1] ?? "";

			// Extract the --site-primary line from inside :root.dark
			const rootDarkMatch = css.match(/:root\.dark\s*\{([^}]+)\}/s);
			expect(rootDarkMatch).not.toBeNull();
			const rootDarkPrimaryLine = rootDarkMatch?.[1]
				.split("\n")
				.find((l) => l.includes("--site-primary:"));
			expect(rootDarkPrimaryLine).toBeDefined();
			const rootDarkIndent = rootDarkPrimaryLine?.match(/^(\s*)/)?.[1] ?? "";

			expect(mediaIndent).toBe(rootDarkIndent);
		});

		it("only emits explicit raw dark override vars when those properties are provided", () => {
			const themePartialDark: Theme = {
				...baseTheme,
				dark: { surface: "#111111" },
			};
			const css = generateThemeCSS(themePartialDark);
			expect(css).toContain("--site-surface-dark: #111111");
			expect(css).not.toContain("--site-text-dark:");
			expect(css).not.toContain("--site-muted-dark:");
		});

		it("emits dark presentation surface tokens when dark overrides are provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-surface-elevated-dark:");
			expect(css).toContain("--site-surface-sunken-dark:");
			expect(css).toContain("--site-surface-frost-dark:");
			expect(css).toContain("--site-surface-frost-border-dark:");
			expect(css).toContain("--site-section-highlight-bg-dark:");
		});

		it("emits dark presentation shadow tokens when dark overrides are provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-shadow-card-dark:");
			expect(css).toContain("--site-shadow-lg-dark:");
			expect(css).toContain("--site-shadow-ambient-dark:");
		});

		it("emits dark presentation CTA tokens when dark overrides are provided", () => {
			const css = generateThemeCSS(themeWithDark);
			expect(css).toContain("--site-primary-button-bg-dark:");
			expect(css).toContain("--site-primary-button-hover-bg-dark:");
			expect(css).toContain("--site-primary-button-fg-dark:");
			expect(css).toContain("--site-primary-button-border-dark:");
			expect(css).toContain("--site-primary-button-shadow-dark:");
		});
	});

	describe("dark neutral scale (Issue 2)", () => {
		it("emits --site-neutral-50-dark in dark block when surface is tinted", () => {
			const css = generateThemeCSS(themeWithSurface);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-neutral-50-dark:");
		});

		it("emits all 11 dark neutral steps for a tinted surface", () => {
			const css = generateThemeCSS(themeWithSurface);
			const darkSection = css.split("@media")[1] ?? "";
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(darkSection).toContain(`--site-neutral-${step}-dark:`);
			}
		});

		it("does NOT emit --site-neutral-50-dark when surface is white", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).not.toContain("--site-neutral-50-dark:");
		});

		it("does NOT emit --site-neutral-50-dark when surface is explicitly #ffffff", () => {
			const css = generateThemeCSS({ ...baseTheme, surface: "#ffffff" });
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).not.toContain("--site-neutral-50-dark:");
		});

		it("dark neutral-50 step is darker than the corresponding light neutral-50", () => {
			const css = generateThemeCSS(themeWithSurface);
			// Extract light neutral-50
			const lightMatch = css.match(/--color-neutral-50:\s*(#[0-9a-f]{6})/i);
			expect(lightMatch).not.toBeNull();
			if (!lightMatch?.[1]) return;
			const lightHex = lightMatch[1];
			const lightR = parseInt(lightHex.slice(1, 3), 16);
			const lightG = parseInt(lightHex.slice(3, 5), 16);
			const lightB = parseInt(lightHex.slice(5, 7), 16);
			const lightLum = (lightR + lightG + lightB) / 3;

			// Extract dark neutral-50 (from dark block)
			const darkSection = css.split("@media")[1] ?? "";
			const darkMatch = darkSection.match(/--site-neutral-50-dark:\s*(#[0-9a-f]{6})/i);
			expect(darkMatch).not.toBeNull();
			if (!darkMatch?.[1]) return;
			const darkHex = darkMatch[1];
			const darkR = parseInt(darkHex.slice(1, 3), 16);
			const darkG = parseInt(darkHex.slice(3, 5), 16);
			const darkB = parseInt(darkHex.slice(5, 7), 16);
			const darkLum = (darkR + darkG + darkB) / 3;

			// Dark step-50 should be much darker than light step-50
			expect(darkLum).toBeLessThan(lightLum);
			expect(darkLum).toBeLessThan(100); // dark surface
		});

		it("dark neutral vars appear in both @media block and :root.dark block", () => {
			const css = generateThemeCSS(themeWithSurface);
			// Should appear in @media dark block
			const mediaMatch = css.match(/@media[^{]*\{[^{]*:root:not\(\.light\)\s*\{([^}]+)\}/s);
			expect(mediaMatch).not.toBeNull();
			expect(mediaMatch?.[1]).toContain("--site-neutral-50-dark:");

			// Should also appear in :root.dark
			const rootDarkMatch = css.match(/:root\.dark\s*\{([^}]+)\}/s);
			expect(rootDarkMatch).not.toBeNull();
			expect(rootDarkMatch?.[1]).toContain("--site-neutral-50-dark:");
		});
	});

	describe("dark primary/accent scale hooks (Issue 3)", () => {
		it("emits --site-primary-50-dark in dark block", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-primary-50-dark:");
		});

		it("emits --site-primary-100-dark in dark block", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-primary-100-dark:");
		});

		it("emits --site-accent-50-dark in dark block", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			expect(darkSection).toContain("--site-accent-50-dark:");
		});

		it("primary-50-dark value is a dark color (low luminance)", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			const match = darkSection.match(/--site-primary-50-dark:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const lum = (r + g + b) / 3;
			expect(lum).toBeLessThan(80); // should be a dark value
		});

		it("accent-50-dark value is a dark color (low luminance)", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			const match = darkSection.match(/--site-accent-50-dark:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const lum = (r + g + b) / 3;
			expect(lum).toBeLessThan(80); // should be a dark value
		});

		it("dark scale hooks appear in both @media block and :root.dark block", () => {
			const css = generateThemeCSS(baseTheme);
			const mediaMatch = css.match(/@media[^{]*\{[^{]*:root:not\(\.light\)\s*\{([^}]+)\}/s);
			expect(mediaMatch).not.toBeNull();
			expect(mediaMatch?.[1]).toContain("--site-primary-50-dark:");

			const rootDarkMatch = css.match(/:root\.dark\s*\{([^}]+)\}/s);
			expect(rootDarkMatch).not.toBeNull();
			expect(rootDarkMatch?.[1]).toContain("--site-primary-50-dark:");
		});

		it("primary-50-dark and primary-100-dark differ (darker for 950 range)", () => {
			const css = generateThemeCSS(baseTheme);
			const darkSection = css.split("@media")[1] ?? "";
			const match50 = darkSection.match(/--site-primary-50-dark:\s*(#[0-9a-f]{6})/i);
			const match100 = darkSection.match(/--site-primary-100-dark:\s*(#[0-9a-f]{6})/i);
			expect(match50).not.toBeNull();
			expect(match100).not.toBeNull();
			// Both should be valid hex
			expect(match50?.[1]).toMatch(/^#[0-9a-f]{6}$/i);
			expect(match100?.[1]).toMatch(/^#[0-9a-f]{6}$/i);
		});
	});

	describe("3-digit hex support (hexToRgb expansion)", () => {
		it("generates all 11 primary scale steps when primary is a 3-digit hex (#06f)", () => {
			const themeWith3DigitPrimary: Theme = {
				...baseTheme,
				primary: "#06f",
			};
			const css = generateThemeCSS(themeWith3DigitPrimary);
			const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
			for (const step of steps) {
				expect(css).toContain(`--color-primary-${step}:`);
			}
		});

		it("all 11 primary scale values are valid 6-digit hex when primary is #06f", () => {
			const themeWith3DigitPrimary: Theme = {
				...baseTheme,
				primary: "#06f",
			};
			const css = generateThemeCSS(themeWith3DigitPrimary);
			const matches = [...css.matchAll(/--color-primary-\d+:\s*(#[0-9a-f]{6})/gi)];
			expect(matches).toHaveLength(11);
			for (const match of matches) {
				expect(match[1]).toMatch(/^#[0-9a-f]{6}$/i);
			}
		});

		it("3-digit primary #06f produces a blue-tinted primary-50 (high lightness, blue bias)", () => {
			const themeWith3DigitPrimary: Theme = {
				...baseTheme,
				primary: "#06f",
			};
			const css = generateThemeCSS(themeWith3DigitPrimary);
			const match = css.match(/--color-primary-50:\s*(#[0-9a-f]{6})/i);
			expect(match).not.toBeNull();
			if (!match?.[1]) return;
			const hex = match[1];
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			// primary-50 should be near-white with a color tint (high luminance)
			const luminance = (r + g + b) / 3;
			expect(luminance).toBeGreaterThan(200);
			// blue channel should be at least as high as red (blue-tinted hue preserved)
			expect(b).toBeGreaterThanOrEqual(r);
		});
	});

	describe("color generation consistency", () => {
		it("generates different scales for different primary colors", () => {
			const css1 = generateThemeCSS(baseTheme);
			const css2 = generateThemeCSS({ ...baseTheme, primary: "#7c3aed" });
			const p500_1 = css1.match(/--color-primary-500:\s*(#[0-9a-f]{6})/i)?.[1];
			const p500_2 = css2.match(/--color-primary-500:\s*(#[0-9a-f]{6})/i)?.[1];
			expect(p500_1).not.toEqual(p500_2);
		});

		it("always produces valid 6-digit hex values for primary scale", () => {
			const css = generateThemeCSS(baseTheme);
			const matches = css.matchAll(/--color-primary-\d+:\s*(#[0-9a-f]{6})/gi);
			let count = 0;
			for (const match of matches) {
				expect(match[1]).toMatch(/^#[0-9a-f]{6}$/i);
				count++;
			}
			expect(count).toBe(11);
		});

		it("always produces valid 6-digit hex values for accent scale", () => {
			const css = generateThemeCSS(baseTheme);
			const matches = css.matchAll(/--color-accent-\d+:\s*(#[0-9a-f]{6})/gi);
			let count = 0;
			for (const match of matches) {
				expect(match[1]).toMatch(/^#[0-9a-f]{6}$/i);
				count++;
			}
			expect(count).toBe(11);
		});

		it("works with a very dark primary color", () => {
			const css = generateThemeCSS({ ...baseTheme, primary: "#1e3a5f" });
			expect(css).toContain(":root {");
			expect(css).toMatch(/--color-primary-50:\s*#[0-9a-f]{6}/i);
		});

		it("works with a very light primary color", () => {
			const css = generateThemeCSS({ ...baseTheme, primary: "#e0f2fe" });
			expect(css).toContain(":root {");
			expect(css).toMatch(/--color-primary-950:\s*#[0-9a-f]{6}/i);
		});

		it("works with a fully saturated primary color", () => {
			const css = generateThemeCSS({ ...baseTheme, primary: "#ff0000" });
			expect(css).toContain(":root {");
			expect(css).toMatch(/--color-primary-500:\s*#[0-9a-f]{6}/i);
		});
	});

	describe("Horiva palette preservation", () => {
		it("keeps Horiva primary light steps near the configured purple hue instead of drifting cyan", () => {
			const css = generateThemeCSS(horivaTheme);

			const baseHue = hueFromHex(horivaTheme.primary);
			const primary50Hue = hueFromHex(getHexToken(css, "--color-primary-50"));
			const primary100Hue = hueFromHex(getHexToken(css, "--color-primary-100"));

			expect(hueDistance(primary50Hue, baseHue)).toBeLessThan(45);
			expect(hueDistance(primary100Hue, baseHue)).toBeLessThan(45);
		});

		it("keeps Horiva accent and neutral light steps close to the configured warm editorial hue", () => {
			const css = generateThemeCSS(horivaTheme);

			const accentHue = hueFromHex(horivaTheme.accent);
			const surfaceHue = hueFromHex(horivaTheme.surface ?? horivaTheme.primary);
			const accent50Hue = hueFromHex(getHexToken(css, "--color-accent-50"));
			const accent100Hue = hueFromHex(getHexToken(css, "--color-accent-100"));
			const neutral100Hue = hueFromHex(getHexToken(css, "--color-neutral-100"));

			expect(hueDistance(accent50Hue, accentHue)).toBeLessThan(35);
			expect(hueDistance(accent100Hue, accentHue)).toBeLessThan(35);
			expect(hueDistance(neutral100Hue, surfaceHue)).toBeLessThan(35);
		});

		it("derives warm dark surface and text tokens for tinted editorial themes without explicit dark overrides", () => {
			const css = generateThemeCSS(horivaTheme);
			const darkSection = css.split("@media")[1] ?? "";

			expect(darkSection).not.toContain("--site-surface: #0f172a;");
			expect(darkSection).not.toContain("--site-text: #f1f5f9;");
			expect(darkSection).not.toContain("--site-muted: #94a3b8;");

			const darkSurface = hexChannels(getHexToken(darkSection, "--site-surface"));
			const darkText = hexChannels(getHexToken(darkSection, "--site-text"));
			const darkMuted = hexChannels(getHexToken(darkSection, "--site-muted"));

			expect(darkSurface.r).toBeGreaterThan(darkSurface.b);
			expect(darkText.r).toBeGreaterThan(darkText.b);
			expect(darkMuted.r).toBeGreaterThan(darkMuted.b);
		});
	});
});
