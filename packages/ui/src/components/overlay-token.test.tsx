import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";
import { Sheet, SheetContent, SheetTitle } from "./sheet";

describe("overlay token styling", () => {
	const oldDialogOverlayClass = ["bg", "black/80"].join("-");
	const oldSheetOverlayClass = ["bg", "black/40"].join("-");

	it("uses token-based dialog overlay colors", () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Dialog title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		const overlay = document.querySelector(".fixed.inset-0.z-50");
		expect(overlay).not.toHaveClass(oldDialogOverlayClass);
		expect(overlay).toHaveClass("bg-foreground/45");
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("uses token-based sheet overlay colors", () => {
		render(
			<Sheet open>
				<SheetContent>
					<SheetTitle>Navigation</SheetTitle>
				</SheetContent>
			</Sheet>,
		);

		const overlay = document.querySelector(".fixed.inset-0.z-50");
		expect(overlay).not.toHaveClass(oldSheetOverlayClass);
		expect(overlay).toHaveClass("bg-foreground/35");
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
});
