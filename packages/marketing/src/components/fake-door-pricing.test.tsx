import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeDoorPricing } from "./fake-door-pricing";

const tiers = [
	{
		name: "Home",
		price: "$29/mo",
		monthlyPriceCents: 2000,
		features: ["Attendance"],
	},
	{
		name: "Center",
		price: "$99/mo",
		monthlyPriceCents: 5000,
		highlighted: true,
		features: ["Ratios", "Billing"],
	},
];

describe("FakeDoorPricing", () => {
	it("renders tier names, prices, and features", () => {
		render(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} heading="Choose your plan" />);

		expect(screen.getByRole("heading", { name: "Home", level: 3 })).toBeTruthy();
		expect(screen.getByText("$29/mo")).toBeTruthy();
		expect(screen.getByRole("heading", { name: "Center", level: 3 })).toBeTruthy();
		expect(screen.getByText("Ratios")).toBeTruthy();
	});

	it("builds direct signup links with plan and source context", () => {
		render(<FakeDoorPricing apiUrl="" sourcePage="/compare" tiers={tiers} buttonPrefix="Start" />);

		expect(screen.getByRole("link", { name: "Start Home" }).getAttribute("href")).toBe(
			"https://my.pebbledesk.app/signup?plan=home&source=%2Fcompare",
		);
		expect(screen.getByRole("link", { name: "Start Center" }).getAttribute("href")).toBe(
			"https://my.pebbledesk.app/signup?plan=center_starter&source=%2Fcompare",
		);
	});

	it("renders stable local signup targets even when attribution is present on the page URL", () => {
		window.history.replaceState(
			{},
			"",
			"/?utm_source=newsletter&utm_campaign=spring-push&utm_term=childcare&ref=partner-ally",
		);

		render(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} buttonPrefix="Start" />);

		expect(screen.getByRole("link", { name: "Start Home" }).getAttribute("href")).toBe(
			"https://my.pebbledesk.app/signup?plan=home&source=%2F",
		);
	});

	it("keeps the same local signup target after the pricing island rerenders", async () => {
		window.history.replaceState(
			{},
			"",
			"/?utm_source=newsletter&utm_campaign=spring-push&utm_term=childcare&ref=partner-ally",
		);

		render(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} buttonPrefix="Start" />);

		await waitFor(() => {
			expect(screen.getByRole("link", { name: "Start Home" }).getAttribute("href")).toBe(
				"https://my.pebbledesk.app/signup?plan=home&source=%2F",
			);
		});

		fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

		expect(screen.getByRole("link", { name: "Start Home" }).getAttribute("href")).toBe(
			"https://my.pebbledesk.app/signup?plan=home&source=%2F",
		);
	});

	it("shows annual pricing when the billing toggle is switched", () => {
		render(
			<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} annualSavingsText="2 months free" />,
		);

		fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

		expect(screen.getByText("$200/yr")).toBeTruthy();
		expect(screen.getByText("$500/yr")).toBeTruthy();
		expect(screen.getAllByText("2 months free")).toHaveLength(2);

		fireEvent.click(screen.getByRole("radio", { name: "Monthly" }));

		expect(screen.getByText("$29/mo")).toBeTruthy();
		expect(screen.getByText("$99/mo")).toBeTruthy();
	});

	it("supports arrow-key navigation across the billing radios", () => {
		render(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} />);

		const monthlyRadio = screen.getByRole("radio", { name: "Monthly" });
		const annualRadio = screen.getByRole("radio", { name: "Annual" });

		monthlyRadio.focus();
		fireEvent.keyDown(monthlyRadio, { key: "ArrowRight" });

		expect(annualRadio).toHaveAttribute("aria-checked", "true");
		expect(annualRadio).toHaveFocus();
		expect(screen.getByText("$200/yr")).toBeTruthy();

		fireEvent.keyDown(annualRadio, { key: "ArrowLeft" });

		expect(monthlyRadio).toHaveAttribute("aria-checked", "true");
		expect(monthlyRadio).toHaveFocus();
		expect(screen.getByText("$29/mo")).toBeTruthy();
	});

	it("supports Home and End keys on the billing radios", () => {
		render(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} />);

		const monthlyRadio = screen.getByRole("radio", { name: "Monthly" });
		const annualRadio = screen.getByRole("radio", { name: "Annual" });

		monthlyRadio.focus();
		fireEvent.keyDown(monthlyRadio, { key: "End" });

		expect(annualRadio).toHaveAttribute("aria-checked", "true");
		expect(annualRadio).toHaveFocus();

		fireEvent.keyDown(annualRadio, { key: "Home" });

		expect(monthlyRadio).toHaveAttribute("aria-checked", "true");
		expect(monthlyRadio).toHaveFocus();
	});

	it("does not render Enterprise as a fake-door pricing card", () => {
		render(
			<FakeDoorPricing
				apiUrl=""
				sourcePage="/"
				tiers={[
					{
						name: "Enterprise",
						price: "Custom",
						description: "For multi-site operators",
						features: ["Custom onboarding"],
					},
				]}
				trialBannerText="Create your account and finish setup in the product app."
				popularTier="Enterprise"
			/>,
		);

		expect(
			screen.getByText("Create your account and finish setup in the product app."),
		).toBeTruthy();
		expect(screen.queryByText("Most Popular")).not.toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Enterprise", level: 3 })).not.toBeInTheDocument();
		expect(screen.getByText("Enterprise")).toBeInTheDocument();
		expect(screen.getByText("Custom")).toBeInTheDocument();
		expect(screen.getByText("For multi-site operators")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Contact sales" })).toHaveAttribute(
			"href",
			"/pricing/#contact",
		);
	});

	it("omits the billing toggle when monthly pricing is unavailable or disabled", () => {
		const { rerender } = render(
			<FakeDoorPricing
				apiUrl=""
				sourcePage="/"
				tiers={[
					{
						name: "Enterprise",
						price: "Custom",
						features: ["Custom onboarding"],
					},
				]}
			/>,
		);

		expect(screen.queryByRole("radiogroup", { name: "Billing period" })).toBeNull();

		rerender(<FakeDoorPricing apiUrl="" sourcePage="/" tiers={tiers} showBillingToggle={false} />);

		expect(screen.queryByRole("radiogroup", { name: "Billing period" })).toBeNull();
	});
});
