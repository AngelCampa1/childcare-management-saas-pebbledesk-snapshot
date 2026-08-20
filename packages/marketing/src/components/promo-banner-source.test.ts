import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./promo-banner.astro"), "utf8");

describe("promo-banner source", () => {
	it("accepts the promotion config props from SiteConfig", () => {
		expect(source).toContain("code: string");
		expect(source).toContain("label: string");
		expect(source).toContain("renewalLabel?: string");
		expect(source).toContain("validThrough?: string | null");
		expect(source).toContain("urgencyLabel?: string");
		expect(source).toContain("ctaHref?: string");
		expect(source).toContain("ctaLabel?: string");
	});

	it("treats validThrough as inclusive end-of-day UTC and hides after expiry", () => {
		expect(source).toContain(
			"validThrough ? new Date(`$" + "{validThrough}T23:59:59Z`).getTime() : 0",
		);
		expect(source).toContain("Date.now() > expiryMs");
		expect(source).toContain("{!isExpired && (");
	});

	it("renders an accessible region with a dismiss button", () => {
		expect(source).toContain('role="region"');
		expect(source).toContain('aria-label="Promotional announcement"');
		expect(source).toContain('aria-label="Dismiss promotional banner"');
		expect(source).toContain("data-promo-banner-dismiss");
	});

	it("persists dismissal in localStorage keyed by the promo code", () => {
		expect(source).toContain('"pebbledesk_promo_dismissed"');
		expect(source).toContain("window.localStorage.setItem(DISMISS_KEY, code)");
		expect(source).toContain("window.localStorage.getItem(DISMISS_KEY)");
	});

	it("hides the banner inline before paint when expired or dismissed", () => {
		expect(source).toContain("<script is:inline data-promo-banner-init>");
		expect(source).toContain("Date.now() > expiresAt");
		expect(source).toContain("dismissed === code");
	});

	it("respects prefers-reduced-motion for the highlight pulse", () => {
		expect(source).toContain("@media (prefers-reduced-motion: reduce)");
		expect(source).toContain("animation: none");
	});

	it("renders an optional CTA link when ctaHref is provided", () => {
		expect(source).toContain("{ctaHref && (");
		expect(source).toContain("{ctaLabel}");
	});

	it("writes numeric expiry timestamp into data-promo-expires-at attribute", () => {
		expect(source).toContain("data-promo-expires-at={expiryMs}");
	});

	it("does not render public expiry copy", () => {
		expect(source).not.toContain("expiryNote");
		expect(source).not.toContain("formattedExpiry");
	});

	it("keeps spacing between the limited offer and deadline", () => {
		expect(source).toContain(
			'<span class="promo-banner-highlight font-bold">{code} gives {label}.</span>',
		);
		expect(source).toContain('{renewalLabel && <span class="ml-1">{renewalLabel}</span>}');
		expect(source).toContain("{urgencyLabel}:");
		expect(source).not.toContain("Limited offer:");
		expect(source).not.toContain("Ends {formattedExpiry}");
		expect(source).not.toContain("first yearEnds");
	});

	it("guards against open-ended or invalid validThrough producing a visible expired state", () => {
		expect(source).toContain("const expiryMs = validThrough ?");
		expect(source).toContain("expiryMs > 0 && Number.isFinite(expiryMs)");
	});

	it("increases dismiss button touch target to 40px for tablet users", () => {
		expect(source).toContain("h-10 w-10");
	});

	it("announces dismissal to screen readers via an aria-live region", () => {
		expect(source).toContain('role="status"');
		expect(source).toContain('aria-live="polite"');
		expect(source).toContain("promo-banner-status");
		expect(source).toContain('"Promotional banner dismissed"');
	});

	it("hides via hidden attribute only, not redundant style.display", () => {
		expect(source).toContain('banner.setAttribute("hidden", "")');
		expect(source).not.toContain('banner.style.display = "none"');
	});
});
