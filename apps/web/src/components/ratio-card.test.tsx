import type { RoomRatioStatus } from "@pebbledesk/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RatioCard } from "./ratio-card";

function makeRatio(overrides: Partial<RoomRatioStatus> = {}): RoomRatioStatus {
	return {
		classroomId: "room-1",
		classroomName: "Toddlers",
		ageGroup: "Toddler",
		maxCapacity: 10,
		minRatioStaff: 1,
		minRatioChildren: 4,
		currentChildCount: 4,
		currentStaffCount: 1,
		ratioRequired: 0.25,
		ratioActual: 0.25,
		inCompliance: true,
		nearLimit: false,
		ratioRuleSource: "state",
		...overrides,
	};
}

describe("RatioCard", () => {
	it("renders in compliant (green) state", () => {
		const ratio = makeRatio({ inCompliance: true, nearLimit: false });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Toddlers")).toBeInTheDocument();
		expect(screen.getByText("Compliant")).toBeInTheDocument();

		const button = container.querySelector("button");
		expect(button?.className).not.toContain("border-destructive");
		expect(button?.className).not.toContain("border-warning");
	});

	it("renders in warning (amber near-limit) state", () => {
		// currentChildCount=3, staff=1, minRatio=4 → childrenAllowed=4, margin=1
		const ratio = makeRatio({ inCompliance: true, nearLimit: true, currentChildCount: 3 });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Near Limit")).toBeInTheDocument();
		expect(screen.getByText("1 more child triggers a violation")).toBeInTheDocument();

		const button = container.querySelector("button");
		expect(button?.className).toContain("border-warning");
	});

	it("shows correct near-limit margin when 2 children remaining", () => {
		// currentChildCount=2, staff=1, minRatio=4 → margin=2
		const ratio = makeRatio({ inCompliance: true, nearLimit: true, currentChildCount: 2 });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("2 more children trigger a violation")).toBeInTheDocument();
	});

	it("shows zero-margin near-limit message when at capacity", () => {
		// currentChildCount=4, staff=1, minRatio=4 → margin=0
		const ratio = makeRatio({ inCompliance: true, nearLimit: true, currentChildCount: 4 });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Adding any child triggers a violation")).toBeInTheDocument();
		expect(screen.getByText("Check Attendance")).toBeInTheDocument();
	});

	it("shows correct required ratio label for non-1 staff requirement", () => {
		// minRatioStaff=2, minRatioChildren=8
		const ratio = makeRatio({ minRatioStaff: 2, minRatioChildren: 8 });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText(/Required 2:8/)).toBeInTheDocument();
	});

	it("renders in violation (red) state when inCompliance is false", () => {
		const ratio = makeRatio({ inCompliance: false, nearLimit: false });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Violation")).toBeInTheDocument();

		const button = container.querySelector("button");
		expect(button?.className).toContain("border-destructive");
	});

	it("renders in violation state when openViolationId is set even if inCompliance is true", () => {
		const ratio = makeRatio({ inCompliance: true, nearLimit: false, openViolationId: "viol-1" });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Violation")).toBeInTheDocument();
		const button = container.querySelector("button");
		expect(button?.className).toContain("border-destructive");
	});

	it("shows 'Need X more staff' alert in violation state when staff is insufficient", () => {
		// 8 children, 1 staff, ratio required 0.25 → need ceil(8*0.25)=2 staff, have 1 → need 1 more
		const ratio = makeRatio({
			inCompliance: false,
			nearLimit: false,
			currentChildCount: 8,
			currentStaffCount: 1,
			ratioRequired: 0.25,
		});
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText(/Need \d+ more staff member/)).toBeInTheDocument();
		expect(screen.getByText("Fix in Attendance")).toBeInTheDocument();
	});

	it("shows plural 'staff members' when 2+ staff needed", () => {
		// 12 children, 1 staff, ratio required 0.25 → need ceil(12*0.25)=3, have 1 → need 2
		const ratio = makeRatio({
			inCompliance: false,
			nearLimit: false,
			currentChildCount: 12,
			currentStaffCount: 1,
			ratioRequired: 0.25,
		});
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Need 2 more staff members")).toBeInTheDocument();
	});

	it("shows 'Ratio violation active' when staffNeeded <= 0", () => {
		// 0 children, 2 staff → computeStaffNeeded = max(0, 0 - 2) = 0
		const ratio = makeRatio({
			inCompliance: false,
			nearLimit: false,
			currentChildCount: 0,
			currentStaffCount: 2,
			ratioRequired: 0.25,
		});
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Ratio violation active")).toBeInTheDocument();
	});

	it("displays classroom name, age group and required ratio", () => {
		const ratio = makeRatio({
			classroomName: "Infants Room",
			ageGroup: "Infant",
			minRatioChildren: 3,
		});
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("Infants Room")).toBeInTheDocument();
		expect(screen.getByText(/Infant · Required 1:3/)).toBeInTheDocument();
	});

	it("displays current staff and child counts", () => {
		const ratio = makeRatio({ currentStaffCount: 3, currentChildCount: 9 });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("3")).toBeInTheDocument();
		expect(screen.getByText("9")).toBeInTheDocument();
	});

	it("shows N/A actual ratio when staff count is 0", () => {
		const ratio = makeRatio({ currentStaffCount: 0, currentChildCount: 5, inCompliance: false });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("N/A")).toBeInTheDocument();
	});

	it("shows formatted actual ratio when staff count > 0", () => {
		const ratio = makeRatio({ currentStaffCount: 1, currentChildCount: 4, inCompliance: true });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		expect(screen.getByText("1:4.0")).toBeInTheDocument();
	});

	it("applies freshUpdate animation class to status badge", () => {
		const ratio = makeRatio();
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} freshUpdate={true} />);

		const badge = container.querySelector(".motion-safe\\:animate-ratio-flash");
		expect(badge).toBeInTheDocument();
	});

	it("calls onClick when button is clicked", () => {
		const onClick = vi.fn();
		const ratio = makeRatio();
		render(<RatioCard ratio={ratio} onClick={onClick} />);

		fireEvent.click(screen.getByRole("button"));
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("has correct aria-label on the button", () => {
		const ratio = makeRatio({ classroomName: "Butterflies" });
		render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		const button = screen.getByRole("button");
		expect(button).toHaveAttribute("aria-label", "Butterflies ratio card — compliant");
	});

	it("capacity bar width reflects currentChildCount / maxCapacity", () => {
		const ratio = makeRatio({ currentChildCount: 5, maxCapacity: 10 });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		// The inner bar div has an inline width style
		const bar = container.querySelector<HTMLElement>(".h-1\\.5 .h-full");
		expect(bar?.style.width).toBe("50%");
	});

	it("capacity bar is 0% when maxCapacity is 0", () => {
		const ratio = makeRatio({ currentChildCount: 5, maxCapacity: 0 });
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		const bar = container.querySelector<HTMLElement>(".h-1\\.5 .h-full");
		expect(bar?.style.width).toBe("0%");
	});

	it("capacity bar is capped at 100% when over capacity", () => {
		const ratio = makeRatio({
			currentChildCount: 15,
			maxCapacity: 10,
			inCompliance: false,
			nearLimit: false,
		});
		const { container } = render(<RatioCard ratio={ratio} onClick={vi.fn()} />);

		const bar = container.querySelector<HTMLElement>(".h-1\\.5 .h-full");
		expect(bar?.style.width).toBe("100%");
	});
});
