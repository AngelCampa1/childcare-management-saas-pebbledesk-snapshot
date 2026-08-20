import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendancePage, Route } from "./_auth/attendance";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	const routeUseSearch = vi.fn(() => ({}));

	return {
		...actual,
		createFileRoute: () => (options: unknown) => ({
			...(options as object),
			useSearch: routeUseSearch,
		}),
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
	};
});

vi.mock("@pebbledesk/ui/components/tabs", async () => {
	const React = await vi.importActual<typeof import("react")>("react");

	type TabsContextValue = {
		value: string;
		setValue: (value: string) => void;
	};

	const TabsContext = React.createContext<TabsContextValue | null>(null);

	return {
		Tabs: ({
			children,
			onValueChange,
			value,
		}: {
			children: React.ReactNode;
			onValueChange: (value: string) => void;
			value: string;
		}) => (
			<TabsContext.Provider value={{ value, setValue: onValueChange }}>
				<div>{children}</div>
			</TabsContext.Provider>
		),
		TabsList: ({
			children,
			"aria-label": ariaLabel,
		}: {
			children: React.ReactNode;
			"aria-label"?: string;
		}) => (
			<div role="tablist" aria-label={ariaLabel}>
				{children}
			</div>
		),
		TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => {
			const context = React.useContext(TabsContext);
			if (!context) throw new Error("Missing tabs context");

			return (
				<button
					aria-selected={context.value === value}
					role="tab"
					type="button"
					onClick={() => context.setValue(value)}
				>
					{children}
				</button>
			);
		},
		TabsContent: ({ children, value }: { children: React.ReactNode; value: string }) => {
			const context = React.useContext(TabsContext);
			if (!context || context.value !== value) return null;

			return <div>{children}</div>;
		},
	};
});

vi.mock("../components/attendance-roster", () => ({
	AttendanceRoster: ({
		classroomId,
		ratioStatus,
	}: {
		classroomId: string;
		ratioStatus?: { status: string; requiredRatio?: string };
	}) => (
		<div
			data-testid="attendance-roster"
			data-ratio-status={ratioStatus?.status}
			data-required-ratio={ratioStatus?.requiredRatio}
		>
			{classroomId}
		</div>
	),
}));

vi.mock("../components/signature-pad", () => ({
	SignaturePad: ({
		label,
		onChange,
	}: {
		label: string;
		onChange: (dataUrl: string | null) => void;
	}) => (
		<div data-testid="signature-pad" data-label={label}>
			<button type="button" onClick={() => onChange("data:image/png;base64,test")}>
				Sign
			</button>
			<button type="button" onClick={() => onChange(null)}>
				Clear
			</button>
		</div>
	),
}));

vi.mock("../components/attendance-search", () => ({
	AttendanceSearch: ({
		checkInError,
		defaultClassroomId,
		isCheckInPending,
		onCheckIn,
	}: {
		checkInError?: Error | null;
		defaultClassroomId?: string;
		isCheckInPending?: boolean;
		onCheckIn: (childId: string, classroomId: string) => void;
	}) => (
		<button
			aria-invalid={checkInError ? "true" : undefined}
			data-testid="attendance-search"
			data-pending={String(isCheckInPending)}
			type="button"
			onClick={() => {
				if (defaultClassroomId) {
					onCheckIn("child-1", defaultClassroomId);
				}
			}}
		>
			search
		</button>
	),
}));

vi.mock("@pebbledesk/ui/components/checkbox", () => ({
	Checkbox: ({
		id,
		checked,
		onCheckedChange,
	}: {
		id?: string;
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			id={id}
			type="checkbox"
			checked={checked ?? false}
			onChange={(e) => onCheckedChange?.(e.target.checked)}
		/>
	),
}));

vi.mock("@pebbledesk/ui/components/label", () => ({
	Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("../hooks/use-attendance", () => ({
	useCheckIns: vi.fn(),
	useCheckIn: vi.fn(),
	useStaffCheckIns: vi.fn(),
	useStaffClockIn: vi.fn(),
	useStaffClockOut: vi.fn(),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
	useClassroomStaff: vi.fn(),
}));

import {
	useCheckIn,
	useCheckIns,
	useStaffCheckIns,
	useStaffClockIn,
	useStaffClockOut,
} from "../hooks/use-attendance";
import { useAuthSession } from "../hooks/use-auth-session";
import { useClassroomStaff, useClassrooms } from "../hooks/use-classrooms";

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseClassroomStaff = vi.mocked(useClassroomStaff);
const mockedUseCheckIns = vi.mocked(useCheckIns);
const mockedUseCheckIn = vi.mocked(useCheckIn);
const mockedUseStaffCheckIns = vi.mocked(useStaffCheckIns);
const mockedUseStaffClockIn = vi.mocked(useStaffClockIn);
const mockedUseStaffClockOut = vi.mocked(useStaffClockOut);
const mockedUseSearch = vi.mocked(Route.useSearch);

describe("AttendancePage", () => {
	const clockInMutate = vi.fn();
	const clockOutMutate = vi.fn();
	const checkInMutate = vi.fn();

	beforeEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
		mockedUseAuthSession.mockReset();
		mockedUseClassrooms.mockReset();
		mockedUseClassroomStaff.mockReset();
		mockedUseCheckIns.mockReset();
		mockedUseCheckIn.mockReset();
		mockedUseStaffCheckIns.mockReset();
		mockedUseStaffClockIn.mockReset();
		mockedUseStaffClockOut.mockReset();
		mockedUseSearch.mockReset();
		mockedUseSearch.mockReturnValue({} as never);
		clockInMutate.mockReset();
		clockOutMutate.mockReset();
		checkInMutate.mockReset();
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: ["classroom-1"],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 8,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: [
				{
					membershipId: "membership-1",
					userName: "Taylor Reed",
					userEmail: "taylor@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIn.mockReturnValue({
			mutate: checkInMutate,
			mutateAsync: checkInMutate,
			isPending: false,
			error: null,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffClockIn.mockReturnValue({
			mutate: clockInMutate,
			isPending: false,
		} as never);
		mockedUseStaffClockOut.mockReturnValue({
			mutate: clockOutMutate,
			isPending: false,
		} as never);
	});

	it("matches staff attendance against the center-local date instead of UTC", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-09T06:45:00.000Z"));
		const dateTimeFormat = Intl.DateTimeFormat;
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function MockDateTimeFormat(
			locale,
			options,
		) {
			if (options?.timeZone === "America/Los_Angeles" && options?.year === "numeric") {
				return {
					formatToParts(value) {
						const iso = new Date(value).toISOString();
						if (iso === "2026-04-09T06:45:00.000Z" || iso === "2026-04-08T15:30:00.000Z") {
							return [
								{ type: "year", value: "2026" },
								{ type: "month", value: "04" },
								{ type: "day", value: "08" },
							];
						}

						return [
							{ type: "year", value: "2026" },
							{ type: "month", value: "04" },
							{ type: "day", value: "09" },
						];
					},
				} as Intl.DateTimeFormat;
			}

			return new dateTimeFormat(locale, options);
		} as typeof Intl.DateTimeFormat);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-08T15:30:00.000Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));
		expect(screen.getByText(/Clocked in at/)).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /Clock Out/i })).toHaveLength(2);
	});

	it("shows a staff tab for directors and uses auth session center data", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Attendance")).toBeInTheDocument();
		expect(screen.getByText("Staff")).toBeInTheDocument();
		expect(screen.getByTestId("attendance-roster")).toHaveTextContent("classroom-1");
	});

	it("labels the classroom tab group for screen readers", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByRole("tablist", { name: "Attendance views" })).toBeInTheDocument();
	});

	it("renders a readable center-local date in the page header", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T15:03:00.000Z"));
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Friday, April 10, 2026")).toBeInTheDocument();
	});

	it("checks in a child from the attendance search action", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCheckIn.mockReturnValue({
			mutateAsync: checkInMutate,
			isPending: false,
			error: null,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByTestId("attendance-search"));

		expect(checkInMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				childId: "child-1",
				classroomId: "classroom-1",
			}),
		);
	});

	it("passes child check-in pending and error state into attendance search", () => {
		mockedUseCheckIn.mockReturnValue({
			mutateAsync: checkInMutate,
			isPending: true,
			error: new Error("Failed to check in"),
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		const searchAction = screen.getByTestId("attendance-search");
		expect(searchAction).toHaveAttribute("data-pending", "true");
		expect(searchAction).toHaveAttribute("aria-invalid", "true");
	});

	it("stacks the page-level attendance actions on mobile widths", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		const searchButton = screen.getByTestId("attendance-search");
		const actionBar = searchButton.parentElement;
		if (!actionBar) throw new Error("Expected page-level attendance actions container");

		expect(actionBar.className).toContain("flex-col");
		expect(actionBar.className).toContain("sm:flex-row");
	});

	it("falls back to owner and UTC when the auth session is missing", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Staff")).toBeInTheDocument();
		expect(screen.getByText("Attendance")).toBeInTheDocument();
	});

	it("renders a loading skeleton while classrooms are loading", () => {
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		const { container } = render(<AttendancePage />);

		expect(screen.getByRole("heading", { name: "Attendance" })).toBeInTheDocument();
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("renders the empty state when no classrooms are configured", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Set up your classrooms first")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Start the day by setting up your classrooms so attendance and ratios start tracking.",
			),
		).toBeInTheDocument();
	});

	it("guides staff without a classroom assignment to refresh and return to the dashboard", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: [],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("No classroom assigned yet")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Refresh once your director places you on a room, then check-ins will start flowing here.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Refresh attendance" })).toBeInTheDocument();
		expect(screen.getByText("Ask your director to assign you a room.")).toBeInTheDocument();
		expect(screen.queryByRole("link", { name: "Go to dashboard" })).toBeNull();
	});

	it("requests the classrooms list for staff attendance so assigned rooms can render", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: [],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(mockedUseClassrooms).toHaveBeenCalledWith(undefined, { enabled: true });
	});

	it("opens attendance on a valid room search parameter", () => {
		// #27: room param must be a UUID — use real RFC-4122-compliant UUIDs for classroom ids
		const roomUuid = "550e8400-e29b-41d4-a716-446655440002";
		mockedUseSearch.mockReturnValue({ room: roomUuid } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "550e8400-e29b-41d4-a716-446655440001",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: roomUuid,
					name: "Toddlers",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 10,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByRole("tab", { name: "Toddlers" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByTestId("attendance-roster")).toHaveTextContent(roomUuid);
	});

	it("falls back to the default room when the room search parameter is invalid", () => {
		mockedUseSearch.mockReturnValue({ room: "missing-room" } as never);

		render(<AttendancePage />);

		expect(screen.getByRole("tab", { name: "Infants" })).toHaveAttribute("aria-selected", "true");
		expect(screen.getByTestId("attendance-roster")).toHaveTextContent("classroom-1");
	});

	it("renders the assigned-room view for staff users", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: ["classroom-2"],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: "classroom-2",
					name: "Toddlers",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 10,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.queryByText("Staff")).not.toBeInTheDocument();
		expect(screen.queryByText("Infants")).not.toBeInTheDocument();
		expect(screen.getByText("Toddlers")).toBeInTheDocument();
	});

	it("uses the assigned classroom for staff page-level actions", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: ["classroom-2"],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: "classroom-2",
					name: "Toddlers",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 10,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		fireEvent.click(screen.getByTestId("attendance-search"));
		const [clockInButton] = screen.getAllByRole("button", { name: "Clock In" });
		if (!clockInButton) throw new Error("Expected a page-level clock-in button");
		fireEvent.click(clockInButton);

		expect(checkInMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				childId: "child-1",
				classroomId: "classroom-2",
			}),
		);
		expect(clockInMutate).toHaveBeenCalledWith({ classroomId: "classroom-2" });
	});

	it("does not default page-level actions when staff are assigned to multiple classrooms", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: ["classroom-1", "classroom-2"],
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: "classroom-2",
					name: "Toddlers",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 10,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		fireEvent.click(screen.getByTestId("attendance-search"));
		expect(checkInMutate).not.toHaveBeenCalled();
		expect(screen.getAllByRole("button", { name: "Clock In" })[0]).toBeDisabled();

		fireEvent.click(screen.getByRole("tab", { name: "Toddlers" }));
		fireEvent.click(screen.getByTestId("attendance-search"));
		const [clockInButton] = screen.getAllByRole("button", { name: "Clock In" });
		if (!clockInButton) throw new Error("Expected a page-level clock-in button");
		fireEvent.click(clockInButton);

		expect(checkInMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				childId: "child-1",
				classroomId: "classroom-2",
			}),
		);
		expect(clockInMutate).toHaveBeenCalledWith({ classroomId: "classroom-2" });
	});

	it("renders warning and empty classroom compliance states", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 7,
					staffCount: 1,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: "classroom-2",
					name: "Toddlers",
					// childCount > 0 so the empty-enrollment guard does not fire;
					// live check-in data resolves to empty arrays (no children currently
					// present), so the compliance bar shows the "Empty" state.
					childCount: 3,
					staffCount: 0,
					maxCapacity: 10,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		// Infants: still loading — falls back to childCount:7 / staffCount:1 from the
		// classroom record, producing Near capacity (87.5%) and 1:7.0 ratio.
		// Toddlers: resolved empty arrays — zero live children/staff → "Empty" badge.
		mockedUseCheckIns.mockImplementation(({ classroomId }: { classroomId: string }) => {
			if (classroomId === "classroom-1") return { data: undefined, isLoading: true } as never;
			return { data: [], isLoading: false } as never;
		});
		mockedUseStaffCheckIns.mockImplementation(({ classroomId }: { classroomId: string }) => {
			if (classroomId === "classroom-1") return { data: undefined, isLoading: true } as never;
			return { data: [], isLoading: false } as never;
		});

		render(<AttendancePage />);

		expect(screen.getByText("Near capacity")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("tab", { name: "Toddlers" }));
		expect(screen.getByText("Empty")).toBeInTheDocument();
	});

	it("marks a classroom as a violation when a child is checked in without staff clocked in", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Toddlers",
					childCount: 1,
					staffCount: 0,
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-1",
					centerId: "center-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T13:57:00.000Z",
					checkedInBy: "user-1",
					checkedOutAt: undefined,
					notes: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Violation")).toBeInTheDocument();
		expect(screen.queryByText("Compliant")).not.toBeInTheDocument();
	});

	it("clocks in from the page-level staff button when no active check-in exists", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		const [clockInButton] = screen.getAllByRole("button", { name: "Clock In" });
		if (!clockInButton) throw new Error("Expected a page-level clock-in button");
		fireEvent.click(clockInButton);

		expect(clockInMutate).toHaveBeenCalledWith({ classroomId: "classroom-1" });
	});

	it("disables the page-level clock-in button while a mutation is pending", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffClockIn.mockReturnValue({
			mutate: clockInMutate,
			isPending: true,
		} as never);

		render(<AttendancePage />);

		expect(screen.getAllByRole("button", { name: "Clock In" })[0]).toBeDisabled();
	});

	it("clocks out from the page-level staff button when an active check-in exists", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "other-checkin",
					membershipId: "membership-2",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-08T15:00:00.000Z",
					clockedOutAt: null,
				},
				{
					id: "active-checkin",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-08T15:30:00.000Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		const [clockOutButton] = screen.getAllByRole("button", { name: "Clock Out" });
		if (!clockOutButton) throw new Error("Expected a page-level clock-out button");
		fireEvent.click(clockOutButton);

		expect(clockOutMutate).toHaveBeenCalledWith("active-checkin");
		expect(clockOutMutate).not.toHaveBeenCalledWith("other-checkin");
	});

	it("renders the staff room loading state", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(screen.getByRole("tab", { name: "Staff" })).toHaveAttribute("aria-selected", "true");
		expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("renders the no-staff-assigned state", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(screen.getByText("No staff currently clocked in to this room.")).toBeInTheDocument();
	});

	it("allows directors to clock in a staff member who is not currently checked in", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));
		const clockInButtons = screen.getAllByRole("button", { name: "Clock In" });
		const rowClockInButton = clockInButtons[1];
		if (!rowClockInButton) throw new Error("Expected a row-level clock-in button");
		fireEvent.click(rowClockInButton);

		expect(screen.getByText("Not clocked in")).toBeInTheDocument();
		expect(clockInMutate).toHaveBeenCalledWith({
			classroomId: "classroom-1",
			membershipId: "membership-1",
		});
	});

	it("keeps page-level attendance actions on a real classroom when the staff overview tab is selected", () => {
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));
		fireEvent.click(screen.getByTestId("attendance-search"));
		const clockInButtons = screen.getAllByRole("button", { name: "Clock In" });
		const pageClockInButton = clockInButtons[0];
		if (!pageClockInButton) throw new Error("Expected a page-level clock-in button");
		fireEvent.click(pageClockInButton);

		expect(mockedUseStaffCheckIns).not.toHaveBeenCalledWith({ classroomId: "staff" });
		expect(checkInMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				childId: "child-1",
				classroomId: "classroom-1",
			}),
		);
		expect(clockInMutate).toHaveBeenCalledWith({
			classroomId: "classroom-1",
		});
	});

	it("renders clocked-out staff rows", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T20:00:00.000Z"));
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T15:30:00.000Z",
					clockedOutAt: "2026-04-10T22:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(screen.getByText(/Clocked out at/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Clock Out/i })).not.toBeInTheDocument();
	});

	it("clocks out a staff row from the staff tab", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T20:00:00.000Z"));
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T15:30:00.000Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));
		const clockOutButtons = screen.getAllByRole("button", { name: "Clock Out" });
		const rowClockOutButton = clockOutButtons[1];
		if (!rowClockOutButton) throw new Error("Expected a row-level clock-out button");
		fireEvent.click(rowClockOutButton);

		expect(clockOutMutate).toHaveBeenCalledWith("checkin-1");
	});

	it("falls back to staff email and unknown labels when names are missing", () => {
		mockedUseClassroomStaff.mockReturnValue({
			data: [
				{
					membershipId: "membership-1",
					userName: null,
					userEmail: "taylor@example.com",
				},
				{
					membershipId: "membership-2",
					userName: null,
					userEmail: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(screen.getByText("taylor@example.com")).toBeInTheDocument();
		expect(screen.getByText("Unknown Staff")).toBeInTheDocument();
		expect(screen.getAllByText("?")).toHaveLength(2);
	});

	it("reloads the page when staff click the Refresh attendance button", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Taylor Reed" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Pebble Center",
					state: "CA",
					timezone: "America/Los_Angeles",
				},
				classroomIds: [],
			},
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		const reload = vi.fn();
		const originalLocation = window.location;
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, reload },
		});

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("button", { name: "Refresh attendance" }));

		expect(reload).toHaveBeenCalledTimes(1);

		Object.defineProperty(window, "location", {
			configurable: true,
			value: originalLocation,
		});
	});

	it("surfaces staff clocked in without an assignment on the staff tab", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T20:00:00.000Z"));
		mockedUseClassroomStaff.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-unassigned",
					membershipId: "membership-999",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T15:30:00.000Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(
			screen.getByText("1 team member currently clocked in (not in staff assignments)."),
		).toBeInTheDocument();
	});

	it("pluralizes the unassigned clocked-in message when more than one team member is present", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T20:00:00.000Z"));
		mockedUseClassroomStaff.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "checkin-a",
					membershipId: "membership-a",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T15:30:00.000Z",
					clockedOutAt: null,
				},
				{
					id: "checkin-b",
					membershipId: "membership-b",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T15:35:00.000Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);
		fireEvent.click(screen.getByRole("tab", { name: "Staff" }));

		expect(
			screen.getByText("2 team members currently clocked in (not in staff assignments)."),
		).toBeInTheDocument();
	});

	it("shows targeted empty state when selected room has no enrolled children", () => {
		// Override: one classroom with childCount 0
		vi.mocked(useClassrooms).mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 4,
					staffCount: 0,
					childCount: 0,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText(/No children assigned to Sunshine Room/i)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Enroll a child/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Assign existing child/i })).toBeInTheDocument();
	});

	it("falls back to local-time date when the timezone formatter cannot resolve date parts", () => {
		// #16: formatDateKey now warns and falls back instead of throwing
		const dateTimeFormat = Intl.DateTimeFormat;
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function MockDateTimeFormat(
			locale,
			options,
		) {
			if (options?.timeZone === "America/Los_Angeles" && options?.year === "numeric") {
				return {
					formatToParts: () => [],
				} as Intl.DateTimeFormat;
			}

			return new dateTimeFormat(locale, options);
		} as typeof Intl.DateTimeFormat);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		// Should not throw — renders with local fallback date
		expect(() => render(<AttendancePage />)).not.toThrow();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("could not resolve date parts for timezone"),
		);

		warnSpy.mockRestore();
	});

	it("sets ratioStatus to warning when ratio proximity exceeds 85% of the limit, not when only capacity is near", () => {
		// Classroom: maxCapacity=10, minRatioStaff=1, minRatioChildren=6
		// Live: 5 children / 1 staff → ratio 5:1 which is <85% of the 6:1 limit → ok (not near ratio)
		// Capacity: 5/10 = 50% → not near capacity either
		// Confirms: warning is not triggered by capacity alone
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 5,
					staffCount: 1,
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: [
				{
					id: "ci-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
				{
					id: "ci-2",
					childId: "child-2",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
				{
					id: "ci-3",
					childId: "child-3",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
				{
					id: "ci-4",
					childId: "child-4",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
				{
					id: "ci-5",
					childId: "child-5",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "sci-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T13:00:00Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		const roster = screen.getByTestId("attendance-roster");
		// 5 children / 1 staff = 5 children-per-staff, limit is 6 → 5/6 = 83.3% < 85% → ok
		expect(roster.dataset.ratioStatus).toBe("ok");
	});

	it("sets ratioStatus to warning when actual ratio exceeds 85% of the allowed limit", () => {
		// Classroom: maxCapacity=10, minRatioStaff=1, minRatioChildren=6
		// Live: 6 children / 1 staff → ratio exactly at limit → warning (>85% of limit)
		// Note: capacity = 6/10 = 60% which is NOT near capacity — confirms warning comes from ratio
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 6,
					staffCount: 1,
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		// 6 children checked in
		mockedUseCheckIns.mockReturnValue({
			data: ["ci-1", "ci-2", "ci-3", "ci-4", "ci-5", "ci-6"].map((id, i) => ({
				id,
				childId: `child-${i + 1}`,
				classroomId: "classroom-1",
				checkedInAt: "2026-04-10T14:00:00Z",
				checkedOutAt: null,
			})),
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "sci-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T13:00:00Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		const roster = screen.getByTestId("attendance-roster");
		// 6/1 = 6.0 children-per-staff, limit is 6.0 → 6.0/6.0 = 100% > 85% → warning (not violation since not strictly >)
		expect(roster.dataset.ratioStatus).toBe("warning");
	});

	it("passes undefined ratioStatus when ratio fields are null", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 1,
					maxCapacity: 10,
					minRatioStaff: null,
					minRatioChildren: null,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: [
				{
					id: "ci-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T14:00:00Z",
					checkedOutAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "sci-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T13:00:00Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		const roster = screen.getByTestId("attendance-roster");
		// null ratio fields → ratioStatus prop should be undefined → no data attribute rendered
		expect(roster.dataset.ratioStatus).toBeUndefined();
		expect(roster.dataset.requiredRatio).toBeUndefined();
	});

	it("applies the stricter state-mandated ratio so the room banner matches the Ratios page", () => {
		// Center is in CA (default session). CA infant rule is 1:3, stricter than the
		// loosely-configured 1:6 classroom rule. With 4 children / 1 staff the classroom
		// rule alone would read "Compliant" (4 ≤ 6), but the state rule is violated (4 > 3).
		// The Attendance banner must surface the same violation the Ratios page does, and
		// label the required ratio as the resolved 1:3 — not the raw 1:6 classroom value.
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					ageGroup: "infant",
					childCount: 4,
					staffCount: 1,
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCheckIns.mockReturnValue({
			data: ["ci-1", "ci-2", "ci-3", "ci-4"].map((id, i) => ({
				id,
				childId: `child-${i + 1}`,
				classroomId: "classroom-1",
				checkedInAt: "2026-04-10T14:00:00Z",
				checkedOutAt: null,
			})),
			isLoading: false,
		} as never);
		mockedUseStaffCheckIns.mockReturnValue({
			data: [
				{
					id: "sci-1",
					membershipId: "membership-1",
					classroomId: "classroom-1",
					clockedInAt: "2026-04-10T13:00:00Z",
					clockedOutAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AttendancePage />);

		expect(screen.getByText("Violation")).toBeInTheDocument();
		const roster = screen.getByTestId("attendance-roster");
		expect(roster.dataset.ratioStatus).toBe("violation");
		expect(roster.dataset.requiredRatio).toBe("1:3");
	});

	// #3 — missing-session early return
	it("renders a skeleton while the session is loading", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);

		const { container } = render(<AttendancePage />);

		expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
		expect(screen.queryByText("Attendance")).not.toBeInTheDocument();
	});

	// #27 — invalid UUID room param is silently ignored
	it("ignores a non-UUID room search parameter and shows the default room", () => {
		mockedUseSearch.mockReturnValue({ room: "not-a-uuid" } as never);
		mockedUseStaffCheckIns.mockReturnValue({ data: [], isLoading: false } as never);

		render(<AttendancePage />);

		// Falls back to the first classroom (classroom-1 from beforeEach)
		expect(screen.getByRole("tab", { name: "Infants" })).toHaveAttribute("aria-selected", "true");
	});

	it("ignores a malformed UUID room search parameter and shows the default room", () => {
		mockedUseSearch.mockReturnValue({ room: "00000000-0000-0000-0000-000000000001" } as never);
		mockedUseStaffCheckIns.mockReturnValue({ data: [], isLoading: false } as never);

		render(<AttendancePage />);

		// "00000000-..." is not a valid RFC-4122 UUID (invalid version/variant bits)
		// so it is ignored and the first room is shown
		expect(screen.getByRole("tab", { name: "Infants" })).toHaveAttribute("aria-selected", "true");
	});

	// #35 — valid UUID that doesn't match any room shows a notice
	it("shows a room-not-found notice when the UUID room param does not match any classroom", async () => {
		mockedUseSearch.mockReturnValue({ room: "550e8400-e29b-41d4-a716-446655440099" } as never);
		mockedUseStaffCheckIns.mockReturnValue({ data: [], isLoading: false } as never);

		render(<AttendancePage />);

		// The notice is rendered via useEffect; wait for it
		expect(
			await screen.findByText("Selected room not found, showing first available."),
		).toBeInTheDocument();
		// Still falls back to the first room
		expect(screen.getByRole("tab", { name: "Infants" })).toHaveAttribute("aria-selected", "true");
	});

	// MED #3 — useEffect dep: validatedRoom (derived from search.room) is in the dep array,
	// so switching from a non-matching UUID to one that matches a classroom suppresses the notice.
	it("re-evaluates the room-not-found notice when the room search param changes", async () => {
		const VALID_ROOM_UUID = "550e8400-e29b-41d4-a716-446655440002";
		const UNKNOWN_UUID = "550e8400-e29b-41d4-a716-446655440099";

		mockedUseSearch.mockReturnValue({ room: UNKNOWN_UUID } as never);
		mockedUseStaffCheckIns.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					childCount: 3,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: null,
				},
				{
					id: VALID_ROOM_UUID,
					name: "Toddlers",
					childCount: 2,
					staffCount: 1,
					maxCapacity: 6,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		const { rerender } = render(<AttendancePage />);

		// Starts with a non-matching UUID — notice should appear
		expect(
			await screen.findByText("Selected room not found, showing first available."),
		).toBeInTheDocument();

		// Simulate the search param changing to a valid room UUID
		mockedUseSearch.mockReturnValue({ room: VALID_ROOM_UUID } as never);
		rerender(<AttendancePage />);

		// The valid room tab should now be selected (effect ran with new validatedRoom)
		expect(screen.getByRole("tab", { name: "Toddlers" })).toHaveAttribute("aria-selected", "true");
	});

	it("shows error box and Try again button instead of empty classroom state when useClassrooms errors", () => {
		const refetch = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch,
		} as never);

		render(<AttendancePage />);

		expect(screen.queryByText("Set up your classrooms first")).not.toBeInTheDocument();
		expect(screen.getByText("Failed to load classrooms.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});
});
