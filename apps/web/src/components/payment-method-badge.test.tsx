import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PaymentMethodBadge } from "./payment-method-badge";

describe("PaymentMethodBadge", () => {
	it("renders the correct label for each known payment method", () => {
		const { rerender } = render(<PaymentMethodBadge method="cash" />);
		expect(screen.getByText("Cash")).toBeInTheDocument();

		rerender(<PaymentMethodBadge method="check" />);
		expect(screen.getByText("Check")).toBeInTheDocument();

		rerender(<PaymentMethodBadge method="ach" />);
		expect(screen.getByText("ACH")).toBeInTheDocument();

		rerender(<PaymentMethodBadge method="credit_card" />);
		expect(screen.getByText("Credit Card")).toBeInTheDocument();

		rerender(<PaymentMethodBadge method="other" />);
		expect(screen.getByText("Other")).toBeInTheDocument();
	});

	it("accepts a custom label override", () => {
		render(<PaymentMethodBadge method="ach" label="Direct Deposit" />);
		expect(screen.getByText("Direct Deposit")).toBeInTheDocument();
	});

	it("falls back to the method string for unknown methods", () => {
		render(<PaymentMethodBadge method="wire_transfer" />);
		expect(screen.getByText("wire_transfer")).toBeInTheDocument();
	});

	it("applies info tone classes for ach and credit_card methods", () => {
		render(<PaymentMethodBadge method="ach" />);
		const badge = screen.getByText("ACH");
		expect(badge.className).toContain("bg-primary/10");
		expect(badge.className).toContain("text-primary");
	});

	it("applies muted tone classes for cash, check, and other methods", () => {
		render(<PaymentMethodBadge method="cash" />);
		const badge = screen.getByText("Cash");
		expect(badge.className).toContain("bg-muted");
		expect(badge.className).toContain("text-muted-foreground");
	});

	it("accepts a className prop and merges it", () => {
		render(<PaymentMethodBadge method="check" className="extra-class" />);
		const badge = screen.getByText("Check");
		expect(badge.className).toContain("extra-class");
	});
});
