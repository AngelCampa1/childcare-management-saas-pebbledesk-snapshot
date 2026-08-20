import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useClassrooms, useCreateClassroom } from "../hooks/use-classrooms";
import { useRatios } from "../hooks/use-ratios";
import { ClassroomsPage, CreateClassroomForm } from "./_auth/classrooms/index";

vi.mock("../hooks/use-setup-progress", () => ({
	useSetupProgress: vi.fn(() => ({ allDone: false, isLoading: false, currentStep: null })),
}));

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
			aria-label="Age Group"
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

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => () => ({}),
		useNavigate: () => vi.fn(),
	};
});

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
	useCreateClassroom: vi.fn(),
}));

vi.mock("../hooks/use-ratios", () => ({
	useRatios: vi.fn(),
}));

const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseCreateClassroom = vi.mocked(useCreateClassroom);
const mockedUseRatios = vi.mocked(useRatios);

describe("ClassroomsPage", () => {
	it("gives the archived classroom checkbox an explicit accessible name", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByRole("checkbox")).toHaveAttribute("aria-label", "Show archived");
	});

	it("opens the add classroom form from the empty state", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Add your first classroom" }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Classrooms control ratios and attendance tracking. Set a capacity and minimum staff ratio to get started.",
			),
		).toBeVisible();
		expect(screen.getByLabelText("Name")).toBeInTheDocument();

		const messages = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
			.flat()
			.map((value) => String(value))
			.join("\n");

		expect(messages).not.toMatch(/Missing Description|aria-describedby/);

		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	it("uses a singular child label when only one child is enrolled", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					staffCount: 0,
					childCount: 1,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByText("1 child")).toBeInTheDocument();
		expect(screen.queryByText("1 children")).not.toBeInTheDocument();
	});

	it("shows open slots and an explicit details action on classroom cards", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					staffCount: 2,
					childCount: 7,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByText("3 open slots")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "View details for Toddlers" })).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("shows a violation badge when live ratio data reports an active violation", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					staffCount: 0,
					childCount: 1,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Toddlers",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					currentChildCount: 1,
					currentStaffCount: 0,
					ratioRequired: 1 / 6,
					ratioActual: 0,
					inCompliance: false,
					nearLimit: false,
					openViolationId: "violation-1",
				},
			],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByText("Violation")).toBeInTheDocument();
		expect(screen.queryByText("Compliant")).not.toBeInTheDocument();
	});

	it("shows the backend-resolved (state-stricter) ratio on the card, not the raw configured ratio", () => {
		// Classroom configured loosely at 1:8, but the live ratio reflects a stricter
		// state-mandated 1:4 (resolveEffectiveRatioRule applied server-side). The card
		// label must match the Ratios page and detail page, not the raw 1:8 value.
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Preschool",
					ageGroup: "preschool",
					maxCapacity: 16,
					minRatioStaff: 1,
					minRatioChildren: 8,
					staffCount: 1,
					childCount: 8,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Preschool",
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
					openViolationId: undefined,
					ratioRuleSource: "state:CA",
				},
			],
			isLoading: false,
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByText(/1:4 ratio/)).toBeInTheDocument();
		expect(screen.queryByText(/1:8 ratio/)).not.toBeInTheDocument();
	});

	it("keeps empty classrooms marked as empty when live ratio data is compliant", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Infants",
					ageGroup: "infant",
					maxCapacity: 8,
					minRatioStaff: 1,
					minRatioChildren: 4,
					staffCount: 0,
					childCount: 0,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{
					classroomId: "classroom-1",
					classroomName: "Infants",
					ageGroup: "infant",
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

		render(<ClassroomsPage />);

		expect(screen.getByText("Empty")).toBeInTheDocument();
		expect(screen.queryByText("Compliant")).not.toBeInTheDocument();
	});

	it("shows inline error and keeps create classroom dialog open when creation fails", async () => {
		mockedUseClassrooms.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Name already taken")),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({ data: [], isLoading: false } as never);

		render(<ClassroomsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Add Classroom" }));

		const dialog = screen.getByRole("dialog");
		const form = dialog.querySelector("form");
		if (!form) throw new Error("Expected form in dialog");

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sunshine Room" } });
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "preschool" } });
		fireEvent.change(screen.getByLabelText("Max Capacity"), { target: { value: "10" } });
		fireEvent.change(screen.getByLabelText("Staff (ratio)"), { target: { value: "1" } });
		fireEvent.change(screen.getByLabelText("Children (ratio)"), { target: { value: "4" } });
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Name already taken");
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("disables Create Classroom when a ratio field contains a non-integer like 1.5", () => {
		render(<CreateClassroomForm onSubmit={vi.fn()} isSubmitting={false} />);

		fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sunshine Room" } });
		fireEvent.change(screen.getByRole("combobox"), { target: { value: "preschool" } });
		fireEvent.change(screen.getByLabelText("Max Capacity"), { target: { value: "10" } });
		fireEvent.change(screen.getByLabelText("Staff (ratio)"), { target: { value: "1.5" } });
		fireEvent.change(screen.getByLabelText("Children (ratio)"), { target: { value: "4" } });

		const submit = screen.getByRole("button", { name: /Create Classroom/i });
		expect(submit).toBeDisabled();

		// Integer values re-enable submission.
		fireEvent.change(screen.getByLabelText("Staff (ratio)"), { target: { value: "1" } });
		expect(submit).not.toBeDisabled();
	});

	it("adds step='1' to ratio and capacity inputs so arrow controls step by whole numbers", () => {
		render(<CreateClassroomForm onSubmit={vi.fn()} isSubmitting={false} />);

		expect(screen.getByLabelText("Max Capacity")).toHaveAttribute("step", "1");
		expect(screen.getByLabelText("Staff (ratio)")).toHaveAttribute("step", "1");
		expect(screen.getByLabelText("Children (ratio)")).toHaveAttribute("step", "1");
	});

	it("stacks the ratio inputs on mobile and only splits them on larger screens", () => {
		render(<CreateClassroomForm onSubmit={vi.fn()} isSubmitting={false} />);

		const staffInput = screen.getByLabelText("Staff (ratio)");
		const ratioGrid = staffInput.closest(".space-y-2")?.parentElement;
		if (!ratioGrid) throw new Error("Expected ratio grid container");

		expect(ratioGrid.className).toContain("grid");
		expect(ratioGrid.className).toContain("sm:grid-cols-2");
		expect(ratioGrid.className).not.toContain("grid-cols-2 gap-4");
	});

	it("shows ratio minimum helper text in classroom creation dialog", () => {
		mockedUseClassrooms.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({ data: [], isLoading: false } as never);

		render(<ClassroomsPage />);
		fireEvent.click(screen.getByRole("button", { name: /Add Classroom/i }));
		const helperText = screen.getByText(/Most states require/i);
		expect(helperText).toBeVisible();
	});

	it("renders classroom card with child count testid and Compliant badge for compliant room", () => {
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Toddler Room",
					ageGroup: "toddler",
					maxCapacity: 10,
					minRatioStaff: 1,
					minRatioChildren: 6,
					staffCount: 2,
					childCount: 8,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateClassroom.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseRatios.mockReturnValue({ data: [], isLoading: false } as never);

		render(<ClassroomsPage />);

		const countEl = screen.getByTestId("classroom-child-count-toddler-room");
		expect(countEl).toHaveTextContent("8 children");
		const cardRoot = countEl.closest("[class*='rounded']") ?? document.body;
		expect(within(cardRoot as HTMLElement).getByText("Compliant")).toBeInTheDocument();
	});
});
