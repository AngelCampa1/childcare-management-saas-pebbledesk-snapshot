import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldHelp, HelpTip, PageHelpPanel } from "./help-tip";

describe("HelpTip", () => {
	it("renders an accessible help trigger with plain-language content", async () => {
		render(
			<HelpTip label="Help: ratio">
				A ratio is how many children one staff member may watch.
			</HelpTip>,
		);

		const trigger = screen.getByRole("button", { name: "Help: ratio" });
		expect(trigger).toBeInTheDocument();

		fireEvent.click(trigger);

		expect(
			await screen.findAllByText("A ratio is how many children one staff member may watch."),
		).not.toHaveLength(0);
	});

	it("uses a 44px touch target for the icon-only help trigger", () => {
		render(<HelpTip label="Help: touch target">Help text</HelpTip>);

		const trigger = screen.getByRole("button", { name: "Help: touch target" });

		expect(trigger).toHaveClass("h-11");
		expect(trigger).toHaveClass("w-11");
	});

	it("gives the opened popover dialog an accessible name matching the trigger", async () => {
		render(<HelpTip label="Help: ratio">A ratio is how many children one staff watches.</HelpTip>);

		fireEvent.click(screen.getByRole("button", { name: "Help: ratio" }));

		const dialog = await screen.findByRole("dialog", { name: "Help: ratio" });
		expect(dialog).toBeInTheDocument();
	});

	it("declares aria-haspopup=dialog so AT announces it opens a dialog", () => {
		render(<HelpTip label="Help: dialog hint">Content</HelpTip>);

		const trigger = screen.getByRole("button", { name: "Help: dialog hint" });
		expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
	});

	it("uses type=button so the trigger is never submitted as a form control", () => {
		render(<HelpTip label="Help: type check">Content</HelpTip>);

		const trigger = screen.getByRole("button", { name: "Help: type check" });
		expect(trigger).toHaveAttribute("type", "button");
	});

	it("supports custom placement and trigger classes", () => {
		render(
			<>
				<HelpTip label="Help: custom" side="right" className="text-primary">
					Custom help text
				</HelpTip>
				<HelpTip label="Help: left" side="left">
					Left help text
				</HelpTip>
			</>,
		);

		expect(screen.getByRole("button", { name: "Help: custom" })).toHaveClass("text-primary");
		expect(screen.getByRole("button", { name: "Help: left" })).toBeInTheDocument();
	});

	it("renders field labels with visible help beside the label", async () => {
		render(
			<FieldHelp
				htmlFor="capacity"
				label="Max capacity"
				help="The most children your license allows in this room."
			/>,
		);

		expect(screen.getByText("Max capacity")).toHaveAttribute("for", "capacity");

		fireEvent.click(screen.getByRole("button", { name: "Help: Max capacity" }));
		expect(
			await screen.findAllByText("The most children your license allows in this room."),
		).not.toHaveLength(0);
	});

	it("marks required fields for screen readers and supports unbound labels", () => {
		render(
			<FieldHelp
				label="Child name"
				required
				className="items-start"
				help="Use the child's legal name."
			/>,
		);

		expect(screen.getByText("Child name")).not.toHaveAttribute("for");
		expect(screen.getByText("required")).toHaveClass("sr-only");
		expect(screen.getByRole("button", { name: "Help: Child name" })).toBeInTheDocument();
	});
});

describe("PageHelpPanel", () => {
	it("answers what the page is for, what to do first, and what to watch out for", () => {
		render(
			<PageHelpPanel
				title="Need help with attendance?"
				what="Use this page to check children and staff into the right room."
				first="Start by clocking staff in, then check children in as they arrive."
				watch="If a room turns red, add staff or correct attendance right away."
			/>,
		);

		expect(screen.getByRole("region", { name: "Page help" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Need help with attendance?" })).toBeInTheDocument();
		expect(screen.getByText("What this page is for")).toBeInTheDocument();
		expect(screen.getByText("What to do first")).toBeInTheDocument();
		expect(screen.getByText("What to watch")).toBeInTheDocument();
		expect(screen.getByText(/clocking staff in/i)).toBeInTheDocument();
	});

	it("accepts layout classes for pages that need tighter spacing", () => {
		render(
			<PageHelpPanel title="Quick help" what="What" first="First" watch="Watch" className="mt-4" />,
		);

		expect(screen.getByRole("region", { name: "Page help" })).toHaveClass("mt-4");
	});

	it("renders canonical public-knowledge help from a route", () => {
		render(<PageHelpPanel route="/attendance" />);

		expect(screen.getByRole("region", { name: "Page help" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /attendance/i })).toBeInTheDocument();
		expect(screen.getByText("What this page is for")).toBeInTheDocument();
		expect(screen.getByText("What to do first")).toBeInTheDocument();
		expect(screen.getByText("What to watch")).toBeInTheDocument();
	});

	it("fails loudly when a route-backed panel is missing canonical public knowledge", () => {
		expect(() => render(<PageHelpPanel route="/missing" />)).toThrow(/Missing app page help/);
	});
});
