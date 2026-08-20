import { Button, buttonVariants } from "@pebbledesk/ui/components/button";
import { Card } from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("Card interactive prop", () => {
	it("does not include hover-lift classes by default", () => {
		render(<Card data-testid="card">content</Card>);
		const card = screen.getByTestId("card");
		expect(card).not.toHaveClass("motion-safe:hover:-translate-y-0.5");
		expect(card).not.toHaveAttribute("data-interactive");
	});

	it("adds hover-lift, focus-lift, and motion-safe transition classes when interactive", () => {
		render(
			<Card interactive data-testid="card">
				content
			</Card>,
		);
		const card = screen.getByTestId("card");
		expect(card).toHaveAttribute("data-interactive", "true");
		expect(card).toHaveClass(
			"motion-safe:transition-transform",
			"motion-safe:duration-200",
			"motion-safe:ease-out",
			"motion-safe:hover:-translate-y-0.5",
			"hover:shadow-md",
			"focus-visible:-translate-y-0.5",
		);
	});

	it("preserves base card classes alongside the interactive opt-in", () => {
		render(
			<Card interactive className="custom" data-testid="card">
				content
			</Card>,
		);
		const card = screen.getByTestId("card");
		expect(card).toHaveClass("rounded-xl", "border", "bg-card", "custom");
	});
});

describe("Button press micro-interaction", () => {
	it("includes the active-scale press class on the base variant", () => {
		expect(buttonVariants({ variant: "default" })).toContain("motion-safe:active:scale-[0.98]");
		expect(buttonVariants({ variant: "default" })).toContain("motion-safe:duration-150");
	});

	it("renders the press class on a real button element", () => {
		render(<Button>Press me</Button>);
		const btn = screen.getByRole("button", { name: "Press me" });
		expect(btn.className).toContain("motion-safe:active:scale-[0.98]");
		// Focus-visible ring stays untouched.
		expect(btn.className).toContain("focus-visible:ring-2");
	});

	it("disables the press scale when the button is disabled", () => {
		expect(buttonVariants({ variant: "default" })).toContain("disabled:active:scale-100");
	});
});

describe("Skeleton shimmer", () => {
	it("uses bg-muted base and gates the shimmer pseudo-element behind motion-safe", () => {
		render(<Skeleton data-testid="sk" className="h-4 w-20" />);
		const sk = screen.getByTestId("sk");
		expect(sk).toHaveAttribute("data-slot", "skeleton");
		expect(sk).toHaveClass(
			"relative",
			"overflow-hidden",
			"bg-muted",
			"motion-safe:after:animate-skeleton-shimmer",
		);
		// Caller class merges in.
		expect(sk).toHaveClass("h-4", "w-20");
	});
});
