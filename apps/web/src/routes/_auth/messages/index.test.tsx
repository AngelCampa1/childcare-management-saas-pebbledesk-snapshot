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

vi.mock("@pebbledesk/ui/components/dialog", () => ({
	Dialog: ({
		children,
		open,
	}: {
		children: ReactNode;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	}) => <div data-open={String(open)}>{children}</div>,
	DialogTrigger: ({ children, asChild }: { children: ReactNode; asChild?: boolean }) =>
		asChild ? children : <div>{children}</div>,
	DialogContent: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
	DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../hooks/use-phase5", () => ({
	useMessageInbox: vi.fn(),
	useMessages: vi.fn(),
	useSendMessage: vi.fn(),
}));

vi.mock("../../../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("../../../hooks/use-guardians", () => ({
	useGuardians: vi.fn(),
}));

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value: string;
		onValueChange: (v: string) => void;
	}) => (
		<select value={value} onChange={(e) => onValueChange(e.target.value)}>
			{children}
		</select>
	),
	SelectTrigger: ({ id: _id, children: _children }: { id?: string; children?: ReactNode }) => (
		<option value="" disabled hidden>
			{/* _id is ignored since select is on parent */}
		</option>
	),
	SelectValue: ({ placeholder: _placeholder }: { placeholder?: string }) => null,
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
		<div>
			{title}
			{action}
		</div>
	),
}));

import { useAuthSession } from "../../../hooks/use-auth-session";
import { useClassrooms } from "../../../hooks/use-classrooms";
import { useGuardians } from "../../../hooks/use-guardians";
import { useMessageInbox, useMessages, useSendMessage } from "../../../hooks/use-phase5";
import { MessagesPage } from "./index";

const mockedUseMessageInbox = vi.mocked(useMessageInbox);
const mockedUseMessages = vi.mocked(useMessages);
const mockedUseSendMessage = vi.mocked(useSendMessage);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseGuardians = vi.mocked(useGuardians);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function setupDefaultHooks({
	messages = [],
	isLoading = false,
	inboxReplies = [],
	timezone,
}: {
	messages?: {
		id: string;
		subject: string;
		messageType: "announcement" | "direct" | "alert";
		createdAt: string;
	}[];
	isLoading?: boolean;
	inboxReplies?: unknown[];
	timezone?: string;
} = {}) {
	mockedUseMessages.mockReturnValue({ data: messages, isLoading } as never);
	mockedUseMessageInbox.mockReturnValue({ data: inboxReplies, isLoading: false } as never);
	mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseClassrooms.mockReturnValue({ data: [] } as never);
	mockedUseGuardians.mockReturnValue({ data: [] } as never);
	mockedUseAuthSession.mockReturnValue({
		data: timezone ? { center: { timezone } } : undefined,
	} as never);
}

describe("MessagesPage", () => {
	it("renders the Messages heading", () => {
		setupDefaultHooks();

		render(<MessagesPage />);

		expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeInTheDocument();
	});

	it("shows loading skeleton when messages are loading", () => {
		setupDefaultHooks({ isLoading: true });

		const { container } = render(<MessagesPage />);

		expect(container.firstChild).not.toBeNull();
		expect(screen.getByRole("heading", { name: /Messages/i })).toBeInTheDocument();
	});

	it("shows empty state when there are no messages", () => {
		setupDefaultHooks({ messages: [] });

		render(<MessagesPage />);

		expect(screen.getByText("No sent messages yet")).toBeInTheDocument();
	});

	it("renders message rows when messages exist", () => {
		setupDefaultHooks({
			messages: [
				{
					id: "msg-1",
					subject: "Hello parents",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
			] as never,
		});

		render(<MessagesPage />);

		expect(screen.getByText("Hello parents")).toBeInTheDocument();
	});

	it("renders sent-message timestamps in the center timezone, not the browser zone", () => {
		setupDefaultHooks({
			messages: [
				{
					id: "msg-1",
					subject: "Hello parents",
					messageType: "announcement",
					// 2026-04-11T02:00:00Z is Apr 10, 7:00 PM in America/Los_Angeles.
					createdAt: "2026-04-11T02:00:00.000Z",
				},
			] as never,
			timezone: "America/Los_Angeles",
		});

		render(<MessagesPage />);

		expect(screen.getByText(/Apr 10, 2026 7:00\s?PM/)).toBeInTheDocument();
	});

	it("renders the Compose button", () => {
		setupDefaultHooks();

		render(<MessagesPage />);

		expect(screen.getByRole("button", { name: /Compose/i })).toBeInTheDocument();
	});

	it("shows multiple messages in the list", () => {
		setupDefaultHooks({
			messages: [
				{
					id: "msg-1",
					subject: "First message",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				{
					id: "msg-2",
					subject: "Second message",
					messageType: "direct",
					createdAt: "2026-04-02T10:00:00.000Z",
				},
			],
		});

		render(<MessagesPage />);

		expect(screen.getByText("First message")).toBeInTheDocument();
		expect(screen.getByText("Second message")).toBeInTheDocument();
	});

	it("shows the description text", () => {
		setupDefaultHooks();

		render(<MessagesPage />);

		expect(screen.getByText(/Review sent messages and delivery status/)).toBeInTheDocument();
	});

	it("renders null data as empty list without crashing", () => {
		mockedUseMessages.mockReturnValue({ data: null, isLoading: false } as never);
		mockedUseMessageInbox.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({ data: [] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		expect(screen.getByText("No sent messages yet")).toBeInTheDocument();
	});

	it("renders message badge with correct type label", () => {
		setupDefaultHooks({
			messages: [
				{
					id: "msg-1",
					subject: "Alert message",
					messageType: "alert",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
			],
		});

		render(<MessagesPage />);

		expect(screen.getByText("alert")).toBeInTheDocument();
	});

	it("disables Send button when sendMessage is pending", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseMessageInbox.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: true } as never);
		mockedUseClassrooms.mockReturnValue({ data: [] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		// Open the compose dialog
		fireEvent.click(screen.getByRole("button", { name: /Compose/i }));

		const sendButton = screen.getByRole("button", { name: /Send message/i });
		expect(sendButton).toBeDisabled();
	});

	it("shows recent inbound replies in an inbox section", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "msg-1",
						fromEmail: "mia@example.com",
						fromName: "Mia Jones",
						body: "Can you resend the permission slip?",
						receivedAt: "2026-05-19T12:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-1",
						subject: "Field trip",
						messageType: "announcement",
						createdAt: "2026-05-18T12:00:00.000Z",
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
		expect(screen.getByText("Can you resend the permission slip?")).toBeInTheDocument();
	});

	it("falls back to reply email when an inbox reply has no guardian or sender name", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "msg-1",
						fromEmail: "mia@example.com",
						fromName: "",
						body: "We can bring extra wipes.",
						receivedAt: "2026-05-19T12:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-1",
						subject: "Supply reminder",
						messageType: "announcement",
						createdAt: "2026-05-18T12:00:00.000Z",
					},
					guardian: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		expect(screen.getByText("mia@example.com replied to Supply reminder")).toBeInTheDocument();
		expect(screen.getByText("We can bring extra wipes.")).toBeInTheDocument();
	});

	it("falls back to sender name when an inbox reply has no matched guardian", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "msg-1",
						fromEmail: "mia@example.com",
						fromName: "Mia Jones",
						body: "I updated our pickup list.",
						receivedAt: "2026-05-19T12:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-1",
						subject: "Pickup update",
						messageType: "direct",
						createdAt: "2026-05-18T12:00:00.000Z",
					},
					guardian: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		expect(screen.getByText("Mia Jones replied to Pickup update")).toBeInTheDocument();
	});

	it("shows validation until a classroom recipient is selected", () => {
		const mockMutateAsync = vi.fn();
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		fireEvent.change(screen.getByRole("textbox", { name: /^Subject$/i }), {
			target: { value: "Spring Trip" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: /^Message$/i }), {
			target: { value: "Join us!" },
		});
		const initialSelects = screen.getAllByRole("combobox");
		fireEvent.change(initialSelects[0], { target: { value: "classroom" } });
		fireEvent.change(initialSelects[1], { target: { value: "announcement" } });

		fireEvent.click(screen.getByRole("button", { name: /Send message/i }));
		expect(mockMutateAsync).not.toHaveBeenCalled();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Complete the message and choose recipients before sending.",
		);

		const updatedSelects = screen.getAllByRole("combobox");
		fireEvent.change(updatedSelects[1], { target: { value: "c-1" } });

		expect(screen.getByRole("button", { name: /Send message/i })).toBeEnabled();
	});

	it("shows validation until at least one guardian is selected", () => {
		const mockMutateAsync = vi.fn();
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({ data: [] } as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Jane", lastName: "Doe" }],
		} as never);

		render(<MessagesPage />);

		fireEvent.change(screen.getByRole("textbox", { name: /^Subject$/i }), {
			target: { value: "Spring Trip" },
		});
		fireEvent.change(screen.getByRole("textbox", { name: /^Message$/i }), {
			target: { value: "Join us!" },
		});
		const selects = screen.getAllByRole("combobox");
		fireEvent.change(selects[0], { target: { value: "guardian_ids" } });
		fireEvent.change(selects[1], { target: { value: "direct" } });

		fireEvent.click(screen.getByRole("button", { name: /Send message/i }));
		expect(mockMutateAsync).not.toHaveBeenCalled();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Complete the message and choose recipients before sending.",
		);

		fireEvent.click(screen.getByRole("checkbox", { name: "Jane Doe" }));

		expect(screen.getByRole("button", { name: /Send message/i })).toBeEnabled();
	});

	it("shows validation instead of silently ignoring an invalid submit", () => {
		const mockMutateAsync = vi.fn();
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({ data: [] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Send message/i }));

		expect(mockMutateAsync).not.toHaveBeenCalled();
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Complete the message and choose recipients before sending.",
		);
	});

	it("opens the compose dialog and shows form elements", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Jane", lastName: "Doe" }],
		} as never);

		render(<MessagesPage />);

		expect(screen.getByText("New message")).toBeInTheDocument();
		expect(screen.getByRole("textbox", { name: /^Subject$/i })).toBeInTheDocument();
	});

	it("shows classroom select when recipient mode is classroom", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		// The mocked Dialog renders children always, so form is in DOM.
		// The selects are rendered as <select> elements: Send to, Type.
		const allSelects = screen.getAllByRole("combobox");
		expect(allSelects.length).toBeGreaterThanOrEqual(2);
		// The "Send to" select is now first (index 0)
		const sendToSelect = allSelects[0];
		expect(sendToSelect).toBeInTheDocument();
		fireEvent.change(sendToSelect, { target: { value: "classroom" } });

		// After selecting "classroom", the Classroom dropdown label should appear
		expect(screen.getByText("Classroom")).toBeInTheDocument();
	});

	it("hides announcement/alert types and the guardians recipient mode for staff", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({ data: [{ id: "c-1", name: "Toddlers" }] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);
		mockedUseAuthSession.mockReturnValue({
			data: { center: { timezone: "UTC" }, membership: { id: "m-1", role: "staff" } },
		} as never);

		render(<MessagesPage />);

		// Staff may only send a "direct" message to "a classroom"; the API forbids the rest.
		expect(screen.getByRole("option", { name: "Direct" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "A classroom" })).toBeInTheDocument();
		expect(screen.queryByRole("option", { name: "Announcement" })).not.toBeInTheDocument();
		expect(screen.queryByRole("option", { name: "Alert" })).not.toBeInTheDocument();
		expect(screen.queryByRole("option", { name: "Selected guardians" })).not.toBeInTheDocument();
		// GET /api/guardians is Owner/Director only — staff must not fire it on mount.
		expect(mockedUseGuardians).toHaveBeenCalledWith(undefined, { enabled: false });
	});

	it("offers announcement/alert and the guardians recipient mode to non-staff", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({ data: [{ id: "c-1", name: "Toddlers" }] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);
		mockedUseAuthSession.mockReturnValue({
			data: { center: { timezone: "UTC" }, membership: { id: "m-1", role: "director" } },
		} as never);

		render(<MessagesPage />);

		expect(screen.getByRole("option", { name: "Announcement" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Alert" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Selected guardians" })).toBeInTheDocument();
		// Owner/Director may select guardian recipients, so the directory IS fetched.
		expect(mockedUseGuardians).toHaveBeenCalledWith(undefined, { enabled: true });
	});

	it("shows guardian checkboxes when recipient mode is guardian_ids", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({ data: [] } as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Jane", lastName: "Doe" }],
		} as never);

		render(<MessagesPage />);

		const allSelects = screen.getAllByRole("combobox");
		const sendToSelect = allSelects[0];
		fireEvent.change(sendToSelect, { target: { value: "guardian_ids" } });

		expect(screen.getByText("Jane Doe")).toBeInTheDocument();
	});

	it("renders with classrooms and guardians data available", () => {
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g-1", firstName: "Jane", lastName: "Doe" }],
		} as never);

		render(<MessagesPage />);

		expect(screen.getByText("No sent messages yet")).toBeInTheDocument();
	});

	it("submits the compose form and calls sendMessage.mutateAsync", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue({});
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		// Fill all required fields
		fireEvent.change(screen.getByRole("textbox", { name: /^Subject$/i }), {
			target: { value: "Spring Trip" },
		});
		const allSelects = screen.getAllByRole("combobox");
		// Send to (index 0), Type (index 1) before classroom appears
		fireEvent.change(allSelects[1], { target: { value: "announcement" } });
		// Body textarea
		fireEvent.change(screen.getByRole("textbox", { name: /^Message$/i }), {
			target: { value: "Join us!" },
		});
		// Send to → "classroom" causes Classroom select to appear
		fireEvent.change(allSelects[0], { target: { value: "classroom" } });
		// After classroom appears: Send to (0), Classroom (1), Type (2)
		const updatedSelects = screen.getAllByRole("combobox");
		fireEvent.change(updatedSelects[1], { target: { value: "c-1" } });

		// Submit
		fireEvent.submit(screen.getByRole("dialog").querySelector("form") as HTMLFormElement);

		expect(mockMutateAsync).toHaveBeenCalledTimes(1);
	});

	it("shows a next-step success state after sending a message", async () => {
		const mockMutateAsync = vi.fn().mockResolvedValue({});
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "c-1", name: "Toddlers" }],
		} as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		fireEvent.change(screen.getByRole("textbox", { name: /^Subject$/i }), {
			target: { value: "Spring Trip" },
		});
		const allSelects = screen.getAllByRole("combobox");
		fireEvent.change(allSelects[1], { target: { value: "announcement" } });
		fireEvent.change(screen.getByRole("textbox", { name: /^Message$/i }), {
			target: { value: "Join us!" },
		});
		fireEvent.change(allSelects[0], { target: { value: "classroom" } });
		const updatedSelects = screen.getAllByRole("combobox");
		fireEvent.change(updatedSelects[1], { target: { value: "c-1" } });

		fireEvent.submit(screen.getByRole("dialog").querySelector("form") as HTMLFormElement);

		expect(await screen.findByRole("status")).toHaveTextContent("Message sent");
		expect(screen.getByRole("link", { name: "Review sent messages" })).toHaveAttribute(
			"href",
			"#sent-messages",
		);
		expect(screen.queryByText("No sent messages yet")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Compose/i }));
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("shows To and Message section headers in the compose dialog", () => {
		setupDefaultHooks();
		render(<MessagesPage />);
		// Dialog mock always renders children, so these should be visible
		expect(screen.getByText("To")).toBeInTheDocument();
		expect(screen.getAllByText("Message").length).toBeGreaterThanOrEqual(1);
	});

	it("shows data-safe reassurance in the messages error state", () => {
		mockedUseMessages.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);
		render(<MessagesPage />);
		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByText("We couldn't load your messages")).toBeInTheDocument();
		expect(screen.getByText(/Your data is safe/i)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Refresh page/i })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Contact support/i })).toBeInTheDocument();
	});

	it("shows server error message when sendMessage.mutateAsync throws", async () => {
		const mockMutateAsync = vi
			.fn()
			.mockRejectedValue(new Error("Choose at least one recipient with an email address."));
		mockedUseMessages.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSendMessage.mockReturnValue({
			mutateAsync: mockMutateAsync,
			isPending: false,
		} as never);
		mockedUseClassrooms.mockReturnValue({ data: [{ id: "c-1", name: "Toddlers" }] } as never);
		mockedUseGuardians.mockReturnValue({ data: [] } as never);

		render(<MessagesPage />);

		fireEvent.change(screen.getByRole("textbox", { name: /^Subject$/i }), {
			target: { value: "Test" },
		});
		const allSelects = screen.getAllByRole("combobox");
		// Send to (0), Type (1) before classroom appears
		fireEvent.change(allSelects[1], { target: { value: "announcement" } });
		fireEvent.change(screen.getByRole("textbox", { name: /^Message$/i }), {
			target: { value: "Body" },
		});
		// Send to → "classroom" causes Classroom select to appear
		fireEvent.change(allSelects[0], { target: { value: "classroom" } });
		// After classroom appears: Send to (0), Classroom (1), Type (2)
		const updatedSelects = screen.getAllByRole("combobox");
		fireEvent.change(updatedSelects[1], { target: { value: "c-1" } });

		fireEvent.submit(screen.getByRole("dialog").querySelector("form") as HTMLFormElement);

		// Wait for error to appear
		await screen.findByRole("alert");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Choose at least one recipient with an email address.",
		);
	});

	it("shows an unread count badge on inbox threads with unread replies", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "msg-1",
						fromEmail: "parent@example.com",
						fromName: "Parent A",
						body: "Question about pickup.",
						receivedAt: "2026-05-20T10:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-1",
						subject: "Pickup info",
						messageType: "direct",
						createdAt: "2026-05-19T10:00:00.000Z",
					},
					guardian: null,
				},
				{
					reply: {
						id: "reply-2",
						messageId: "msg-1",
						fromEmail: "parent@example.com",
						fromName: "Parent A",
						body: "Follow-up question.",
						receivedAt: "2026-05-20T11:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-1",
						subject: "Pickup info",
						messageType: "direct",
						createdAt: "2026-05-19T10:00:00.000Z",
					},
					guardian: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		// 2 unread replies on the same thread → badge shows "2"
		expect(screen.getByText("2")).toBeInTheDocument();
	});

	it("does not show an unread badge when all replies have been read", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-1",
						messageId: "msg-1",
						fromEmail: "parent@example.com",
						fromName: "Parent A",
						body: "Thanks!",
						receivedAt: "2026-05-20T10:00:00.000Z",
						readAt: "2026-05-20T10:05:00.000Z",
					},
					message: {
						id: "msg-1",
						subject: "Reminder",
						messageType: "announcement",
						createdAt: "2026-05-19T10:00:00.000Z",
					},
					guardian: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		// Thread link should exist but no unread badge
		expect(screen.getByText("Parent A replied to Reminder")).toBeInTheDocument();
		expect(screen.queryByText("1")).not.toBeInTheDocument();
	});

	it("renders the inbox filter toggle buttons", () => {
		setupDefaultHooks();
		render(<MessagesPage />);

		expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Unread only" })).toBeInTheDocument();
	});

	it("inbox filter buttons use rounded-full (pill-button canon)", () => {
		setupDefaultHooks();
		render(<MessagesPage />);

		const allBtn = screen.getByRole("button", { name: "All" });
		const unreadBtn = screen.getByRole("button", { name: "Unread only" });

		expect(allBtn.className).toContain("rounded-full");
		expect(unreadBtn.className).toContain("rounded-full");
	});

	it("filters inbox to unread-only when Unread only is clicked", () => {
		setupDefaultHooks();
		mockedUseMessageInbox.mockReturnValue({
			data: [
				{
					reply: {
						id: "reply-read",
						messageId: "msg-read",
						fromEmail: "a@example.com",
						fromName: "A",
						body: "Already read.",
						receivedAt: "2026-05-20T10:00:00.000Z",
						readAt: "2026-05-20T10:05:00.000Z",
					},
					message: {
						id: "msg-read",
						subject: "Read thread",
						messageType: "announcement",
						createdAt: "2026-05-19T10:00:00.000Z",
					},
					guardian: null,
				},
				{
					reply: {
						id: "reply-unread",
						messageId: "msg-unread",
						fromEmail: "b@example.com",
						fromName: "B",
						body: "Not yet read.",
						receivedAt: "2026-05-20T12:00:00.000Z",
						readAt: null,
					},
					message: {
						id: "msg-unread",
						subject: "Unread thread",
						messageType: "direct",
						createdAt: "2026-05-19T10:00:00.000Z",
					},
					guardian: null,
				},
			],
			isLoading: false,
		} as never);

		render(<MessagesPage />);

		// Both threads visible initially
		expect(screen.getByText("A replied to Read thread")).toBeInTheDocument();
		expect(screen.getByText("B replied to Unread thread")).toBeInTheDocument();

		// Switch to "Unread only"
		fireEvent.click(screen.getByRole("button", { name: "Unread only" }));

		expect(screen.queryByText("A replied to Read thread")).not.toBeInTheDocument();
		expect(screen.getByText("B replied to Unread thread")).toBeInTheDocument();
	});

	it("inbox filter buttons expose aria-pressed for screen readers", () => {
		setupDefaultHooks();
		render(<MessagesPage />);

		const allBtn = screen.getByRole("button", { name: "All" });
		const unreadBtn = screen.getByRole("button", { name: "Unread only" });

		// Initial state: "All" is active, "Unread only" is not
		expect(allBtn).toHaveAttribute("aria-pressed", "true");
		expect(unreadBtn).toHaveAttribute("aria-pressed", "false");

		// Click "Unread only" — aria-pressed should flip
		fireEvent.click(unreadBtn);

		expect(allBtn).toHaveAttribute("aria-pressed", "false");
		expect(unreadBtn).toHaveAttribute("aria-pressed", "true");
	});

	it("formats message createdAt in the active center timezone", () => {
		// 2026-04-01T14:00Z → 10:00 AM in America/New_York (EDT, UTC-4).
		setupDefaultHooks({
			messages: [
				{
					id: "msg-tz",
					subject: "Timezone test",
					messageType: "announcement",
					createdAt: "2026-04-01T14:00:00.000Z",
				},
			] as never,
			timezone: "America/New_York",
		});

		render(<MessagesPage />);

		expect(screen.getByText("Apr 1, 2026 10:00 AM")).toBeInTheDocument();
	});
});
