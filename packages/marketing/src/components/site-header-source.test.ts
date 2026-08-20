import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "./site-header.astro"), "utf8");

describe("site-header mobile nav source", () => {
	it("passes promo renewal copy into the promo banner", () => {
		expect(source).toContain("renewalLabel={promo.renewalLabel}");
	});

	it("includes a dedicated mobile close affordance inside the panel", () => {
		expect(source).toContain("data-mobile-nav-close");
		expect(source).toContain('aria-label="Close navigation menu"');
	});

	it("keeps the mobile overlay hidden in the SSR markup until the client nav script enables it", () => {
		expect(source).toContain('<div data-mobile-nav-overlay class="mobile-nav-overlay" hidden>');
	});

	it("keeps an SSR mobile navigation fallback until the client nav script enables the trigger", () => {
		expect(source).toContain("data-mobile-nav-trigger");
		expect(source).toContain("data-mobile-nav-fallback");
		expect(source).toContain('[data-mobile-nav-ready="true"] .mobile-nav-trigger');
		expect(source).toContain('[data-mobile-nav-ready="true"] [data-mobile-nav-fallback]');
	});

	it("keeps desktop navigation and header CTAs hidden until the large breakpoint", () => {
		expect(source).toContain("site-header-nav hidden lg:flex");
		expect(source).toContain('class="hidden lg:flex items-center gap-3"');
		expect(source).toContain('class="relative lg:hidden"');
		expect(source).not.toContain("site-header-nav hidden md:flex");
		expect(source).not.toContain('class="hidden md:flex items-center gap-3"');
		expect(source).not.toContain('class="relative md:hidden"');
	});

	it("renders Resources megamenu categories in desktop and mobile navigation", () => {
		expect(source).toContain("isMegaMenu(item)");
		expect(source).toContain("item.megaMenu.map");
		expect(source).toContain("mega-panel");
		expect(source).toContain("data-mega-content");
	});
});

describe("site-header mega menu source", () => {
	it("mega menu trigger button has aria-haspopup set to true", () => {
		expect(source).toContain('aria-haspopup="true"');
	});

	it("mega panel uses the mega-panel CSS class for visibility control", () => {
		expect(source).toContain('class="mega-panel absolute left-0 right-0 top-full"');
	});

	it("mega panel visibility is toggled via is-open class on mega-group", () => {
		expect(source).toContain(".mega-group.is-open .mega-panel");
	});

	it("desktop mega open/close is driven by mouseenter and mouseleave JS events", () => {
		expect(source).toContain('addEventListener("mouseenter", open)');
		expect(source).toContain('addEventListener("mouseleave", close)');
	});

	it("close has an 80ms delay to prevent snap-shut when crossing the gap", () => {
		expect(source).toContain("}, 80)");
	});

	it("Escape key closes the open mega panel and returns focus to trigger", () => {
		expect(source).toContain('e.key === "Escape"');
		expect(source).toContain('group.classList.remove("is-open")');
	});

	it("mobile accordion uses data-mega-trigger attribute on expand button", () => {
		expect(source).toContain("data-mega-trigger");
	});

	it("mobile accordion content uses data-mega-content with hidden attribute by default", () => {
		expect(source).toContain("data-mega-content hidden");
	});

	it("Sign in link is conditionally rendered when signInHref is provided", () => {
		expect(source).toContain("{signInHref && (");
		expect(source).toContain("Sign in");
	});
});
