import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemberships, useSwitchCenter } from "../hooks/use-memberships";
import { CenterSwitcher } from "./center-switcher";

// Stub Radix dropdown-menu to avoid portal/pointer-event issues in jsdom.
// The real component uses DropdownMenuPrimitive.Portal which renders outside
// the test container. We replace it with plain divs that expose the same props.
vi.mock("@pebbledesk/ui/components/dropdown-menu", () => {
	const React = require("react");
	return {
		DropdownMenu: ({ children }: { children: ReactNode }) =>
			React.createElement("div", { "data-testid": "dropdown-root" }, children),
		DropdownMenuTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) => {
			if (asChild && React.isValidElement(children)) {
				return children;
			}
			return React.createElement("div", { "data-testid": "dropdown-trigger" }, children);
		},
		DropdownMenuContent: ({ children }: { children: ReactNode }) =>
			React.createElement("div", { "data-testid": "dropdown-content" }, children),
		DropdownMenuItem: ({
			children,
			onSelect,
			className,
			...rest
		}: {
			children: ReactNode;
			onSelect?: () => void;
			className?: string;
			[key: string]: unknown;
		}) =>
			React.createElement(
				"div",
				{
					role: "menuitem",
					className,
					onClick: onSelect,
					...rest,
				},
				children,
			),
	};
});

vi.mock("../hooks/use-memberships", () => ({
	useMemberships: vi.fn(),
	useSwitchCenter: vi.fn(),
}));

const mockedUseMemberships = vi.mocked(useMemberships);
const mockedUseSwitchCenter = vi.mocked(useSwitchCenter);

function makeWrapper() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

const mockMutate = vi.fn();

function setupSwitchCenter({ isPending = false } = {}) {
	mockedUseSwitchCenter.mockReturnValue({
		mutate: mockMutate,
		isPending,
	} as unknown as ReturnType<typeof useSwitchCenter>);
}

const twoMemberships = [
	{
		id: "mem-1",
		centerId: "center-1",
		centerName: "Sunny Meadow",
		role: "owner",
		acceptedAt: "2026-01-01T00:00:00.000Z",
	},
	{
		id: "mem-2",
		centerId: "center-2",
		centerName: "Little Stars",
		role: "director",
		acceptedAt: "2026-02-01T00:00:00.000Z",
	},
];

describe("CenterSwitcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupSwitchCenter();
	});

	it("renders nothing when there is only one membership", () => {
		mockedUseMemberships.mockReturnValue({
			data: [twoMemberships[0]],
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		const { container } = render(<CenterSwitcher activeCenterId="center-1" />, {
			wrapper: makeWrapper(),
		});

		expect(container.firstChild).toBeNull();
	});

	it("renders nothing while memberships are loading with no data", () => {
		mockedUseMemberships.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as unknown as ReturnType<typeof useMemberships>);

		const { container } = render(<CenterSwitcher activeCenterId="center-1" />, {
			wrapper: makeWrapper(),
		});

		expect(container.firstChild).toBeNull();
	});

	it("shows the dropdown trigger with the current center name for multi-center users", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		expect(screen.getByRole("button", { name: /Sunny Meadow/i })).toBeInTheDocument();
	});

	it("lists all center options in the dropdown content", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		// With the mock, content is always rendered — both center names are in the DOM
		expect(screen.getAllByText("Sunny Meadow").length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText("Little Stars")).toBeInTheDocument();
	});

	it("calls useSwitchCenter mutate with the centerId when a different center is clicked", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		fireEvent.click(screen.getByText("Little Stars"));

		expect(mockMutate).toHaveBeenCalledWith("center-2");
	});

	it("does not call mutate when the current active center item is clicked", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		// Click on the menu item for the active center (center-1 = "Sunny Meadow")
		const activeItem = screen.getByTestId("center-item-center-1");
		fireEvent.click(activeItem);

		expect(mockMutate).not.toHaveBeenCalled();
	});

	it("marks the current center item with data-active=true", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		const activeItem = screen.getByTestId("center-item-center-1");
		expect(activeItem).toHaveAttribute("data-active", "true");

		const inactiveItem = screen.getByTestId("center-item-center-2");
		expect(inactiveItem).toHaveAttribute("data-active", "false");
	});

	it("shows a Check icon on the active center item and not on the inactive one", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		const activeItem = screen.getByTestId("center-item-center-1");
		expect(activeItem.querySelector("[data-testid='check-icon']")).toBeInTheDocument();

		const inactiveItem = screen.getByTestId("center-item-center-2");
		expect(inactiveItem.querySelector("[data-testid='check-icon']")).not.toBeInTheDocument();
	});

	it("falls back to 'Switch center' label when no membership matches the activeCenterId", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		render(<CenterSwitcher activeCenterId="center-999" />, { wrapper: makeWrapper() });

		expect(screen.getByRole("button", { name: /Switch center/i })).toBeInTheDocument();
	});

	it("disables the trigger button while a center switch is pending", () => {
		mockedUseMemberships.mockReturnValue({
			data: twoMemberships,
			isLoading: false,
		} as unknown as ReturnType<typeof useMemberships>);

		setupSwitchCenter({ isPending: true });

		render(<CenterSwitcher activeCenterId="center-1" />, { wrapper: makeWrapper() });

		const trigger = screen.getByRole("button", { name: /Sunny Meadow/i });
		expect(trigger).toBeDisabled();
	});
});
