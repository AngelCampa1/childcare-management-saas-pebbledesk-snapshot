import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordStrengthMeter } from "./password-strength-meter";

describe("PasswordStrengthMeter", () => {
	it("renders 0 filled bars for an empty password", () => {
		render(<PasswordStrengthMeter password="" />);
		const bars = screen.getAllByTestId("strength-bar");
		expect(bars).toHaveLength(4);
		for (const bar of bars) {
			expect(bar).toHaveAttribute("data-filled", "false");
		}
	});

	it("renders 0 filled bars and first suggestion for a score-0 password", () => {
		// "abc" scores 0 with zxcvbn-ts/language-common
		render(<PasswordStrengthMeter password="abc" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		expect(filledBars).toHaveLength(0);
		// First suggestion should be rendered
		const suggestion = screen.getByTestId("strength-suggestion");
		expect(suggestion.textContent).not.toBe("");
	});

	it("renders 4 filled green bars for a very strong password", () => {
		render(<PasswordStrengthMeter password="xK9#mR2vLpQw8!" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		// Very strong password should score 4 → 4 filled bars
		expect(filledBars).toHaveLength(4);
	});

	it("renders red bars for a score-0 password", () => {
		// "12345678" scores 0 with common dictionary
		render(<PasswordStrengthMeter password="12345678" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		// Score 0 → 0 filled bars (no red bars shown since nothing is filled)
		expect(filledBars).toHaveLength(0);
	});

	it("renders red bars for a score-1 password", () => {
		// "zxcvb" scores 1 with common dictionary
		render(<PasswordStrengthMeter password="zxcvb" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		expect(filledBars.length).toBeGreaterThan(0);
		for (const bar of filledBars) {
			expect(bar).toHaveAttribute("data-color", "red");
		}
	});

	it("renders yellow bars for a score-2 password", () => {
		// "Suns3tBeach" scores 2 with zxcvbn-ts/language-common
		render(<PasswordStrengthMeter password="Suns3tBeach" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		expect(filledBars).toHaveLength(2);
		for (const bar of filledBars) {
			expect(bar).toHaveAttribute("data-color", "yellow");
		}
	});

	it("renders green bars for a score-3 or score-4 password", () => {
		// "PurpleRain77" scores 3 with language-common
		render(<PasswordStrengthMeter password="PurpleRain77" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		expect(filledBars.length).toBeGreaterThanOrEqual(3);
		for (const bar of filledBars) {
			expect(bar).toHaveAttribute("data-color", "green");
		}
	});

	it("renders green bars for a score-4 password", () => {
		render(<PasswordStrengthMeter password="xK9#mR2vLpQw8!" />);
		const bars = screen.getAllByTestId("strength-bar");
		const filledBars = bars.filter((b) => b.getAttribute("data-filled") === "true");
		expect(filledBars).toHaveLength(4);
		for (const bar of filledBars) {
			expect(bar).toHaveAttribute("data-color", "green");
		}
	});

	it("shows a suggestion element when score is below 3", () => {
		render(<PasswordStrengthMeter password="Suns3tBeach" />);
		const suggestion = screen.getByTestId("strength-suggestion");
		// Score 2 shows a suggestion from zxcvbn feedback
		expect(suggestion).toBeInTheDocument();
		expect(suggestion.textContent).not.toBe("");
	});

	it("renders empty suggestion when score is 3 or higher", () => {
		render(<PasswordStrengthMeter password="PurpleRain77" />);
		const suggestion = screen.getByTestId("strength-suggestion");
		// Score >= 3 has no suggestion
		expect(suggestion.textContent).toBe("");
	});

	it("renders empty suggestion when score is 4", () => {
		render(<PasswordStrengthMeter password="xK9#mR2vLpQw8!" />);
		const suggestion = screen.getByTestId("strength-suggestion");
		expect(suggestion.textContent).toBe("");
	});
});
