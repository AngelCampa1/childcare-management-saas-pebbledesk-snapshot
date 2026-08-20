import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	MessageDetailPage,
	MessageDetailRoute,
	Route as MessageDetailRouteConfig,
} from "./_auth/messages/$id";
import { MessagesPage } from "./_auth/messages/index";
import { SchedulingPage } from "./_auth/scheduling/index";
import { TimeEntriesPage } from "./_auth/scheduling/time";

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("../hooks/use-phase5", () => ({
	useSchedules: vi.fn(),
	useShifts: vi.fn(),
	useTimeEntries: vi.fn(),
	useApproveTimeEntry: vi.fn(),
	useMessages: vi.fn(),
	useMessageInbox: vi.fn(),
	useMessage: vi.fn(),
	useRedeliverMessage: vi.fn(),
	useMarkMessageRepliesRead: vi.fn(),
	useCreateSchedule: vi.fn(),
	useDeleteSchedule: vi.fn(),
	useUpdateSchedule: vi.fn(),
	useCreateShift: vi.fn(),
	useDeleteShift: vi.fn(),
	useUpdateShift: vi.fn(),
	useSendMessage: vi.fn(),
}));

vi.mock("../hooks/use-guardians", () => ({
	useGuardians: vi.fn(),
}));

vi.mock("../hooks/use-members", () => ({
	useMembers: vi.fn(),
}));

vi.mock("@pebbledesk/ui/components/select", async () => {
	const React = await import("react");

	type SelectCtx = {
		value?: string;
		onChange?: (v: string) => void;
		options: { value: string; label: ReactNode }[];
		addOption: (value: string, label: ReactNode) => void;
		triggerId?: string;
		setTriggerId: (id: string) => void;
	};

	const SelectContext = React.createContext<SelectCtx>({
		options: [],
		addOption: () => {},
		setTriggerId: () => {},
	});

	return {
		Select: ({
			children,
			value,
			onValueChange,
		}: {
			children: ReactNode;
			value?: string;
			onValueChange?: (value: string) => void;
		}) => {
			const [options, setOptions] = React.useState<{ value: string; label: ReactNode }[]>([]);
			const [triggerId, setTriggerId] = React.useState<string | undefined>();
			const addOption = React.useCallback((v: string, label: ReactNode) => {
				setOptions((prev) => {
					if (prev.some((o) => o.value === v)) return prev;
					return [...prev, { value: v, label }];
				});
			}, []);
			return (
				<SelectContext.Provider
					value={{ value, onChange: onValueChange, options, addOption, triggerId, setTriggerId }}
				>
					{children}
				</SelectContext.Provider>
			);
		},
		SelectTrigger: ({
			children: _children,
			id,
		}: {
			children?: ReactNode;
			id?: string;
			className?: string;
		}) => {
			const ctx = React.useContext(SelectContext);
			React.useEffect(() => {
				if (id) ctx.setTriggerId(id);
			}, [id, ctx]);
			return (
				<select id={id} value={ctx.value ?? ""} onChange={(e) => ctx.onChange?.(e.target.value)}>
					<option value="">--</option>
					{ctx.options.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		},
		SelectValue: ({ placeholder: _p }: { placeholder?: string }) => null,
		SelectContent: ({ children }: { children: ReactNode }) => (
			<div style={{ display: "none" }}>{children}</div>
		),
		SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
			const ctx = React.useContext(SelectContext);
			React.useEffect(() => {
				ctx.addOption(value, children);
			}, [value, children, ctx]);
			return null;
		},
	};
});

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		Link: ({
			children,
			params,
			to,
		}: {
			children?: ReactNode;
			params?: Record<string, string>;
			to: string;
		}) => (
			<a data-testid="router-link" data-params={JSON.stringify(params)} data-to={to} href={to}>
				{children}
			</a>
		),
	};
});

import { useAuthSession } from "../hooks/use-auth-session";
import { useClassrooms } from "../hooks/use-classrooms";
import { useGuardians } from "../hooks/use-guardians";
import { useMembers } from "../hooks/use-members";
import {
	useApproveTimeEntry,
	useCreateSchedule,
	useCreateShift,
	useDeleteSchedule,
	useDeleteShift,
	useMarkMessageRepliesRead,
	useMessage,
	useMessageInbox,
	useMessages,
	useRedeliverMessage,
	useSchedules,
	useSendMessage,
	useShifts,
	useTimeEntries,
	useUpdateSchedule,
	useUpdateShift,
} from "../hooks/use-phase5";

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseSchedules = vi.mocked(useSchedules);
const mockedUseShifts = vi.mocked(useShifts);
const mockedUseTimeEntries = vi.mocked(useTimeEntries);
const mockedUseApproveTimeEntry = vi.mocked(useApproveTimeEntry);
const mockedUseMessages = vi.mocked(useMessages);
const mockedUseMessageInbox = vi.mocked(useMessageInbox);
const mockedUseMessage = vi.mocked(useMessage);
const mockedUseRedeliverMessage = vi.mocked(useRedeliverMessage);
const mockedUseMarkMessageRepliesRead = vi.mocked(useMarkMessageRepliesRead);
const mockedUseCreateSchedule = vi.mocked(useCreateSchedule);
const mockedUseDeleteSchedule = vi.mocked(useDeleteSchedule);
const mockedUseUpdateSchedule = vi.mocked(useUpdateSchedule);
const mockedUseCreateShift = vi.mocked(useCreateShift);
const mockedUseDeleteShift = vi.mocked(useDeleteShift);
const mockedUseUpdateShift = vi.mocked(useUpdateShift);
const mockedUseMembers = vi.mocked(useMembers);
const mockedUseSendMessage = vi.mocked(useSendMessage);
const mockedUseGuardians = vi.mocked(useGuardians);

describe("phase 5 pages", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateSchedule.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseDeleteSchedule.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseDeleteShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateSchedule.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseMembers.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseMessageInbox.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseApproveTimeEntry.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseMarkMessageRepliesRead.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
	});

	it("renders the director scheduling page", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [
				{
					id: "schedule-1",
					name: "Spring plan",
					effectiveFrom: "2026-04-01T12:00:00Z",
				},
				{
					id: "schedule-2",
					name: "Summer plan",
					effectiveFrom: "2026-05-01T12:00:00Z",
					effectiveUntil: "2026-05-31T12:00:00Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
				{
					id: "shift-2",
					membershipId: "membership-2",
					dayOfWeek: 9,
					startTime: "09:00",
					endTime: "17:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.getByText("Scheduling")).toBeInTheDocument();
		expect(screen.getByText("Spring plan")).toBeInTheDocument();
		expect(screen.getByText("Summer plan")).toBeInTheDocument();
		expect(screen.getByText(/Effective May 1, 2026 to May 31, 2026/)).toBeInTheDocument();
		expect(screen.getByText(/Day 09:00 - 17:00/)).toBeInTheDocument();
	});

	it("shows classroom names for recurring shifts instead of raw classroom ids", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					classroomId: "classroom-1",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.getByText("Sunshine Room")).toBeInTheDocument();
		expect(screen.queryByText("classroom-1")).not.toBeInTheDocument();
	});

	it("keeps scheduling recovery guidance honest when classrooms already exist", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 1,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(screen.getByText("No saved schedule templates")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Use Attendance for today's coverage while recurring plans are still empty.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByText("Create classrooms first so recurring staffing can be organized by room."),
		).not.toBeInTheDocument();
		expect(screen.getAllByRole("link", { name: "Open attendance" })).toHaveLength(2);
		expect(screen.queryByRole("link", { name: "Review classrooms" })).not.toBeInTheDocument();
	});

	it("renders the staff scheduling copy and empty states", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: undefined, isLoading: false } as never);

		render(<SchedulingPage />);

		expect(
			screen.getByText("View your assigned shifts and saved schedule templates."),
		).toBeInTheDocument();
		expect(screen.getByText("Add classrooms before building a schedule")).toBeInTheDocument();
		expect(
			screen.getByText("Create classrooms first so recurring staffing can be organized by room."),
		).toBeInTheDocument();
		expect(screen.getByText("No recurring shifts assigned")).toBeInTheDocument();
		expect(
			screen.getByText("This page only shows shifts that already exist in the system."),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Review classrooms" })).toHaveAttribute(
			"href",
			"/classrooms",
		);
		expect(screen.getByRole("link", { name: "Open attendance" })).toHaveAttribute(
			"href",
			"/attendance",
		);
	});

	it("renders the time entries page", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "entry-1",
					date: "2026-04-07",
					hoursWorked: 8,
					hoursScheduled: 7.5,
					overtimeHours: 0.5,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);

		render(<TimeEntriesPage />);

		expect(screen.getByText("Time Entries")).toBeInTheDocument();
		expect(screen.getByText("Worked 8h / Scheduled 7.5h / Overtime 0.5h")).toBeInTheDocument();
		expect(screen.getByText("approved")).toBeInTheDocument();

		const reviewHeading = screen.getByRole("heading", { level: 2, name: "Entry review" });
		const reviewCard = reviewHeading.closest("[class*='border-primary/20']");
		expect(reviewCard).not.toBeNull();
	});

	it("renders empty time entries and messages states", () => {
		mockedUseTimeEntries.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseMessages.mockReturnValue({ data: undefined, isLoading: false } as never);

		render(<TimeEntriesPage />);
		render(<MessagesPage />);

		expect(screen.getByText("No time entries found")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Approve live attendance and staff clock-ins first, then return here to review hours.",
			),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Go to attendance" })).toHaveAttribute(
			"href",
			"/attendance",
		);
		expect(screen.getByText("No sent messages yet")).toBeInTheDocument();
		expect(
			screen.getByText("This page only lists messages after they have been sent."),
		).toBeInTheDocument();
		expect(screen.getByText("Review family contacts")).toBeInTheDocument();
	});

	it("navigates to message detail with router links", () => {
		mockedUseMessages.mockReturnValue({
			data: [
				{
					id: "message-1",
					subject: "Update",
					messageType: "announcement",
					createdAt: "2026-04-07T12:00:00Z",
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		const link = screen.getByTestId("router-link");
		expect(link).toHaveAttribute("data-to", "/messages/$id");
		expect(link).toHaveAttribute("data-params", JSON.stringify({ id: "message-1" }));
		expect(link).toHaveTextContent("Update");
	});

	it("renders recent inbound replies in the messages inbox", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "message-1",
						fromEmail: "mia@example.com",
						fromName: "Mia Jones",
						body: "We can bring the permission slip tomorrow.",
						receivedAt: "2026-05-19T12:00:00Z",
						readAt: null,
					},
					message: {
						id: "message-1",
						subject: "Field trip",
						messageType: "announcement",
						createdAt: "2026-05-18T12:00:00Z",
					},
					guardian: {
						id: "guardian-1",
						firstName: "Mia",
						lastName: "Jones",
						email: "mia@example.com",
					},
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		expect(screen.getByText("Inbox")).toBeInTheDocument();
		expect(screen.getByText("Mia Jones replied to Field trip")).toBeInTheDocument();
		expect(screen.getByText("We can bring the permission slip tomorrow.")).toBeInTheDocument();
	});

	it("renders the messages list and detail pages", () => {
		mockedUseMessages.mockReturnValue({
			data: [
				{
					id: "message-1",
					subject: "Update",
					messageType: "announcement",
					createdAt: "2026-04-07T12:00:00Z",
				},
			],
			isLoading: false,
		} as never);
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "message-1",
					subject: "Update",
					body: "Hello families",
					messageType: "announcement",
					createdAt: "2026-04-07T12:00:00Z",
				},
				recipients: [
					{
						messageRecipients: { id: "recipient-1", deliveredAt: "2026-04-07T12:01:00Z" },
						guardians: {
							id: "guardian-1",
							firstName: "Mia",
							lastName: "Jones",
							email: "mia@example.com",
						},
					},
				],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<MessagesPage />);
		expect(screen.getByText("Messages")).toBeInTheDocument();
		expect(screen.getByText("Update")).toBeInTheDocument();

		render(<MessageDetailPage messageId="message-1" />);
		expect(screen.getByText("Hello families")).toBeInTheDocument();
		expect(screen.getByText("mia@example.com")).toBeInTheDocument();
		expect(screen.getByText(/Delivered Apr/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry delivery" })).toBeDisabled();
	});

	it("renders pending delivery and handles redelivery actions", () => {
		const mutate = vi.fn();
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "message-1",
					subject: "Update",
					body: "Hello families",
					messageType: "announcement",
					createdAt: "2026-04-07T12:00:00Z",
				},
				recipients: [
					{
						messageRecipients: { id: "recipient-1" },
						guardians: { id: "guardian-1", firstName: "Mia", lastName: "Jones" },
					},
				],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate,
			isPending: false,
		} as never);

		render(<MessageDetailPage messageId="message-1" />);

		expect(screen.getByText("Pending delivery")).toBeInTheDocument();
		expect(screen.getByText("No email on file")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Retry delivery" }));
		expect(mutate).toHaveBeenCalled();
	});

	it("renders the route wrapper from the route param", () => {
		vi.spyOn(MessageDetailRouteConfig, "useParams").mockReturnValue({ id: "message-1" } as never);
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "message-1",
					subject: "Update",
					body: "Hello families",
					messageType: "announcement",
					createdAt: "2026-04-07T12:00:00Z",
				},
				recipients: [],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);

		render(<MessageDetailRoute />);

		expect(mockedUseMessage).toHaveBeenCalledWith("message-1");
	});

	it("uses the default scheduling copy when the auth session is missing", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(mockedUseShifts).toHaveBeenCalledWith(undefined);
		expect(
			screen.getByText("Review saved schedule templates and recurring staff shifts."),
		).toBeInTheDocument();
	});

	it("disables redelivery while pending and shows loading skeletons", () => {
		mockedUseMessage.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi.fn(),
			isPending: true,
		} as never);

		const { container } = render(<MessageDetailPage messageId="message-1" />);

		expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("renders message not found and loading states", () => {
		mockedUseMessage.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi.fn(),
			isPending: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseTimeEntries.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: true } as never);

		render(<SchedulingPage />);
		render(<TimeEntriesPage />);
		render(<MessagesPage />);
		render(<MessageDetailPage messageId="message-missing" />);

		expect(screen.getByText("Message not found.")).toBeInTheDocument();
	});

	it("renders loading skeletons for scheduling, messages, and time entries", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: true } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: true } as never);
		mockedUseTimeEntries.mockReturnValue({ data: [], isLoading: true } as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: true } as never);

		const { container: schedulingContainer } = render(<SchedulingPage />);
		const { container: timeEntriesContainer } = render(<TimeEntriesPage />);
		const { container: messagesContainer } = render(<MessagesPage />);

		expect(schedulingContainer.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
			0,
		);
		expect(timeEntriesContainer.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(
			0,
		);
		expect(messagesContainer.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("owner sees New schedule button, staff does not", () => {
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		const { unmount } = render(<SchedulingPage />);
		expect(screen.getByRole("button", { name: /new schedule/i })).toBeInTheDocument();
		unmount();

		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-2", name: "Bob Staff" },
				membership: { id: "membership-2", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		render(<SchedulingPage />);
		expect(screen.queryByRole("button", { name: /new schedule/i })).not.toBeInTheDocument();
	});

	it("clicking New schedule opens dialog with name, effectiveFrom, and effectiveUntil fields", async () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^effective from$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^effective until$/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /create schedule/i })).toBeInTheDocument();
	});

	it("submitting New schedule form calls useCreateSchedule mutate", () => {
		const mutate = vi.fn();
		mockedUseCreateSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Fall Plan" } });
		fireEvent.change(screen.getByLabelText(/^effective from$/i), {
			target: { value: "2026-09-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create schedule/i }));

		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({ name: "Fall Plan", effectiveFrom: "2026-09-01" }),
			expect.anything(),
		);
	});

	it("Create schedule button is disabled while isPending", () => {
		mockedUseCreateSchedule.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		expect(screen.getByRole("button", { name: /create schedule/i })).toBeDisabled();
	});

	it("each schedule row has Add shift and Delete buttons for owner", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [
				{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" },
				{ id: "schedule-2", name: "Summer plan", effectiveFrom: "2026-05-01T12:00:00Z" },
			],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(screen.getAllByRole("button", { name: /add shift/i })).toHaveLength(2);
		expect(screen.getAllByRole("button", { name: /delete/i })).toHaveLength(2);
	});

	it("each shift row has a Delete button for owner but no Add shift button", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					classroomId: "classroom-1",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
				{
					id: "shift-2",
					classroomId: "classroom-1",
					membershipId: "membership-2",
					dayOfWeek: 2,
					startTime: "09:00",
					endTime: "17:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.getAllByRole("button", { name: /delete/i })).toHaveLength(2);
		expect(screen.queryByRole("button", { name: /add shift/i })).not.toBeInTheDocument();
	});

	it("clicking schedule Delete calls useDeleteSchedule mutateAsync", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseDeleteSchedule.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
	});

	it("does not delete a schedule when the confirmation dialog is canceled", () => {
		const mutate = vi.fn();
		mockedUseDeleteSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));
		expect(screen.getByRole("alertdialog", { name: "Delete schedule" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("clicking shift Delete calls useDeleteShift mutateAsync", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseDeleteShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					classroomId: "classroom-1",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));
		fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());
	});

	it("does not delete a shift when the confirmation dialog is canceled", () => {
		const mutate = vi.fn();
		mockedUseDeleteShift.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					classroomId: "classroom-1",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /delete/i }));
		expect(screen.getByRole("alertdialog", { name: "Delete shift" })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(mutate).not.toHaveBeenCalled();
	});

	it("clicking Add shift opens dialog with staff, classroom, day, time fields", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: "Alice",
					userEmail: "alice@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		expect(screen.getByLabelText(/^staff member$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^classroom$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/day/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^start time$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^end time$/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /add shift/i })).toBeInTheDocument();
	});

	it("Add shift button is disabled while isPending", () => {
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getAllByRole("button", { name: /add shift/i })[0]);

		const submitBtn = screen
			.getAllByRole("button", { name: /add shift/i })
			.find((b) => b.closest("form"));
		expect(submitBtn).toBeDisabled();
	});

	it("director also sees New schedule, Add shift, and Delete buttons", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(screen.getByRole("button", { name: /new schedule/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /add shift/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
	});

	it("staff sees no New schedule, Add shift, or Delete buttons", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-2", name: "Bob Staff" },
				membership: { id: "membership-2", centerId: "center-1", role: "staff" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-1",
					classroomId: "classroom-1",
					membershipId: "membership-2",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.queryByRole("button", { name: /new schedule/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /add shift/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
	});

	it("New schedule form calls mutate with effectiveUntil when provided", () => {
		const mutate = vi.fn();
		mockedUseCreateSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Fall Plan" } });
		fireEvent.change(screen.getByLabelText(/^effective from$/i), {
			target: { value: "2026-09-01" },
		});
		fireEvent.change(screen.getByLabelText(/^effective until$/i), {
			target: { value: "2026-12-31" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create schedule/i }));

		expect(mutate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Fall Plan",
				effectiveFrom: "2026-09-01",
				effectiveUntil: "2026-12-31",
			}),
			expect.anything(),
		);
	});

	it("New schedule form closes dialog and resets on successful submission", () => {
		const mutate = vi.fn().mockImplementation((_input, options) => {
			options?.onSuccess?.();
		});
		mockedUseCreateSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Fall Plan" } });
		fireEvent.change(screen.getByLabelText(/^effective from$/i), {
			target: { value: "2026-09-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create schedule/i }));

		expect(mutate).toHaveBeenCalled();
		// After success the dialog should be closed, form fields gone
		expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
	});

	it("Add shift form partial submission does nothing when required fields missing", () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		// Only set time fields, leave selects empty — should not call mutate
		const startInput = screen.getByLabelText(/^start time$/i);
		const endInput = screen.getByLabelText(/^end time$/i);
		fireEvent.change(startInput, { target: { value: "08:00" } });
		fireEvent.change(endInput, { target: { value: "16:00" } });

		const submitBtn = screen.getByRole("button", { name: /^add shift$/i });
		fireEvent.click(submitBtn);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("Add shift form full submission calls createShift mutateAsync with all fields", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: "Alice",
					userEmail: "alice@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		// Wait for options to render (SelectItem useEffect)
		await screen.findByLabelText(/^staff member$/i);

		fireEvent.change(screen.getByLabelText(/^staff member$/i), {
			target: { value: "membership-1" },
		});
		fireEvent.change(screen.getByLabelText(/^classroom$/i), {
			target: { value: "classroom-1" },
		});
		fireEvent.change(screen.getByLabelText(/^day$/i), { target: { value: "1" } });
		fireEvent.change(screen.getByLabelText(/^start time$/i), { target: { value: "08:00" } });
		fireEvent.change(screen.getByLabelText(/^end time$/i), { target: { value: "16:00" } });

		fireEvent.click(screen.getByRole("button", { name: /^add shift$/i }));

		expect(mutateAsync).toHaveBeenCalledWith({
			scheduleId: "schedule-1",
			membershipId: "membership-1",
			classroomId: "classroom-1",
			dayOfWeek: 1,
			startTime: "08:00",
			endTime: "16:00",
		});
	});

	it("Add shift dialog closes and resets after successful submission", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: "Alice",
					userEmail: "alice@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		await screen.findByLabelText(/^staff member$/i);

		fireEvent.change(screen.getByLabelText(/^staff member$/i), {
			target: { value: "membership-1" },
		});
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });
		fireEvent.change(screen.getByLabelText(/^day$/i), { target: { value: "1" } });
		fireEvent.change(screen.getByLabelText(/^start time$/i), { target: { value: "08:00" } });
		fireEvent.change(screen.getByLabelText(/^end time$/i), { target: { value: "16:00" } });

		fireEvent.click(screen.getByRole("button", { name: /^add shift$/i }));

		await screen.findByRole("button", { name: /add shift/i });

		expect(mutateAsync).toHaveBeenCalled();
		// Dialog should be closed — the form's submit button (inside the dialog) is gone
		expect(screen.queryByLabelText(/staff member/i)).not.toBeInTheDocument();
	});

	it("New schedule submit does nothing when name is empty", () => {
		const mutate = vi.fn();
		mockedUseCreateSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		// Only set effectiveFrom, leave name empty
		fireEvent.change(screen.getByLabelText(/^effective from$/i), {
			target: { value: "2026-09-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create schedule/i }));

		expect(mutate).not.toHaveBeenCalled();
	});

	it("Add shift dialog stays open and shows error when createShift mutateAsync rejects", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("server error"));
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: "Alice",
					userEmail: "alice@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		await screen.findByLabelText(/^staff member$/i);

		fireEvent.change(screen.getByLabelText(/^staff member$/i), {
			target: { value: "membership-1" },
		});
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });
		fireEvent.change(screen.getByLabelText(/^day$/i), { target: { value: "1" } });
		fireEvent.change(screen.getByLabelText(/^start time$/i), { target: { value: "08:00" } });
		fireEvent.change(screen.getByLabelText(/^end time$/i), { target: { value: "16:00" } });

		fireEvent.click(screen.getByRole("button", { name: /^add shift$/i }));

		// Wait for the error message to appear (rejection handled + state updated)
		await screen.findByText("Failed to create shift. Please try again.");

		// Dialog must remain open — form fields still visible
		expect(screen.getByLabelText(/^staff member$/i)).toBeInTheDocument();
	});

	it("reopening the Add shift dialog after a failed submit shows no stale error", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("server error"));
		mockedUseCreateShift.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-1",
					centerId: "center-1",
					userId: "user-1",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: "Alice",
					userEmail: "alice@example.com",
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		// Open dialog, fill all fields, submit → server rejects → error appears
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));
		await screen.findByLabelText(/^staff member$/i);
		fireEvent.change(screen.getByLabelText(/^staff member$/i), {
			target: { value: "membership-1" },
		});
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });
		fireEvent.change(screen.getByLabelText(/^day$/i), { target: { value: "1" } });
		fireEvent.change(screen.getByLabelText(/^start time$/i), { target: { value: "08:00" } });
		fireEvent.change(screen.getByLabelText(/^end time$/i), { target: { value: "16:00" } });
		fireEvent.click(screen.getByRole("button", { name: /^add shift$/i }));
		await screen.findByText("Failed to create shift. Please try again.");

		// Close the dialog (simulates pressing Escape or clicking outside)
		// The Dialog's onOpenChange fires with false — use the Escape key via keyboard event
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", code: "Escape" });

		// Re-open the dialog
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));
		await screen.findByLabelText(/^staff member$/i);

		// Stale error must NOT be visible after re-open
		expect(screen.queryByText("Failed to create shift. Please try again.")).not.toBeInTheDocument();
	});

	it("archived classrooms are excluded from Add shift classroom options", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Active Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
				{
					id: "classroom-2",
					name: "Archived Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 8,
					archivedAt: "2026-01-01T00:00:00Z",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		expect(screen.getByText("Active Room")).toBeInTheDocument();
		expect(screen.queryByText("Archived Room")).not.toBeInTheDocument();
	});

	it("renders scheduling page when classrooms and members data is undefined", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseMembers.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(screen.getByText("Scheduling")).toBeInTheDocument();
	});

	it("member display falls back to userEmail then id when userName is absent", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [{ id: "schedule-1", name: "Spring plan", effectiveFrom: "2026-04-01T12:00:00Z" }],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMembers.mockReturnValue({
			data: [
				{
					id: "membership-email-only",
					centerId: "center-1",
					userId: "user-2",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: null,
					userEmail: "bob@example.com",
				},
				{
					id: "membership-id-only",
					centerId: "center-1",
					userId: "user-3",
					role: "staff",
					joinedAt: "2026-01-01T00:00:00Z",
					acceptedAt: null,
					invitedAt: null,
					userName: null,
					userEmail: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /add shift/i }));

		expect(screen.getByText("bob@example.com")).toBeInTheDocument();
		expect(screen.getByText("membership-id-only")).toBeInTheDocument();
	});

	it("schedule without effectiveUntil shows no 'to' date suffix", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({
			data: [
				{
					id: "schedule-no-until",
					name: "Open-ended plan",
					effectiveFrom: "2026-06-01T12:00:00Z",
					effectiveUntil: undefined,
				},
			],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);

		expect(screen.getByText("Open-ended plan")).toBeInTheDocument();
		expect(screen.getByText(/Effective Jun 1, 2026/)).toBeInTheDocument();
		expect(screen.queryByText(/Effective Jun 1, 2026 to/)).not.toBeInTheDocument();
	});

	it("shift with unknown classroomId falls back to raw classroomId string", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-known",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-unknown-classroom",
					classroomId: "classroom-orphan",
					membershipId: "membership-1",
					dayOfWeek: 1,
					startTime: "08:00",
					endTime: "16:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.getByText("classroom-orphan")).toBeInTheDocument();
	});

	it("shift with out-of-bounds dayOfWeek falls back to 'Day' label", () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "director" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({
			data: [
				{
					id: "shift-oob-day",
					classroomId: "classroom-1",
					membershipId: "membership-1",
					dayOfWeek: 99,
					startTime: "10:00",
					endTime: "18:00",
				},
			],
			isLoading: false,
		} as never);

		render(<SchedulingPage />);

		expect(screen.getByText(/Day 10:00 - 18:00/)).toBeInTheDocument();
	});

	it("Compose button renders on messages page", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);

		render(<MessagesPage />);

		expect(screen.getByRole("button", { name: /compose/i })).toBeInTheDocument();
	});

	it("clicking Compose opens dialog with subject, type, body, and recipientMode fields", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		expect(screen.getByLabelText(/^subject$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^type$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^send to$/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument();
	});

	it("selecting classroom mode shows classroom select", async () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		await screen.findByLabelText(/^classroom$/i);
		expect(screen.getByLabelText(/^classroom$/i)).toBeInTheDocument();
	});

	it("selecting guardian_ids mode shows guardian checkboxes", async () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: [
				{ id: "guardian-1", firstName: "Mia", lastName: "Jones", email: "mia@example.com" },
				{ id: "guardian-2", firstName: "Sam", lastName: "Lee", email: "sam@example.com" },
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "guardian_ids" } });

		await screen.findByText("Mia Jones");
		expect(screen.getByText("Mia Jones")).toBeInTheDocument();
		expect(screen.getByText("Sam Lee")).toBeInTheDocument();
	});

	it("submitting with classroom mode calls sendMessage.mutateAsync with correct payload", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Picnic Day" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "announcement" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), {
			target: { value: "Join us this Friday!" },
		});
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		await screen.findByLabelText(/^classroom$/i);
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		await screen.findByRole("button", { name: /compose/i });

		expect(mutateAsync).toHaveBeenCalledWith({
			subject: "Picnic Day",
			body: "Join us this Friday!",
			messageType: "announcement",
			recipientMode: "classroom",
			classroomId: "classroom-1",
		});
	});

	it("submitting with guardian_ids mode calls sendMessage.mutateAsync with correct payload", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "guardian-1", firstName: "Mia", lastName: "Jones", email: "mia@example.com" }],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Reminder" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "direct" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Please RSVP." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "guardian_ids" } });

		await screen.findByText("Mia Jones");
		fireEvent.click(screen.getByRole("checkbox", { name: /mia jones/i }));

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		await screen.findByRole("button", { name: /compose/i });

		expect(mutateAsync).toHaveBeenCalledWith({
			subject: "Reminder",
			body: "Please RSVP.",
			messageType: "direct",
			recipientMode: "guardian_ids",
			recipientGuardianIds: ["guardian-1"],
		});
	});

	it("compose dialog closes and form resets after successful submit", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Test" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "alert" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Alert body." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		await screen.findByLabelText(/^classroom$/i);
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		await screen.findByRole("button", { name: /compose/i });

		// Dialog should be closed — form fields gone
		expect(screen.queryByLabelText(/^subject$/i)).not.toBeInTheDocument();
	});

	it("Send message button is disabled while isPending", () => {
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: true,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		expect(screen.getByRole("button", { name: /send message/i })).toBeDisabled();
	});

	it("compose submit does nothing when required fields are missing", () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		// Only fill subject, leave the rest empty
		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Test" } });
		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("compose submit does nothing when classroom mode has no classroom selected", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "No Classroom" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "announcement" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Body text." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		// Classroom dropdown visible but not selected
		await screen.findByLabelText(/^classroom$/i);

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("compose submit does nothing when guardian_ids mode has no guardians selected", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "guardian-1", firstName: "Mia", lastName: "Jones", email: "mia@example.com" }],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "No Guardians" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "direct" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Body text." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "guardian_ids" } });

		// Guardian list visible but none checked
		await screen.findByText("Mia Jones");

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("classroom dropdown renders when classrooms data is undefined", async () => {
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		await screen.findByLabelText(/^classroom$/i);
		// No items in the classroom select but it renders without error
		expect(screen.getByLabelText(/^classroom$/i)).toBeInTheDocument();
	});

	it("guardian list renders when guardians data is undefined", async () => {
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "guardian_ids" } });

		// Guardians section renders without crashing even with undefined data — label is present
		await screen.findByText("Guardians");
	});

	it("unchecking a guardian removes them from the selection", async () => {
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn().mockResolvedValue({}),
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "guardian-1", firstName: "Mia", lastName: "Jones", email: "mia@example.com" }],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Toggle" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "direct" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Body." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "guardian_ids" } });

		await screen.findByText("Mia Jones");
		const checkbox = screen.getByRole("checkbox", { name: /mia jones/i });

		// Check then uncheck
		fireEvent.click(checkbox);
		expect(checkbox).toBeChecked();
		fireEvent.click(checkbox);
		expect(checkbox).not.toBeChecked();
	});

	it("compose dialog stays open if sendMessage throws", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("network error"));
		mockedUseSendMessage.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [
				{
					id: "classroom-1",
					name: "Sunshine Room",
					childCount: 0,
					staffCount: 0,
					maxCapacity: 12,
					archivedAt: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);
		fireEvent.click(screen.getByRole("button", { name: /compose/i }));

		fireEvent.change(screen.getByLabelText(/^subject$/i), { target: { value: "Retry Me" } });
		fireEvent.change(screen.getByLabelText(/^type$/i), { target: { value: "alert" } });
		fireEvent.change(screen.getByLabelText(/^message$/i), { target: { value: "Something." } });
		fireEvent.change(screen.getByLabelText(/^send to$/i), { target: { value: "classroom" } });

		await screen.findByLabelText(/^classroom$/i);
		fireEvent.change(screen.getByLabelText(/^classroom$/i), { target: { value: "classroom-1" } });

		fireEvent.click(screen.getByRole("button", { name: /send message/i }));

		// Wait for the rejected promise to settle
		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalled());

		// Dialog should still be open — subject field still visible
		expect(screen.getByLabelText(/^subject$/i)).toBeInTheDocument();
	});

	it("renders an Approve button only on pending time entries", () => {
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "entry-pending",
					date: "2026-04-07",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
				},
				{
					id: "entry-manual",
					date: "2026-04-08",
					hoursWorked: 7,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "manual",
				},
				{
					id: "entry-done",
					date: "2026-04-09",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "approved",
				},
			],
			isLoading: false,
		} as never);

		render(<TimeEntriesPage />);

		const approveButtons = screen.getAllByRole("button", { name: /^Approve time entry for/ });
		expect(approveButtons).toHaveLength(2);
		expect(screen.getByText("Pending review")).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 3, name: "Approved" })).toBeInTheDocument();
	});

	it("calls mutateAsync with the entry when Approve is clicked", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		const entry = {
			id: "entry-pending",
			date: "2026-04-07",
			hoursWorked: 8,
			hoursScheduled: 8,
			overtimeHours: 0,
			status: "auto",
		};
		mockedUseApproveTimeEntry.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseTimeEntries.mockReturnValue({
			data: [entry],
			isLoading: false,
		} as never);

		render(<TimeEntriesPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Approve time entry for/ }));

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(entry));
	});

	it("shows inline error and keeps new schedule dialog open when createSchedule fails", async () => {
		const mutate = vi.fn().mockImplementation((_input, options) => {
			options?.onError?.(new Error("Schedule already exists"));
		});
		mockedUseCreateSchedule.mockReturnValue({
			mutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseAuthSession.mockReturnValue({
			data: {
				user: { id: "user-1", name: "Jane Smith" },
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
				center: { id: "center-1", name: "Pebble Center", state: "TX" },
			},
			isLoading: false,
		} as never);
		mockedUseSchedules.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseShifts.mockReturnValue({ data: [], isLoading: false } as never);

		render(<SchedulingPage />);
		fireEvent.click(screen.getByRole("button", { name: /new schedule/i }));

		fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Fall Plan" } });
		fireEvent.change(screen.getByLabelText(/^effective from$/i), {
			target: { value: "2026-09-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: /create schedule/i }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Schedule already exists");
		});
		expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
	});

	it("surfaces the server error message when approval fails", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Entry already approved"));
		mockedUseApproveTimeEntry.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		mockedUseTimeEntries.mockReturnValue({
			data: [
				{
					id: "entry-pending",
					date: "2026-04-07",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
				},
			],
			isLoading: false,
		} as never);

		render(<TimeEntriesPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Approve time entry for/ }));

		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Entry already approved");
	});
});
