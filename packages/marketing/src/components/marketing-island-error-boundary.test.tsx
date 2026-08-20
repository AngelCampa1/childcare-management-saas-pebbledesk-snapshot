import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

const captureException = vi.fn();

vi.mock("../lib/sentry-client", () => ({
	captureException: (...args: unknown[]) => captureException(...args),
}));

import {
	MarketingIslandFallbackCta,
	withMarketingIslandErrorBoundary,
} from "./marketing-island-error-boundary";

describe("MarketingIslandErrorBoundary", () => {
	it("renders a CTA fallback without description copy when none is provided", () => {
		render(<MarketingIslandFallbackCta href="/signup" text="Start free" />);

		expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/signup");
		expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
	});

	it("fails closed for silent boundaries", () => {
		function CrashWidget(): never {
			throw new Error("silent crash");
		}

		const SilentWidget = withMarketingIslandErrorBoundary(CrashWidget, {
			componentName: "SilentWidget",
			mode: "silent",
		});

		const { container } = render(<SilentWidget />);

		expect(container).toBeEmptyDOMElement();
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "SilentWidget", surface: "marketing" },
		});
	});
});
