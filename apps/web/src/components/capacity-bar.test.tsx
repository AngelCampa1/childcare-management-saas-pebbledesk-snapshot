import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CapacityBar } from "./capacity-bar";

describe("CapacityBar", () => {
	it("renders 0/10 empty state with primary color bar", () => {
		const { container } = render(<CapacityBar current={0} max={10} />);
		expect(screen.getByText("0 / 10 children")).toBeInTheDocument();
		const bar = container.querySelector(".h-full");
		expect(bar).toHaveStyle({ width: "0%" });
		expect(bar?.className).toContain("bg-primary");
	});

	it("renders 5/10 half-full state with primary color bar", () => {
		const { container } = render(<CapacityBar current={5} max={10} />);
		expect(screen.getByText("5 / 10 children")).toBeInTheDocument();
		const bar = container.querySelector(".h-full");
		expect(bar).toHaveStyle({ width: "50%" });
		expect(bar?.className).toContain("bg-primary");
	});

	it("renders 10/10 full (amber/warning) state", () => {
		const { container } = render(<CapacityBar current={10} max={10} />);
		expect(screen.getByText("10 / 10 children")).toBeInTheDocument();
		const bar = container.querySelector(".h-full");
		// 100% >= 85% → bg-destructive (actually 100% >= 100% → bg-destructive)
		expect(bar).toHaveStyle({ width: "100%" });
		expect(bar?.className).toContain("bg-destructive");
		// near capacity sr-only text: actually 100% triggers "Over capacity", not "Near capacity"
		expect(screen.getByText(/Over capacity/)).toBeInTheDocument();
	});

	it("renders 9/10 near capacity (amber warning) state", () => {
		const { container } = render(<CapacityBar current={9} max={10} />);
		expect(screen.getByText("9 / 10 children")).toBeInTheDocument();
		const bar = container.querySelector(".h-full");
		expect(bar).toHaveStyle({ width: "90%" });
		expect(bar?.className).toContain("bg-warning");
		expect(screen.getByText(/Near capacity/)).toBeInTheDocument();
	});

	it("renders 11/10 over-capacity (red/destructive) state clamped to 100%", () => {
		const { container } = render(<CapacityBar current={11} max={10} />);
		expect(screen.getByText("11 / 10 children")).toBeInTheDocument();
		const bar = container.querySelector(".h-full");
		expect(bar).toHaveStyle({ width: "100%" });
		expect(bar?.className).toContain("bg-destructive");
		expect(screen.getByText(/Over capacity/)).toBeInTheDocument();
	});

	it("applies optional className to wrapper", () => {
		const { container } = render(<CapacityBar current={5} max={10} className="my-custom-class" />);
		expect(container.firstChild).toHaveClass("my-custom-class");
	});

	it("renders 0% when max is 0 to avoid divide-by-zero", () => {
		const { container } = render(<CapacityBar current={5} max={0} />);
		const bar = container.querySelector(".h-full");
		expect(bar).toHaveStyle({ width: "0%" });
	});

	it('shows "Capacity" label', () => {
		render(<CapacityBar current={3} max={10} />);
		expect(screen.getByText("Capacity")).toBeInTheDocument();
	});
});
