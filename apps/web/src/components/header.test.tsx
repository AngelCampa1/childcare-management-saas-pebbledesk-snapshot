import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatRatioFreshness, Header } from "./header";

const { mockSignOut, mockNavigate } = vi.hoisted(() => ({
	mockSignOut: vi.fn().mockResolvedValue(undefined),
	mockNavigate: vi.fn(),
}));

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		signOut: mockSignOut,
	}),
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: React.ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

// Stub Popover to avoid portal/pointer-event issues in jsdom.
// Renders content inline so sign-out button is accessible.
vi.mock("@pebbledesk/ui/components/popover", () => {
	const React = require("react");
	return {
		Popover: ({
			children,
			open,
			onOpenChange,
		}: {
			children: ReactNode;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}) =>
			React.createElement(
				"div",
				{
					"data-testid": "popover-root",
					"data-open": open ? "true" : "false",
					onClick: () => onOpenChange?.(!open),
				},
				children,
			),
		PopoverTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => {
			if (asChild && React.isValidElement(children)) {
				return children;
			}
			return React.createElement("div", { "data-testid": "popover-trigger" }, children);
		},
		PopoverContent: ({ children }: { children: ReactNode }) =>
			React.createElement("div", { "data-testid": "popover-content" }, children),
	};
});

vi.mock("./center-switcher", () => ({
	CenterSwitcher: ({ activeCenterId }: { activeCenterId: string }) => {
		const React = require("react");
		return React.createElement("div", {
			"data-testid": "center-switcher",
			"data-center-id": activeCenterId,
		});
	},
}));

function makeWrapper() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe("Header", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSignOut.mockResolvedValue(undefined);
	});

	it("renders the center name with a middle dot separator and muted state", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByText("Pebble Verify Center", { exact: false })).toBeInTheDocument();
		const stateLabel = screen.getByText("TX");
		expect(stateLabel.className).toMatch(/text-muted-foreground/);
		expect(stateLabel.className).toMatch(/text-xs/);
		const separator = screen.getByText("·", { selector: "span" });
		expect(separator).toHaveAttribute("aria-hidden", "true");
		expect(screen.queryByText(/\//)).not.toBeInTheDocument();
		expect(screen.getByText("All Ratios OK")).toBeInTheDocument();
	});

	it("omits the separator when the center state is unavailable", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState=""
				ratioStatus="unknown"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByText("Pebble Verify Center")).toBeInTheDocument();
		expect(screen.queryByText("·")).not.toBeInTheDocument();
		expect(screen.queryByText(/\//)).not.toBeInTheDocument();
		expect(screen.getByText("Checking ratios")).toBeInTheDocument();
	});

	it("surfaces active violations in the compliance badge", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="violation"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByText("Active ratio violation")).toBeInTheDocument();
	});

	it("renders a navigation toggle when the shell provides one", () => {
		const onOpenNavigation = vi.fn();

		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
				onOpenNavigation={onOpenNavigation}
			/>,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

		expect(onOpenNavigation).toHaveBeenCalledTimes(1);
	});

	it("links the user menu to account security", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByRole("link", { name: "Account security" })).toHaveAttribute(
			"href",
			"/account",
		);
	});

	it("closes the account menu when account security is selected", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		const popover = screen.getByTestId("popover-root");
		fireEvent.click(popover);
		expect(popover).toHaveAttribute("data-open", "true");

		fireEvent.click(screen.getByRole("link", { name: "Account security" }));

		expect(popover).toHaveAttribute("data-open", "false");
	});

	it("keeps the compliance badge rendered in the mobile shell", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="violation"
				userName="Taylor Reed"
				onOpenNavigation={() => {}}
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByTestId("ratio-badge")).not.toHaveClass("hidden");
		expect(screen.getByText("Active ratio violation")).toBeInTheDocument();
	});

	it("shows a live freshness label when a ratio update timestamp is provided", () => {
		const now = Date.now();
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="ok"
				ratioUpdatedAt={now - 14_000}
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		const freshness = screen.getByTestId("ratio-freshness");
		expect(freshness.textContent).toMatch(/^Live · /);
		expect(freshness.className).toMatch(/text-muted-foreground/);
	});

	it("hides the freshness label when ratios are still unknown", () => {
		render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="unknown"
				ratioUpdatedAt={Date.now()}
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.queryByTestId("ratio-freshness")).toBeNull();
	});

	it("formats freshness in seconds, minutes, and hours", () => {
		const now = 10_000_000;
		expect(formatRatioFreshness(now, now)).toBe("Live · just updated");
		// Anything under 10s (matching the 15s poll cadence) should stay on the
		// "just updated" copy so the label does not flicker between polls.
		expect(formatRatioFreshness(now - 9_000, now)).toBe("Live · just updated");
		expect(formatRatioFreshness(now - 10_000, now)).toBe("Live · updated 10s ago");
		expect(formatRatioFreshness(now - 20_000, now)).toBe("Live · updated 20s ago");
		expect(formatRatioFreshness(now - 5 * 60_000, now)).toBe("Live · updated 5m ago");
		expect(formatRatioFreshness(now - 2 * 3_600_000, now)).toBe("Live · updated 2h ago");
	});

	it("exposes the full state name via title and aria-label on the center state badge", () => {
		render(
			<Header
				centerName="Sunny Meadow Childcare"
				centerState="CA"
				ratioStatus="ok"
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		const stateLabel = screen.getByText("CA");
		expect(stateLabel).toHaveAttribute("title", "California");
		expect(stateLabel).toHaveAttribute("aria-label", "California");
	});

	it("uses design-system tokens instead of raw palette classes in the shell chrome", () => {
		const { container } = render(
			<Header
				centerName="Pebble Verify Center"
				centerState="TX"
				ratioStatus="warning"
				userName="Taylor Reed"
				onOpenNavigation={() => {}}
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(container.innerHTML).not.toMatch(/(?:gray|slate|blue|green|red|amber)-\d{2,3}/);
	});

	it("renders CenterSwitcher when activeCenterId is provided", () => {
		render(
			<Header
				centerName="Sunny Meadow"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
				activeCenterId="center-1"
			/>,
			{ wrapper: makeWrapper() },
		);

		const switcher = screen.getByTestId("center-switcher");
		expect(switcher).toBeInTheDocument();
		expect(switcher).toHaveAttribute("data-center-id", "center-1");
	});

	it("does not render CenterSwitcher when activeCenterId is omitted", () => {
		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		expect(screen.queryByTestId("center-switcher")).not.toBeInTheDocument();
	});

	it("shows the user initials in the account menu trigger", () => {
		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByRole("button", { name: "Open account menu" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Open account menu" }).textContent).toBe("TR");
	});

	it("keeps persistent mobile header controls at least 44px square", () => {
		render(
			<Header
				centerName="Pebble Center"
				centerState="CA"
				userName="Taylor Reed"
				onOpenNavigation={vi.fn()}
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(screen.getByRole("button", { name: "Open navigation" }).className).toContain("min-h-11");
		expect(screen.getByRole("button", { name: "Open navigation" }).className).toContain("min-w-11");
		expect(screen.getByRole("button", { name: "Open account menu" }).className).toContain(
			"min-h-11",
		);
		expect(screen.getByRole("button", { name: "Open account menu" }).className).toContain(
			"min-w-11",
		);
	});

	it("calls signOut and navigates to /login when the sign-out button is clicked", async () => {
		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith({ to: "/login", replace: true });
		});
	});

	it("shows 'Signing out...' label on the button while sign-out is in flight", async () => {
		let resolveSignOut: () => void;
		mockSignOut.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				resolveSignOut = resolve;
			}),
		);

		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => {
			expect(screen.getByText("Signing out...")).toBeInTheDocument();
		});

		resolveSignOut?.();
	});

	it("keeps the user in place when sign-out fails and shows a retry message", async () => {
		mockSignOut.mockRejectedValueOnce(new Error("network down"));

		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => {
			expect(mockSignOut).toHaveBeenCalledTimes(1);
		});

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent(
				"We couldn't sign you out. Please try again.",
			);
		});

		expect(mockNavigate).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
	});

	it("treats resolved sign-out API errors as failures instead of navigating away", async () => {
		mockSignOut.mockResolvedValueOnce({
			error: { message: "session still active" },
		});

		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent(
				"We couldn't sign you out. Please try again.",
			);
		});

		expect(mockNavigate).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
	});

	it("clears sign-out errors when the account popover closes", async () => {
		mockSignOut.mockRejectedValueOnce(new Error("network down"));

		render(
			<Header centerName="Sunny Meadow" centerState="TX" ratioStatus="ok" userName="Taylor Reed" />,
			{ wrapper: makeWrapper() },
		);

		fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent(
				"We couldn't sign you out. Please try again.",
			);
		});

		fireEvent.click(screen.getByTestId("popover-root"));

		await waitFor(() => {
			expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		});
	});

	it("attaches the provided mobile navigation trigger ref", () => {
		const navigationButtonRef = { current: null as HTMLButtonElement | null };

		render(
			<Header
				centerName="Sunny Meadow"
				centerState="TX"
				ratioStatus="ok"
				userName="Taylor Reed"
				onOpenNavigation={vi.fn()}
				navigationButtonRef={navigationButtonRef}
			/>,
			{ wrapper: makeWrapper() },
		);

		expect(navigationButtonRef.current).toBe(
			screen.getByRole("button", { name: "Open navigation" }),
		);
	});

	it("fires the interval callback and cleanup when ratioUpdatedAt is provided", async () => {
		vi.useFakeTimers();
		const now = Date.now();

		const { unmount } = render(
			<Header
				centerName="Sunny Meadow"
				centerState="TX"
				ratioStatus="ok"
				ratioUpdatedAt={now - 5_000}
				userName="Taylor Reed"
			/>,
			{ wrapper: makeWrapper() },
		);

		vi.advanceTimersByTime(15_000);

		expect(screen.getByTestId("ratio-freshness")).toBeInTheDocument();

		unmount();

		vi.useRealTimers();
	});
});
