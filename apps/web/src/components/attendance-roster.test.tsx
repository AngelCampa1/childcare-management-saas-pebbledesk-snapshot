import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceRoster } from "./attendance-roster";

const mockedUseChildren = vi.hoisted(() => vi.fn());
const mockedUseCheckIns = vi.hoisted(() => vi.fn());
const mockedUseCheckIn = vi.hoisted(() => vi.fn());
const mockedUseCheckOut = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-children", () => ({
	useChildren: (...args: unknown[]) => mockedUseChildren(...args),
}));

vi.mock("../hooks/use-attendance", () => ({
	useCheckIns: (...args: unknown[]) => mockedUseCheckIns(...args),
	useCheckIn: () => mockedUseCheckIn(),
	useCheckOut: () => mockedUseCheckOut(),
}));

vi.mock("./signature-pad", () => ({
	SignaturePad: ({ label }: { label: string; onChange: (v: string | null) => void }) => (
		<div data-testid="roster-signature-pad" data-label={label} />
	),
}));

const TODAY = "2026-04-15";

// Simulate Intl to return a deterministic date so tests don't drift. We keep a
// reference to the real DateTimeFormat so `format` (used by the shared
// formatTime/formatDate helpers) still produces correct wall-clock output,
// while overriding `formatToParts` so the roster's date-key bucketing is stable.
const RealDateTimeFormat = Intl.DateTimeFormat;
vi.stubGlobal(
	"Intl",
	Object.assign({}, Intl, {
		DateTimeFormat: class {
			#opts: Record<string, string>;
			#real: Intl.DateTimeFormat;
			constructor(locale: string, opts: Record<string, string>) {
				this.#opts = opts;
				this.#real = new RealDateTimeFormat(locale, opts);
			}
			format(value?: Date | number) {
				return this.#real.format(value);
			}
			formatToParts() {
				if (this.#opts.calendar === undefined) {
					return [
						{ type: "year", value: "2026" },
						{ type: "month", value: "04" },
						{ type: "day", value: "15" },
					];
				}
				return new RealDateTimeFormat("en-CA").formatToParts(new Date());
			}
		},
	}),
);

const CHILD = {
	id: "child-1",
	firstName: "Grace",
	lastName: "Taylor",
	ageGroup: "infant" as const,
	enrollmentStatus: "active" as const,
	dateOfBirth: "2025-01-01",
	centerId: "center-1",
	classroomId: "classroom-1",
	subsidyEligible: false,
};

function makeCheckIn(overrides: {
	id: string;
	checkedInAt: string;
	checkedOutAt?: string | null;
	childId?: string;
}) {
	return {
		id: overrides.id,
		childId: overrides.childId ?? "child-1",
		classroomId: "classroom-1",
		centerId: "center-1",
		checkedInAt: overrides.checkedInAt,
		checkedOutAt: overrides.checkedOutAt ?? null,
	};
}

describe("AttendanceRoster", () => {
	beforeEach(() => {
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: false });
	});

	it("shows skeleton rows while children are loading", () => {
		mockedUseChildren.mockReturnValue({ data: undefined, isLoading: true });
		mockedUseCheckIns.mockReturnValue({ data: undefined, isLoading: false });

		const { container } = render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(container.querySelector(".h-8.w-20")).not.toBeNull();
		expect(screen.queryByText("No children assigned to this classroom.")).not.toBeInTheDocument();
	});

	it("shows empty state when no children are assigned", () => {
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByText("No children assigned to this classroom.")).toBeInTheDocument();
	});

	it("shows Check Out button when child has only an active check-in", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByRole("button", { name: /check out/i })).toBeInTheDocument();
	});

	it("shows a recoverable error state when attendance roster data cannot load", () => {
		mockedUseChildren.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		mockedUseCheckIns.mockReturnValue({ data: undefined, isLoading: false, isError: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByRole("status")).toHaveTextContent(
			"We couldn't load this room's attendance roster.",
		);
		expect(screen.getByText("Refresh the page or try again in a moment.")).toBeInTheDocument();
	});

	it("shows checked-out state (no action button) when child only has a completed check-in", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [
				makeCheckIn({
					id: "ci-1",
					checkedInAt: `${TODAY}T14:00:00Z`,
					checkedOutAt: `${TODAY}T16:00:00Z`,
				}),
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByText(/out at/i)).toBeInTheDocument();
		// No Check In or Check Out button — completed records are display-only
		expect(screen.queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
	});

	it("prefers the active check-in when a child has both a completed and an active check-in today", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [
				// Completed check-in earlier today (returned first from API)
				makeCheckIn({
					id: "ci-old",
					checkedInAt: `${TODAY}T10:00:00Z`,
					checkedOutAt: `${TODAY}T12:00:00Z`,
				}),
				// Active check-in later today
				makeCheckIn({ id: "ci-new", checkedInAt: `${TODAY}T14:00:00Z` }),
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		// Should show Check Out (active), not Check In (completed)
		expect(screen.getByRole("button", { name: /check out/i })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /check in/i })).not.toBeInTheDocument();
	});

	it("uses the most recent completed check-in when no active check-in exists today", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [
				makeCheckIn({
					id: "ci-old",
					checkedInAt: `${TODAY}T09:00:00Z`,
					checkedOutAt: `${TODAY}T10:00:00Z`,
				}),
				makeCheckIn({
					id: "ci-new",
					checkedInAt: `${TODAY}T13:00:00Z`,
					checkedOutAt: `${TODAY}T14:00:00Z`,
				}),
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByText(/out at 2:00 PM/i)).toBeInTheDocument();
	});

	it("orders active, absent, and checked-out children for quick scanning", () => {
		const absentChild = { ...CHILD, id: "child-2", firstName: "Ada", lastName: "Brown" };
		const checkedOutChild = { ...CHILD, id: "child-3", firstName: "Milo", lastName: "Green" };

		mockedUseChildren.mockReturnValue({
			data: [absentChild, checkedOutChild, CHILD],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({
			data: [
				makeCheckIn({ id: "ci-active", checkedInAt: `${TODAY}T14:00:00Z`, childId: CHILD.id }),
				makeCheckIn({
					id: "ci-checked-out",
					checkedInAt: `${TODAY}T09:00:00Z`,
					checkedOutAt: `${TODAY}T11:00:00Z`,
					childId: checkedOutChild.id,
				}),
			],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(
			screen.getAllByText(/Grace Taylor|Ada Brown|Milo Green/).map((node) => node.textContent),
		).toEqual(["Grace Taylor", "Ada Brown", "Milo Green"]);
	});

	it("falls back to local-time date key and logs a warning when Intl returns empty parts", () => {
		// #16: formatDateKey now warns and falls back instead of throwing
		const stableIntl = globalThis.Intl;
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.stubGlobal(
			"Intl",
			Object.assign({}, stableIntl, {
				DateTimeFormat: class {
					formatToParts() {
						return [];
					}
				},
			}),
		);
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		try {
			// Should not throw — renders with local fallback date
			expect(() =>
				render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />),
			).not.toThrow();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("could not resolve date parts for timezone"),
			);
		} finally {
			vi.stubGlobal("Intl", stableIntl);
			warnSpy.mockRestore();
		}
	});

	it("shows Not here when no check-ins exist for the child today", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByText(/not here/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /check in/i })).toBeInTheDocument();
	});

	it("checks in a child from the roster", () => {
		const mutate = vi.fn();
		mockedUseCheckIn.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));
		fireEvent.click(screen.getByRole("button", { name: /confirm check in/i }));

		expect(mutate).toHaveBeenCalledWith({
			childId: "child-1",
			classroomId: "classroom-1",
			isLate: false,
			signatureData: undefined,
		});
	});

	it("suppresses same-render duplicate roster check-in clicks", () => {
		const mutate = vi.fn();
		mockedUseCheckIn.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));
		const confirmButton = screen.getByRole("button", { name: /confirm check in/i });
		fireEvent.click(confirmButton);
		fireEvent.click(confirmButton);

		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate).toHaveBeenCalledWith({
			childId: "child-1",
			classroomId: "classroom-1",
			isLate: false,
			signatureData: undefined,
		});
	});

	it("does not call roster check-in when a pending mutation handler fires", () => {
		const mutate = vi.fn();
		mockedUseCheckIn.mockReturnValue({ mutate, isPending: true });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByRole("button", { name: /^check in$/i })).toBeDisabled();
		expect(mutate).not.toHaveBeenCalled();
	});

	it("disables roster check-in while a check-in is pending", () => {
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: true });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByRole("button", { name: /^check in$/i })).toBeDisabled();
	});

	it("captures late flag and signature on roster check-in", () => {
		const mutate = vi.fn();
		mockedUseCheckIn.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));

		// Signature pad renders when form is open
		expect(screen.getByTestId("roster-signature-pad")).toBeInTheDocument();
		expect(screen.getByTestId("roster-signature-pad").dataset.label).toContain(
			"Check-in signature",
		);

		// Toggle the Mark late checkbox
		fireEvent.click(screen.getByLabelText("Mark late"));

		fireEvent.click(screen.getByRole("button", { name: /confirm check in/i }));

		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({ childId: "child-1", classroomId: "classroom-1", isLate: true }),
		);
	});

	it("cancels a roster check-in when Cancel is clicked", () => {
		const mutate = vi.fn();
		mockedUseCheckIn.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check in$/i }));
		expect(screen.getByRole("button", { name: /confirm check in/i })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(mutate).not.toHaveBeenCalled();
		expect(screen.queryByRole("button", { name: /confirm check in/i })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^check in$/i })).toBeInTheDocument();
	});

	it("checks out a child from the roster via the two-step confirmation", () => {
		const mutate = vi.fn();
		mockedUseCheckOut.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		// First click opens the signature / confirmation panel
		fireEvent.click(screen.getByRole("button", { name: /^check out$/i }));
		// Second click on "Confirm Check Out" submits the mutation
		fireEvent.click(screen.getByRole("button", { name: /confirm check out/i }));

		expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: "ci-1" }));
	});

	it("cancels a roster check-out when the Cancel button is clicked", () => {
		const mutate = vi.fn();
		mockedUseCheckOut.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check out$/i }));
		expect(screen.getByRole("button", { name: /confirm check out/i })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

		expect(mutate).not.toHaveBeenCalled();
		// The confirmation panel is gone; original Check Out button is back
		expect(screen.queryByRole("button", { name: /confirm check out/i })).not.toBeInTheDocument();
	});

	it("suppresses same-render duplicate roster check-out confirmation clicks", () => {
		const mutate = vi.fn();
		mockedUseCheckOut.mockReturnValue({ mutate, isPending: false });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		fireEvent.click(screen.getByRole("button", { name: /^check out$/i }));
		const confirmButton = screen.getByRole("button", { name: /confirm check out/i });
		fireEvent.click(confirmButton);
		fireEvent.click(confirmButton);

		expect(mutate).toHaveBeenCalledTimes(1);
		expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ id: "ci-1" }));
	});

	it("does not call roster check-out when a pending mutation handler fires", () => {
		const mutate = vi.fn();
		mockedUseCheckOut.mockReturnValue({ mutate, isPending: true });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		// Check Out button is disabled while a mutation is pending — clicking it does not open panel
		expect(screen.getByRole("button", { name: /^check out$/i })).toBeDisabled();
		expect(mutate).not.toHaveBeenCalled();
	});

	it("disables roster check-out button while a check-out is pending", () => {
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: true });
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-1", checkedInAt: `${TODAY}T14:00:00Z` })],
			isLoading: false,
		});

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByRole("button", { name: /^check out$/i })).toBeDisabled();
	});

	it("filters inactive children out of the roster", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				CHILD,
				{
					...CHILD,
					id: "child-2",
					firstName: "Inactive",
					lastName: "Child",
					enrollmentStatus: "inactive",
				},
			],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.getByText("Grace Taylor")).toBeInTheDocument();
		expect(screen.queryByText("Inactive Child")).not.toBeInTheDocument();
	});

	it("renders operator-language ratio bar when ratioStatus is provided", () => {
		mockedUseChildren.mockReturnValue({
			data: [CHILD],
			isLoading: false,
		});
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: false });

		render(
			<AttendanceRoster
				classroomId="classroom-1"
				timezone="UTC"
				ratioStatus={{ childCount: 8, staffCount: 2, requiredRatio: "1:4", status: "ok" }}
			/>,
		);

		expect(screen.getByText("8 children · 2 staff")).toBeInTheDocument();
		expect(screen.getByText("1:4 required")).toBeInTheDocument();
		expect(screen.getByText("Within ratio")).toBeInTheDocument();
	});

	it("shows Near limit label for warning status", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: false });

		render(
			<AttendanceRoster
				classroomId="classroom-1"
				timezone="UTC"
				ratioStatus={{ childCount: 6, staffCount: 1, requiredRatio: "1:4", status: "warning" }}
			/>,
		);

		expect(screen.getByText("Near limit")).toBeInTheDocument();
	});

	it("shows Violation label for violation status", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: false });

		render(
			<AttendanceRoster
				classroomId="classroom-1"
				timezone="UTC"
				ratioStatus={{ childCount: 8, staffCount: 0, requiredRatio: "1:4", status: "violation" }}
			/>,
		);

		expect(screen.getByText("Violation")).toBeInTheDocument();
	});

	it("does not render ratio bar when ratioStatus is not provided", () => {
		mockedUseChildren.mockReturnValue({ data: [CHILD], isLoading: false });
		mockedUseCheckIns.mockReturnValue({ data: [], isLoading: false });
		mockedUseCheckIn.mockReturnValue({ mutate: vi.fn(), isPending: false });
		mockedUseCheckOut.mockReturnValue({ mutate: vi.fn(), isPending: false });

		render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		expect(screen.queryByText(/children ·/)).not.toBeInTheDocument();
		expect(screen.queryByText("Within ratio")).not.toBeInTheDocument();
	});

	// #17 — stable child-id keys survive reorder (checked-in child sorts to top)
	it("uses stable child-id keys so row identity is preserved when status order changes", () => {
		const childA = { ...CHILD, id: "child-a", firstName: "Ada", lastName: "Brown" };
		const childB = { ...CHILD, id: "child-b", firstName: "Ben", lastName: "Clark" };

		// First render: childA is checked in (sorts first), childB is absent (sorts second)
		mockedUseChildren.mockReturnValue({ data: [childA, childB], isLoading: false });
		mockedUseCheckIns.mockReturnValue({
			data: [makeCheckIn({ id: "ci-a", checkedInAt: `${TODAY}T14:00:00Z`, childId: "child-a" })],
			isLoading: false,
		});

		const { rerender } = render(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		// Ada is first (checked-in), Ben is second (absent)
		const [firstRow, secondRow] = screen.getAllByText(/Ada Brown|Ben Clark/);
		expect(firstRow?.textContent).toContain("Ada");
		expect(secondRow?.textContent).toContain("Ben");

		// Second render: Ada is now checked out (sorts last), Ben stays absent (sorts middle)
		mockedUseCheckIns.mockReturnValue({
			data: [
				makeCheckIn({
					id: "ci-a",
					checkedInAt: `${TODAY}T14:00:00Z`,
					checkedOutAt: `${TODAY}T16:00:00Z`,
					childId: "child-a",
				}),
			],
			isLoading: false,
		});

		rerender(<AttendanceRoster classroomId="classroom-1" timezone="UTC" />);

		// Ben (absent) is now first, Ada (checked-out) is second
		const [firstRowAfter, secondRowAfter] = screen.getAllByText(/Ada Brown|Ben Clark/);
		expect(firstRowAfter?.textContent).toContain("Ben");
		expect(secondRowAfter?.textContent).toContain("Ada");
	});
});
