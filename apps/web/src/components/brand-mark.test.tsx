import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./brand-mark";

describe("BrandMark", () => {
	it("renders the PebbleDesk wordmark", () => {
		render(<BrandMark />);
		expect(screen.getByText("PebbleDesk")).toBeInTheDocument();
	});

	it("renders the inline SVG logo with aria-hidden", () => {
		const { container } = render(<BrandMark />);
		const svg = container.querySelector("svg");
		expect(svg).toBeInTheDocument();
		expect(svg).toHaveAttribute("aria-hidden", "true");
		expect(svg?.querySelector("text")).not.toBeInTheDocument();
		expect(svg?.querySelector("ellipse")).not.toBeInTheDocument();
		expect(svg?.querySelector("rect")).toBeInTheDocument();
		expect(svg?.querySelectorAll("path")).toHaveLength(4);
	});

	it("merges the className prop onto the wrapper", () => {
		const { container } = render(<BrandMark className="my-custom-class" />);
		const wrapper = container.firstChild as HTMLElement;
		expect(wrapper.className).toContain("my-custom-class");
	});

	it("uses sidebar text color by default for the app shell", () => {
		render(<BrandMark />);
		const span = screen.getByText("PebbleDesk");
		expect(span.className).toContain("text-sidebar-foreground");
	});

	it("allows public shells to override the wordmark text color", () => {
		render(<BrandMark wordmarkClassName="text-foreground" />);
		const span = screen.getByText("PebbleDesk");
		expect(span.className).toContain("text-foreground");
	});
});
