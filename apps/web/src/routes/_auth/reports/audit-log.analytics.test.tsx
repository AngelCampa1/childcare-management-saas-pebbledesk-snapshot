/**
 * Analytics tests for AuditLogPage.
 * Verifies that audit_log_filtered fires on filter changes (not on mount).
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		createFileRoute: () => () => ({}),
	};
});

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: { center: { timezone: "America/Chicago" } },
	})),
}));

vi.mock("../../../hooks/use-reports", () => ({
	useAuditLog: vi.fn(() => ({
		data: undefined,
		isLoading: false,
		isError: false,
		refetch: vi.fn(),
		hasNextPage: false,
		fetchNextPage: vi.fn(),
		isFetchingNextPage: false,
	})),
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("@pebbledesk/ui/components/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
	}: {
		children: ReactNode;
		onClick?: () => void;
		disabled?: boolean;
	}) => (
		<button type="button" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
}));

vi.mock("@pebbledesk/ui/components/label", () => ({
	Label: ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("@pebbledesk/ui/components/skeleton", () => ({
	Skeleton: () => null,
}));

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value: string;
		onValueChange: (v: string) => void;
	}) => (
		<select
			value={value}
			onChange={(e) => onValueChange(e.target.value)}
			data-testid="select-wrapper"
		>
			{children}
		</select>
	),
	SelectTrigger: ({
		children,
		"aria-label": ariaLabel,
	}: {
		children?: ReactNode;
		"aria-label"?: string;
	}) => (
		<option value="" disabled hidden aria-label={ariaLabel}>
			{children}
		</option>
	),
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

import { track } from "../../../lib/analytics";
import { AuditLogPage } from "./audit-log";

const mockedTrack = vi.mocked(track);

describe("AuditLogPage — audit_log_filtered analytics", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does NOT fire track on initial mount with default (no) filters", () => {
		render(<AuditLogPage />);
		expect(mockedTrack).not.toHaveBeenCalled();
	});

	it("fires track(auditLogFiltered) with has_filters:true when action filter changes", () => {
		render(<AuditLogPage />);

		// Change the action filter select (first select)
		const selects = screen.getAllByRole("combobox");
		fireEvent.change(selects[0], { target: { value: "create" } });

		expect(mockedTrack).toHaveBeenCalledWith("audit_log_filtered", { has_filters: true });
		expect(mockedTrack).toHaveBeenCalledTimes(1);
	});

	it("fires track with has_filters:true and entity_type when entity filter changes", () => {
		render(<AuditLogPage />);

		const selects = screen.getAllByRole("combobox");
		fireEvent.change(selects[1], { target: { value: "children" } });

		expect(mockedTrack).toHaveBeenCalledWith("audit_log_filtered", {
			has_filters: true,
			entity_type: "children",
		});
	});

	it("does NOT fire track when filter is reset to 'all' (no active filters)", () => {
		render(<AuditLogPage />);

		const selects = screen.getAllByRole("combobox");
		// Set a filter, then reset it
		fireEvent.change(selects[1], { target: { value: "children" } });
		vi.clearAllMocks();
		fireEvent.change(selects[1], { target: { value: "all" } });

		expect(mockedTrack).not.toHaveBeenCalled();
	});
});
