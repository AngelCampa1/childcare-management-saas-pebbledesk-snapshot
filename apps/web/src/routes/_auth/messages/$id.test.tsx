import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../hooks/use-phase5", () => ({
	useMessage: vi.fn(),
	useMarkMessageRepliesRead: vi.fn(),
	useRedeliverMessage: vi.fn(),
}));

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

import { useAuthSession } from "../../../hooks/use-auth-session";
import {
	useMarkMessageRepliesRead,
	useMessage,
	useRedeliverMessage,
} from "../../../hooks/use-phase5";
import { MessageDetailPage } from "./$id";

const mockedUseMessage = vi.mocked(useMessage);
const mockedUseRedeliverMessage = vi.mocked(useRedeliverMessage);
const mockedUseMarkMessageRepliesRead = vi.mocked(useMarkMessageRepliesRead);
const mockedUseAuthSession = vi.mocked(useAuthSession);

function mockSessionTimezone(timezone: string | undefined): void {
	mockedUseAuthSession.mockReturnValue({
		data: timezone ? { center: { timezone } } : undefined,
	} as never);
}

function setupDefaultMocks() {
	mockedUseRedeliverMessage.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseMarkMessageRepliesRead.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockSessionTimezone(undefined);
}

describe("MessageDetailPage", () => {
	beforeEach(() => {
		mockSessionTimezone(undefined);
	});

	it("renders reply timestamps in the center timezone, not the browser zone", () => {
		mockSessionTimezone("America/Los_Angeles");
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Policy Update",
					body: "New policy details.",
					messageType: "direct",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				replies: [
					{
						messageReplies: {
							id: "reply-1",
							fromEmail: "jane@example.com",
							fromName: "Jane Doe",
							body: "Thanks.",
							// 2026-04-11T02:00:00Z is Apr 10, 7:00 PM in America/Los_Angeles.
							receivedAt: "2026-04-11T02:00:00.000Z",
							readAt: null,
						},
						guardians: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
					},
				],
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();
		mockSessionTimezone("America/Los_Angeles");

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getByText(/Apr 10, 2026 7:00\s?PM/)).toBeInTheDocument();
	});

	it("shows loading skeleton while loading", () => {
		mockedUseMessage.mockReturnValue({ data: undefined, isLoading: true } as never);
		setupDefaultMocks();

		const { container } = render(<MessageDetailPage messageId="msg-1" />);

		expect(container.firstChild).not.toBeNull();
		expect(screen.queryByText("Message not found.")).not.toBeInTheDocument();
	});

	it("shows 'Message not found.' when data is null", () => {
		mockedUseMessage.mockReturnValue({ data: null, isLoading: false } as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getByText("Message not found.")).toBeInTheDocument();
	});

	it("renders message subject and body when data is present", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Spring Field Trip",
					body: "Dear families, we are going on a field trip.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getByText("Spring Field Trip")).toBeInTheDocument();
		expect(screen.getByText("Dear families, we are going on a field trip.")).toBeInTheDocument();
	});

	it("constrains long message bodies to a scrollable region", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Long Update",
					body: "Line one\n".repeat(80),
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		const bodyRegion = screen.getByLabelText("Message body content");
		expect(bodyRegion).toHaveClass("max-h-96");
		expect(bodyRegion).toHaveClass("overflow-y-auto");
	});

	it("renders recipient list with delivery status", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Policy Update",
					body: "New policy details here.",
					messageType: "direct",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				replies: [
					{
						messageReplies: {
							id: "reply-1",
							fromEmail: "jane.doe@example.com",
							fromName: "Jane Doe",
							body: "Thanks for the update.",
							receivedAt: "2026-04-01T12:00:00.000Z",
							readAt: null,
						},
						guardians: {
							firstName: "Jane",
							lastName: "Doe",
							email: "jane.doe@example.com",
						},
					},
				],
				recipients: [
					{
						messageRecipients: {
							id: "mr-1",
							deliveredAt: "2026-04-01T11:00:00.000Z",
						},
						guardians: {
							firstName: "Jane",
							lastName: "Doe",
							email: "jane.doe@example.com",
						},
					},
					{
						messageRecipients: {
							id: "mr-2",
							deliveredAt: null,
						},
						guardians: {
							firstName: "John",
							lastName: "Smith",
							email: null,
						},
					},
				],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getAllByText("Jane Doe")).toHaveLength(2);
		expect(screen.getAllByText("jane.doe@example.com")).toHaveLength(2);
		expect(screen.getByText("John Smith")).toBeInTheDocument();
		expect(screen.getByText("No email on file")).toBeInTheDocument();
		expect(screen.getByText(/Pending delivery/)).toBeInTheDocument();
		expect(screen.getByText("Inbox replies")).toBeInTheDocument();
		expect(screen.getByText("Thanks for the update.")).toBeInTheDocument();
	});

	it("falls back to sender metadata for replies without a matched guardian", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Policy Update",
					body: "New policy details here.",
					messageType: "direct",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				replies: [
					{
						messageReplies: {
							id: "reply-1",
							fromEmail: "family@example.com",
							fromName: "",
							body: "Thanks for the note.",
							receivedAt: "2026-04-01T12:00:00.000Z",
							readAt: null,
						},
						guardians: null,
					},
					{
						messageReplies: {
							id: "reply-2",
							fromEmail: "mia@example.com",
							fromName: "Mia Jones",
							body: "We can attend.",
							receivedAt: "2026-04-01T12:30:00.000Z",
							readAt: null,
						},
						guardians: null,
					},
				],
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getAllByText("family@example.com")).toHaveLength(2);
		expect(screen.getByText("Mia Jones")).toBeInTheDocument();
		expect(screen.getByText("Thanks for the note.")).toBeInTheDocument();
	});

	it("shows delivery health summary on the detail page", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Policy Update",
					body: "New policy details here.",
					messageType: "direct",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: {
							id: "mr-1",
							deliveredAt: "2026-04-01T11:00:00.000Z",
						},
						guardians: { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
					},
					{
						messageRecipients: { id: "mr-2", deliveredAt: null },
						guardians: { firstName: "John", lastName: "Smith", email: "john@example.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		expect(screen.getByText("Delivery health")).toBeInTheDocument();
		expect(screen.getByText("1 of 2 delivered")).toBeInTheDocument();
		expect(screen.getByText("1 needs retry")).toBeInTheDocument();
	});

	it("enables Retry delivery button when there are undelivered recipients", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Alert",
					body: "Alert body.",
					messageType: "alert",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: { id: "mr-1", deliveredAt: null },
						guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		const retryButton = screen.getByRole("button", { name: /Retry delivery/i });
		expect(retryButton).not.toBeDisabled();
	});

	it("disables Retry delivery button when all recipients are delivered", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Alert",
					body: "Alert body.",
					messageType: "alert",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: { id: "mr-1", deliveredAt: "2026-04-01T11:00:00.000Z" },
						guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();

		render(<MessageDetailPage messageId="msg-1" />);

		const retryButton = screen.getByRole("button", { name: /Retry delivery/i });
		expect(retryButton).toBeDisabled();
	});

	it("shows 'Queued for delivery' feedback after successful retry", async () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Test",
					body: "Body.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: { id: "mr-1", deliveredAt: null },
						guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi
				.fn()
				.mockImplementation((_arg: unknown, callbacks?: { onSuccess?: () => void }) => {
					callbacks?.onSuccess?.();
				}),
			isPending: false,
		} as never);

		render(<MessageDetailPage messageId="msg-1" />);
		fireEvent.click(screen.getByRole("button", { name: /retry delivery/i }));

		expect(await screen.findByText("Queued for delivery")).toBeInTheDocument();
	});

	it("shows 'Delivery failed' feedback after failed retry", async () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Test",
					body: "Body.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: { id: "mr-1", deliveredAt: null },
						guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({
			mutate: vi.fn().mockImplementation((_arg: unknown, callbacks?: { onError?: () => void }) => {
				callbacks?.onError?.();
			}),
			isPending: false,
		} as never);

		render(<MessageDetailPage messageId="msg-1" />);
		fireEvent.click(screen.getByRole("button", { name: /retry delivery/i }));

		expect(await screen.findByText("Delivery failed")).toBeInTheDocument();
	});

	it("disables Retry delivery when redeliver is pending", () => {
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Test",
					body: "Body.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				recipients: [
					{
						messageRecipients: { id: "mr-1", deliveredAt: null },
						guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		mockedUseRedeliverMessage.mockReturnValue({ mutate: vi.fn(), isPending: true } as never);

		render(<MessageDetailPage messageId="msg-1" />);

		const retryButton = screen.getByRole("button", { name: /Retry delivery/i });
		expect(retryButton).toBeDisabled();
	});

	it("fires mark-read mutation once when thread has unread replies", () => {
		const markReadMutate = vi.fn();
		mockedUseMarkMessageRepliesRead.mockReturnValue({
			mutate: markReadMutate,
			isPending: false,
		} as never);
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Update",
					body: "Body.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				replies: [
					{
						messageReplies: {
							id: "reply-1",
							fromEmail: "a@b.com",
							fromName: null,
							body: "Got it.",
							receivedAt: "2026-04-01T11:00:00.000Z",
							readAt: null,
						},
						guardians: null,
					},
				],
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();
		mockedUseMarkMessageRepliesRead.mockReturnValue({
			mutate: markReadMutate,
			isPending: false,
		} as never);

		render(<MessageDetailPage messageId="msg-1" />);

		expect(markReadMutate).toHaveBeenCalledTimes(1);
	});

	it("does NOT fire mark-read mutation when all replies are already read", () => {
		const markReadMutate = vi.fn();
		mockedUseMarkMessageRepliesRead.mockReturnValue({
			mutate: markReadMutate,
			isPending: false,
		} as never);
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-1",
					subject: "Update",
					body: "Body.",
					messageType: "announcement",
					createdAt: "2026-04-01T10:00:00.000Z",
				},
				replies: [
					{
						messageReplies: {
							id: "reply-1",
							fromEmail: "a@b.com",
							fromName: null,
							body: "Got it.",
							receivedAt: "2026-04-01T11:00:00.000Z",
							readAt: "2026-04-01T12:00:00.000Z",
						},
						guardians: null,
					},
				],
				recipients: [],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();
		mockedUseMarkMessageRepliesRead.mockReturnValue({
			mutate: markReadMutate,
			isPending: false,
		} as never);

		render(<MessageDetailPage messageId="msg-1" />);

		expect(markReadMutate).not.toHaveBeenCalled();
	});

	it("formats recipient deliveredAt in the active center timezone", () => {
		// 2026-04-01T14:00Z → 10:00 AM in America/New_York (EDT, UTC-4).
		mockedUseMessage.mockReturnValue({
			data: {
				message: {
					id: "msg-tz",
					subject: "Timezone test",
					body: "body",
					messageType: "announcement",
					createdAt: "2026-04-01T13:30:00.000Z",
				},
				recipients: [
					{
						messageRecipients: {
							id: "mr-tz",
							deliveredAt: "2026-04-01T14:00:00.000Z",
						},
						guardians: { firstName: "Pat", lastName: "Doe", email: "p@d.com" },
					},
				],
			},
			isLoading: false,
		} as never);
		setupDefaultMocks();
		mockSessionTimezone("America/New_York");

		render(<MessageDetailPage messageId="msg-tz" />);

		expect(screen.getByText(/Delivered Apr 1, 2026 10:00 AM/)).toBeInTheDocument();
	});
});
