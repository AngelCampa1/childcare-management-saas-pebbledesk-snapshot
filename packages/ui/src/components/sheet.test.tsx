import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet.js";

// Radix Dialog/Sheet requires a title for accessibility; wrap in Sheet with
// a title so the dialog role is accessible.
function TestSheet({ open, onOpenChange }: { open: boolean; onOpenChange?: (v: boolean) => void }) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent side="left" aria-label="Navigation">
				<SheetTitle>Navigation</SheetTitle>
				<div>Nav content</div>
				<button type="button">First button</button>
				<button type="button">Last button</button>
			</SheetContent>
		</Sheet>
	);
}

describe("Sheet", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not render children when closed", () => {
		render(<TestSheet open={false} />);
		expect(screen.queryByText("Nav content")).not.toBeInTheDocument();
	});

	it("renders children when open", () => {
		render(<TestSheet open={true} />);
		expect(screen.getByText("Nav content")).toBeInTheDocument();
	});

	it("renders the close button when open", () => {
		render(<TestSheet open={true} />);
		// SheetContent renders a Close button with visible text "Close"
		expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
	});

	it("calls onOpenChange(false) when Escape is pressed", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<TestSheet open={true} onOpenChange={onOpenChange} />);
		await user.keyboard("{Escape}");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("calls onOpenChange(false) when the close button is clicked", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		render(<TestSheet open={true} onOpenChange={onOpenChange} />);
		await user.click(screen.getByRole("button", { name: /close/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("traps focus inside the dialog (Tab cycles through focusable children)", async () => {
		const user = userEvent.setup();
		render(<TestSheet open={true} />);

		// Focus the first button inside the sheet
		const firstButton = screen.getByRole("button", { name: /first button/i });
		firstButton.focus();
		expect(document.activeElement).toBe(firstButton);

		// Tab should move to next focusable element within the dialog, not escape
		await user.tab();
		const dialog = screen.getByRole("dialog");
		expect(dialog.contains(document.activeElement)).toBe(true);
	});

	it("renders with side=right class when side prop is right", () => {
		render(
			<Sheet open={true}>
				<SheetContent side="right" aria-label="Right sheet">
					<SheetTitle>Right Navigation</SheetTitle>
					<div>Right content</div>
				</SheetContent>
			</Sheet>,
		);
		const dialog = screen.getByRole("dialog");
		// The right-side variant adds slide-in-from-right animation class
		expect(dialog.className).toMatch(/slide-in-from-right/);
	});

	it("renders with side=left class by default", () => {
		render(
			<Sheet open={true}>
				<SheetContent aria-label="Left sheet">
					<SheetTitle>Left Navigation</SheetTitle>
					<div>Left content</div>
				</SheetContent>
			</Sheet>,
		);
		const dialog = screen.getByRole("dialog");
		expect(dialog.className).toMatch(/slide-in-from-left/);
	});

	it("SheetContent renders the close button regardless of children", () => {
		render(
			<Sheet open={true}>
				<SheetContent aria-label="Sheet with header">
					<SheetTitle>Title</SheetTitle>
					<div data-testid="header-wrapper">Content</div>
				</SheetContent>
			</Sheet>,
		);
		// SheetContent always renders a built-in Close button
		expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
	});

	it("SheetHeader renders with border-b class and accepts custom className", () => {
		render(
			<Sheet open={true}>
				<SheetContent aria-label="Sheet with header section">
					<SheetTitle>Title</SheetTitle>
					<SheetHeader data-testid="sheet-header" className="custom-class">
						Header content
					</SheetHeader>
				</SheetContent>
			</Sheet>,
		);
		const header = screen.getByTestId("sheet-header");
		expect(header).toBeInTheDocument();
		expect(header.className).toMatch(/border-b/);
		expect(header.className).toMatch(/custom-class/);
	});

	it("omits aria-describedby and does not warn when no description is provided", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		render(<TestSheet open={true} />);

		const dialog = screen.getByRole("dialog");
		await waitFor(() => {
			expect(dialog).not.toHaveAttribute("aria-describedby");
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(warnSpy).not.toHaveBeenCalled();
	});
});
