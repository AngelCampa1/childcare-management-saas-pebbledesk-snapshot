import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RootErrorBoundary } from "./root-error-boundary";

const captureException = vi.fn();

// Mock TanStack Router's useRouter
vi.mock("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
}));

vi.mock("../lib/sentry", () => ({
	captureException: (...args: unknown[]) => captureException(...args),
}));

describe("RootErrorBoundary", () => {
	it("renders a friendly heading", () => {
		render(<RootErrorBoundary error={new Error("Boom")} reset={() => {}} />);
		expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
	});

	it("renders the brand mark on the error shell", () => {
		render(<RootErrorBoundary error={new Error("Boom")} reset={() => {}} />);
		const wordmark = screen.getByText("PebbleDesk");
		expect(wordmark.closest("div")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
	});

	it("renders a Try again button", () => {
		render(<RootErrorBoundary error={new Error("Boom")} reset={() => {}} />);
		expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
	});

	it("calls reset when Try again is clicked", () => {
		const reset = vi.fn();
		render(<RootErrorBoundary error={new Error("Boom")} reset={reset} />);
		fireEvent.click(screen.getByRole("button", { name: /try again/i }));
		expect(reset).toHaveBeenCalledOnce();
	});

	it("renders a go to dashboard link", () => {
		render(<RootErrorBoundary error={new Error("Boom")} reset={() => {}} />);
		const link = screen.getByRole("link", { name: /go to dashboard/i });
		expect(link).toHaveAttribute("href", "/");
	});

	it("logs the error to console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const err = new Error("test error");
		render(<RootErrorBoundary error={err} reset={() => {}} />);
		expect(spy).toHaveBeenCalledWith("[RootErrorBoundary]", err);
		spy.mockRestore();
	});

	it("captures the error in Sentry", () => {
		const err = new Error("test error");

		render(<RootErrorBoundary error={err} reset={() => {}} />);

		expect(captureException).toHaveBeenCalledWith(err, {
			tags: { component: "RootErrorBoundary", surface: "app" },
		});
	});
});
