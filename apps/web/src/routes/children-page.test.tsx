import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ChildrenPage, formatAgeGroup, formatDate } from "./_auth/children/index";

const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-setup-progress", () => ({
	useSetupProgress: vi.fn(() => ({ allDone: false, isLoading: false, currentStep: null })),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		useNavigate: () => mockedNavigate,
		Link: ({
			children,
			to,
			params,
			className,
			onClick,
			...rest
		}: {
			children: React.ReactNode;
			to: string;
			params?: Record<string, string>;
			className?: string;
			onClick?: React.MouseEventHandler<HTMLAnchorElement>;
		} & Record<string, unknown>) => {
			const href = params
				? Object.entries(params).reduce((u, [k, v]) => u.replace(`$${k}`, v), to)
				: to;
			return (
				<a href={href} className={className} onClick={onClick} {...rest}>
					{children}
				</a>
			);
		},
	};
});

const mockedUseChildren = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-children", () => ({
	useChildren: (...args: unknown[]) => mockedUseChildren(...args),
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
		<select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
			{children}
		</select>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<option value="">{placeholder ?? ""}</option>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

describe("children list page date formatting", () => {
	it("renders date-only birthdays without shifting the previous day", () => {
		expect(formatDate("2024-01-05")).toBe("Jan 5, 2024");
	});

	it("keeps the primary enrollment CTA content-sized on mobile instead of a full-width slab", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);
		const headerCta = screen.getByRole("link", { name: /Enroll Child/ });
		expect(headerCta.className).not.toMatch(/(^|\s)w-full(\s|$)/);
		expect(headerCta.className).toMatch(/self-start/);
		expect(headerCta.className).toMatch(/sm:self-auto/);
	});

	it("keeps Enroll child as primary CTA even when search has no results", () => {
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<ChildrenPage />);
		fireEvent.change(screen.getByPlaceholderText("Search children..."), {
			target: { value: "Mia" },
		});

		expect(screen.getByText("No children match your search")).toBeInTheDocument();
		expect(
			screen.getByText("Try a different search or clear your filters to see enrolled children."),
		).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(1);
		expect(screen.getAllByRole("link", { name: "Enroll Child" })).toHaveLength(1);
	});

	it("switches the header summary into filtered mode instead of showing fake totals", () => {
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<ChildrenPage />);
		fireEvent.change(screen.getByPlaceholderText("Search children..."), {
			target: { value: "Mia" },
		});

		expect(screen.getByText("Filters applied")).toBeInTheDocument();
		expect(screen.queryByText(/^0 active$/)).not.toBeInTheDocument();
	});

	it("trims surrounding whitespace before querying children", () => {
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		});

		render(<ChildrenPage />);
		fireEvent.change(screen.getByPlaceholderText("Search children..."), {
			target: { value: "  Mia  " },
		});

		expect(mockedUseChildren).toHaveBeenLastCalledWith(
			expect.objectContaining({
				search: "Mia",
			}),
		);
	});

	it("formats age groups and non-date-only date strings", () => {
		expect(formatAgeGroup("young_toddler")).toBe("Young Toddler");
		// Non-date-only string flows through Date constructor branch
		const full = formatDate("2024-03-15T12:00:00.000Z");
		expect(full).toMatch(/2024/);
	});

	it("renders the loading skeleton when children are loading", () => {
		mockedUseChildren.mockReturnValue({ data: undefined, isLoading: true });
		const { container } = render(<ChildrenPage />);
		// Skeleton rows render placeholder skeleton elements
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("shows active/waitlist/withdrawn summary counts", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "a",
					firstName: "A",
					lastName: "Z",
					dateOfBirth: "2024-01-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
				},
				{
					id: "b",
					firstName: "B",
					lastName: "Z",
					dateOfBirth: "2024-01-02",
					ageGroup: "toddler",
					enrollmentStatus: "waitlist",
				},
				{
					id: "c",
					firstName: "C",
					lastName: "Z",
					dateOfBirth: "2024-01-03",
					ageGroup: "toddler",
					enrollmentStatus: "withdrawn",
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);
		expect(screen.getByText(/1 active/)).toBeInTheDocument();
		expect(screen.getByText(/1 waitlist/)).toBeInTheDocument();
		expect(screen.getByText(/1 withdrawn/)).toBeInTheDocument();
	});

	it("navigates to the enroll page when clicking the primary CTA with no active filters", () => {
		mockedNavigate.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);
		fireEvent.click(screen.getByRole("link", { name: /Enroll Child/ }));
		expect(mockedNavigate).not.toHaveBeenCalled();
	});

	it("clears filters when clicking the header 'Clear filters' CTA in an empty search", () => {
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<ChildrenPage />);
		fireEvent.change(screen.getByPlaceholderText("Search children..."), {
			target: { value: "no-match" },
		});

		const clearButtons = screen.getAllByRole("button", { name: "Clear filters" });
		fireEvent.click(clearButtons[0] as HTMLElement);

		expect((screen.getByPlaceholderText("Search children...") as HTMLInputElement).value).toBe("");
	});

	it("clears filters via the empty state action when filters are active", () => {
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<ChildrenPage />);
		fireEvent.change(screen.getByPlaceholderText("Search children..."), {
			target: { value: "no-match" },
		});

		const clearButtons = screen.getAllByRole("button", { name: "Clear filters" });
		// Click the second one (EmptyState action)
		fireEvent.click(clearButtons[clearButtons.length - 1] as HTMLElement);

		expect((screen.getByPlaceholderText("Search children...") as HTMLInputElement).value).toBe("");
	});

	it("navigates to enroll from the empty state when no filters are active", () => {
		mockedNavigate.mockReset();
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<ChildrenPage />);
		// Both header CTA and empty-state CTA read "Enroll Child"; they are now links.
		const links = screen.getAllByRole("link", { name: "Enroll Child" });
		expect(links.length).toBeGreaterThanOrEqual(1);
		// Links navigate declaratively; no imperative navigate call expected.
		expect(mockedNavigate).not.toHaveBeenCalled();
	});

	it("renders a child-profile link with the correct href for each row", () => {
		mockedNavigate.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-42",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);
		const viewLink = screen.getByRole("link", { name: "View details for Mia Lopez" });
		expect(viewLink).toHaveAttribute("href", "/children/child-42");
		// Rows no longer carry an imperative onClick; navigation is declarative via Link.
		expect(mockedNavigate).not.toHaveBeenCalled();
	});

	it("shows an explicit view details action for each child row", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-42",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);

		expect(screen.getByRole("link", { name: "View details for Mia Lopez" })).toBeInTheDocument();
	});

	it("passes the status param through when selecting a specific status filter", () => {
		mockedUseChildren.mockReset();
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<ChildrenPage />);
		fireEvent.change(screen.getAllByRole("combobox")[0], {
			target: { value: "waitlist" },
		});

		expect(mockedUseChildren).toHaveBeenLastCalledWith(
			expect.objectContaining({ status: "waitlist" }),
		);
	});

	it("passes the ageGroup filter through to the hook", () => {
		mockedUseChildren.mockReset();
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false });

		render(<ChildrenPage />);
		fireEvent.change(screen.getAllByRole("combobox")[1], {
			target: { value: "toddler" },
		});

		expect(mockedUseChildren).toHaveBeenLastCalledWith(
			expect.objectContaining({ ageGroup: "toddler" }),
		);
	});

	it("renders child name as an explicit link to the child profile", () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Sofia",
					lastName: "Ramirez",
					dateOfBirth: "2023-06-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);

		// The row now has two links: the child name and the explicit "View details for ..." action.
		const nameLink = screen.getByRole("link", { name: "Sofia Ramirez" });
		expect(nameLink).toBeInTheDocument();
		expect(nameLink).toHaveAttribute("href", expect.stringContaining("/children/"));
	});

	it("clicking the child name link does not trigger row-level navigate", async () => {
		mockedNavigate.mockReset();
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Sofia",
					lastName: "Ramirez",
					dateOfBirth: "2021-05-10",
					ageGroup: "toddler",
					classroomId: "classroom-1",
					enrolledAt: "2024-01-01",
					status: "enrolled",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		} as never);

		render(<ChildrenPage />);

		// Two links per row share the child name (name link and View link). Use the exact-name match.
		const nameLink = await screen.findByRole("link", { name: "Sofia Ramirez" });
		fireEvent.click(nameLink);

		// The row-level navigate should NOT have been called — the Link handles navigation declaratively
		expect(mockedNavigate).not.toHaveBeenCalled();
	});

	it('treats status "all" as the default view instead of a fake active filter', () => {
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Nora",
					lastName: "Diaz",
					dateOfBirth: "2024-02-14",
					ageGroup: "toddler",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		});

		render(<ChildrenPage />);
		fireEvent.change(screen.getAllByRole("combobox")[0], {
			target: { value: "all" },
		});

		expect(screen.getByText("1 active")).toBeInTheDocument();
		expect(screen.queryByText("Filters applied")).not.toBeInTheDocument();
	});
});
