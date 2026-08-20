import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceCalendar } from "./attendance-calendar";
import { AttendanceRoster } from "./attendance-roster";

const mockedUseCheckInHistory = vi.hoisted(() => vi.fn());
const mockedUseChildren = vi.hoisted(() => vi.fn());
const mockedUseCheckIn = vi.hoisted(() => vi.fn());
const mockedUseCheckIns = vi.hoisted(() => vi.fn());
const mockedUseCheckOut = vi.hoisted(() => vi.fn());
const rosterCheckInMutate = vi.hoisted(() => vi.fn());
const rosterCheckOutMutate = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-attendance", () => ({
	useCheckInHistory: (...args: unknown[]) => mockedUseCheckInHistory(...args),
	useCheckIn: (...args: unknown[]) => mockedUseCheckIn(...args),
	useCheckIns: (...args: unknown[]) => mockedUseCheckIns(...args),
	useCheckOut: (...args: unknown[]) => mockedUseCheckOut(...args),
}));

vi.mock("../hooks/use-children", () => ({
	useChildren: (...args: unknown[]) => mockedUseChildren(...args),
}));

describe("AttendanceCalendar", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
		mockedUseChildren.mockReset();
		mockedUseCheckIn.mockReset();
		mockedUseCheckIns.mockReset();
		mockedUseCheckOut.mockReset();
		mockedUseCheckInHistory.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseCheckIn.mockReturnValue({
			mutate: rosterCheckInMutate,
			isPending: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseCheckOut.mockReturnValue({
			mutate: rosterCheckOutMutate,
			isPending: false,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("calculates attendance rate against elapsed weekdays in the current month", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T08:00:00.000Z",
					checkedOutAt: "2026-04-10T14:30:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		expect(screen.getByText("Days Attended").previousElementSibling).toHaveTextContent("1");
		expect(screen.getByText("13%")).toBeInTheDocument();
		expect(screen.getByText("Avg Hours/Day").previousElementSibling).toHaveTextContent("6.5h");
	});

	it("shows an ASCII-safe empty average when there are no attended days", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		expect(screen.getByText("0%")).toBeInTheDocument();
		expect(screen.getByText("N/A")).toBeInTheDocument();
	});

	it("shows the loading skeleton while check-in history is loading", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const { container } = render(
			<AttendanceCalendar childId="child-1" timezone="America/Chicago" />,
		);

		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("uses semantic status tokens for attended day cells", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T08:00:00.000Z",
					checkedOutAt: "2026-04-10T15:30:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
				{
					id: "check-in-2",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-09T08:00:00.000Z",
					checkedOutAt: "2026-04-09T11:00:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		const fullDayCell = screen.getByText("10").closest("button");
		const partialDayCell = screen.getByText("9").closest("button");

		if (!fullDayCell || !partialDayCell) {
			throw new Error("Expected calendar day cells to render");
		}

		expect(fullDayCell.className).toContain("bg-success/15");
		expect(fullDayCell.className).toContain("text-success");
		expect(partialDayCell.className).toContain("bg-warning/15");
		expect(partialDayCell.className).toContain("text-warning");
	});

	it("renders muted weekend day cells when there is no attendance record", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		const weekendCell = screen.getByText("4").closest("button");
		if (!weekendCell) {
			throw new Error("Expected a weekend day cell");
		}

		expect(weekendCell.className).toContain("bg-muted/40");
		expect(weekendCell.className).toContain("text-muted-foreground/70");
		expect(weekendCell.className).toContain("cursor-default");
	});

	it("uses semantic tokens in the day detail panel", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T08:00:00.000Z",
					checkedOutAt: "2026-04-10T15:30:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: "Packed lunch",
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		const fullDayCell = screen.getByText("10").closest("button");
		if (!fullDayCell) {
			throw new Error("Expected the attended day cell to render");
		}

		fireEvent.click(fullDayCell);

		expect(screen.getByText("Check-in").className).toContain("text-primary");
		expect(screen.getByText("Total hours").className).toContain("text-primary");
		expect(screen.getByText("Packed lunch").className).toContain("bg-background");
	});

	it("wraps to the next year when navigating forward from December", async () => {
		vi.setSystemTime(new Date("2026-12-10T12:00:00.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);
		fireEvent.click(screen.getByRole("button", { name: "Next month" }));
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		expect(screen.getByText(/January 2027/)).toBeInTheDocument();
	});

	it("wraps to the previous year when navigating back from January", async () => {
		vi.setSystemTime(new Date("2026-01-10T12:00:00.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Los_Angeles" />);
		fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
		await act(async () => {
			vi.advanceTimersByTime(150);
		});

		expect(screen.getByText(/December 2025/)).toBeInTheDocument();
	});

	it("renders check-in/out times in the supplied center timezone (not browser)", () => {
		// 13:30 UTC → 09:30 AM in America/New_York (EDT) vs 06:30 AM in LA.
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T13:30:00.000Z",
					checkedOutAt: "2026-04-10T20:30:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/New_York" />);
		const dayCell = screen.getByText("10").closest("button");
		if (!dayCell) throw new Error("Expected day 10 cell to render");
		fireEvent.click(dayCell);

		expect(screen.getByText("9:30 AM")).toBeInTheDocument();
		expect(screen.getByText("4:30 PM")).toBeInTheDocument();
	});

	it("falls back to locale formatting when the date formatter parts are incomplete", () => {
		const dateTimeFormat = Intl.DateTimeFormat;
		const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function MockDateTimeFormat(
			locale,
			options,
		) {
			if (options?.timeZone === "America/Los_Angeles" && options?.weekday === "long") {
				return {
					formatToParts: () => [{ type: "year", value: "2026" }],
				} as Intl.DateTimeFormat;
			}

			return new dateTimeFormat(locale, options);
		} as typeof Intl.DateTimeFormat);
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		expect(screen.getByText("Attendance History")).toBeInTheDocument();
		spy.mockRestore();
	});

	it("uses the center-local month when initializing history queries", () => {
		vi.setSystemTime(new Date("2026-04-01T06:30:00.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Los_Angeles" />);

		expect(screen.getByText("March 2026")).toBeInTheDocument();
		expect(mockedUseCheckInHistory).toHaveBeenCalledWith("child-1", "2026-03-01", "2026-03-31");
	});

	it("re-bases the visible month when the center timezone resolves after mount", () => {
		vi.setSystemTime(new Date("2026-04-01T06:30:00.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		const { rerender } = render(<AttendanceCalendar childId="child-1" timezone="UTC" />);
		expect(screen.getByText("April 2026")).toBeInTheDocument();

		rerender(<AttendanceCalendar childId="child-1" timezone="America/Los_Angeles" />);

		expect(screen.getByText("March 2026")).toBeInTheDocument();
		expect(mockedUseCheckInHistory).toHaveBeenLastCalledWith("child-1", "2026-03-01", "2026-03-31");
	});

	it("shows a checked-in day without hours when the check-in is still open", () => {
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T08:00:00.000Z",
					checkedOutAt: null,
					checkedInBy: "Taylor Reed",
					checkedOutBy: null,
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		const fullDayCell = screen.getByText("10").closest("button");
		if (!fullDayCell) {
			throw new Error("Expected the attended day cell to render");
		}

		expect(fullDayCell).not.toHaveTextContent("0.0h");
		fireEvent.click(fullDayCell);
		expect(screen.getByText("Still checked in")).toBeInTheDocument();
	});

	it("refreshes the today marker when local midnight passes with the calendar open", async () => {
		// 23:59:30 local (America/Chicago = UTC-5 in April / CDT) on April 10
		vi.setSystemTime(new Date("2026-04-11T04:59:30.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Chicago" />);

		const tenthCellBefore = screen.getByText("10").closest("button");
		if (!tenthCellBefore) throw new Error("Expected day 10 cell");
		expect(tenthCellBefore.className).toContain("ring-ring");

		// Advance 90 seconds — crosses local midnight into April 11.
		await act(async () => {
			vi.advanceTimersByTime(90_000);
		});

		const tenthCellAfter = screen.getByText("10").closest("button");
		const eleventhCellAfter = screen.getByText("11").closest("button");
		if (!tenthCellAfter || !eleventhCellAfter) throw new Error("Expected day cells");
		expect(tenthCellAfter.className).not.toContain("ring-ring");
		expect(eleventhCellAfter.className).toContain("ring-ring");
	});

	it("buckets late UTC check-ins into the center-local calendar day", () => {
		vi.setSystemTime(new Date("2026-04-01T06:30:00.000Z"));
		mockedUseCheckInHistory.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-01T05:45:00.000Z",
					checkedOutAt: "2026-04-01T12:30:00.000Z",
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceCalendar childId="child-1" timezone="America/Los_Angeles" />);

		const marchThirtyFirstCell = screen.getByText("31").closest("button");
		if (!marchThirtyFirstCell) {
			throw new Error("Expected the local March 31 day cell to render");
		}

		fireEvent.click(marchThirtyFirstCell);
		expect(screen.getByText("Tuesday, March 31")).toBeInTheDocument();
		expect(screen.queryByText("Wednesday, April 1")).not.toBeInTheDocument();
	});
});

describe("AttendanceRoster", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-10T12:00:00.000Z"));
		mockedUseChildren.mockReset();
		mockedUseCheckIn.mockReset();
		mockedUseCheckIns.mockReset();
		mockedUseCheckOut.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseCheckIn.mockReturnValue({
			mutate: rosterCheckInMutate,
			isPending: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseCheckOut.mockReturnValue({
			mutate: rosterCheckOutMutate,
			isPending: false,
		});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("shows the roster loading state", () => {
		mockedUseChildren.mockReturnValue({
			data: undefined,
			isLoading: true,
		});
		mockedUseCheckIns.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		const { container } = render(
			<AttendanceRoster classroomId="classroom-1" timezone="America/Chicago" />,
		);

		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("renders roster rows and actions for each attendance status", () => {
		const today = new Date().toISOString().split("T")[0];

		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Ada",
					lastName: "Lovelace",
					enrollmentStatus: "active",
				},
				{
					id: "child-2",
					firstName: "Bea",
					lastName: "Chen",
					enrollmentStatus: "active",
				},
				{
					id: "child-3",
					firstName: "Cam",
					lastName: "Diaz",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: `${today}T08:00:00.000Z`,
					checkedOutAt: null,
					checkedInBy: "Taylor Reed",
					checkedOutBy: null,
					notes: null,
				},
				{
					id: "check-in-2",
					childId: "child-2",
					classroomId: "classroom-1",
					checkedInAt: `${today}T08:00:00.000Z`,
					checkedOutAt: `${today}T11:30:00.000Z`,
					checkedInBy: "Taylor Reed",
					checkedOutBy: "Taylor Reed",
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="America/Chicago" />);

		expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
		expect(screen.getByText("Bea Chen")).toBeInTheDocument();
		expect(screen.getByText("Cam Diaz")).toBeInTheDocument();
		expect(screen.getByText(/In at/)).toBeInTheDocument();
		expect(screen.getByText(/Out at/)).toBeInTheDocument();
		expect(screen.getByText("Not here")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Check In" }));
		fireEvent.click(screen.getByRole("button", { name: /confirm check in/i }));
		fireEvent.click(screen.getByRole("button", { name: "Check Out" }));
		fireEvent.click(screen.getByRole("button", { name: /confirm check out/i }));
		expect(rosterCheckInMutate).toHaveBeenCalledWith(
			expect.objectContaining({ childId: "child-3", classroomId: "classroom-1" }),
		);
		expect(rosterCheckOutMutate).toHaveBeenCalledWith(
			expect.objectContaining({ id: "check-in-1" }),
		);
	});

	it("shows the empty roster state when there are no children", () => {
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="America/Chicago" />);

		expect(screen.getByText("No children assigned to this classroom.")).toBeInTheDocument();
	});

	it("matches roster status against the center-local date instead of UTC", () => {
		vi.setSystemTime(new Date("2026-04-10T06:30:00.000Z"));
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Ada",
					lastName: "Lovelace",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [
				{
					id: "check-in-1",
					childId: "child-1",
					classroomId: "classroom-1",
					checkedInAt: "2026-04-10T05:45:00.000Z",
					checkedOutAt: null,
					checkedInBy: "Taylor Reed",
					checkedOutBy: null,
					notes: null,
				},
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="America/Los_Angeles" />);

		expect(screen.getByText(/In at/)).toBeInTheDocument();
		expect(screen.queryByText("Not here")).not.toBeInTheDocument();
	});
});
