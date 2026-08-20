import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { DateInput } from "./date-input";

describe("DateInput", () => {
	it("renders a native date input with an explicit US locale", () => {
		const { container } = render(<DateInput aria-label="when" />);
		const input = container.querySelector("input");
		expect(input).not.toBeNull();
		expect(input).toHaveAttribute("type", "date");
		expect(input).toHaveAttribute("lang", "en-US");
	});

	it("forwards arbitrary input props", () => {
		const { container } = render(
			<DateInput aria-label="due" value="2026-04-11" readOnly required />,
		);
		const input = container.querySelector("input");
		expect(input).toHaveAttribute("aria-label", "due");
		expect(input).toHaveAttribute("value", "2026-04-11");
		expect(input).toHaveAttribute("required");
	});

	it("lets callers override the locale if a non-US format is ever needed", () => {
		const { container } = render(<DateInput aria-label="when" lang="en-GB" />);
		const input = container.querySelector("input");
		expect(input).toHaveAttribute("lang", "en-GB");
	});

	it("forwards refs to the underlying input element", () => {
		const ref = createRef<HTMLInputElement>();
		render(<DateInput ref={ref} aria-label="when" />);
		expect(ref.current).toBeInstanceOf(HTMLInputElement);
		expect(ref.current?.type).toBe("date");
	});

	it("applies maxDate as the native max attribute", () => {
		const { container } = render(<DateInput aria-label="dob" maxDate="2026-05-25" />);
		const input = container.querySelector("input");
		expect(input).toHaveAttribute("max", "2026-05-25");
	});

	it("applies minDate as the native min attribute", () => {
		const { container } = render(<DateInput aria-label="dob" minDate="2020-01-01" />);
		const input = container.querySelector("input");
		expect(input).toHaveAttribute("min", "2020-01-01");
	});

	it("applies both maxDate and minDate together", () => {
		const { container } = render(
			<DateInput aria-label="dob" minDate="2010-01-01" maxDate="2026-05-25" />,
		);
		const input = container.querySelector("input");
		expect(input).toHaveAttribute("min", "2010-01-01");
		expect(input).toHaveAttribute("max", "2026-05-25");
	});

	it("does not set max or min when neither maxDate nor minDate is provided", () => {
		const { container } = render(<DateInput aria-label="dob" />);
		const input = container.querySelector("input");
		expect(input).not.toHaveAttribute("max");
		expect(input).not.toHaveAttribute("min");
	});
});
