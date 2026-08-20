import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogInstance } from "../lib/analytics";
import { PricingCards } from "./pricing-cards";

function makePostHogMock(overrides: Partial<PostHogInstance> = {}): PostHogInstance {
	return { capture: vi.fn(), identify: vi.fn(), ...overrides };
}

const TIERS_WITH_CENTS = [
	{
		slug: "starter",
		name: "Starter",
		price: "$129/mo billed annually",
		monthlyPriceCents: 15900,
		promotionalPrice: {
			monthly: {
				badgeLabel: "80% off the first year",
				originalPriceLabel: "$159/mo",
				discountedPriceLabel: "$32/mo",
				renewalPriceLabel: "Then $159/mo",
			},
			annual: {
				badgeLabel: "80% off the first year",
				originalPriceLabel: "$129/mo billed annually",
				discountedPriceLabel: "$26/mo when paid yearly",
				originalAnnualTotalLabel: "$1548/year",
				discountedAnnualTotalLabel: "$309.60/year",
				renewalPriceLabel: "Then $129/mo when paid yearly ($1548/year)",
			},
		},
		annualPriceOverride: "$1548/year",
		features: ["Feature A", "Feature B"],
		cta: { text: "Start trial", target: "/signup?plan=starter" },
	},
	{
		slug: "pro",
		name: "Pro",
		price: "$199/mo billed annually",
		monthlyPriceCents: 23900,
		annualPriceOverride: "$2388/year",
		highlighted: true,
		features: ["Feature A", "Feature B", "Feature C"],
		cta: { text: "Start trial", target: "/signup?plan=pro" },
	},
	{
		slug: "enterprise",
		name: "Enterprise",
		price: "Custom",
		features: ["Everything"],
		cta: { text: "Contact sales", target: "/contact" },
	},
];

const MINIMAL_TIER = [
	{
		slug: "home",
		name: "Home",
		price: "$39/mo billed annually",
		monthlyPriceCents: 4900,
		features: ["Feature A"],
		cta: { text: "Start trial", target: "/signup?plan=home" },
	},
];

beforeEach(() => {
	delete window.posthog;
});
afterEach(() => {
	delete window.posthog;
});

describe("PricingCards default state", () => {
	it("defaults to annual billing period", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		expect(annualBtn).toHaveAttribute("aria-checked", "true");
	});

	it("shows the canonical annual display for tiers with monthlyPriceCents", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		expect(screen.getByText("$26/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$199/mo")).toBeInTheDocument();
		expect(screen.queryByText("$129/mo")).not.toBeInTheDocument();
		// The list price now shows struck through above the discounted price.
		expect(screen.getByText("$129/mo billed annually")).toBeInTheDocument();
		expect(screen.queryByText("$199/mo billed annually")).not.toBeInTheDocument();
		expect(screen.getByText("$309.60/year")).toBeInTheDocument();
	});

	it("shows annual totals when annual is active", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		const labels = [screen.getByText("$309.60/year"), screen.getByText("$2388/year")];
		expect(labels.length).toBe(2);
	});

	it("uses a clean yearly fallback when an annual total is not provided", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		expect(screen.getByText("Billed yearly")).toBeInTheDocument();
		expect(screen.queryByText("billed annually")).not.toBeInTheDocument();
	});

	it("does not render Enterprise as a selectable pricing card", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		expect(screen.queryByRole("heading", { name: "Enterprise", level: 3 })).not.toBeInTheDocument();
	});

	it("shows promotional price as primary and hides list-price comparison", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		expect(screen.getByText("$26/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("80% off the first year")).toBeInTheDocument();
		expect(screen.getByText("$309.60/year")).toBeInTheDocument();
		expect(screen.getByText("Then $129/mo when paid yearly ($1548/year)")).toBeInTheDocument();
		expect(screen.queryByText("$129/mo")).not.toBeInTheDocument();
		expect(screen.queryByText("$1548/year")).not.toBeInTheDocument();
		expect(screen.queryByText(/normally/i)).not.toBeInTheDocument();
		expect(screen.queryByText("80% off once")).not.toBeInTheDocument();
	});

	it("renders struck-through original list price above the discounted price when a promotional price is present", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		const struckElement = screen.getByText("$129/mo billed annually");
		expect(struckElement.tagName).toBe("P");
		expect(struckElement.className).toContain("line-through");
	});

	it("does not render a struck-through price element when no promotional price is present", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		const allPs = document.querySelectorAll("p.line-through");
		expect(allPs.length).toBe(0);
	});

	it("shows Enterprise as a small sales-led note when supplied", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		const note = screen.getByText("Enterprise");
		const aside = note.closest("aside");
		const salesLink = screen.getByRole("link", { name: "Contact sales" });

		expect(aside).toHaveTextContent("Custom");
		expect(aside).toContainElement(salesLink);
		expect(salesLink).toHaveAttribute("href", "/contact");
	});
});

describe("PricingCards toggle UI", () => {
	it("renders both Monthly and Annual radio buttons", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		expect(screen.getByRole("radio", { name: /monthly/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /annual/i })).toBeInTheDocument();
	});

	it("always shows the '2 months free' pill text inside the Annual button", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} annualSavingsText="2 months free" />);
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		expect(annualBtn).toHaveTextContent("2 months free");
	});

	it("does not render annual default as customer-facing savings copy", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} annualSavingsText="2 months free" />);
		expect(screen.queryByText(/annual default/i)).not.toBeInTheDocument();
	});

	it("uses custom toggle labels from props", () => {
		render(
			<PricingCards
				tiers={TIERS_WITH_CENTS}
				monthlyToggleLabel="Per Month"
				annualToggleLabel="Per Year"
			/>,
		);
		expect(screen.getByRole("radio", { name: /per month/i })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: /per year/i })).toBeInTheDocument();
	});

	it("does not render toggle when no tier has monthlyPriceCents", () => {
		const tiersNoToggle = [
			{
				slug: "ent",
				name: "Enterprise",
				price: "Custom",
				features: [],
				cta: { text: "Contact", target: "/contact" },
			},
		];
		render(<PricingCards tiers={tiersNoToggle} />);
		expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
	});

	it("suppresses toggle when showBillingToggle is false even if tiers have monthlyPriceCents", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} showBillingToggle={false} />);
		expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
	});

	it("shows toggle when showBillingToggle is true and tiers have monthlyPriceCents", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} showBillingToggle={true} />);
		expect(screen.getByRole("radiogroup")).toBeInTheDocument();
	});

	it("renders with empty tiers array without crashing", () => {
		render(<PricingCards tiers={[]} />);
		expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
		expect(screen.queryByRole("article")).not.toBeInTheDocument();
	});
});

describe("PricingCards switching to monthly", () => {
	it("switches to monthly when Monthly button is clicked", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		const monthlyBtn = screen.getByRole("radio", { name: /monthly/i });
		fireEvent.click(monthlyBtn);
		expect(monthlyBtn).toHaveAttribute("aria-checked", "true");
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		expect(annualBtn).toHaveAttribute("aria-checked", "false");
	});

	it("shows the monthly price after switching to monthly", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		expect(screen.getByText("$32/mo")).toBeInTheDocument();
		// The monthly list price now shows struck through above the discounted price.
		expect(screen.getByText("$159/mo")).toBeInTheDocument();
		expect(screen.getByText("$239/mo")).toBeInTheDocument();
	});

	it("shows first-year promotion terms and renewal price after switching to monthly", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		expect(screen.getByText("80% off the first year")).toBeInTheDocument();
		expect(screen.getByText("Then $159/mo")).toBeInTheDocument();
		expect(screen.queryByText("80% off for 12 months")).not.toBeInTheDocument();
		expect(screen.queryByText("80% off once")).not.toBeInTheDocument();
	});

	it("hides 'billed annually' sub-label when monthly is selected", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		expect(screen.queryByText("billed annually")).not.toBeInTheDocument();
	});
});

describe("PricingCards analytics", () => {
	it("calls trackBillingToggle with 'monthly' when switching to monthly", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });
		render(<PricingCards tiers={TIERS_WITH_CENTS} sourcePage="/pricing" />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "monthly",
			source_page: "/pricing",
		});
	});

	it("calls trackBillingToggle with 'annual' when switching back to annual", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });
		render(<PricingCards tiers={TIERS_WITH_CENTS} sourcePage="/pricing" />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		fireEvent.click(screen.getByRole("radio", { name: /annual/i }));
		expect(capture).toHaveBeenCalledTimes(2);
		expect(capture).toHaveBeenNthCalledWith(2, ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "annual",
			source_page: "/pricing",
		});
	});

	it("defaults sourcePage to '/pricing/' when not provided", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		expect(capture).toHaveBeenCalledWith(ANALYTICS_EVENTS.billingToggleSwitched, {
			billing_period: "monthly",
			source_page: "/pricing/",
		});
	});

	it("does not track when clicking the already-selected option", () => {
		const capture = vi.fn();
		window.posthog = makePostHogMock({ capture });
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		// Annual is already selected, so clicking it again should not fire
		fireEvent.click(screen.getByRole("radio", { name: /annual/i }));
		expect(capture).not.toHaveBeenCalled();
	});
});

describe("PricingCards keyboard navigation", () => {
	it("moves focus to Monthly and selects it on ArrowLeft from Annual", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		fireEvent.keyDown(annualBtn, { key: "ArrowLeft" });
		expect(screen.getByRole("radio", { name: /monthly/i })).toHaveAttribute("aria-checked", "true");
	});

	it("moves focus to Annual and selects it on ArrowRight from Monthly", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		const monthlyBtn = screen.getByRole("radio", { name: /monthly/i });
		fireEvent.keyDown(monthlyBtn, { key: "ArrowRight" });
		expect(screen.getByRole("radio", { name: /annual/i })).toHaveAttribute("aria-checked", "true");
	});

	it("wraps ArrowRight from last option back to first", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		// Annual is last option; ArrowRight should wrap to Monthly
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		fireEvent.keyDown(annualBtn, { key: "ArrowRight" });
		expect(screen.getByRole("radio", { name: /monthly/i })).toHaveAttribute("aria-checked", "true");
	});

	it("selects first option on Home key", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		fireEvent.keyDown(annualBtn, { key: "Home" });
		expect(screen.getByRole("radio", { name: /monthly/i })).toHaveAttribute("aria-checked", "true");
	});

	it("selects last option on End key", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		const monthlyBtn = screen.getByRole("radio", { name: /monthly/i });
		fireEvent.keyDown(monthlyBtn, { key: "End" });
		expect(screen.getByRole("radio", { name: /annual/i })).toHaveAttribute("aria-checked", "true");
	});

	it("ArrowDown behaves like ArrowRight", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		fireEvent.keyDown(screen.getByRole("radio", { name: /monthly/i }), { key: "ArrowDown" });
		expect(screen.getByRole("radio", { name: /annual/i })).toHaveAttribute("aria-checked", "true");
	});

	it("ArrowUp behaves like ArrowLeft", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		fireEvent.keyDown(annualBtn, { key: "ArrowUp" });
		expect(screen.getByRole("radio", { name: /monthly/i })).toHaveAttribute("aria-checked", "true");
	});

	it("wraps ArrowLeft from first option back to last", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		// Switch to monthly first (index 0, the first option)
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		const monthlyBtn = screen.getByRole("radio", { name: /monthly/i });
		// ArrowLeft from first should wrap to last (Annual)
		fireEvent.keyDown(monthlyBtn, { key: "ArrowLeft" });
		expect(screen.getByRole("radio", { name: /annual/i })).toHaveAttribute("aria-checked", "true");
	});
});

describe("PricingCards tier description", () => {
	it("renders tier description when provided", () => {
		const tiersWithDesc = [
			{
				slug: "basic",
				name: "Basic",
				price: "$49/mo",
				monthlyPriceCents: 4900,
				description: "Perfect for small centers",
				features: ["Feature A"],
				cta: { text: "Start trial", target: "/signup" },
			},
		];
		render(<PricingCards tiers={tiersWithDesc} />);
		expect(screen.getByText("Perfect for small centers")).toBeInTheDocument();
	});

	it("does not render description text when description is omitted", () => {
		render(<PricingCards tiers={MINIMAL_TIER} />);
		// MINIMAL_TIER has no description field, so no description text appears
		expect(screen.queryByText("Perfect for small centers")).not.toBeInTheDocument();
	});
});

describe("PricingCards annual badge style when monthly is active", () => {
	it("shows the savings pill in non-selected style when Monthly is active", () => {
		render(<PricingCards tiers={MINIMAL_TIER} annualSavingsText="2 months free" />);
		// Switch to monthly so the Annual button badge gets non-selected style
		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));
		const annualBtn = screen.getByRole("radio", { name: /annual/i });
		const badge = annualBtn.querySelector("span");
		expect(badge).toBeInTheDocument();
		// Should have non-selected color class
		expect(badge?.className).toContain("color-accent-100");
	});
});

describe("PricingCards visual emphasis", () => {
	it("renders a CTA link for each tier", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		const startTrialLinks = screen.getAllByRole("link", { name: "Start trial" });
		expect(startTrialLinks).toHaveLength(2);
		expect(
			screen.getByRole("link", { name: "Contact sales" }).closest("aside"),
		).toBeInTheDocument();
	});

	it("adds billing=annual to self-serve CTA links while annual pricing is selected", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		expect(screen.getAllByRole("link", { name: "Start trial" })[0]).toHaveAttribute(
			"href",
			"/signup?plan=starter&billing=annual",
		);
	});

	it("adds billing=monthly to self-serve CTA links after switching to monthly", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		fireEvent.click(screen.getByRole("radio", { name: /monthly/i }));

		expect(screen.getAllByRole("link", { name: "Start trial" })[0]).toHaveAttribute(
			"href",
			"/signup?plan=starter&billing=monthly",
		);
	});

	it("does not add billing cadence to unrelated paths that mention signup", () => {
		render(
			<PricingCards
				tiers={[
					{
						...TIERS_WITH_CENTS[0],
						cta: { text: "Read guide", target: "/resources/signup-guide?topic=pricing" },
					},
				]}
			/>,
		);

		expect(screen.getByRole("link", { name: "Read guide" })).toHaveAttribute(
			"href",
			"/resources/signup-guide?topic=pricing",
		);
	});

	it("renders tier names as h3 headings", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		expect(screen.getByRole("heading", { name: "Starter", level: 3 })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Pro", level: 3 })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Enterprise", level: 3 })).not.toBeInTheDocument();
	});

	it("renders tier feature lists", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);
		expect(screen.getAllByText("Feature A").length).toBeGreaterThan(0);
	});

	it("renders expandable feature details for each tier", () => {
		render(<PricingCards tiers={TIERS_WITH_CENTS} />);

		expect(screen.getAllByText("Included workflows").length).toBe(2);
	});
});
