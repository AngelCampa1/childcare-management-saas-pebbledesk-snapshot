import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../../../hooks/use-phase5", () => ({
	useTimeEntries: vi.fn(),
	useApproveTimeEntry: vi.fn(),
}));

vi.mock("../../../hooks/use-members", () => ({
	useMembers: vi.fn(() => ({ data: undefined })),
}));

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({ data: { membership: { id: "membership-1", role: "director" } } })),
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
		<div>
			{title}
			{action}
		</div>
	),
}));

import { useAuthSession } from "../../../hooks/use-auth-session";
import { useMembers } from "../../../hooks/use-members";
import { useApproveTimeEntry, useTimeEntries } from "../../../hooks/use-phase5";
import { TimeEntriesPage } from "./time";

const mockedUseTimeEntries = vi.mocked(useTimeEntries);
const mockedUseApproveTimeEntry = vi.mocked(useApproveTimeEntry);
const mockedUseMembers = vi.mocked(useMembers);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function setupDefaultMocks() {
	mockedUseApproveTimeEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
}

describe("TimeEntriesPage", () => {
	it("renders the Time Entries heading", () => {
		mockedUseTimeEntries.mockReturnValue({ data: [], isLoading: false } as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByRole("heading", { name: /Time Entries/i })).toBeInTheDocument();
	});

	it("shows skeleton while loading", () => {
		mockedUseTimeEntries.mockReturnValue({ data: undefined, isLoading: true } as never);
		setupDefaultMocks();

		const { container } = render(<TimeEntriesPage />);

		expect(container.firstChild).not.toBeNull();
		expect(screen.queryByRole("heading", { name: /Time Entries/i })).not.toBeInTheDocument();
	});

	it("shows empty state when no time entries exist", () => {
		mockedUseTimeEntries.mockReturnValue({ data: [], isLoading: false } as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByText("No time entries found")).toBeInTheDocument();
	});

	it("renders pending entry with Approve button", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "pending",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByRole("button", { name: /Approve time entry/i })).toBeInTheDocument();
		expect(screen.getByText(/Worked 8h/)).toBeInTheDocument();
	});

	it("approves with the selected time entry data", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		const entry = {
			id: "te-1",
			centerId: "center-1",
			membershipId: "membership-1",
			date: "2026-04-01",
			hoursWorked: 8,
			hoursScheduled: 7.5,
			overtimeHours: 0.5,
			status: "auto",
			createdAt: "2026-04-01T12:00:00.000Z",
			updatedAt: "2026-04-01T12:00:00.000Z",
		};
		mockedUseTimeEntries.mockReturnValue({
			data: [entry],
			isLoading: false,
		} as never);
		mockedUseApproveTimeEntry.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<TimeEntriesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Approve time entry/i }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith(entry);
		});
	});

	it("shows fallback approval error for non-Error rejections", async () => {
		const mutateAsync = vi.fn().mockRejectedValue("offline");
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					centerId: "center-1",
					membershipId: "membership-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					createdAt: "2026-04-01T12:00:00.000Z",
					updatedAt: "2026-04-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseApproveTimeEntry.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<TimeEntriesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Approve time entry/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Failed to approve time entry");
		});
	});

	it("formats non-date-only entry dates", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01T12:00:00.000Z",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByText("Apr 1, 2026")).toBeInTheDocument();
	});

	it("renders approved entry without Approve button", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.queryByRole("button", { name: /Approve time entry/i })).not.toBeInTheDocument();
		// The approved entry shows approved badge
		expect(screen.getAllByText("approved").length).toBeGreaterThanOrEqual(1);
	});

	it("shows 'Nothing waiting' when all entries are approved", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByText(/Nothing waiting — approved entries are below/)).toBeInTheDocument();
	});

	it("renders null data as empty list without crashing", () => {
		mockedUseTimeEntries.mockReturnValue({ data: null, isLoading: false } as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByText("No time entries found")).toBeInTheDocument();
	});

	it("renders description text", () => {
		mockedUseTimeEntries.mockReturnValue({ data: [], isLoading: false } as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByText(/Approve live attendance and review scheduled/)).toBeInTheDocument();
	});

	it("summarizes payroll readiness for pending and overtime review", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "pending",
				},
				{
					id: "te-2",
					date: "2026-04-02",
					hoursWorked: 9,
					hoursScheduled: 8,
					overtimeHours: 1,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.getByRole("region", { name: "Coverage summary" })).toBeInTheDocument();
		expect(screen.getByText("1 pending")).toBeInTheDocument();
		expect(screen.getByText("1 approved")).toBeInTheDocument();
		expect(screen.getByText("17h worked")).toBeInTheDocument();
		expect(screen.getByText("1h overtime")).toBeInTheDocument();
	});

	it("shows each coverage metric once, not duplicated in a second stat block", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "pending",
				},
				{
					id: "te-2",
					date: "2026-04-02",
					hoursWorked: 9,
					hoursScheduled: 8,
					overtimeHours: 1,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		// The "Pending" metric label must appear exactly once — in the Coverage summary —
		// and not be repeated by a redundant stat-card grid above it. ("Approved" also
		// appears as the Entry-review section heading, so it is not a reliable dup signal.)
		expect(screen.getAllByText("Pending")).toHaveLength(1);
		// The card-grid-only label "Worked hours" is gone; the summary uses "Worked".
		expect(screen.queryByText("Worked hours")).not.toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Coverage summary" })).toBeInTheDocument();
	});

	it("shows staff name from members when available", () => {
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Jane Smith",
					userEmail: "jane@example.com",
				},
			],
		} as never);
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					centerId: "center-1",
					membershipId: "membership-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					createdAt: "2026-04-01T12:00:00.000Z",
					updatedAt: "2026-04-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseApproveTimeEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

		render(<TimeEntriesPage />);

		expect(screen.getByText("Jane Smith")).toBeInTheDocument();
	});

	it("hides the Approve button for staff so they never hit an always-403 control", () => {
		mockedUseAuthSession.mockReturnValueOnce({
			data: { membership: { id: "membership-1", role: "staff" } },
		} as never);
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					centerId: "center-1",
					membershipId: "membership-1",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					createdAt: "2026-04-01T12:00:00.000Z",
					updatedAt: "2026-04-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		// The entry is still visible (staff can review their own hours)...
		expect(screen.getByText(/Worked 8h/)).toBeInTheDocument();
		// ...but the Approve control is gone for staff.
		expect(screen.queryByRole("button", { name: /Approve time entry/i })).not.toBeInTheDocument();
		expect(screen.getByText("Pending approval")).toBeInTheDocument();
	});

	it("falls back to membershipId when no matching member found", () => {
		mockedUseMembers.mockReturnValue({ data: [] } as never);
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "te-1",
					centerId: "center-1",
					membershipId: "membership-unknown",
					date: "2026-04-01",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					createdAt: "2026-04-01T12:00:00.000Z",
					updatedAt: "2026-04-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseApproveTimeEntry.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);

		render(<TimeEntriesPage />);

		expect(screen.getByText("membership-unknown")).toBeInTheDocument();
	});

	it("shows error box and Try again button instead of empty state when useTimeEntries errors", () => {
		const refetch = vi.fn();
		mockedUseTimeEntries.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch,
		} as never);
		setupDefaultMocks();

		render(<TimeEntriesPage />);

		expect(screen.queryByText("No time entries found")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load time entries.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});
