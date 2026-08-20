import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceSearch } from "./attendance-search";

const mockedUseChildren = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-children", () => ({
	useChildren: (...args: unknown[]) => mockedUseChildren(...args),
}));

describe("AttendanceSearch", () => {
	it("exposes an accessible name for the child search combobox", () => {
		render(<AttendanceSearch onCheckIn={vi.fn()} />);

		expect(screen.getByRole("combobox", { name: "Search children for attendance" })).toBeDefined();
	});
	beforeEach(() => {
		mockedUseChildren.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Nora",
					lastName: "Diaz",
					ageGroup: "toddler",
				},
			],
			isLoading: false,
		});
	});

	it("passes classroomId to useChildren so search is scoped to the active room", () => {
		render(
			<AttendanceSearch
				defaultClassroomId="room-abc"
				onCheckIn={() => {
					// noop
				}}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "no" } });

		expect(mockedUseChildren).toHaveBeenCalledWith(
			expect.objectContaining({ classroomId: "room-abc" }),
		);
	});

	it("exposes combobox ARIA attributes on the search input and listbox role on results", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" },
				{ id: "child-2", firstName: "Ivan", lastName: "Diaz", ageGroup: "toddler" },
			],
			isLoading: false,
		});

		render(
			<AttendanceSearch
				defaultClassroomId="room-1"
				onCheckIn={() => {
					// noop
				}}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...") as HTMLInputElement;
		expect(input.getAttribute("role")).toBe("combobox");
		expect(input.getAttribute("aria-autocomplete")).toBe("list");
		expect(input.getAttribute("aria-controls")).toBe("attendance-search-listbox");
		expect(input.getAttribute("aria-expanded")).toBe("false");

		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Di" } });

		expect(input.getAttribute("aria-expanded")).toBe("true");
		const listbox = screen.getByRole("listbox");
		expect(listbox.id).toBe("attendance-search-listbox");
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(2);
		expect(options[0].id).toBe("attendance-search-listbox-option-0");
	});

	it("uses an accessible 44px clear search control", () => {
		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={vi.fn()} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nor" } });

		const clearButton = screen.getByRole("button", { name: "Clear attendance search" });
		expect(clearButton.className).toContain("min-h-11");
		expect(clearButton.className).toContain("min-w-11");

		fireEvent.click(clearButton);

		expect(input).toHaveValue("");
		expect(input).toHaveFocus();
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	it("ArrowDown highlights first option and updates aria-activedescendant", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" },
				{ id: "child-2", firstName: "Ivan", lastName: "Diaz", ageGroup: "toddler" },
			],
			isLoading: false,
		});

		render(
			<AttendanceSearch
				defaultClassroomId="room-1"
				onCheckIn={() => {
					// noop
				}}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Di" } });

		fireEvent.keyDown(input, { key: "ArrowDown" });

		const options = screen.getAllByRole("option");
		expect(options[0].getAttribute("aria-selected")).toBe("true");
		expect(input.getAttribute("aria-activedescendant")).toBe("attendance-search-listbox-option-0");

		fireEvent.keyDown(input, { key: "ArrowDown" });
		const options2 = screen.getAllByRole("option");
		expect(options2[1].getAttribute("aria-selected")).toBe("true");
	});

	it("ArrowUp highlights the last option from an empty active state", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" },
				{ id: "child-2", firstName: "Ivan", lastName: "Diaz", ageGroup: "preschool" },
			],
			isLoading: false,
		});

		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={vi.fn()} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Diaz" } });
		fireEvent.keyDown(input, { key: "ArrowUp" });

		const options = screen.getAllByRole("option");
		expect(options[1].getAttribute("aria-selected")).toBe("true");
		expect(input).toHaveAttribute("aria-activedescendant", "attendance-search-listbox-option-1");
	});

	it("does not move the highlight when arrow keys run with no results", () => {
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={vi.fn()} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Missing" } });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "ArrowUp" });

		expect(input).not.toHaveAttribute("aria-activedescendant");
		expect(screen.getByText("No children found")).toBeInTheDocument();
	});

	it("Enter selects highlighted option and calls onCheckIn", () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		const onCheckIn = vi.fn();
		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={onCheckIn} />);

		const input = screen.getByPlaceholderText("Search child...") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(onCheckIn).toHaveBeenCalledWith("child-1", "room-1");
	});

	it("clicking a result check-in button selects the child", async () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		const onCheckIn = vi.fn();
		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={onCheckIn} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });
		const checkInButton = screen.getByRole("button", { name: "Check In" });
		const mouseDown = fireEvent.mouseDown(checkInButton);
		fireEvent.click(checkInButton);

		expect(mouseDown).toBe(false);
		expect(onCheckIn).toHaveBeenCalledWith("child-1", "room-1");
		await waitFor(() => expect(input).toHaveValue(""));
	});

	it("keeps failed quick-search check-ins visible with retry guidance", async () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		const onCheckIn = vi.fn().mockRejectedValue(new Error("Failed to check in"));
		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={onCheckIn} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });
		fireEvent.click(screen.getByRole("button", { name: "Check In" }));

		await waitFor(() => expect(onCheckIn).toHaveBeenCalledWith("child-1", "room-1"));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(input).toHaveValue("Nora");
		expect(screen.getByRole("listbox")).toBeInTheDocument();
		expect(screen.getByRole("alert")).toHaveTextContent("Check-in did not go through. Try again.");
		const retryButton = screen.getByRole("button", { name: "Retry check-in for Nora Diaz" });
		const mouseDown = fireEvent.mouseDown(retryButton);

		expect(retryButton).toBeEnabled();
		expect(mouseDown).toBe(false);

		fireEvent.click(retryButton);

		await waitFor(() => expect(onCheckIn).toHaveBeenCalledTimes(2));
	});

	it("clears a parent check-in error when the search query changes", () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		render(
			<AttendanceSearch
				defaultClassroomId="room-1"
				checkInError={new Error("Failed to check in")}
				onCheckIn={vi.fn()}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });

		fireEvent.change(input, { target: { value: "Nor" } });

		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("disables quick-search check-in while the parent mutation is pending", () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		render(
			<AttendanceSearch defaultClassroomId="room-1" isCheckInPending={true} onCheckIn={vi.fn()} />,
		);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });

		expect(screen.queryByRole("button", { name: "Check In" })).not.toBeInTheDocument();
		const pendingButton = screen.getByRole("button", { name: "Checking in Nora Diaz" });

		expect(pendingButton).toBeDisabled();
	});

	it("does not render check-in buttons without a default classroom", () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		render(<AttendanceSearch onCheckIn={vi.fn()} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });

		expect(screen.getByRole("option")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Check In" })).not.toBeInTheDocument();
	});

	it("shows a loading state while child search is pending", () => {
		mockedUseChildren.mockReturnValue({ data: [], isLoading: true });

		render(<AttendanceSearch defaultClassroomId="room-1" onCheckIn={vi.fn()} />);

		const input = screen.getByPlaceholderText("Search child...");
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nor" } });

		expect(screen.getByText("Searching...")).toBeInTheDocument();
	});

	it("Escape closes the dropdown and clears the active highlight", () => {
		mockedUseChildren.mockReturnValue({
			data: [{ id: "child-1", firstName: "Nora", lastName: "Diaz", ageGroup: "toddler" }],
			isLoading: false,
		});

		render(
			<AttendanceSearch
				defaultClassroomId="room-1"
				onCheckIn={() => {
					// noop
				}}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nora" } });
		fireEvent.keyDown(input, { key: "ArrowDown" });
		expect(screen.queryByRole("listbox")).toBeInTheDocument();

		fireEvent.keyDown(input, { key: "Escape" });

		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		expect(input.getAttribute("aria-activedescendant")).toBeNull();
	});

	it("uses full-width mobile sizing for the search shell and results dropdown", () => {
		render(
			<AttendanceSearch
				defaultClassroomId="classroom-1"
				onCheckIn={() => {
					// noop
				}}
			/>,
		);

		const input = screen.getByPlaceholderText("Search child...");
		const searchShell = input.parentElement;
		if (!searchShell) throw new Error("Expected search shell");

		expect(searchShell.className).toContain("w-full");
		expect(searchShell.className).toContain("sm:w-64");

		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "Nor" } });

		expect(searchShell.className).toContain("w-full");
		expect(searchShell.className).toContain("sm:w-64");

		const dropdown = screen.getByRole("listbox").parentElement;
		if (!dropdown) throw new Error("Expected results dropdown");

		expect(dropdown.className).toContain("w-full");
		expect(dropdown.className).toContain("sm:w-64");
	});

	it("wrapper div has stable width classes that do not change on focus", () => {
		render(<AttendanceSearch onCheckIn={vi.fn()} defaultClassroomId="classroom-1" />);
		const input = screen.getByRole("combobox");
		const wrapper = input.closest("div")?.parentElement;
		if (!wrapper) throw new Error("Expected wrapper div");

		const classNameBefore = wrapper.className;
		fireEvent.focus(input);
		const classNameAfter = wrapper.className;

		// Width classes must not change on focus
		const getWidthClasses = (cls: string) =>
			cls.split(" ").filter((c) => c.startsWith("w-") || c.startsWith("sm:w-"));
		expect(getWidthClasses(classNameAfter)).toEqual(getWidthClasses(classNameBefore));
	});
});
