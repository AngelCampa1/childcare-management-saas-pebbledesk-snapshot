import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AttendancePage } from "./_auth/attendance";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => ({
			...(options as object),
			useSearch: vi.fn(() => ({})),
		}),
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../components/attendance-roster", () => ({
	AttendanceRoster: () => <div data-testid="attendance-roster" />,
}));

vi.mock("../components/attendance-search", () => ({
	AttendanceSearch: () => <button type="button">search</button>,
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: () => ({
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
	}),
}));

vi.mock("../hooks/use-attendance", () => ({
	useCheckIn: () => ({ mutate: vi.fn(), isPending: false }),
	useStaffCheckIns: () => ({ data: [], isLoading: false }),
	useStaffClockIn: () => ({ mutate: vi.fn(), isPending: false }),
	useStaffClockOut: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: () => ({ data: [], isLoading: false }),
	useClassroomStaff: () => ({ data: [], isLoading: false }),
}));

describe("AttendancePage empty state", () => {
	it("renders a classrooms setup CTA when attendance cannot start yet", () => {
		render(<AttendancePage />);

		expect(screen.getByText("Set up your classrooms first")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Start the day by setting up your classrooms so attendance and ratios start tracking.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Add a classroom" })).toHaveAttribute(
			"href",
			"/classrooms",
		);
	});
});
