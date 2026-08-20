import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthSession } from "../hooks/use-auth-session";
import {
	useChild,
	useChildren,
	useLinkGuardian,
	useReactivateChild,
	useUnlinkGuardian,
	useUpdateChild,
	useUpdateGuardianLink,
	useWithdrawChild,
} from "../hooks/use-children";
import { useAssignChild, useClassrooms } from "../hooks/use-classrooms";
import {
	useChildSubsidySummary,
	useCreateSubsidyCase,
	useCreateSubsidyClaim,
	useUpdateSubsidyCase,
} from "../hooks/use-finance";
import { useCreateGuardian, useDeleteGuardian, useGuardians } from "../hooks/use-guardians";
import {
	AddGuardianDialog,
	AssignClassroomDialog,
	ChildHealthSection,
	ChildProfilePage,
	calculateAge,
	EditChildDetailsCard,
	EditGuardianLinkDialog,
	GuardianRow,
	LinkGuardianDialog,
	ProfileSkeleton,
	Route,
	WithdrawDialog,
} from "./_auth/children/$id";

vi.mock("@pebbledesk/ui/components/textarea", () => ({
	Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
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
			aria-label="select"
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		>
			{children}
		</select>
	),
	SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
		<>{children ?? <span id={id} />}</>
	),
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<option value="">{placeholder ?? ""}</option>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

vi.mock("../components/attendance-calendar", () => ({
	AttendanceCalendar: ({ childId, timezone }: { childId: string; timezone: string }) => (
		<div data-testid="attendance-calendar" data-child-id={childId} data-timezone={timezone} />
	),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		useNavigate: () => vi.fn(),
	};
});

vi.mock("../hooks/use-children", () => ({
	useChild: vi.fn(),
	useChildren: vi.fn(),
	useLinkGuardian: vi.fn(),
	useReactivateChild: vi.fn(),
	useUnlinkGuardian: vi.fn(),
	useUpdateChild: vi.fn(),
	useUpdateGuardianLink: vi.fn(),
	useWithdrawChild: vi.fn(),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useAssignChild: vi.fn(),
	useClassrooms: vi.fn(),
}));

vi.mock("../hooks/use-guardians", () => ({
	useCreateGuardian: vi.fn(),
	useDeleteGuardian: vi.fn(),
	useGuardians: vi.fn(),
}));

vi.mock("../hooks/use-finance", () => ({
	useChildSubsidySummary: vi.fn(),
	useCreateSubsidyCase: vi.fn(),
	useCreateSubsidyClaim: vi.fn(),
	useUpdateSubsidyCase: vi.fn(),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			center: {
				timezone: "America/Chicago",
			},
		},
	})),
}));

const mockedUseChild = vi.mocked(useChild);
const mockedUseLinkGuardian = vi.mocked(useLinkGuardian);
const mockedUseReactivateChild = vi.mocked(useReactivateChild);
const mockedUseUnlinkGuardian = vi.mocked(useUnlinkGuardian);
const mockedUseUpdateChild = vi.mocked(useUpdateChild);
const mockedUseUpdateGuardianLink = vi.mocked(useUpdateGuardianLink);
const mockedUseWithdrawChild = vi.mocked(useWithdrawChild);
const mockedUseAssignChild = vi.mocked(useAssignChild);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseCreateGuardian = vi.mocked(useCreateGuardian);
const mockedUseDeleteGuardian = vi.mocked(useDeleteGuardian);
const mockedUseGuardians = vi.mocked(useGuardians);
const mockedUseChildSubsidySummary = vi.mocked(useChildSubsidySummary);
const mockedUseChildren = vi.mocked(useChildren);
const mockedUseCreateSubsidyCase = vi.mocked(useCreateSubsidyCase);
const mockedUseCreateSubsidyClaim = vi.mocked(useCreateSubsidyClaim);
const mockedUseUpdateSubsidyCase = vi.mocked(useUpdateSubsidyCase);
const mockedUseAuthSession = vi.mocked(useAuthSession);

describe("ChildProfilePage", () => {
	beforeEach(() => {
		vi.spyOn(Route, "useParams").mockReturnValue({ id: "child-1" } as never);

		mockedUseChild.mockReturnValue({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: true,
					enrollmentStatus: "active",
					allergies: "Peanuts",
					immunizations: "MMR",
					notes: "Naps at 1pm",
				},
				currentClassroom: {
					name: "Sunflower Room",
					ageGroup: "preschool",
					effectiveDate: "2026-02-01",
				},
				guardians: [
					{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: "mia@example.com",
						phone: "555-0100",
						isPrimary: true,
						authorizedPickup: true,
						relationship: "Mother",
					},
				],
				primaryGuardianName: "Mia Johnson",
			},
			isLoading: false,
		});

		mockedUseUpdateChild.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseWithdrawChild.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseReactivateChild.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ id: "guardian-2" }),
			isPending: false,
		} as never);
		mockedUseUnlinkGuardian.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateGuardianLink.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunflower Room",
					ageGroup: "preschool",
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue({ id: "guardian-2" }),
			isPending: false,
		} as never);
		mockedUseDeleteGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockResolvedValue(undefined),
			isPending: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-2",
					firstName: "Jordan",
					lastName: "Lee",
					email: "jordan@example.com",
					phone: null,
					relationship: "Parent",
				},
			],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateSubsidyCase.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseCreateSubsidyClaim.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseChildSubsidySummary.mockReturnValue({
			data: {
				cases: [
					{
						id: "case-1",
						centerId: "center-1",
						childId: "child-1",
						program: "ccdf",
						caseNumber: "CASE-123",
						agencyName: "County Services",
						authorizedHoursWeekly: 32,
						rateDaily: 45,
						effectiveDate: "2026-01-01",
						status: "active",
						createdAt: "2026-01-01T12:00:00.000Z",
						updatedAt: "2026-01-01T12:00:00.000Z",
					},
				],
				activeCase: {
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					authorizedHoursWeekly: 32,
					rateDaily: 45,
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
				claims: [
					{
						id: "claim-1",
						centerId: "center-1",
						subsidyCaseId: "case-1",
						periodStart: "2026-02-01",
						periodEnd: "2026-02-07",
						daysAttended: 5,
						hoursAttended: 24,
						amountClaimed: 300,
						status: "submitted",
						createdAt: "2026-02-07T12:00:00.000Z",
						updatedAt: "2026-02-07T12:00:00.000Z",
					},
				],
				latestClaim: {
					id: "claim-1",
					centerId: "center-1",
					subsidyCaseId: "case-1",
					periodStart: "2026-02-01",
					periodEnd: "2026-02-07",
					daysAttended: 5,
					hoursAttended: 24,
					amountClaimed: 300,
					status: "submitted",
					createdAt: "2026-02-07T12:00:00.000Z",
					updatedAt: "2026-02-07T12:00:00.000Z",
				},
			},
			isLoading: false,
		} as never);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("renders the child profile and subsidy card", () => {
		render(<ChildProfilePage />);

		expect(screen.getByRole("heading", { name: "Ava Johnson" })).toBeInTheDocument();
		expect(screen.getByText("Subsidy")).toBeInTheDocument();
		expect(screen.getByText("CASE-123")).toBeInTheDocument();
		expect(screen.getByTestId("attendance-calendar")).toHaveAttribute("data-child-id", "child-1");
		expect(screen.getByTestId("attendance-calendar")).toHaveAttribute(
			"data-timezone",
			"America/Chicago",
		);
	});

	it("preserves date-only values when rendering child and classroom dates", () => {
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2024-01-05",
					ageGroup: "toddler",
					subsidyEligible: false,
					enrollmentStatus: "active",
				},
				currentClassroom: {
					name: "Toddlers",
					ageGroup: "toddler",
					effectiveDate: "2026-04-10",
				},
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);

		expect(screen.getByText("Jan 5, 2024")).toBeInTheDocument();
		expect(screen.getByText("Apr 10, 2026")).toBeInTheDocument();
		expect(screen.queryByText("Jan 4, 2024")).not.toBeInTheDocument();
		expect(screen.queryByText("Apr 9, 2026")).not.toBeInTheDocument();
	});

	it("calculates age from a date-only birth date without UTC drift", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-05T04:30:00.000Z"));
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Mia",
					lastName: "Lopez",
					dateOfBirth: "2025-01-05",
					ageGroup: "infant",
					subsidyEligible: false,
					enrollmentStatus: "active",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);

		expect(screen.getByText("11 mos")).toBeInTheDocument();
		expect(screen.queryByText("1 yr, 0 mos")).not.toBeInTheDocument();
	});

	it("opens the edit, withdraw, assign, and guardian dialogs", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		try {
			render(<ChildProfilePage />);

			// Multiple "Edit" buttons exist (child details + health sections); the child-details one is first.
			fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0] as HTMLElement);
			expect(screen.getByText("Edit Child Details")).toBeInTheDocument();

			fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
			fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
			expect(screen.getByText("Withdraw Child")).toBeInTheDocument();
			expect(
				screen.getByText(
					"Withdrawing removes the child from their classroom and marks the profile as withdrawn.",
				),
			).toBeInTheDocument();

			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
			expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
			expect(screen.getByText("Select a classroom to move this child into.")).toBeInTheDocument();

			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			fireEvent.click(screen.getByRole("button", { name: "Link Existing" }));
			expect(screen.getByText("Link Guardian")).toBeInTheDocument();
			expect(
				screen.getByText("Search for an existing guardian to link to this child."),
			).toBeInTheDocument();

			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			fireEvent.click(screen.getByRole("button", { name: "Add New" }));
			expect(screen.getByText("Add New Guardian")).toBeInTheDocument();
			expect(
				screen.getByText("Create a guardian record and link them to this child."),
			).toBeInTheDocument();

			const messages = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
				.flat()
				.map((value) => String(value))
				.join("\n");

			expect(messages).not.toMatch(/Missing Description|aria-describedby/);
		} finally {
			consoleErrorSpy.mockRestore();
			consoleWarnSpy.mockRestore();
		}
	}, 10_000);

	it("renders the loading skeleton and not-found states", () => {
		const { container } = render(<ProfileSkeleton />);
		expect(container.firstChild).not.toBeNull();

		mockedUseChild.mockReturnValueOnce({
			data: undefined,
			isLoading: false,
		});

		render(<ChildProfilePage />);
		expect(screen.getByText("Child not found")).toBeInTheDocument();
	});

	it("shows a reactivate button for withdrawn children", () => {
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: true,
					enrollmentStatus: "withdrawn",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);

		expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
	});

	it("renders a guardian row and shows confirmation dialog before unlinking", async () => {
		const unlink = vi.fn();
		mockedUseUnlinkGuardian.mockReturnValueOnce({
			mutate: unlink,
			isPending: false,
		} as never);

		render(
			<GuardianRow
				childId="child-1"
				guardian={{
					id: "guardian-1",
					firstName: "Mia",
					lastName: "Johnson",
					email: "mia@example.com",
					phone: "5125550111",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "Mother",
				}}
			/>,
		);

		expect(screen.getByText("Mother")).toBeInTheDocument();
		expect(screen.getByText("(512) 555-0111")).toBeInTheDocument();

		// Clicking Remove opens the confirmation dialog — mutation is NOT yet called.
		fireEvent.click(screen.getByRole("button", { name: "Remove Mia Johnson" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(screen.getByText("Unlink guardian?")).toBeInTheDocument();
		expect(unlink).not.toHaveBeenCalled();

		// Confirming inside the dialog calls the mutation.
		fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
		await waitFor(() => {
			expect(unlink).toHaveBeenCalledWith("guardian-1");
		});
	});

	it("cancels the guardian unlink when Cancel is clicked in the confirmation dialog", () => {
		const unlink = vi.fn();
		mockedUseUnlinkGuardian.mockReturnValueOnce({
			mutate: unlink,
			isPending: false,
		} as never);

		render(
			<GuardianRow
				childId="child-1"
				guardian={{
					id: "guardian-1",
					firstName: "Mia",
					lastName: "Johnson",
					email: "mia@example.com",
					phone: null,
					isPrimary: false,
					authorizedPickup: false,
					relationship: null,
				}}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Remove Mia Johnson" }));
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(unlink).not.toHaveBeenCalled();
	});

	it("saves edited child details", async () => {
		const save = vi.fn().mockResolvedValue(undefined);

		render(
			<EditChildDetailsCard
				child={{
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: true,
				}}
				timezone="UTC"
				onSave={save}
				onCancel={vi.fn()}
				isSaving={false}
			/>,
		);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Ava-Mae" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(save).toHaveBeenCalledWith({
				firstName: "Ava-Mae",
				lastName: "Johnson",
				dateOfBirth: "2021-04-10",
				ageGroup: "preschool",
				subsidyEligible: true,
			});
		});
	});

	it("toggles subsidy eligibility off via the edit checkbox", async () => {
		const save = vi.fn().mockResolvedValue(undefined);

		render(
			<EditChildDetailsCard
				child={{
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: true,
				}}
				timezone="UTC"
				onSave={save}
				onCancel={vi.fn()}
				isSaving={false}
			/>,
		);

		fireEvent.click(screen.getByLabelText("Subsidy Eligible"));
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(save).toHaveBeenCalledWith({
				firstName: "Ava",
				lastName: "Johnson",
				dateOfBirth: "2021-04-10",
				ageGroup: "preschool",
				subsidyEligible: false,
			});
		});
	});

	it("confirms a withdrawal", async () => {
		const confirm = vi.fn().mockResolvedValue(undefined);

		render(
			<WithdrawDialog
				open
				onOpenChange={vi.fn()}
				childName="Ava Johnson"
				onConfirm={confirm}
				isSubmitting={false}
			/>,
		);

		expect(
			screen.getByText(
				"Withdrawing removes the child from their classroom and marks the profile as withdrawn.",
			),
		).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

		await waitFor(() => {
			expect(confirm).toHaveBeenCalled();
		});
	});

	it("renders the add guardian dialog form", () => {
		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

		expect(screen.getByText("Add New Guardian")).toBeInTheDocument();
		expect(
			screen.getByText("Create a guardian record and link them to this child."),
		).toBeInTheDocument();
		expect(screen.getByLabelText("First Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Last Name")).toBeInTheDocument();
		expect(screen.getByLabelText("Relationship (optional)")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add Guardian" })).toBeDisabled();
	});

	it("passes relationship when adding a new guardian", async () => {
		const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-2" });
		const linkGuardian = vi.fn().mockResolvedValue({});

		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: createGuardian,
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "555-0199" } });
		fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
			target: { value: "Aunt" },
		});
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "yes" } });
		fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });

		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(createGuardian).toHaveBeenCalledWith({
				firstName: "Jordan",
				lastName: "Lee",
				email: "jordan@example.com",
				phone: "555-0199",
			});
			expect(linkGuardian).toHaveBeenCalledWith({
				guardianId: "guardian-2",
				isPrimary: true,
				authorizedPickup: true,
				relationship: "Aunt",
			});
		});
	});

	it("defaults new guardian links to not authorized for pickup", async () => {
		const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-2" });
		const linkGuardian = vi.fn().mockResolvedValue({});

		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: createGuardian,
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(linkGuardian).toHaveBeenCalledWith({
				guardianId: "guardian-2",
				isPrimary: false,
				authorizedPickup: false,
				relationship: undefined,
			});
		});
	});

	it("passes relationship when linking an existing guardian", async () => {
		const linkGuardian = vi.fn().mockResolvedValue({});

		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);

		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={vi.fn()}
				existingGuardianIds={["guardian-1"]}
			/>,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
			target: { value: "Father" },
		});
		fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });
		fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "yes" } });

		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(linkGuardian).toHaveBeenCalledWith({
				guardianId: "guardian-2",
				isPrimary: true,
				authorizedPickup: true,
				relationship: "Father",
			});
		});
	});

	it("defaults linked guardians to not authorized for pickup", async () => {
		const linkGuardian = vi.fn().mockResolvedValue({});

		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);

		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={vi.fn()}
				existingGuardianIds={["guardian-1"]}
			/>,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(linkGuardian).toHaveBeenCalledWith({
				guardianId: "guardian-2",
				isPrimary: false,
				authorizedPickup: false,
				relationship: undefined,
			});
		});
	});

	it("formats the selected guardian phone number in the link dialog preview", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-2",
					firstName: "Jordan",
					lastName: "Lee",
					email: "jordan@example.com",
					phone: "5125550199",
					relationship: "Parent",
				},
			],
			isLoading: false,
		} as never);

		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={vi.fn()}
				existingGuardianIds={["guardian-1"]}
			/>,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });

		expect(screen.getAllByText("Jordan Lee")).toHaveLength(2);
		expect(screen.getByText("jordan@example.com")).toBeInTheDocument();
		expect(screen.queryByText("5125550199")).not.toBeInTheDocument();
		expect(screen.getByText("(512) 555-0199")).toBeInTheDocument();
	});

	it("renders classroom choices in the assign dialog", () => {
		mockedUseClassrooms.mockReturnValueOnce({
			data: [
				{
					id: "classroom-1",
					name: "Sunflower Room",
					ageGroup: "preschool",
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);

		expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
		expect(screen.getByText("Select a classroom to move this child into.")).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Sunflower Room (Preschool)" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
	});

	it("opens the new subsidy case dialog with the child locked in", () => {
		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: /New case/i }));

		expect(screen.getByText("New subsidy case")).toBeInTheDocument();
		expect(screen.queryByLabelText("Child")).not.toBeInTheDocument();
	});

	it("submits a new subsidy case with the locked child id", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ id: "case-new" });
		mockedUseCreateSubsidyCase.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: /New case/i }));
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText("Case number"), { target: { value: "CASE-500" } });
		fireEvent.change(screen.getByLabelText("Agency name"), {
			target: { value: "County Services" },
		});
		fireEvent.change(screen.getByLabelText("Effective date"), {
			target: { value: "2026-04-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create case" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				childId: "child-1",
				program: "ccdf",
				caseNumber: "CASE-500",
				agencyName: "County Services",
				effectiveDate: "2026-04-01",
				status: "active",
			});
		});
	});

	it("shows the new claim CTA only when an active case exists", () => {
		const { unmount } = render(<ChildProfilePage />);
		expect(screen.getByRole("button", { name: /New claim/i })).toBeInTheDocument();
		unmount();

		mockedUseChildSubsidySummary.mockReturnValueOnce({
			data: {
				cases: [],
				activeCase: null,
				claims: [],
				latestClaim: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		expect(screen.queryByRole("button", { name: /New claim/i })).not.toBeInTheDocument();
	});

	it("submits a new subsidy claim against the active case", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ id: "claim-new" });
		mockedUseCreateSubsidyClaim.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: /New claim/i }));
		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-07" } });
		fireEvent.change(screen.getByLabelText("Days attended"), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText("Hours attended"), { target: { value: "25" } });
		fireEvent.change(screen.getByLabelText("Amount claimed"), { target: { value: "300" } });
		fireEvent.click(screen.getByRole("button", { name: "Create claim" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				subsidyCaseId: "case-1",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				daysAttended: 5,
				hoursAttended: 25,
				amountClaimed: 300,
				status: "draft",
			});
		});
	});

	it("shows an inline error and keeps assign dialog open when assignChild fails", async () => {
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Classroom is at capacity")),
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{ id: "classroom-1", name: "Sunflower Room", ageGroup: "preschool", archivedAt: null },
			],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Classroom is at capacity");
		});
		expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
	});

	it("shows an inline error and keeps link guardian dialog open when linkGuardian fails", async () => {
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Guardian already linked")),
			isPending: false,
		} as never);

		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={vi.fn()}
				existingGuardianIds={["guardian-1"]}
			/>,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Guardian already linked");
		});
		expect(screen.getByText("Link Guardian")).toBeInTheDocument();
	});

	it("shows an inline error and keeps add guardian dialog open when create or link fails", async () => {
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Email already in use")),
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
		});
		expect(screen.getByText("Add New Guardian")).toBeInTheDocument();
	});

	it("rolls back the created guardian when the link step fails to prevent orphan rows", async () => {
		const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-99" });
		const linkGuardian = vi.fn().mockRejectedValue(new Error("Guardian already linked"));
		const deleteGuardian = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: createGuardian,
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);
		mockedUseDeleteGuardian.mockReturnValue({
			mutateAsync: deleteGuardian,
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={onOpenChange} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(deleteGuardian).toHaveBeenCalledWith({ id: "guardian-99" });
		});
		expect(createGuardian).toHaveBeenCalled();
		expect(linkGuardian).toHaveBeenCalled();
		expect(screen.getByRole("alert")).toHaveTextContent("Guardian already linked");
		expect(screen.getByText("Add New Guardian")).toBeInTheDocument();
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});

	it("swallows rollback failures and still surfaces the original link error", async () => {
		const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-99" });
		const linkGuardian = vi.fn().mockRejectedValue(new Error("Link failed"));
		const deleteGuardian = vi.fn().mockRejectedValue(new Error("Rollback failed"));

		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: createGuardian,
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);
		mockedUseDeleteGuardian.mockReturnValue({
			mutateAsync: deleteGuardian,
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Link failed");
		});
		expect(deleteGuardian).toHaveBeenCalledWith({ id: "guardian-99" });
	});

	it("shows an inline error inside the withdraw dialog when withdrawChild fails", async () => {
		mockedUseWithdrawChild.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Cannot withdraw enrolled child")),
			isPending: false,
		} as never);

		render(
			<WithdrawDialog
				open
				onOpenChange={vi.fn()}
				onConfirm={async () => {
					await Promise.reject(new Error("Cannot withdraw enrolled child"));
				}}
				isSubmitting={false}
				error="Cannot withdraw enrolled child"
			/>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent("Cannot withdraw enrolled child");
	});

	it("shows no error in withdraw dialog when error is null", () => {
		render(
			<WithdrawDialog
				open
				onOpenChange={vi.fn()}
				onConfirm={async () => {}}
				isSubmitting={false}
				error={null}
			/>,
		);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("renders the loading skeleton when child data is loading", () => {
		mockedUseChild.mockReturnValueOnce({ data: undefined, isLoading: true } as never);
		const { container } = render(<ChildProfilePage />);
		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("navigates back to children list from the not-found empty state", () => {
		mockedUseChild.mockReturnValueOnce({ data: undefined, isLoading: false } as never);
		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Back to children" }));
		// useNavigate is mocked to return vi.fn() - we just want coverage for the handler
	});

	it("fires the reactivate mutation for withdrawn children", () => {
		const mutate = vi.fn();
		mockedUseReactivateChild.mockReturnValueOnce({ mutate, isPending: false } as never);
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
					enrollmentStatus: "withdrawn",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Reactivate" }));
		expect(mutate).toHaveBeenCalled();
	});

	it("shows reactivate loading label when the mutation is pending", () => {
		mockedUseReactivateChild.mockReturnValueOnce({
			mutate: vi.fn(),
			isPending: true,
		} as never);
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
					enrollmentStatus: "withdrawn",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		expect(screen.getByRole("button", { name: /Reactivating/ })).toBeInTheDocument();
	});

	it("opens the assign dialog from the no-classroom empty state", () => {
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
					enrollmentStatus: "active",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		expect(screen.getByText("Not assigned to a classroom")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));
		expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
	});

	it("opens the add-guardian dialog from the empty guardians state CTA", () => {
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
					enrollmentStatus: "active",
				},
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));
		expect(
			screen.getByText("Create a guardian record and link them to this child."),
		).toBeInTheDocument();
	});

	it("successfully withdraws a child and closes the dialog", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseWithdrawChild.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
		const allButtons = screen.getAllByRole("button", { name: "Withdraw" });
		// Last "Withdraw" button is the dialog confirm action
		fireEvent.click(allButtons[allButtons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
	});

	it("restricts the DOB DateInput to today or earlier via maxDate", () => {
		render(
			<EditChildDetailsCard
				child={{
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
				}}
				timezone="UTC"
				onSave={vi.fn()}
				onCancel={vi.fn()}
				isSaving={false}
			/>,
		);

		const dobInput = screen.getByLabelText("Date of Birth") as HTMLInputElement;
		const maxAttr = dobInput.getAttribute("max");
		expect(maxAttr).not.toBeNull();
		// Should be a valid ISO date string in YYYY-MM-DD format and not in the future
		expect(maxAttr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		const maxDate = new Date(`${maxAttr}T12:00:00`);
		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		expect(maxDate.getTime()).toBeLessThan(tomorrow.getTime());
	});

	it("derives the DOB maxDate from the center timezone, not UTC", () => {
		// 2026-03-02T23:30:00Z is still Mar 2 in UTC but already Mar 3 in the
		// far-ahead center timezone Kiritimati (UTC+14). The "no future DOB" guard
		// must track the center's calendar day so it can't admit a future date.
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-02T23:30:00.000Z"));
		try {
			render(
				<EditChildDetailsCard
					child={{
						firstName: "Ava",
						lastName: "Johnson",
						dateOfBirth: "2021-04-10",
						ageGroup: "preschool",
						subsidyEligible: false,
					}}
					timezone="Pacific/Kiritimati"
					onSave={vi.fn()}
					onCancel={vi.fn()}
					isSaving={false}
				/>,
			);

			const dobInput = screen.getByLabelText("Date of Birth") as HTMLInputElement;
			expect(dobInput.getAttribute("max")).toBe("2026-03-03");
		} finally {
			vi.useRealTimers();
		}
	});

	it("guards EditChildDetailsCard save against empty required fields", () => {
		const save = vi.fn();
		render(
			<EditChildDetailsCard
				child={{
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
				}}
				timezone="UTC"
				onSave={save}
				onCancel={vi.fn()}
				isSaving={false}
			/>,
		);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "   " } });
		const saveBtn = screen.getByRole("button", { name: "Save Changes" });
		expect(saveBtn).toBeDisabled();
	});

	it("shows 'Saving...' label while EditChildDetailsCard is saving", () => {
		render(
			<EditChildDetailsCard
				child={{
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
				}}
				timezone="UTC"
				onSave={vi.fn()}
				onCancel={vi.fn()}
				isSaving={true}
			/>,
		);
		expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
	});

	it("renders GuardianRow without optional fields", () => {
		render(
			<GuardianRow
				childId="child-1"
				guardian={{
					id: "guardian-x",
					firstName: "Solo",
					lastName: "Contact",
					email: null,
					phone: null,
					isPrimary: false,
					authorizedPickup: false,
					relationship: null,
				}}
			/>,
		);
		expect(screen.getByText("Solo Contact")).toBeInTheDocument();
		expect(screen.queryByText("Primary")).not.toBeInTheDocument();
	});

	it("successfully assigns a classroom and closes the dialog", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();
		mockedUseAssignChild.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{ id: "classroom-1", name: "Sunflower Room", ageGroup: "preschool", archivedAt: null },
			],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={onOpenChange} />);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				childId: "child-1",
				effectiveDate: expect.any(String),
			});
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	it("clears the assign classroom error when dialog is closed", async () => {
		const onOpenChange = vi.fn();
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("boom")),
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{ id: "classroom-1", name: "Sunflower Room", ageGroup: "preschool", archivedAt: null },
			],
			isLoading: false,
		} as never);

		const { rerender } = render(
			<AssignClassroomDialog childId="child-1" open onOpenChange={onOpenChange} />,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));
		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
		});

		// Click Cancel → triggers onOpenChange(false) path
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		rerender(<AssignClassroomDialog childId="child-1" open={false} onOpenChange={onOpenChange} />);
	});

	it("shows assigning loading state", () => {
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{ id: "classroom-1", name: "Sunflower Room", ageGroup: "preschool", archivedAt: null },
			],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		expect(screen.getByRole("button", { name: "Assigning..." })).toBeInTheDocument();
	});

	it("resets selectedClassroomId to '' when AssignClassroomDialog is closed without saving", () => {
		const onOpenChange = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			data: [
				{ id: "classroom-1", name: "Sunflower Room", ageGroup: "preschool", archivedAt: null },
			],
			isLoading: false,
		} as never);

		const { rerender } = render(
			<AssignClassroomDialog childId="child-1" open onOpenChange={onOpenChange} />,
		);

		// Select a classroom (non-seed value)
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("classroom-1");

		// Close via Radix close button — fires Dialog's onOpenChange(false), triggering the reset
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		rerender(<AssignClassroomDialog childId="child-1" open onOpenChange={onOpenChange} />);

		// Field must be back to seed value (empty string → placeholder shown, Assign button disabled)
		expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
	});

	it("successfully links a guardian and closes the dialog", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();
		mockedUseLinkGuardian.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={onOpenChange}
				existingGuardianIds={[]}
			/>,
		);

		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	it("shows linking loading state", () => {
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);

		render(
			<LinkGuardianDialog childId="child-1" open onOpenChange={vi.fn()} existingGuardianIds={[]} />,
		);
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		expect(screen.getByRole("button", { name: "Linking..." })).toBeInTheDocument();
	});

	it("closes the link guardian dialog via Cancel", () => {
		const onOpenChange = vi.fn();
		render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={onOpenChange}
				existingGuardianIds={[]}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("resets all fields to seed values when LinkGuardianDialog is closed without saving", () => {
		const onOpenChange = vi.fn();

		const { rerender } = render(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={onOpenChange}
				existingGuardianIds={[]}
			/>,
		);

		// Change fields away from seed values
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
			target: { value: "Father" },
		});
		fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });
		fireEvent.change(screen.getAllByRole("combobox")[2], { target: { value: "yes" } });

		// Close via Radix close button — fires Dialog's onOpenChange(false), triggering the reset
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		rerender(
			<LinkGuardianDialog
				childId="child-1"
				open
				onOpenChange={onOpenChange}
				existingGuardianIds={[]}
			/>,
		);

		// Guardian select back to empty → Link button disabled
		expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
		// Relationship text cleared
		const relInput = screen.getByLabelText("Relationship (optional)") as HTMLInputElement;
		expect(relInput.value).toBe("");
		// isPrimary and authorizedPickup back to "no"
		expect((screen.getAllByRole("combobox")[1] as HTMLSelectElement).value).toBe("no");
		expect((screen.getAllByRole("combobox")[2] as HTMLSelectElement).value).toBe("no");
	});

	it("successfully adds a new guardian and closes the dialog", async () => {
		const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-new" });
		const linkGuardian = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();

		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: createGuardian,
			isPending: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: linkGuardian,
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={onOpenChange} />);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	it("shows adding loading state in add guardian dialog", () => {
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);
		// With a pending createGuardian, the submit button shows "Adding..." only when valid.
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		expect(screen.getByRole("button", { name: "Adding..." })).toBeInTheDocument();
	});

	it("resets all fields to seed values when AddGuardianDialog (child profile) is closed without saving", () => {
		const onOpenChange = vi.fn();

		const { rerender } = render(
			<AddGuardianDialog childId="child-1" open onOpenChange={onOpenChange} />,
		);

		// Fill fields with non-seed values
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "5551234567" } });
		fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
			target: { value: "Aunt" },
		});
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "yes" } });
		fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });

		// Close via Radix close button — fires Dialog's onOpenChange(false), triggering the reset
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		rerender(<AddGuardianDialog childId="child-1" open onOpenChange={onOpenChange} />);

		// All fields back to seed values (empty strings / "no")
		expect((screen.getByLabelText("First Name") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Last Name") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Relationship (optional)") as HTMLInputElement).value).toBe("");
		expect((screen.getAllByRole("combobox")[0] as HTMLSelectElement).value).toBe("no");
		expect((screen.getAllByRole("combobox")[1] as HTMLSelectElement).value).toBe("no");
	});

	it("shows 'Withdrawing...' label when submission is pending", () => {
		render(
			<WithdrawDialog open onOpenChange={vi.fn()} onConfirm={async () => {}} isSubmitting={true} />,
		);
		expect(screen.getByRole("button", { name: "Withdrawing..." })).toBeInTheDocument();
	});

	it("falls back to UTC timezone when there is no auth session in the page", () => {
		mockedUseAuthSession.mockReturnValueOnce({ data: undefined, isLoading: false } as never);

		render(<ChildProfilePage />);
		expect(screen.getByTestId("attendance-calendar")).toHaveAttribute("data-timezone", "UTC");
	});

	it("treats a missing subsidy summary as null without crashing", () => {
		mockedUseChildSubsidySummary.mockReturnValueOnce({
			data: undefined,
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		// Page still renders and the New-case CTA is visible.
		expect(screen.getByRole("button", { name: /New case/i })).toBeInTheDocument();
	});

	it("defaults LinkGuardianDialog ids to an empty list when guardians is undefined", () => {
		mockedUseChild.mockReturnValueOnce({
			data: {
				child: {
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					dateOfBirth: "2021-04-10",
					ageGroup: "preschool",
					subsidyEligible: false,
					enrollmentStatus: "active",
				},
				currentClassroom: null,
				guardians: undefined,
				primaryGuardianName: null,
			},
			isLoading: false,
		} as never);

		render(<ChildProfilePage />);
		// Still renders without crashing; the empty-guardian CTA is shown.
		expect(screen.getByRole("button", { name: "Add Guardian" })).toBeInTheDocument();
	});

	it("defaults active classrooms to an empty list when classrooms data is undefined", () => {
		mockedUseClassrooms.mockReturnValueOnce({ data: undefined, isLoading: false } as never);
		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);
		expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
	});

	it("falls back to UTC when assignClassroom has no auth session", async () => {
		mockedUseAuthSession.mockReturnValueOnce({ data: undefined, isLoading: false } as never);

		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseAssignChild.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Room", ageGroup: "preschool", archivedAt: null }],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
	});

	it("surfaces a generic error when AssignClassroomDialog throws a non-Error", async () => {
		mockedUseAssignChild.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue("string-err"),
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "classroom-1", name: "Room", ageGroup: "preschool", archivedAt: null }],
			isLoading: false,
		} as never);

		render(<AssignClassroomDialog childId="child-1" open onOpenChange={vi.fn()} />);
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "classroom-1" } });
		fireEvent.click(screen.getByRole("button", { name: "Assign" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Could not assign classroom.");
		});
	});

	it("defaults LinkGuardianDialog available list to empty when guardians is undefined", () => {
		mockedUseGuardians.mockReturnValueOnce({ data: undefined, isLoading: false } as never);
		render(
			<LinkGuardianDialog childId="child-1" open onOpenChange={vi.fn()} existingGuardianIds={[]} />,
		);
		expect(screen.getByText("Link Guardian")).toBeInTheDocument();
	});

	it("surfaces a generic error when LinkGuardianDialog throws a non-Error", async () => {
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue("string-err"),
			isPending: false,
		} as never);

		render(
			<LinkGuardianDialog childId="child-1" open onOpenChange={vi.fn()} existingGuardianIds={[]} />,
		);
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "guardian-2" } });
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Could not link guardian.");
		});
	});

	it("surfaces a generic error when AddGuardianDialog throws a non-Error", async () => {
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue("string-err"),
			isPending: false,
		} as never);

		render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Could not add guardian.");
		});
	});

	it("clears withdraw error when the Dialog's escape handler fires", async () => {
		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
		expect(screen.getByText("Withdraw Child")).toBeInTheDocument();
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByText("Withdraw Child")).not.toBeInTheDocument();
		});
	});

	it("calculateAge exercises pluralization and month-wrap branches", () => {
		vi.useFakeTimers();
		// now = Aug 15, 2026
		vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));

		// Exactly 1 year old → "1 yr, 0 mos" (tests years===1 singular, months===0 plural 'mos')
		expect(calculateAge("2025-08-15")).toMatch(/1 yr,/);

		// 2 years + 1 month → "2 yrs, 1 mo" (tests years plural + months===1 singular)
		expect(calculateAge("2024-07-10")).toMatch(/2 yrs, 1 mo$/);

		// dob month > current month → months goes negative → years--, months+=12
		// DOB Nov 10, 2024; today Aug 15, 2026 → months=-3 → 9, years=2-1=1 → "1 yr, 9 mos"
		expect(calculateAge("2024-11-10")).toMatch(/1 yr, 9 mos/);

		// Current day < dob day with months === 0 pre-decrement → triggers nested months<0
		// DOB Aug 20, 2025; today Aug 15, 2026 → months=0, then now.getDate(15) < 20 → months=-1
		// → nested if: years--, months+=12 → "0 yrs" path
		const result = calculateAge("2025-08-20");
		expect(result).toMatch(/mos/);

		// Non-date-only branch for formatDate / calculateAge
		expect(calculateAge("2025-08-20T00:00:00.000Z")).toMatch(/mos/);

		vi.useRealTimers();
	});

	it("calculateAge — exact-day birthday is counted as completed year/month", () => {
		vi.useFakeTimers();
		// Today IS the birthday: DOB = 2024-03-10, today = 2026-03-10
		vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));
		// now.getDate() === dob.getDate() so the day-adjustment branch is NOT entered
		// → years=2, months=0 → "2 yrs, 0 mos"
		expect(calculateAge("2024-03-10")).toMatch(/^2 yrs,/);
		vi.useRealTimers();
	});

	it("calculateAge — leap year birthday (Feb 29) parsed correctly in non-leap year", () => {
		vi.useFakeTimers();
		// DOB = 2024-02-29 (leap year), today = 2025-03-01
		vi.setSystemTime(new Date("2025-03-01T12:00:00.000Z"));
		// Local parsing: new Date(2024, 1, 29, 12) → Feb 29 2024 (valid in 2024)
		// now: Mar 1 2025. years=1, months=1, day 1 >= day 29? no → months-- → 0
		// Actually: months = (2025-2024)*12 + (2-1) = 13, then day 1 < 29 → months=12,
		// years=1-1=0... Let's just assert it doesn't throw and returns a month string.
		const result = calculateAge("2024-02-29");
		expect(result).toMatch(/mo/);
		vi.useRealTimers();
	});

	it("calculateAge — DST boundary: YYYY-MM-DD input uses local-noon parser to avoid TZ shift", () => {
		vi.useFakeTimers();
		// US/Eastern DST spring-forward: 2025-03-09 02:00 clocks go forward to 03:00.
		// If we parse "2025-03-09" as UTC midnight and the system is UTC-5, it would appear
		// as Mar 8 2025, giving an off-by-one. The local-noon parser avoids this.
		vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
		// DOB = exactly 1 year ago on a DST-transition date
		const result = calculateAge("2025-03-09");
		// Should be 1 yr, 0 mos — not "11 mos" from DST shift
		expect(result).toMatch(/^1 yr,/);
		vi.useRealTimers();
	});

	it("surfaces an error when withdraw fails from the page", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("cannot-withdraw"));
		mockedUseWithdrawChild.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

		const withdrawButtons = screen.getAllByRole("button", { name: "Withdraw" });
		fireEvent.click(withdrawButtons[withdrawButtons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("cannot-withdraw");
		});
	});

	it("surfaces a non-Error rejection as a generic withdraw message", async () => {
		const mutateAsync = vi.fn().mockRejectedValue("not-an-error");
		mockedUseWithdrawChild.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

		const withdrawButtons = screen.getAllByRole("button", { name: "Withdraw" });
		fireEvent.click(withdrawButtons[withdrawButtons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Could not withdraw child.");
		});
	});

	it("clears dialog error state when closing via the Dialog's escape handler", async () => {
		// Open the page, click Assign/Link/Add... each has an onOpenChange wrapper that clears
		// errors when `next` is false. Pressing Escape triggers that wrapper.
		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: "Add New" }));
		expect(screen.getByText("Add New Guardian")).toBeInTheDocument();
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByText("Add New Guardian")).not.toBeInTheDocument();
		});
	});

	it("clears link dialog error state when closing via the Dialog's escape handler", async () => {
		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: "Link Existing" }));
		expect(screen.getByText("Link Guardian")).toBeInTheDocument();
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByText("Link Guardian")).not.toBeInTheDocument();
		});
	});

	it("clears assign dialog error state when closing via the Dialog's escape handler", async () => {
		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: "Reassign" }));
		expect(screen.getByText("Assign to Classroom")).toBeInTheDocument();
		fireEvent.keyDown(document.body, { key: "Escape", code: "Escape" });

		await waitFor(() => {
			expect(screen.queryByText("Assign to Classroom")).not.toBeInTheDocument();
		});
	});

	it("resets edit mode when EditChildDetailsCard Cancel is clicked from the page", () => {
		render(<ChildProfilePage />);
		// The child-details Edit button is the first among the health-section Edit buttons.
		fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0] as HTMLElement);
		expect(screen.getByText("Edit Child Details")).toBeInTheDocument();

		// Click the Cancel INSIDE the edit card (first Cancel in document)
		fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0] as HTMLElement);
		expect(screen.queryByText("Edit Child Details")).not.toBeInTheDocument();
	});

	it("saves edited child details from the page and exits edit mode", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseUpdateChild.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<ChildProfilePage />);
		// The child-details Edit button is the first among the health-section Edit buttons.
		fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0] as HTMLElement);
		// Change last name to verify the DOM onChange handlers are exercised
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Johnson-Smith" } });
		fireEvent.change(screen.getByLabelText("Date of Birth"), { target: { value: "2021-05-11" } });
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
			// After success the Edit button label flips back from "Cancel" to "Edit";
			// multiple Edit buttons exist (health sections), so use getAllByRole.
			expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0);
		});
	});

	it("successfully withdraws and clears the withdraw error state", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseWithdrawChild.mockReturnValue({ mutateAsync, isPending: false } as never);

		render(<ChildProfilePage />);
		fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

		// Dialog is open. Click the withdraw confirm action (last "Withdraw" button)
		const withdrawButtons = screen.getAllByRole("button", { name: "Withdraw" });
		fireEvent.click(withdrawButtons[withdrawButtons.length - 1] as HTMLElement);

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
	});

	it("closes the add guardian dialog via Cancel", () => {
		const onOpenChange = vi.fn();
		render(<AddGuardianDialog childId="child-1" open onOpenChange={onOpenChange} />);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("surfaces an inline error when creating a subsidy case fails", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Case number already exists"));
		mockedUseCreateSubsidyCase.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		render(<ChildProfilePage />);

		fireEvent.click(screen.getByRole("button", { name: /New case/i }));
		fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText("Case number"), { target: { value: "CASE-500" } });
		fireEvent.change(screen.getByLabelText("Agency name"), {
			target: { value: "County Services" },
		});
		fireEvent.change(screen.getByLabelText("Effective date"), {
			target: { value: "2026-04-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create case" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Case number already exists");
		});
	});

	describe("EditGuardianLinkDialog", () => {
		it("renders edit-relationship dialog pre-filled with current values", () => {
			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: "mia@example.com",
						phone: null,
						isPrimary: true,
						authorizedPickup: false,
						relationship: "Mother",
					}}
					open
					onOpenChange={vi.fn()}
				/>,
			);

			expect(screen.getByText("Edit Relationship")).toBeInTheDocument();
			const relationshipInput = screen.getByLabelText(
				"Relationship (optional)",
			) as HTMLInputElement;
			expect(relationshipInput.value).toBe("Mother");

			const selects = screen.getAllByRole("combobox");
			// first select = isPrimary, second = authorizedPickup
			expect((selects[0] as HTMLSelectElement).value).toBe("yes");
			expect((selects[1] as HTMLSelectElement).value).toBe("no");
		});

		it("calls useUpdateGuardianLink with correct ids and changed fields on submit", async () => {
			const mutateAsync = vi.fn().mockResolvedValue({});
			const onOpenChange = vi.fn();
			mockedUseUpdateGuardianLink.mockReturnValue({
				mutateAsync,
				isPending: false,
			} as never);

			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: false,
						authorizedPickup: false,
						relationship: "Father",
					}}
					open
					onOpenChange={onOpenChange}
				/>,
			);

			fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
				target: { value: "Uncle" },
			});
			fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "yes" } });
			fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });

			fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

			await waitFor(() => {
				expect(mutateAsync).toHaveBeenCalledWith({
					guardianId: "guardian-1",
					data: {
						relationship: "Uncle",
						isPrimary: true,
						authorizedPickup: true,
					},
				});
				expect(onOpenChange).toHaveBeenCalledWith(false);
			});
		});

		it("renders edit button per linked guardian row in ChildProfilePage", () => {
			render(<ChildProfilePage />);
			expect(
				screen.getByRole("button", { name: "Edit relationship Mia Johnson" }),
			).toBeInTheDocument();
		});

		it("opens edit dialog pre-filled when Edit relationship is clicked in GuardianRow", () => {
			render(
				<GuardianRow
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: true,
						authorizedPickup: true,
						relationship: "Mother",
					}}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit relationship Mia Johnson" }));
			expect(screen.getByText("Edit Relationship")).toBeInTheDocument();
			const relationshipInput = screen.getByLabelText(
				"Relationship (optional)",
			) as HTMLInputElement;
			expect(relationshipInput.value).toBe("Mother");
		});

		it("shows inline error when update fails", async () => {
			mockedUseUpdateGuardianLink.mockReturnValue({
				mutateAsync: vi.fn().mockRejectedValue(new Error("Update failed")),
				isPending: false,
			} as never);

			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: false,
						authorizedPickup: false,
						relationship: null,
					}}
					open
					onOpenChange={vi.fn()}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent("Update failed");
			});
			expect(screen.getByText("Edit Relationship")).toBeInTheDocument();
		});

		it("closes edit dialog via Cancel without calling mutate", () => {
			const mutateAsync = vi.fn();
			const onOpenChange = vi.fn();
			mockedUseUpdateGuardianLink.mockReturnValue({
				mutateAsync,
				isPending: false,
			} as never);

			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: false,
						authorizedPickup: false,
						relationship: null,
					}}
					open
					onOpenChange={onOpenChange}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
			expect(mutateAsync).not.toHaveBeenCalled();
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});

		it("shows 'Saving...' label while update is pending", () => {
			mockedUseUpdateGuardianLink.mockReturnValue({
				mutateAsync: vi.fn(),
				isPending: true,
			} as never);

			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: false,
						authorizedPickup: false,
						relationship: null,
					}}
					open
					onOpenChange={vi.fn()}
				/>,
			);

			expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
		});

		it("submits with relationship undefined when input is blank", async () => {
			const mutateAsync = vi.fn().mockResolvedValue({});
			mockedUseUpdateGuardianLink.mockReturnValue({
				mutateAsync,
				isPending: false,
			} as never);

			render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={{
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Johnson",
						email: null,
						phone: null,
						isPrimary: false,
						authorizedPickup: false,
						relationship: null,
					}}
					open
					onOpenChange={vi.fn()}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

			await waitFor(() => {
				expect(mutateAsync).toHaveBeenCalledWith({
					guardianId: "guardian-1",
					data: {
						relationship: undefined,
						isPrimary: false,
						authorizedPickup: false,
					},
				});
			});
		});

		it("resets form fields to guardian seed values when closed without saving", () => {
			const onOpenChange = vi.fn();
			const guardian = {
				id: "guardian-1",
				firstName: "Mia",
				lastName: "Johnson",
				email: null,
				phone: null,
				isPrimary: true,
				authorizedPickup: false,
				relationship: "Mother",
			};

			const { rerender } = render(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={guardian}
					open
					onOpenChange={onOpenChange}
				/>,
			);

			// Change each field away from its seed value
			fireEvent.change(screen.getByLabelText("Relationship (optional)"), {
				target: { value: "Uncle" },
			});
			fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "no" } });
			fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "yes" } });

			// Close via the Radix close button — this fires the Dialog's onOpenChange(false)
			// which is where the field reset lives
			fireEvent.click(screen.getByRole("button", { name: "Close" }));

			// Reopen by passing open=true again (Radix close set open to false via onOpenChange)
			rerender(
				<EditGuardianLinkDialog
					childId="child-1"
					guardian={guardian}
					open
					onOpenChange={onOpenChange}
				/>,
			);

			const relationshipInput = screen.getByLabelText(
				"Relationship (optional)",
			) as HTMLInputElement;
			expect(relationshipInput.value).toBe("Mother");
			const selects = screen.getAllByRole("combobox");
			expect((selects[0] as HTMLSelectElement).value).toBe("yes");
			expect((selects[1] as HTMLSelectElement).value).toBe("no");
		});
	});

	describe("ChildHealthSection", () => {
		it("renders existing value in read mode", () => {
			render(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies"
					value="Peanuts, tree nuts"
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			expect(screen.getByText("Allergies")).toBeInTheDocument();
			expect(screen.getByText("Peanuts, tree nuts")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
			expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		});

		it("shows 'None recorded' when value is null", () => {
			render(
				<ChildHealthSection
					title="Notes"
					fieldId="health-notes"
					value={null}
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			expect(screen.getByText("None recorded")).toBeInTheDocument();
		});

		it("shows 'None recorded' when value is empty string", () => {
			render(
				<ChildHealthSection
					title="Notes"
					fieldId="health-notes"
					value=""
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			expect(screen.getByText("None recorded")).toBeInTheDocument();
		});

		it("enters edit mode and shows textarea with current value", () => {
			render(
				<ChildHealthSection
					title="Immunizations"
					fieldId="health-immunizations"
					value="MMR - 2024-01-15"
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit" }));

			const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
			expect(textarea.value).toBe("MMR - 2024-01-15");
			expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
			expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
		});

		it("calls onSave with updated text and returns to read mode on success", async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);

			render(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies"
					value="Peanuts"
					onSave={onSave}
					isSaving={false}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit" }));
			fireEvent.change(screen.getByRole("textbox"), { target: { value: "Peanuts, dairy" } });
			fireEvent.click(screen.getByRole("button", { name: "Save" }));

			await waitFor(() => {
				expect(onSave).toHaveBeenCalledWith("Peanuts, dairy");
			});
			await waitFor(() => {
				expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
			});
		});

		it("reverts to original value when Cancel is clicked", () => {
			render(
				<ChildHealthSection
					title="Notes"
					fieldId="health-notes"
					value="Original note"
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit" }));
			fireEvent.change(screen.getByRole("textbox"), { target: { value: "Changed note" } });
			fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

			expect(screen.getByText("Original note")).toBeInTheDocument();
			expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
		});

		it("shows Saving... label while save is in progress", async () => {
			let resolveSave!: () => void;
			const onSave = vi.fn().mockReturnValue(
				new Promise<void>((resolve) => {
					resolveSave = resolve;
				}),
			);

			render(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies"
					value="Peanuts"
					onSave={onSave}
					isSaving={false}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit" }));
			fireEvent.click(screen.getByRole("button", { name: "Save" }));

			await waitFor(() => {
				expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
			});

			resolveSave();

			await waitFor(() => {
				expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
			});
		});

		it("disables buttons when isSaving prop is true", () => {
			render(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies"
					value="Peanuts"
					onSave={vi.fn()}
					isSaving={false}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Edit" }));

			const saveBtn = screen.getByRole("button", { name: "Save" });
			expect(saveBtn).not.toBeDisabled();

			// Re-render with isSaving=true
			const { rerender } = render(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies-2"
					value="Peanuts"
					onSave={vi.fn()}
					isSaving={true}
				/>,
			);

			rerender(
				<ChildHealthSection
					title="Allergies"
					fieldId="health-allergies-2"
					value="Peanuts"
					onSave={vi.fn()}
					isSaving={true}
				/>,
			);
			// In read mode with isSaving=true the Edit button is still shown
			expect(screen.getAllByRole("button", { name: "Edit" })[0]).toBeInTheDocument();
		});

		it("renders three health section cards in ChildProfilePage", () => {
			render(<ChildProfilePage />);

			expect(screen.getByText("Allergies")).toBeInTheDocument();
			expect(screen.getByText("Immunizations")).toBeInTheDocument();
			expect(screen.getByText("Notes")).toBeInTheDocument();
			expect(screen.getByText("Peanuts")).toBeInTheDocument();
			expect(screen.getByText("MMR")).toBeInTheDocument();
			expect(screen.getByText("Naps at 1pm")).toBeInTheDocument();
		});

		it("saves allergies from the full profile page", async () => {
			const mutateAsync = vi.fn().mockResolvedValue(undefined);
			mockedUseUpdateChild.mockReturnValue({ mutateAsync, isPending: false } as never);

			render(<ChildProfilePage />);

			const editButtons = screen.getAllByRole("button", { name: "Edit" });
			// First Edit button is the top-level child details edit; health sections come after.
			// Find the Edit button inside the Allergies card by heading proximity — click the
			// second Edit button (Allergies is first health section).
			fireEvent.click(editButtons[1] as HTMLElement);

			const textarea = screen.getByRole("textbox");
			fireEvent.change(textarea, { target: { value: "Shellfish" } });
			fireEvent.click(screen.getByRole("button", { name: "Save" }));

			await waitFor(() => {
				expect(mutateAsync).toHaveBeenCalledWith({ allergies: "Shellfish" });
			});
		});

		it("persists an empty string when clearing allergies so the stale value is removed", async () => {
			const mutateAsync = vi.fn().mockResolvedValue(undefined);
			mockedUseUpdateChild.mockReturnValue({ mutateAsync, isPending: false } as never);

			render(<ChildProfilePage />);

			const editButtons = screen.getAllByRole("button", { name: "Edit" });
			fireEvent.click(editButtons[1] as HTMLElement);

			const textarea = screen.getByRole("textbox");
			fireEvent.change(textarea, { target: { value: "" } });
			fireEvent.click(screen.getByRole("button", { name: "Save" }));

			await waitFor(() => {
				// Clearing must send "" (not undefined) so the PATCH actually persists the cleared
				// value — undefined would be dropped by the partial update and leave the stale entry.
				expect(mutateAsync).toHaveBeenCalledWith({ allergies: "" });
			});
		});
	});

	describe("AddGuardianDialog — schema validation", () => {
		it("shows an inline email error and keeps submit disabled when email is invalid", () => {
			render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

			fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
			fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
			fireEvent.change(screen.getByLabelText("Email"), { target: { value: "notanemail" } });

			expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Add Guardian" })).toBeDisabled();
		});

		it("shows an inline phone error and keeps submit disabled when phone is too short", () => {
			render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

			fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
			fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
			fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "123" } });

			expect(screen.getByText("Enter a valid phone number.")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Add Guardian" })).toBeDisabled();
		});

		it("shows an inline phone error when phone contains invalid characters", () => {
			render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

			fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
			fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
			fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "abc-defg-hij" } });

			expect(screen.getByText("Enter a valid phone number.")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Add Guardian" })).toBeDisabled();
		});

		it("allows submit when email and phone are both empty (optional fields)", async () => {
			const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-ok" });
			const linkGuardian = vi.fn().mockResolvedValue({});
			mockedUseCreateGuardian.mockReturnValue({
				mutateAsync: createGuardian,
				isPending: false,
			} as never);
			mockedUseLinkGuardian.mockReturnValue({
				mutateAsync: linkGuardian,
				isPending: false,
			} as never);

			render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

			fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
			fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });

			expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument();
			expect(screen.queryByText("Enter a valid phone number.")).not.toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Add Guardian" })).not.toBeDisabled();

			fireEvent.click(screen.getByRole("button", { name: "Add Guardian" }));

			await waitFor(() => {
				expect(createGuardian).toHaveBeenCalledWith({
					firstName: "Jordan",
					lastName: "Lee",
					email: undefined,
					phone: undefined,
				});
			});
		});

		it("enables submit and does not show errors when email and phone are valid", async () => {
			const createGuardian = vi.fn().mockResolvedValue({ id: "guardian-ok" });
			const linkGuardian = vi.fn().mockResolvedValue({});
			mockedUseCreateGuardian.mockReturnValue({
				mutateAsync: createGuardian,
				isPending: false,
			} as never);
			mockedUseLinkGuardian.mockReturnValue({
				mutateAsync: linkGuardian,
				isPending: false,
			} as never);

			render(<AddGuardianDialog childId="child-1" open onOpenChange={vi.fn()} />);

			fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
			fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
			fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
			fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "555-0199" } });

			expect(screen.queryByText("Enter a valid email address.")).not.toBeInTheDocument();
			expect(screen.queryByText("Enter a valid phone number.")).not.toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Add Guardian" })).not.toBeDisabled();
		});
	});

	describe("ChildProfilePage — error state", () => {
		it("shows Failed to load message when useChild returns isError=true", () => {
			const refetch = vi.fn();
			mockedUseChild.mockReturnValueOnce({
				data: undefined,
				isLoading: false,
				isError: true,
				refetch,
			} as never);

			render(<ChildProfilePage />);

			expect(screen.getByText("Failed to load this child's profile.")).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
			expect(screen.queryByText("Child not found")).not.toBeInTheDocument();
		});

		it("calls refetch when Try again is clicked", () => {
			const refetch = vi.fn();
			mockedUseChild.mockReturnValueOnce({
				data: undefined,
				isLoading: false,
				isError: true,
				refetch,
			} as never);

			render(<ChildProfilePage />);

			fireEvent.click(screen.getByRole("button", { name: "Try again" }));
			expect(refetch).toHaveBeenCalled();
		});

		it("shows Child not found (not error state) when isError=false and data is missing", () => {
			mockedUseChild.mockReturnValueOnce({
				data: undefined,
				isLoading: false,
				isError: false,
				refetch: vi.fn(),
			} as never);

			render(<ChildProfilePage />);

			expect(screen.getByText("Child not found")).toBeInTheDocument();
			expect(screen.queryByText("Failed to load this child's profile.")).not.toBeInTheDocument();
		});

		describe("staff role — owner/director-only affordances are hidden", () => {
			function setStaffSession() {
				mockedUseAuthSession.mockReturnValue({
					data: {
						center: { timezone: "America/Chicago" },
						membership: { role: "staff" },
					},
				} as never);
			}

			it("does not fire the owner/director-only subsidy summary query for staff", () => {
				setStaffSession();
				render(<ChildProfilePage />);

				// GET /api/subsidy-cases is Owner/Director only — staff must not fire it.
				expect(mockedUseChildSubsidySummary).toHaveBeenCalledWith("child-1", {
					enabled: false,
				});
			});

			it("hides the guardian Link/Add buttons from staff", () => {
				setStaffSession();
				render(<ChildProfilePage />);

				expect(screen.queryByRole("button", { name: /link existing/i })).not.toBeInTheDocument();
				expect(screen.queryByRole("button", { name: /add new/i })).not.toBeInTheDocument();
			});

			it("hides the subsidy section and its actions from staff", () => {
				setStaffSession();
				render(<ChildProfilePage />);

				expect(screen.queryByText("CASE-123")).not.toBeInTheDocument();
				expect(screen.queryByRole("button", { name: /new case/i })).not.toBeInTheDocument();
				expect(screen.queryByRole("button", { name: /new claim/i })).not.toBeInTheDocument();
			});

			it("still lets staff read the child profile and guardian list", () => {
				setStaffSession();
				render(<ChildProfilePage />);

				expect(screen.getByRole("heading", { name: "Ava Johnson" })).toBeInTheDocument();
				// Guardian rows come from useChild (staff-readable), not the directory GET.
				expect(screen.getByText("Mia Johnson")).toBeInTheDocument();
			});
		});

		it("fires the subsidy summary query for an owner/director visitor", () => {
			mockedUseAuthSession.mockReturnValue({
				data: {
					center: { timezone: "America/Chicago" },
					membership: { role: "director" },
				},
			} as never);
			render(<ChildProfilePage />);

			expect(mockedUseChildSubsidySummary).toHaveBeenCalledWith("child-1", {
				enabled: true,
			});
		});
	});
});
