import { fireEvent, render, screen } from "@testing-library/react";
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

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("../../../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("../../../hooks/use-members", () => ({
	useMembers: vi.fn(),
}));

vi.mock("../../../hooks/use-phase5", () => ({
	useSchedules: vi.fn(),
	useShifts: vi.fn(),
	useCreateSchedule: vi.fn(),
	useCreateShift: vi.fn(),
	useDeleteSchedule: vi.fn(),
	useDeleteShift: vi.fn(),
	useUpdateSchedule: vi.fn(),
	useUpdateShift: vi.fn(),
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
		<div>
			{title}
			{action}
		</div>
	),
}));

vi.mock("../../../components/date-input", () => ({
	DateInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input type="date" {...props} />
	),
}));

import { useAuthSession } from "../../../hooks/use-auth-session";
import { useClassrooms } from "../../../hooks/use-classrooms";
import { useMembers } from "../../../hooks/use-members";
import {
	useCreateSchedule,
	useCreateShift,
	useDeleteSchedule,
	useDeleteShift,
	useSchedules,
	useShifts,
	useUpdateSchedule,
	useUpdateShift,
} from "../../../hooks/use-phase5";
import { SchedulingPage } from "./index";

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseMembers = vi.mocked(useMembers);
const mockedUseSchedules = vi.mocked(useSchedules);
const mockedUseShifts = vi.mocked(useShifts);
const mockedUseCreateSchedule = vi.mocked(useCreateSchedule);
const mockedUseCreateShift = vi.mocked(useCreateShift);
const mockedUseDeleteSchedule = vi.mocked(useDeleteSchedule);
const mockedUseDeleteShift = vi.mocked(useDeleteShift);
const mockedUseUpdateSchedule = vi.mocked(useUpdateSchedule);
const mockedUseUpdateShift = vi.mocked(useUpdateShift);

function setupDirectorSession() {
	mockedUseAuthSession.mockReturnValue({
		data: { membership: { role: "director", id: "mem-1" } },
	} as never);
}

function setupStaffSession() {
	mockedUseAuthSession.mockReturnValue({
		data: { membership: { role: "staff", id: "mem-2" } },
	} as never);
}

function setupDefaultHooks({
	schedules = [],
	shifts = [],
	classrooms = [],
	members = [],
}: {
	schedules?: { id: string; name: string; effectiveFrom: string; effectiveUntil?: string }[];
	shifts?: {
		id: string;
		dayOfWeek: number;
		startTime: string;
		endTime: string;
		classroomId: string;
		membershipId?: string;
	}[];
	classrooms?: { id: string; name: string; archivedAt: null | string }[];
	members?: { id: string; userName?: string; userEmail?: string }[];
} = {}) {
	mockedUseClassrooms.mockReturnValue({ data: classrooms, isLoading: false } as never);
	mockedUseMembers.mockReturnValue({ data: members } as never);
	mockedUseSchedules.mockReturnValue({ data: schedules, isLoading: false } as never);
	mockedUseShifts.mockReturnValue({ data: shifts, isLoading: false } as never);
	mockedUseCreateSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseCreateShift.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseDeleteSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseDeleteShift.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseUpdateSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseUpdateShift.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
}

describe("SchedulingPage", () => {
	it("renders the Scheduling heading", () => {
		setupDirectorSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(screen.getByRole("heading", { level: 1, name: "Scheduling" })).toBeInTheDocument();
	});

	it("shows loading skeleton when schedules are loading", () => {
		setupDirectorSession();
		mockedUseClassrooms.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseSchedules.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseShifts.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseMembers.mockReturnValue({ data: undefined } as never);
		mockedUseCreateSchedule.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const { container } = render(<SchedulingPage />);

		expect(container.firstChild).not.toBeNull();
		expect(screen.queryByRole("heading", { name: /Scheduling/i })).not.toBeInTheDocument();
	});

	it("shows an error state with a retry control instead of a false empty state on load failure", () => {
		setupDirectorSession();
		setupDefaultHooks({ classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }] });
		// "Try again" refetches all three queries, so each needs a refetch spy.
		const refetchSchedules = vi.fn();
		const refetchShifts = vi.fn();
		const refetchClassrooms = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Room A", archivedAt: null }],
			isLoading: false,
			refetch: refetchClassrooms,
		} as never);
		mockedUseShifts.mockReturnValue({
			data: [],
			isLoading: false,
			refetch: refetchShifts,
		} as never);
		// Any one of the three queries failing must surface an error, not "No saved templates".
		mockedUseSchedules.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
			refetch: refetchSchedules,
		} as never);

		render(<SchedulingPage />);

		expect(screen.queryByText("No saved schedule templates")).not.toBeInTheDocument();
		expect(screen.getByText(/Failed to load scheduling/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
		expect(refetchSchedules).toHaveBeenCalled();
		expect(refetchShifts).toHaveBeenCalled();
		expect(refetchClassrooms).toHaveBeenCalled();
	});

	it("shows empty state when there are no schedules", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
		});

		render(<SchedulingPage />);

		expect(screen.getByText("No saved schedule templates")).toBeInTheDocument();
	});

	it("shows 'Add classrooms before building a schedule' when no active classrooms", () => {
		setupDirectorSession();
		setupDefaultHooks({ schedules: [], classrooms: [] });

		render(<SchedulingPage />);

		expect(screen.getByText("Add classrooms before building a schedule")).toBeInTheDocument();
	});

	it("shows empty shifts state", () => {
		setupDirectorSession();
		setupDefaultHooks({ shifts: [] });

		render(<SchedulingPage />);

		expect(screen.getByText("No recurring shifts assigned")).toBeInTheDocument();
	});

	it("renders schedule rows when schedules exist", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});

		render(<SchedulingPage />);

		expect(screen.getByText("Spring 2026")).toBeInTheDocument();
	});

	it("renders shift rows when shifts exist", () => {
		setupDirectorSession();
		setupDefaultHooks({
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
		});

		render(<SchedulingPage />);

		expect(screen.getByText(/Mon 08:00 - 17:00/)).toBeInTheDocument();
	});

	it("shows staff description for staff role", () => {
		setupStaffSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(
			screen.getByText(/View your assigned shifts and saved schedule templates/),
		).toBeInTheDocument();
	});

	it("shows director/owner description for non-staff role", () => {
		setupDirectorSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(
			screen.getByText(/Review saved schedule templates and recurring staff shifts/),
		).toBeInTheDocument();
	});

	it("shows 'Your shifts' heading for staff", () => {
		setupStaffSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(screen.getByText("Your shifts")).toBeInTheDocument();
	});

	it("shows 'Recurring shifts' heading for non-staff", () => {
		setupDirectorSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(screen.getByText("Recurring shifts")).toBeInTheDocument();
	});

	it("does not show New schedule button for staff", () => {
		setupStaffSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(screen.queryByRole("button", { name: /New schedule/i })).not.toBeInTheDocument();
	});

	it("shows New schedule button for director", () => {
		setupDirectorSession();
		setupDefaultHooks();

		render(<SchedulingPage />);

		expect(screen.getByRole("button", { name: /New schedule/i })).toBeInTheDocument();
	});

	it("summarizes coverage across schedules, shifts, rooms, and staff", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [
				{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" },
				{ id: "sched-2", name: "Summer 2026", effectiveFrom: "2026-06-01" },
			],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "12:00",
					classroomId: "c-1",
				},
				{
					id: "shift-2",
					dayOfWeek: 2,
					startTime: "12:00",
					endTime: "17:00",
					classroomId: "c-2",
				},
			],
			classrooms: [
				{ id: "c-1", name: "Room A", archivedAt: null },
				{ id: "c-2", name: "Room B", archivedAt: null },
			],
			members: [
				{ id: "mem-1", userName: "Avery Staff" },
				{ id: "mem-2", userName: "Blair Staff" },
			],
		});

		render(<SchedulingPage />);

		expect(screen.getByRole("region", { name: "Coverage summary" })).toBeInTheDocument();
		expect(screen.getByText("2 templates")).toBeInTheDocument();
		expect(screen.getByText("2 shifts")).toBeInTheDocument();
		expect(screen.getByText("2 active rooms")).toBeInTheDocument();
		expect(screen.getByText("2 staff")).toBeInTheDocument();
	});

	it("keeps Create schedule button disabled when name is empty", () => {
		setupDirectorSession();
		setupDefaultHooks({ classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }] });

		render(<SchedulingPage />);

		fireEvent.click(screen.getByRole("button", { name: /New schedule/i }));

		// Name empty, date filled — use document.getElementById to avoid FieldHelp help-button collision
		const effectiveFromInput = document.getElementById(
			"schedule-effective-from",
		) as HTMLInputElement;
		fireEvent.change(effectiveFromInput, { target: { value: "2026-06-01" } });

		expect(screen.getByRole("button", { name: /Create schedule/i })).toBeDisabled();
	});

	it("enables Create schedule button when name and effectiveFrom are both filled", () => {
		setupDirectorSession();
		setupDefaultHooks({ classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }] });

		render(<SchedulingPage />);

		fireEvent.click(screen.getByRole("button", { name: /New schedule/i }));

		const nameInput = document.getElementById("schedule-name") as HTMLInputElement;
		const effectiveFromInput = document.getElementById(
			"schedule-effective-from",
		) as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Spring plan" } });
		fireEvent.change(effectiveFromInput, { target: { value: "2026-06-01" } });

		expect(screen.getByRole("button", { name: /Create schedule/i })).not.toBeDisabled();
	});

	it("keeps Create schedule button disabled when effectiveUntil is before effectiveFrom", () => {
		setupDirectorSession();
		setupDefaultHooks({ classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }] });

		render(<SchedulingPage />);

		fireEvent.click(screen.getByRole("button", { name: /New schedule/i }));

		const nameInput = document.getElementById("schedule-name") as HTMLInputElement;
		const effectiveFromInput = document.getElementById(
			"schedule-effective-from",
		) as HTMLInputElement;
		const effectiveUntilInput = document.getElementById(
			"schedule-effective-until",
		) as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Spring plan" } });
		fireEvent.change(effectiveFromInput, { target: { value: "2026-06-01" } });
		fireEvent.change(effectiveUntilInput, { target: { value: "2026-05-01" } });

		expect(screen.getByRole("button", { name: /Create schedule/i })).toBeDisabled();
	});

	it("uses a confirmation dialog instead of window.confirm when deleting a schedule", () => {
		const confirmSpy = vi.spyOn(window, "confirm");
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: "Delete schedule Spring 2026" }));

		expect(confirmSpy).not.toHaveBeenCalled();
		expect(screen.getByRole("alertdialog", { name: "Delete schedule" })).toBeInTheDocument();
	});

	it("shows the add shift dialog when Add shift is clicked", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		fireEvent.click(screen.getByRole("button", { name: /Add shift/i }));

		expect(screen.getByRole("dialog", { name: "Add shift" })).toBeInTheDocument();
		expect(screen.getByLabelText(/Start time/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/End time/i)).toBeInTheDocument();
	});

	it("shows required-fields error when submitting the add shift form with empty fields", async () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		fireEvent.click(screen.getByRole("button", { name: /Add shift/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Add shift$/i }));

		expect(await screen.findByText("All fields are required.")).toBeInTheDocument();
	});

	it("shows an Edit button for each schedule row for non-staff", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});

		render(<SchedulingPage />);

		expect(screen.getByRole("button", { name: /Edit schedule Spring 2026/i })).toBeInTheDocument();
	});

	it("opens edit-schedule dialog pre-filled with current schedule values", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [
				{
					id: "sched-1",
					name: "Spring 2026",
					effectiveFrom: "2026-03-01",
					effectiveUntil: "2026-05-31",
				},
			],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const nameInput = document.getElementById("edit-schedule-name-sched-1") as HTMLInputElement;
		const effectiveFromInput = document.getElementById(
			"edit-schedule-effective-from-sched-1",
		) as HTMLInputElement;
		const effectiveUntilInput = document.getElementById(
			"edit-schedule-effective-until-sched-1",
		) as HTMLInputElement;

		expect(nameInput.value).toBe("Spring 2026");
		expect(effectiveFromInput.value).toBe("2026-03-01");
		expect(effectiveUntilInput.value).toBe("2026-05-31");
	});

	it("calls useUpdateSchedule mutate with id and changed input on edit-schedule submit", () => {
		const mutateFn = vi.fn();
		mockedUseUpdateSchedule.mockReturnValue({ mutate: mutateFn, isPending: false } as never);

		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});
		// override the update mock after setupDefaultHooks
		mockedUseUpdateSchedule.mockReturnValue({ mutate: mutateFn, isPending: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const nameInput = document.getElementById("edit-schedule-name-sched-1") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "Updated Plan" } });
		fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

		expect(mutateFn).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Updated Plan", effectiveFrom: "2026-03-01" }),
			expect.any(Object),
		);
	});

	it("keeps Save changes button disabled when edit-schedule name is cleared", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const nameInput = document.getElementById("edit-schedule-name-sched-1") as HTMLInputElement;
		fireEvent.change(nameInput, { target: { value: "" } });

		expect(screen.getByRole("button", { name: /Save changes/i })).toBeDisabled();
	});

	it("keeps Save changes button disabled when edit-schedule effectiveUntil is before effectiveFrom", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const effectiveUntilInput = document.getElementById(
			"edit-schedule-effective-until-sched-1",
		) as HTMLInputElement;
		fireEvent.change(effectiveUntilInput, { target: { value: "2026-02-01" } });

		expect(screen.getByRole("button", { name: /Save changes/i })).toBeDisabled();
	});

	it("shows an Edit button for each shift row for non-staff", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		expect(screen.getByRole("button", { name: /Edit shift Mon 08:00/i })).toBeInTheDocument();
	});

	it("opens edit-shift dialog pre-filled with current shift values", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit shift Mon 08:00/i }));

		const startTimeInput = document.getElementById("edit-shift-start-shift-1") as HTMLInputElement;
		const endTimeInput = document.getElementById("edit-shift-end-shift-1") as HTMLInputElement;

		expect(startTimeInput.value).toBe("08:00");
		expect(endTimeInput.value).toBe("17:00");
	});

	it("calls useUpdateShift mutate with id and changed input on edit-shift submit", () => {
		const mutateFn = vi.fn();
		mockedUseUpdateShift.mockReturnValue({ mutate: mutateFn, isPending: false } as never);

		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});
		mockedUseUpdateShift.mockReturnValue({ mutate: mutateFn, isPending: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit shift Mon 08:00/i }));

		const endTimeInput = document.getElementById("edit-shift-end-shift-1") as HTMLInputElement;
		fireEvent.change(endTimeInput, { target: { value: "16:00" } });
		fireEvent.click(screen.getByRole("button", { name: /Save shift/i }));

		expect(mutateFn).toHaveBeenCalledWith(
			expect.objectContaining({ startTime: "08:00", endTime: "16:00" }),
			expect.any(Object),
		);
	});

	it("shows an error when edit-shift end time is not after start time", async () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /Edit shift Mon 08:00/i }));

		const endTimeInput = document.getElementById("edit-shift-end-shift-1") as HTMLInputElement;
		fireEvent.change(endTimeInput, { target: { value: "07:00" } });
		fireEvent.click(screen.getByRole("button", { name: /Save shift/i }));

		expect(await screen.findByText("End time must be after start time.")).toBeInTheDocument();
	});

	it("does not show Edit buttons for staff role", () => {
		setupStaffSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-2",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
		});

		render(<SchedulingPage />);

		expect(screen.queryByRole("button", { name: /Edit schedule/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Edit shift/i })).not.toBeInTheDocument();
	});

	it("scopes add-shift form control ids per schedule so labels never collide", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [
				{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" },
				{ id: "sched-2", name: "Summer 2026", effectiveFrom: "2026-06-01" },
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		// Each schedule renders its own "Add shift" trigger. Opening both dialogs
		// puts two add-shift forms in the DOM at once; the per-schedule suffix
		// keeps each form's input ids (and their Label htmlFor targets) unique so
		// clicking one Label never focuses another schedule's input.
		const triggers = screen.getAllByRole("button", { name: /Add shift/i });
		for (const trigger of triggers) {
			fireEvent.click(trigger);
		}

		const startIds = Array.from(
			document.querySelectorAll('input[id^="shift-start-"]'),
			(el) => el.id,
		);
		expect(startIds).toContain("shift-start-sched-1");
		expect(startIds).toContain("shift-start-sched-2");
		expect(new Set(startIds).size).toBe(startIds.length);

		const endIds = Array.from(document.querySelectorAll('input[id^="shift-end-"]'), (el) => el.id);
		expect(endIds).toContain("shift-end-sched-1");
		expect(endIds).toContain("shift-end-sched-2");
		expect(new Set(endIds).size).toBe(endIds.length);
	});

	it("resets edit-schedule fields to seed values when dialog is closed without saving", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [
				{
					id: "sched-1",
					name: "Spring 2026",
					effectiveFrom: "2026-03-01",
					effectiveUntil: "2026-05-31",
				},
			],
		});

		render(<SchedulingPage />);

		// Open the edit-schedule dialog
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const nameInput = document.getElementById("edit-schedule-name-sched-1") as HTMLInputElement;
		const effectiveFromInput = document.getElementById(
			"edit-schedule-effective-from-sched-1",
		) as HTMLInputElement;
		const effectiveUntilInput = document.getElementById(
			"edit-schedule-effective-until-sched-1",
		) as HTMLInputElement;

		// Change fields away from seed values
		fireEvent.change(nameInput, { target: { value: "Changed Name" } });
		fireEvent.change(effectiveFromInput, { target: { value: "2026-04-01" } });
		fireEvent.change(effectiveUntilInput, { target: { value: "2026-06-30" } });

		// Close via the Radix close button (sr-only "Close")
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		fireEvent.click(screen.getByRole("button", { name: /Edit schedule Spring 2026/i }));

		const nameInput2 = document.getElementById("edit-schedule-name-sched-1") as HTMLInputElement;
		const effectiveFromInput2 = document.getElementById(
			"edit-schedule-effective-from-sched-1",
		) as HTMLInputElement;
		const effectiveUntilInput2 = document.getElementById(
			"edit-schedule-effective-until-sched-1",
		) as HTMLInputElement;

		expect(nameInput2.value).toBe("Spring 2026");
		expect(effectiveFromInput2.value).toBe("2026-03-01");
		expect(effectiveUntilInput2.value).toBe("2026-05-31");
	});

	it("resets add-shift fields to '' when add-shift dialog is closed without saving", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		// Open the add-shift dialog
		fireEvent.click(screen.getByRole("button", { name: /Add shift/i }));

		const startTimeInput = document.getElementById("shift-start-sched-1") as HTMLInputElement;
		const endTimeInput = document.getElementById("shift-end-sched-1") as HTMLInputElement;

		// Change time fields away from seed values
		fireEvent.change(startTimeInput, { target: { value: "09:00" } });
		fireEvent.change(endTimeInput, { target: { value: "17:00" } });

		// Close via the Radix close button (sr-only "Close")
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		fireEvent.click(screen.getByRole("button", { name: /Add shift/i }));

		const startTimeInput2 = document.getElementById("shift-start-sched-1") as HTMLInputElement;
		const endTimeInput2 = document.getElementById("shift-end-sched-1") as HTMLInputElement;

		expect(startTimeInput2.value).toBe("");
		expect(endTimeInput2.value).toBe("");
	});

	it("resets edit-shift fields to seed values when dialog is closed without saving", () => {
		setupDirectorSession();
		setupDefaultHooks({
			schedules: [{ id: "sched-1", name: "Spring 2026", effectiveFrom: "2026-03-01" }],
			shifts: [
				{
					id: "shift-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "17:00",
					classroomId: "c-1",
					membershipId: "mem-1",
				},
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
			members: [{ id: "mem-1", userName: "Alex Staff" }],
		});

		render(<SchedulingPage />);

		// Open the edit-shift dialog
		fireEvent.click(screen.getByRole("button", { name: /Edit shift Mon 08:00/i }));

		const startTimeInput = document.getElementById("edit-shift-start-shift-1") as HTMLInputElement;
		const endTimeInput = document.getElementById("edit-shift-end-shift-1") as HTMLInputElement;

		// Change fields away from seed values
		fireEvent.change(startTimeInput, { target: { value: "10:00" } });
		fireEvent.change(endTimeInput, { target: { value: "18:00" } });

		// Close via the Radix close button (sr-only "Close")
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		fireEvent.click(screen.getByRole("button", { name: /Edit shift Mon 08:00/i }));

		const startTimeInput2 = document.getElementById("edit-shift-start-shift-1") as HTMLInputElement;
		const endTimeInput2 = document.getElementById("edit-shift-end-shift-1") as HTMLInputElement;

		expect(startTimeInput2.value).toBe("08:00");
		expect(endTimeInput2.value).toBe("17:00");
	});

	// GET /api/members is Owner/Director only on the backend
	// (apps/api/src/routes/members.ts requireRole("owner","director")). The staff
	// scheduling view never renders member names (ShiftRow hides them for staff)
	// and the roster count is irrelevant to staff, so firing the query for staff
	// only produces a guaranteed 403 and a misleading "0 staff" coverage tile.
	it("does not fire the owner/director-only members query for a staff visitor", () => {
		setupStaffSession();
		setupDefaultHooks({
			shifts: [
				{ id: "s-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", classroomId: "c-1" },
			],
			classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }],
		});

		render(<SchedulingPage />);

		expect(mockedUseMembers).toHaveBeenCalledWith({ enabled: false });
		// Staff must not see the owner/director "Staff" roster count.
		expect(screen.queryByText(/\bstaff$/i)).not.toBeInTheDocument();
	});

	it("fires the members query for an owner/director visitor", () => {
		setupDirectorSession();
		setupDefaultHooks({ classrooms: [{ id: "c-1", name: "Room A", archivedAt: null }] });

		render(<SchedulingPage />);

		expect(mockedUseMembers).toHaveBeenCalledWith({ enabled: true });
	});
});
