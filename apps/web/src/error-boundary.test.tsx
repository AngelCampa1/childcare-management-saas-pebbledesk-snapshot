import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FallbackErrorBoundary } from "./error-boundary";

vi.mock("./lib/sentry", () => ({
	captureException: vi.fn(),
}));

function ThrowingChild() {
	throw new Error("render failed");
}

describe("FallbackErrorBoundary", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it("renders a pill-shaped refresh button after a render failure", () => {
		render(
			<FallbackErrorBoundary>
				<ThrowingChild />
			</FallbackErrorBoundary>,
		);

		const refreshButton = screen.getByRole("button", { name: "Refresh" });

		expect(refreshButton.style.borderRadius).toBe("9999px");
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();

		expect(() => fireEvent.click(refreshButton)).not.toThrow();
	});
});
