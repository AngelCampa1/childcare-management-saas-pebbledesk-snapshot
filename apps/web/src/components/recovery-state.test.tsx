import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecoveryState } from "./recovery-state";

vi.mock("./brand-mark", () => ({
	BrandMark: ({ className }: { className?: string }) => (
		<div data-testid="brand-mark" className={className} />
	),
}));

describe("RecoveryState", () => {
	it("renders title and description", () => {
		render(
			<RecoveryState
				title="Something went wrong"
				description="Try again later."
				primaryHref="/dashboard"
				primaryLabel="Go to dashboard"
			/>,
		);

		expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
		expect(screen.getByText("Try again later.")).toBeInTheDocument();
	});

	it("renders the primary action as a link by default", () => {
		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/overview"
				primaryLabel="Choose a center"
			/>,
		);

		const link = screen.getByRole("link", { name: "Choose a center" });
		expect(link).toHaveAttribute("href", "/overview");
	});

	it("renders the primary action as a button when onPrimaryAction is provided", () => {
		const handler = vi.fn();

		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/unreachable"
				primaryLabel="Try again"
				onPrimaryAction={handler}
			/>,
		);

		const btn = screen.getByRole("button", { name: "Try again" });
		expect(btn).toBeInTheDocument();
		btn.click();
		expect(handler).toHaveBeenCalledOnce();
	});

	it("renders the secondary action when both props are supplied", () => {
		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
				secondaryHref="/login"
				secondaryLabel="Return to sign in"
			/>,
		);

		const secondary = screen.getByRole("link", { name: "Return to sign in" });
		expect(secondary).toHaveAttribute("href", "/login");
	});

	it("does not render the secondary action when secondaryHref is omitted", () => {
		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
			/>,
		);

		// Only the primary link should exist
		expect(screen.queryAllByRole("link")).toHaveLength(1);
	});

	it("renders children between the description and buttons", () => {
		render(
			<RecoveryState title="Title" description="Desc" primaryHref="/primary" primaryLabel="Primary">
				<p data-testid="extra-child">Extra content</p>
			</RecoveryState>,
		);

		expect(screen.getByTestId("extra-child")).toBeInTheDocument();
	});

	it("shows the BrandMark when showBrandMark is true", () => {
		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
				showBrandMark
			/>,
		);

		expect(screen.getByTestId("brand-mark")).toBeInTheDocument();
	});

	it("does not show the BrandMark by default", () => {
		render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
			/>,
		);

		expect(screen.queryByTestId("brand-mark")).not.toBeInTheDocument();
	});

	it("wraps content in a full-viewport container when fullPage is true", () => {
		const { container } = render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
				fullPage
			/>,
		);

		// The outer wrapper should fill the viewport height
		expect(container.firstChild).toHaveClass("h-screen");
	});

	it("uses the min-height partial-page wrapper when fullPage is false", () => {
		const { container } = render(
			<RecoveryState
				title="Title"
				description="Desc"
				primaryHref="/primary"
				primaryLabel="Primary"
			/>,
		);

		expect(container.firstChild).toHaveClass("min-h-[60vh]");
	});
});
