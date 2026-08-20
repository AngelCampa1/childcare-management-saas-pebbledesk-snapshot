import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("marketing redesign source regressions", () => {
	it("drops the old fallback font stack from the shared stylesheet", () => {
		const source = readSource("../styles/globals.css");

		expect(source).not.toContain("Space Grotesk");
		expect(source).not.toContain("IBM Plex Sans");
		expect(source).not.toContain("surface-glass");
		expect(source).not.toContain("shadow-glow-accent");
	});

	it("removes decorative landing-layout halo gradients from the shared shell", () => {
		const source = readSource("./landing-layout.astro");

		expect(source).not.toContain("radial-gradient(circle_at_top");
		expect(source).not.toContain("h-[24rem]");
	});

	it("simplifies the shared header away from theme-swapped logos while keeping an SSR mobile fallback", () => {
		const source = readSource("../components/site-header.astro");

		expect(source).not.toContain("theme-dark-only");
		expect(source).toContain("data-mobile-nav-fallback");
	});

	it("removes shimmer and editorial-panel treatments from the shared footer capture", () => {
		const source = readSource("../components/site-footer.astro");

		expect(source).not.toContain("btn-shimmer");
		expect(source).not.toContain("editorial-panel");
	});

	it("keeps prose link styling from washing out primary CTA buttons", () => {
		const source = readSource("../styles/globals.css");

		expect(source).toContain(".prose a.btn-primary");
		expect(source).toContain("color: var(--primary-button-fg");
		expect(source).toContain("text-decoration: none");
	});

	it("uses pill radius for shared marketing button classes", () => {
		const source = readSource("../styles/globals.css");
		const searchOverlaySource = readSource("../components/search-overlay.tsx");
		const themeToggleSource = readSource("../components/theme-toggle.tsx");
		const referralShareSource = readSource("../components/referral-share.tsx");

		expect(source).toContain("--primary-button-radius: var(--site-primary-button-radius, 9999px)");
		expect(source).toContain(".btn-secondary");
		expect(source).toContain("border-radius: 9999px");
		expect(source).not.toContain(
			"--primary-button-radius: var(--site-primary-button-radius, var(--radius-md))",
		);
		expect(source).not.toContain("border-radius: var(--radius-sm)");
		expect(searchOverlaySource).toContain("rounded-full");
		expect(themeToggleSource).toContain("rounded-full");
		expect(referralShareSource).toContain("rounded-full");
	});

	it("lets FAQ sections inherit the surrounding page background", () => {
		const source = readSource("../components/faq-section.astro");

		expect(source).toContain('data-section="faq"');
		expect(source).not.toContain('style="background: var(--section-gradient-a)"');
	});

	it("uses the renamed shared accent shadow token in sticky mobile CTAs", () => {
		const source = readSource("../components/sticky-mobile-cta.astro");

		expect(source).toContain("shadow-[var(--shadow-accent-soft)]");
		expect(source).not.toContain("shadow-[var(--shadow-glow-accent)]");
	});

	it("adds the reusable product dashboard and floating collage source components", () => {
		const dashboardSource = readSource("../components/product-dashboard.astro");
		const collageSource = readSource("../components/floating-collage.astro");

		expect(dashboardSource).toContain("data-product-dashboard");
		expect(dashboardSource).toContain("Audit-ready today");
		expect(dashboardSource).toContain("Infants");
		expect(collageSource).toContain("data-floating-collage");
		expect(collageSource).toContain("<ProductDashboard");
		expect(collageSource).toContain("Attendance captured");
	});
});
