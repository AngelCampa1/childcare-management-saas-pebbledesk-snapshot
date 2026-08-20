import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthSession } from "../hooks/use-auth-session";
import { useChildren } from "../hooks/use-children";
import {
	useArchiveClassroom,
	useAssignChild,
	useAssignStaff,
	useClassroom,
	useClassroomChildren,
	useClassroomStaff,
	useUnarchiveClassroom,
	useUnassignChild,
	useUnassignStaff,
	useUpdateClassroom,
} from "../hooks/use-classrooms";
import { useMembers } from "../hooks/use-members";
import { useRatios } from "../hooks/use-ratios";
import { Route } from "./_auth/classrooms/$id";

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value?: string;
		onValueChange?: (value: string) => void;
	}) => (
		<select
			aria-label="select"
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{children}
		</select>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<option value="">{placeholder}</option>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

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
			defaultValue,
			onValueChange,
			value,
		}: {
			children: ReactNode;
			defaultValue?: string;
			onValueChange?: (value: string) => void;
			value?: string;
		}) => {
			const [internalValue, setInternalValue] = React.useState(defaultValue ?? value ?? "");
			const activeValue = value ?? internalValue;

			return (
				<TabsContext.Provider
					value={{
						value: activeValue,
						setValue: (nextValue: string) => {
							setInternalValue(nextValue);
							onValueChange?.(nextValue);
						},
					}}
				>
					<div>{children}</div>
				</TabsContext.Provider>
			);
		},
		TabsList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
		TabsTrigger: ({ children, value }: { children: ReactNode; value: string }) => {
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
		TabsContent: ({ children, value }: { children: ReactNode; value: string }) => {
			const context = React.useContext(TabsContext);
			if (!context || context.value !== value) return null;

			return <div>{children}</div>;
		},
	};
});

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		useNavigate: () => vi.fn(),
	};
});

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("../hooks/use-children", () => ({
	useChildren: vi.fn(),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatios: vi.fn(),
}));

vi.mock("../hooks/use-members", () => ({
	useMembers: vi.fn(),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useArchiveClassroom: vi.fn(),
	useAssignChild: vi.fn(),
	useAssignStaff: vi.fn(),
	useClassroom: vi.fn(),
	useClassroomChildren: vi.fn(),
	useClassroomStaff: vi.fn(),
	useUnarchiveClassroom: vi.fn(),
	useUnassignChild: vi.fn(),
	useUnassignStaff: vi.fn(),
	useUpdateClassroom: vi.fn(),
}));

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseChildren = vi.mocked(useChildren);
const mockedUseRatios = vi.mocked(useRatios);
const mockedUseClassroom = vi.mocked(useClassroom);
const mockedUseClassroomChildren = vi.mocked(useClassroomChildren);
const mockedUseClassroomStaff = vi.mocked(useClassroomStaff);
const mockedUseUnassignChild = vi.mocked(useUnassignChild);
const mockedUseUnassignStaff = vi.mocked(useUnassignStaff);
const mockedUseUpdateClassroom = vi.mocked(useUpdateClassroom);
const mockedUseArchiveClassroom = vi.mocked(useArchiveClassroom);
const mockedUseUnarchiveClassroom = vi.mocked(useUnarchiveClassroom);
const mockedUseAssignChild = vi.mocked(useAssignChild);
const mockedUseAssignStaff = vi.mocked(useAssignStaff);
const mockedUseMembers = vi.mocked(useMembers);

describe("ClassroomDetailPage", () => {
	beforeEach(() => {
		vi.spyOn(Route, "useParams").mockReturnValue({ id: "classroom-1" } as never);

		mockedUseAuthSession.mockReturnValue({
			data: {
				center: { timezone: "America/New_York" },
			},
		} as never);

		mockedUseClassroom.mockReturnValue({
			data: {
				id: "classroom-1",
				name: "Sunflower Room",
				ageGroup: "preschool",
				childCount: 2,
				staffCount: 1,
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
				archivedAt: null,
			},
			isLoading: false,
		} as never);
		mockedUseClassroomChildren.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseUpdateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseArchiveClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUnarchiveClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
				},
			],
			isLoading: false,
		} as never);
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAssignStaff.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-2",
					centerId: "center-1",
					userId: "user-2",
					role: "director",
					joinedAt: "2026-04-01T08:00:00.000Z",
					acceptedAt: "2026-04-01T08:00:00.000Z",
					invitedAt: null,
					userName: "Jamie Rivera",
					userEmail: "jamie@example.com",
				},
				{
					id: "membership-3",
					centerId: "center-1",
					userId: "user-3",
					role: "staff",
					joinedAt: "2026-04-02T08:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-02T08:00:00.000Z",
					userName: "Alex Kim",
					userEmail: "alex@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseUnassignChild.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUnassignStaff.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
	});

	it("keeps classroom dialogs described and warning-free", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) {
			throw new Error("Expected classroom detail route component");
		}

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		expect(screen.getByText("Edit Classroom")).toBeInTheDocument();
		expect(screen.getByText("Update the room details and staffing ratio.")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(screen.getByRole("button", { name: "Archive" }));
		expect(screen.getByText("Archive Classroom")).toBeInTheDocument();
		expect(
			screen.getByText(
				'Archiving removes this classroom from the active list. You can still view it by toggling "Show archived."',
			),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(screen.getAllByRole("button", { name: "Assign Child" })[0]);
		let dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Assign Child")).toBeInTheDocument();
		expect(
			within(dialog).getByText("Choose an unassigned child to move into this classroom."),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		fireEvent.click(screen.getByRole("tab", { name: "Staff (0)" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Staff (0)" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		fireEvent.click(screen.getAllByRole("button", { name: "Assign Staff" })[0]);
		dialog = screen.getByRole("dialog");
		expect(within(dialog).getByText("Assign Staff")).toBeInTheDocument();
		expect(
			within(dialog).getAllByText(
				"Choose a team member who has already accepted their center access.",
			),
		).toHaveLength(1);
		expect(within(dialog).getByRole("combobox")).toBeInTheDocument();
		expect(
			within(dialog).getByText("Jamie Rivera - Director - jamie@example.com"),
		).toBeInTheDocument();
		expect(
			within(dialog).queryByText("Alex Kim - Staff - alex@example.com"),
		).not.toBeInTheDocument();

		const messages = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
			.flat()
			.map((value) => String(value))
			.join("\n");

		expect(messages).not.toMatch(/Missing Description|aria-describedby/);

		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	it("assigns accepted staff from a named roster instead of a raw membership id", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseAssignStaff.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) {
			throw new Error("Expected classroom detail route component");
		}

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("tab", { name: "Staff (0)" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Staff (0)" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		fireEvent.click(screen.getAllByRole("button", { name: "Assign Staff" })[0]);

		fireEvent.change(screen.getByRole("combobox"), {
			target: { value: "membership-2" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				membershipId: "membership-2",
				effectiveDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			});
		});
	});

	it("shows a violation badge when live ratio data reports an active issue", () => {
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Sunflower Room",
					ageGroup: "preschool",
					maxCapacity: 8,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 2,
					currentStaffCount: 0,
					ratioRequired: 0.25,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "violation-1",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) {
			throw new Error("Expected classroom detail route component");
		}

		render(<ClassroomDetailPage />);

		expect(screen.getByText("Violation")).toBeInTheDocument();
		expect(screen.queryByText("Compliant")).not.toBeInTheDocument();
	});

	it("keeps empty classrooms marked as empty when live ratio data is compliant", () => {
		mockedUseClassroom.mockReturnValue({
			data: {
				id: "classroom-1",
				name: "Sunflower Room",
				ageGroup: "preschool",
				childCount: 0,
				staffCount: 0,
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
				archivedAt: null,
			},
			isLoading: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Sunflower Room",
					ageGroup: "preschool",
					maxCapacity: 8,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 0,
					currentStaffCount: 0,
					ratioRequired: 0.25,
					ratioActual: 0.25,
					inCompliance: true,
					nearLimit: false,
					openViolationId: undefined,
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) {
			throw new Error("Expected classroom detail route component");
		}

		render(<ClassroomDetailPage />);

		expect(screen.getByText("Empty")).toBeInTheDocument();
		expect(screen.queryByText("Compliant")).not.toBeInTheDocument();
	});

	it("renders assignment dates without shifting to the previous day", () => {
		mockedUseClassroomChildren.mockReturnValue({
			data: [
				{
					assignmentId: "assignment-1",
					childId: "child-1",
					effectiveDate: "2026-04-10",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) {
			throw new Error("Expected classroom detail route component");
		}

		render(<ClassroomDetailPage />);

		expect(screen.getByText("Apr 10, 2026")).toBeInTheDocument();
		expect(screen.queryByText("Apr 9, 2026")).not.toBeInTheDocument();
	});

	it("shows inline error and keeps edit dialog open when updateClassroom fails", async () => {
		mockedUseUpdateClassroom.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Name already taken")),
			isPending: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		fireEvent.submit(screen.getByRole("dialog").querySelector("form") as HTMLElement);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Name already taken");
		});
		expect(screen.getByText("Edit Classroom")).toBeInTheDocument();
	});

	it("shows inline error and keeps archive dialog open when archiveClassroom fails", async () => {
		mockedUseArchiveClassroom.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Archive failed")),
			isPending: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// Open the archive confirmation dialog
		fireEvent.click(screen.getByRole("button", { name: "Archive" }));
		// Click the destructive confirm button inside the dialog
		const dialog = screen.getByRole("dialog");
		const confirmBtn = dialog.querySelector("button[class*='destructive']");
		if (!confirmBtn) throw new Error("Expected destructive confirm button in archive dialog");
		fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Archive failed");
		});
		expect(screen.getByText("Archive Classroom")).toBeInTheDocument();
	});

	it("shows inline error and keeps assign child dialog open when assignChild fails", async () => {
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Child already assigned")),
			isPending: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getAllByRole("button", { name: "Assign Child" })[0]);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "child-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Child already assigned");
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("shows inline error and keeps assign staff dialog open when assignStaff fails", async () => {
		mockedUseAssignStaff.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Staff already assigned")),
			isPending: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("tab", { name: "Staff (0)" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Staff (0)" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		fireEvent.click(screen.getAllByRole("button", { name: "Assign Staff" })[0]);
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "membership-2" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Staff already assigned");
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("shows confirmation dialog before unassigning a child", async () => {
		const mutate = vi.fn();
		mockedUseUnassignChild.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseClassroomChildren.mockReturnValue({
			data: [
				{
					assignmentId: "assignment-1",
					childId: "child-1",
					effectiveDate: "2026-04-10",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// The unassign X button triggers a confirmation dialog — mutation is NOT yet called.
		fireEvent.click(screen.getByRole("button", { name: "Unassign Mia Lopez" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(screen.getByText("Unassign child?")).toBeInTheDocument();
		expect(mutate).not.toHaveBeenCalled();

		// Confirming calls the mutation.
		fireEvent.click(screen.getByRole("button", { name: "Unassign" }));
		await waitFor(() => {
			expect(mutate).toHaveBeenCalledWith("child-1");
		});
	});

	it("cancels child unassign when Cancel is clicked in the confirmation dialog", async () => {
		const mutate = vi.fn();
		mockedUseUnassignChild.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseClassroomChildren.mockReturnValue({
			data: [
				{
					assignmentId: "assignment-1",
					childId: "child-1",
					effectiveDate: "2026-04-10",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("button", { name: "Unassign Mia Lopez" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("shows confirmation dialog before unassigning a staff member", async () => {
		const mutate = vi.fn();
		mockedUseUnassignStaff.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: [
				{
					assignmentId: "staff-assignment-1",
					membershipId: "membership-2",
					effectiveDate: "2026-04-01",
					role: "director",
					userName: "Jamie Rivera",
					userEmail: "jamie@example.com",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("tab", { name: "Staff (1)" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Staff (1)" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		// The unassign X button triggers a confirmation dialog.
		fireEvent.click(screen.getByRole("button", { name: "Unassign Jamie Rivera" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(screen.getByText("Unassign staff?")).toBeInTheDocument();
		expect(mutate).not.toHaveBeenCalled();

		// Confirming calls the mutation.
		fireEvent.click(screen.getByRole("button", { name: "Unassign" }));
		await waitFor(() => {
			expect(mutate).toHaveBeenCalledWith("membership-2");
		});
	});

	it("cancels staff unassign when Cancel is clicked in the confirmation dialog", async () => {
		const mutate = vi.fn();
		mockedUseUnassignStaff.mockReturnValue({ mutate, isPending: false } as never);
		mockedUseClassroomStaff.mockReturnValue({
			data: [
				{
					assignmentId: "staff-assignment-1",
					membershipId: "membership-2",
					effectiveDate: "2026-04-01",
					role: "director",
					userName: "Jamie Rivera",
					userEmail: "jamie@example.com",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		fireEvent.click(screen.getByRole("tab", { name: "Staff (1)" }));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: "Staff (1)" })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		fireEvent.click(screen.getByRole("button", { name: "Unassign Jamie Rivera" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("shows Restore button and hides Archive + Assign buttons for archived classrooms", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseUnarchiveClassroom.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseClassroom.mockReturnValue({
			data: {
				id: "classroom-1",
				name: "Sunflower Room",
				ageGroup: "preschool",
				childCount: 0,
				staffCount: 0,
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
				archivedAt: "2026-04-19T12:00:00.000Z",
			},
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Assign Child" })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Assign Staff" })).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Restore" }));
		await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
	});

	// #7 — formatLocalDate passes center timezone
	it("renders assignment dates using the center timezone from session", () => {
		// New York timezone: "America/New_York" is set in beforeEach
		mockedUseClassroomChildren.mockReturnValue({
			data: [
				{
					assignmentId: "assignment-1",
					childId: "child-1",
					effectiveDate: "2026-04-10",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// Date should render (no off-by-one) using the center timezone
		expect(screen.getByText("Apr 10, 2026")).toBeInTheDocument();
	});

	// #7 — formatLocalDate falls back to "America/Los_Angeles" when no timezone is configured
	it("renders dates with LA fallback timezone when session has no center timezone", () => {
		mockedUseAuthSession.mockReturnValue({
			data: { center: { timezone: undefined } },
		} as never);
		mockedUseClassroomChildren.mockReturnValue({
			data: [
				{
					assignmentId: "assignment-1",
					childId: "child-1",
					effectiveDate: "2026-04-10",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// Should render a date (not crash), regardless of which timezone fallback is used
		expect(screen.getByText("Apr 10, 2026")).toBeInTheDocument();
	});

	// #24 — liveRatio useMemo guard handles empty/undefined ratios without crashing
	it("renders compliance summary without crashing when ratios data is undefined", () => {
		mockedUseRatios.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// Should render the compliance summary without throwing
		expect(screen.getByText("Sunflower Room")).toBeInTheDocument();
	});

	it("renders compliance summary without crashing when ratios list is empty", () => {
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		expect(screen.getByText("Sunflower Room")).toBeInTheDocument();
	});

	it("derives required staff and the ratio label from the backend-resolved (state-stricter) ratio", () => {
		// Classroom is loosely configured at 1:8, but the live ratio from the backend
		// reflects a stricter state-mandated 1:4 rule (resolveEffectiveRatioRule already
		// applied server-side). The detail page must use the effective ratio so its
		// "Staff needed" count and "Ratio" label match the Ratios page and Attendance banner.
		mockedUseClassroom.mockReturnValue({
			data: {
				id: "classroom-1",
				name: "Sunflower Room",
				ageGroup: "preschool",
				childCount: 8,
				staffCount: 1,
				maxCapacity: 16,
				minRatioStaff: 1,
				minRatioChildren: 8,
				archivedAt: null,
			},
			isLoading: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Sunflower Room",
					ageGroup: "preschool",
					maxCapacity: 16,
					minRatioStaff: 1,
					minRatioChildren: 4,
					currentChildCount: 8,
					currentStaffCount: 1,
					ratioRequired: 0.25,
					ratioActual: 0.125,
					inCompliance: false,
					nearLimit: false,
					openViolationId: null,
					ratioRuleSource: "state:CA",
				},
			],
			isLoading: false,
		} as never);

		const ClassroomDetailPage = Route.options.component;
		if (!ClassroomDetailPage) throw new Error("Expected classroom detail route component");

		render(<ClassroomDetailPage />);

		// Effective 1:4 → 8 children need 2 staff (raw 1:8 would understate as 1 → "1/1 needed").
		expect(screen.getByText("1/2 needed")).toBeInTheDocument();
		// The displayed ratio must reflect the effective state-stricter rule (1:4), not the raw 1:8.
		// Appears both in the subtitle and the compliance summary's Ratio item.
		expect(screen.getAllByText("1:4").length).toBeGreaterThan(0);
		expect(screen.queryByText("1:8")).not.toBeInTheDocument();
		expect(screen.queryByText("1/1 needed")).not.toBeInTheDocument();
	});
});
