/**
 * Analytics tests for MessageDetailPage.
 * Verifies that message_thread_opened fires once per opened thread.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/analytics", () => ({
	track: vi.fn(),
}));

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
import { track } from "../../../lib/analytics";
import { MessageDetailPage } from "./$id";

const mockedUseMessage = vi.mocked(useMessage);
const mockedUseRedeliverMessage = vi.mocked(useRedeliverMessage);
const mockedUseMarkMessageRepliesRead = vi.mocked(useMarkMessageRepliesRead);
const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedTrack = vi.mocked(track);

function setupDefaultMocks() {
	mockedUseAuthSession.mockReturnValue({ data: undefined } as never);
	mockedUseRedeliverMessage.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedUseMarkMessageRepliesRead.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
}

const LOADED_MESSAGE_DATA = {
	message: {
		id: "msg-1",
		subject: "Hello",
		body: "World.",
		messageType: "announcement",
		createdAt: "2026-04-01T10:00:00.000Z",
	},
	replies: [],
	recipients: [
		{
			messageRecipients: { id: "mr-1", deliveredAt: null },
			guardians: { firstName: "A", lastName: "B", email: "a@b.com" },
		},
		{
			messageRecipients: { id: "mr-2", deliveredAt: null },
			guardians: { firstName: "C", lastName: "D", email: "c@d.com" },
		},
	],
};

describe("MessageDetailPage — message_thread_opened analytics", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDefaultMocks();
	});

	it("fires track(messageThreadOpened) once with message_type and recipient_count when data is loaded", () => {
		mockedUseMessage.mockReturnValue({ data: LOADED_MESSAGE_DATA, isLoading: false } as never);

		render(<MessageDetailPage messageId="msg-1" />);

		expect(mockedTrack).toHaveBeenCalledWith("message_thread_opened", {
			message_type: "announcement",
			recipient_count: 2,
		});
		expect(mockedTrack).toHaveBeenCalledTimes(1);
	});

	it("does NOT fire track when data is not yet loaded (isLoading)", () => {
		mockedUseMessage.mockReturnValue({ data: undefined, isLoading: true } as never);

		render(<MessageDetailPage messageId="msg-1" />);

		expect(mockedTrack).not.toHaveBeenCalled();
	});

	it("does NOT fire track when data is null (not found)", () => {
		mockedUseMessage.mockReturnValue({ data: null, isLoading: false } as never);

		render(<MessageDetailPage messageId="msg-1" />);

		expect(mockedTrack).not.toHaveBeenCalled();
	});

	it("does not fire track again on re-render with same messageId", () => {
		mockedUseMessage.mockReturnValue({ data: LOADED_MESSAGE_DATA, isLoading: false } as never);

		const { rerender } = render(<MessageDetailPage messageId="msg-1" />);
		rerender(<MessageDetailPage messageId="msg-1" />);

		expect(mockedTrack).toHaveBeenCalledTimes(1);
	});
});
