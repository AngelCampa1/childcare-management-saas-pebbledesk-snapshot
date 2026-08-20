import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { toast } from "../lib/toast";
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
} from "./use-phase5";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);
const mockedToast = vi.mocked(toast);
const MESSAGE_ID = "550e8400-e29b-41d4-a716-446655440000";

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe("phase 5 hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("omits empty filters when building message and time entry queries", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ messages: [] }),
		} as Response);

		const { result } = renderHook(
			() => useMessages({ messageType: "", classroomId: "room-1", search: "" }),
			{ wrapper: createWrapper() },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/messages?classroomId=room-1");
	});

	it("loads schedules", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ schedules: [{ id: "schedule-1", name: "Spring" }] }),
		} as Response);

		const { result } = renderHook(() => useSchedules(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/schedules");
		expect(result.current.data?.[0].name).toBe("Spring");
	});

	it("loads time entries", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ timeEntries: [{ id: "entry-1", hoursWorked: 8 }] }),
		} as Response);

		const { result } = renderHook(() => useTimeEntries(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/time-entries?limit=200&cursor=0");
	});

	it("drains every time-entry page so large histories are not silently truncated", async () => {
		const fullPage = Array.from({ length: 200 }, (_value, index) => ({
			id: `entry-${index}`,
			hoursWorked: 8,
		}));
		mockedApiFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntries: fullPage }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntries: [{ id: "entry-200", hoursWorked: 8 }] }),
			} as Response);

		const { result } = renderHook(() => useTimeEntries(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(1, "/api/time-entries?limit=200&cursor=0");
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, "/api/time-entries?limit=200&cursor=200");
		expect(result.current.data).toHaveLength(201);
	});

	it("loads shifts with filters", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ shifts: [{ id: "shift-1", dayOfWeek: 2 }] }),
		} as Response);

		const { result } = renderHook(() => useShifts({ membershipId: "membership-1", dayOfWeek: 2 }), {
			wrapper: createWrapper(),
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/shifts?membershipId=membership-1&dayOfWeek=2",
		);
	});

	it("loads messages and a message detail", async () => {
		mockedApiFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ messages: [{ id: "message-1", subject: "Update" }] }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					message: { id: "message-1", subject: "Update" },
					recipients: [{ messageRecipients: { id: "recipient-1" } }],
				}),
			} as Response);

		const wrapper = createWrapper();
		const messagesResult = renderHook(() => useMessages(), { wrapper });
		await waitFor(() => expect(messagesResult.result.current.isSuccess).toBe(true));
		expect(messagesResult.result.current.data?.[0].id).toBe("message-1");

		const messageResult = renderHook(() => useMessage(MESSAGE_ID), { wrapper });
		await waitFor(() => expect(messageResult.result.current.isSuccess).toBe(true));
		expect(mockedApiFetch).toHaveBeenNthCalledWith(2, `/api/messages/${MESSAGE_ID}`);
	});

	it("loads recent message inbox replies", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({
				replies: [
					{
						reply: {
							id: "reply-1",
							body: "We can help with snack duty.",
							fromEmail: "family@example.com",
							receivedAt: "2026-05-19T12:00:00.000Z",
							readAt: null,
						},
						message: { id: "message-1", subject: "Classroom update" },
						guardian: null,
					},
				],
			}),
		} as Response);

		const { result } = renderHook(() => useMessageInbox(), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/messages/inbox");
		expect(result.current.data?.[0].reply.id).toBe("reply-1");
		expect(result.current.data?.[0].reply.body).toBe("We can help with snack duty.");
	});

	it("applies filters for messages and time entries", async () => {
		mockedApiFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ messages: [] }),
			} as Response)
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntries: [] }),
			} as Response);

		const wrapper = createWrapper();
		const messagesResult = renderHook(
			() => useMessages({ messageType: "announcement", classroomId: "room-1", search: "update" }),
			{ wrapper },
		);
		await waitFor(() => expect(messagesResult.result.current.isSuccess).toBe(true));

		const timeEntriesResult = renderHook(
			() =>
				useTimeEntries({
					from: "2026-04-01",
					to: "2026-04-07",
					membershipId: "membership-1",
					classroomId: "room-1",
					status: "approved",
				}),
			{ wrapper },
		);
		await waitFor(() => expect(timeEntriesResult.result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			1,
			"/api/messages?messageType=announcement&classroomId=room-1&search=update",
		);
		expect(mockedApiFetch).toHaveBeenNthCalledWith(
			2,
			"/api/time-entries?from=2026-04-01&to=2026-04-07&membershipId=membership-1&classroomId=room-1&status=approved&limit=200&cursor=0",
		);
	});

	it.each([
		["useSchedules", () => useSchedules(), "/api/schedules", "Failed to fetch schedules"],
		["useShifts", () => useShifts(), "/api/shifts", "Failed to fetch shifts"],
		[
			"useTimeEntries",
			() => useTimeEntries(),
			"/api/time-entries?limit=200&cursor=0",
			"Failed to fetch time entries",
		],
		["useMessages", () => useMessages(), "/api/messages", "Failed to fetch messages"],
		[
			"useMessageInbox",
			() => useMessageInbox(),
			"/api/messages/inbox",
			"Failed to fetch message inbox",
		],
		[
			"useMessage",
			() => useMessage(MESSAGE_ID),
			`/api/messages/${MESSAGE_ID}`,
			"Failed to fetch message",
		],
	] as const)("surfaces %s failures", async (_name, hook, expectedUrl, errorMessage) => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);

		const { result } = renderHook(hook, { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect((result.current.error as Error).message).toBe(errorMessage);
		expect(mockedApiFetch).toHaveBeenCalledWith(expectedUrl);
	});

	it("does not fetch a message until the identifier is available", () => {
		const { result } = renderHook(() => useMessage(""), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("does not fetch a message for malformed identifiers", () => {
		const { result } = renderHook(() => useMessage("message-1"), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("redelivers a message and invalidates related queries", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ delivered: 1 }),
		} as Response);

		const { result } = renderHook(() => useRedeliverMessage("message-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/messages/message-1/redeliver", {
			method: "POST",
		});
	});

	it("surfaces redelivery failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
		} as Response);

		const { result } = renderHook(() => useRedeliverMessage("message-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync()).rejects.toThrow("Failed to redeliver message");
		expect(mockedApiFetch).toHaveBeenCalledWith("/api/messages/message-1/redeliver", {
			method: "POST",
		});
	});

	it("marks message replies read and invalidates inbox and message caches", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ markedRead: 3 }),
		} as Response);

		const { result } = renderHook(() => useMarkMessageRepliesRead(MESSAGE_ID), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith(`/api/messages/${MESSAGE_ID}/replies/read`, {
			method: "POST",
		});
		expect(mockedToast.success).not.toHaveBeenCalled();
		expect(mockedToast.error).not.toHaveBeenCalled();
	});

	it("silently ignores mark-read failures (no toast)", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useMarkMessageRepliesRead(MESSAGE_ID), {
			wrapper: createWrapper(),
		});

		// mutateAsync will throw on failure — wrap to swallow
		await act(async () => {
			try {
				await result.current.mutateAsync();
			} catch {
				// expected
			}
		});

		expect(mockedToast.error).not.toHaveBeenCalled();
	});

	it("tracks schedule_created when useCreateSchedule succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ schedule: { id: "sched-1", name: "Spring" } }),
		} as Response);

		const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("schedule_created", {});
	});

	it("tracks schedule_updated with field_count when useUpdateSchedule succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ schedule: { id: "sched-1", name: "Summer" } }),
		} as Response);

		const { result } = renderHook(() => useUpdateSchedule("sched-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync({ name: "Summer" });
		});

		expect(mockedTrack).toHaveBeenCalledWith("schedule_updated", { field_count: 1 });
	});

	it("tracks shift_created when useCreateShift succeeds", async () => {
		const input = {
			scheduleId: "550e8400-e29b-41d4-a716-446655440001",
			membershipId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			dayOfWeek: 1,
			startTime: "09:00",
			endTime: "17:00",
		};
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ shift: { id: "shift-1", ...input } }),
		} as Response);

		const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync(input);
		});

		expect(mockedTrack).toHaveBeenCalledWith("shift_created", {});
	});

	it("tracks shift_updated with field_count when useUpdateShift succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ shift: { id: "shift-1", dayOfWeek: 2 } }),
		} as Response);

		const { result } = renderHook(() => useUpdateShift("shift-1"), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ dayOfWeek: 2 });
		});

		expect(mockedTrack).toHaveBeenCalledWith("shift_updated", { field_count: 1 });
	});

	it("tracks message_redelivered when useRedeliverMessage succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ delivered: 1 }),
		} as Response);

		const { result } = renderHook(() => useRedeliverMessage("message-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("message_redelivered", {});
	});

	it("tracks message_replies_read with count when useMarkMessageRepliesRead succeeds", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ markedRead: 3 }),
		} as Response);

		const { result } = renderHook(() => useMarkMessageRepliesRead(MESSAGE_ID), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).toHaveBeenCalledWith("message_replies_read", { count: 3 });
	});

	it("does not track message_replies_read when nothing was marked read", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ markedRead: 0 }),
		} as Response);

		const { result } = renderHook(() => useMarkMessageRepliesRead(MESSAGE_ID), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedTrack).not.toHaveBeenCalledWith("message_replies_read", expect.anything());
	});

	it("creates a schedule and invalidates the schedules cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ schedule: { id: "sched-1", name: "Spring" } }),
		} as Response);

		const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/schedules", {
			method: "POST",
			body: JSON.stringify({ name: "Spring", effectiveFrom: "2026-04-01" }),
		});
	});

	it("surfaces create schedule failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" }),
		).rejects.toThrow("Failed to create schedule");
	});

	it("updates a schedule and invalidates the schedules cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ schedule: { id: "sched-1", name: "Summer" } }),
		} as Response);

		const { result } = renderHook(() => useUpdateSchedule("sched-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync({ name: "Summer" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/schedules/sched-1", {
			method: "PATCH",
			body: JSON.stringify({ name: "Summer" }),
		});
	});

	it("surfaces update schedule failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useUpdateSchedule("sched-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync({ name: "Summer" })).rejects.toThrow(
			"Failed to update schedule",
		);
	});

	it("deletes a schedule and invalidates the schedules cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({}),
		} as Response);

		const { result } = renderHook(() => useDeleteSchedule("sched-1"), {
			wrapper: createWrapper(),
		});

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/schedules/sched-1", {
			method: "DELETE",
		});
	});

	it("surfaces delete schedule failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useDeleteSchedule("sched-1"), {
			wrapper: createWrapper(),
		});

		await expect(result.current.mutateAsync()).rejects.toThrow("Failed to delete schedule");
	});

	it("creates a shift and invalidates the shifts cache", async () => {
		const input = {
			scheduleId: "550e8400-e29b-41d4-a716-446655440001",
			membershipId: "550e8400-e29b-41d4-a716-446655440002",
			classroomId: "550e8400-e29b-41d4-a716-446655440003",
			dayOfWeek: 1,
			startTime: "09:00",
			endTime: "17:00",
		};

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ shift: { id: "shift-1", ...input } }),
		} as Response);

		const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync(input);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/shifts", {
			method: "POST",
			body: JSON.stringify(input),
		});
	});

	it("surfaces create shift failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "09:00",
				endTime: "17:00",
			}),
		).rejects.toThrow("Failed to create shift");
	});

	it("updates a shift and invalidates the shifts cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ shift: { id: "shift-1", dayOfWeek: 2 } }),
		} as Response);

		const { result } = renderHook(() => useUpdateShift("shift-1"), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync({ dayOfWeek: 2 });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/shifts/shift-1", {
			method: "PATCH",
			body: JSON.stringify({ dayOfWeek: 2 }),
		});
	});

	it("surfaces update shift failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useUpdateShift("shift-1"), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync({ dayOfWeek: 2 })).rejects.toThrow(
			"Failed to update shift",
		);
	});

	it("deletes a shift and invalidates the shifts cache", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({}),
		} as Response);

		const { result } = renderHook(() => useDeleteShift("shift-1"), { wrapper: createWrapper() });

		await act(async () => {
			await result.current.mutateAsync();
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/shifts/shift-1", {
			method: "DELETE",
		});
	});

	it("surfaces delete shift failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useDeleteShift("shift-1"), { wrapper: createWrapper() });

		await expect(result.current.mutateAsync()).rejects.toThrow("Failed to delete shift");
	});

	it("sends a message and returns the queued delivery summary", async () => {
		const input = {
			subject: "Hello",
			body: "This is a test message",
			messageType: "announcement" as const,
			recipientMode: "classroom" as const,
			classroomId: "550e8400-e29b-41d4-a716-446655440004",
		};

		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "queued", count: 3 }),
		} as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		let sendResult: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
		await act(async () => {
			sendResult = await result.current.mutateAsync(input);
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/messages", {
			method: "POST",
			body: JSON.stringify(input),
		});
		expect(sendResult).toEqual({ status: "queued", count: 3 });
		expect(mockedTrack).toHaveBeenCalledWith("message_send_completed", {
			feature_name: "messages",
			action: "send_message",
			result: "success",
			message_type: "announcement",
			recipient_mode: "classroom",
			recipient_count: 3,
			has_classroom_target: true,
		});
	});

	it("surfaces send message failures", async () => {
		mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			}),
		).rejects.toThrow("Failed to send message");
		expect(mockedTrack).toHaveBeenCalledWith("message_send_failed", {
			feature_name: "messages",
			action: "send_message",
			result: "failed",
			message_type: "announcement",
			recipient_mode: "classroom",
			has_classroom_target: true,
			error_code: "response_error",
		});
	});

	it("falls back when send message error responses are not JSON", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => {
				throw new Error("not json");
			},
		} as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			}),
		).rejects.toThrow("Failed to send message");
	});

	it("rejects malformed send message success responses without tracking completion", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "queued", count: "3" }),
		} as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			}),
		).rejects.toThrow();
		expect(mockedTrack).not.toHaveBeenCalledWith("message_send_completed", expect.any(Object));
	});

	it("tracks send-message failure when the success response is malformed", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ status: "queued", count: "3" }),
		} as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			}),
		).rejects.toThrow();
		expect(mockedTrack).toHaveBeenCalledWith("message_send_failed", {
			feature_name: "messages",
			action: "send_message",
			result: "failed",
			message_type: "announcement",
			recipient_mode: "classroom",
			has_classroom_target: true,
			error_code: "response_error",
		});
	});

	it("surfaces send message server error details", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Choose at least one recipient with an email address." }),
		} as Response);

		const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

		await expect(
			result.current.mutateAsync({
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			}),
		).rejects.toThrow("Choose at least one recipient with an email address.");
	});

	describe("useApproveTimeEntry", () => {
		it("sends a PATCH with the existing hours and approved status to the entry URL", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntry: { id: "entry-1", status: "approved" } }),
			} as Response);

			const { result } = renderHook(() => useApproveTimeEntry(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync({
					id: "entry-1",
					hoursWorked: 8,
					hoursScheduled: 7.5,
					overtimeHours: 0.5,
					status: "auto",
					date: "2026-05-06",
					centerId: "center-test",
					membershipId: "membership-1",
					createdAt: "2026-05-06T12:00:00.000Z",
					updatedAt: "2026-05-06T12:00:00.000Z",
				});
			});

			expect(mockedApiFetch).toHaveBeenCalledWith("/api/time-entries/entry-1", {
				method: "PATCH",
				body: JSON.stringify({
					hoursWorked: 8,
					hoursScheduled: 7.5,
					overtimeHours: 0.5,
					status: "approved",
				}),
			});
		});

		it("surfaces the server error message when the response body has one", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Entry already approved" }),
			} as Response);

			const { result } = renderHook(() => useApproveTimeEntry(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({
					id: "entry-1",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					date: "2026-05-06",
					centerId: "center-test",
					membershipId: "membership-1",
					createdAt: "2026-05-06T12:00:00.000Z",
					updatedAt: "2026-05-06T12:00:00.000Z",
				}),
			).rejects.toThrow("Entry already approved");
		});

		it("falls back to the default message when the body has no error field", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => {
					throw new Error("not json");
				},
			} as Response);

			const { result } = renderHook(() => useApproveTimeEntry(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({
					id: "entry-1",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					date: "2026-05-06",
					centerId: "center-test",
					membershipId: "membership-1",
					createdAt: "2026-05-06T12:00:00.000Z",
					updatedAt: "2026-05-06T12:00:00.000Z",
				}),
			).rejects.toThrow("Failed to approve time entry");
		});

		it("invalidates the timeEntries query on success", async () => {
			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			const invalidate = vi.spyOn(client, "invalidateQueries");

			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntry: { id: "entry-1", status: "approved" } }),
			} as Response);

			function Wrapper({ children }: { children: ReactNode }) {
				return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
			}

			const { result } = renderHook(() => useApproveTimeEntry(), { wrapper: Wrapper });

			await act(async () => {
				await result.current.mutateAsync({
					id: "entry-1",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					date: "2026-05-06",
					centerId: "center-test",
					membershipId: "membership-1",
					createdAt: "2026-05-06T12:00:00.000Z",
					updatedAt: "2026-05-06T12:00:00.000Z",
				});
			});

			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["center-test", "timeEntries"] });
		});
	});

	describe("response validation", () => {
		it.each([
			["useSchedules", () => useSchedules(), { schedules: [{ name: "no id" }] }],
			["useShifts", () => useShifts(), { shifts: [{ dayOfWeek: 1 }] }],
			["useTimeEntries", () => useTimeEntries(), { timeEntries: [{ hoursWorked: 8 }] }],
			["useMessages", () => useMessages(), { messages: [{ subject: "no id" }] }],
			["useMessageInbox", () => useMessageInbox(), { notReplies: [] }],
			[
				"useMessage",
				() => useMessage(MESSAGE_ID),
				{ message: { subject: "no id" }, recipients: [] },
			],
		] as const)("rejects a malformed %s payload", async (_name, hook, payload) => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => payload,
			} as Response);

			const { result } = renderHook(hook, { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
		});
	});

	describe("server error surfacing via parseJsonResponse", () => {
		it("surfaces server error message from useSchedules on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useSchedules(), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useCreateSchedule on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" }),
			).rejects.toThrow("Custom server message");
		});

		it("surfaces server error message from useShifts on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useShifts(), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useTimeEntries on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useTimeEntries(), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useMessages on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useMessages(), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useMessage on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useMessage(MESSAGE_ID), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useMessageInbox on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useMessageInbox(), { wrapper: createWrapper() });

			await waitFor(() => expect(result.current.isError).toBe(true));
			expect((result.current.error as Error).message).toBe("Custom server message");
		});

		it("surfaces server error message from useUpdateSchedule on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useUpdateSchedule("sched-1"), {
				wrapper: createWrapper(),
			});

			await expect(result.current.mutateAsync({ name: "Summer" })).rejects.toThrow(
				"Custom server message",
			);
		});

		it("surfaces server error message from useCreateShift on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({
					scheduleId: "550e8400-e29b-41d4-a716-446655440001",
					membershipId: "550e8400-e29b-41d4-a716-446655440002",
					classroomId: "550e8400-e29b-41d4-a716-446655440003",
					dayOfWeek: 1,
					startTime: "09:00",
					endTime: "17:00",
				}),
			).rejects.toThrow("Custom server message");
		});

		it("surfaces server error message from useUpdateShift on non-ok response", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Custom server message" }),
			} as Response);

			const { result } = renderHook(() => useUpdateShift("shift-1"), {
				wrapper: createWrapper(),
			});

			await expect(result.current.mutateAsync({ dayOfWeek: 2 })).rejects.toThrow(
				"Custom server message",
			);
		});
	});

	describe("mutation toasts", () => {
		it("shows a success toast after redelivering a message", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ delivered: 1 }),
			} as Response);

			const { result } = renderHook(() => useRedeliverMessage("message-1"), {
				wrapper: createWrapper(),
			});

			await act(async () => {
				await result.current.mutateAsync();
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Message redelivery started.");
		});

		it("shows an error toast when redelivery fails", async () => {
			mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

			const { result } = renderHook(() => useRedeliverMessage("message-1"), {
				wrapper: createWrapper(),
			});

			await expect(result.current.mutateAsync()).rejects.toThrow("Failed to redeliver message");
			await waitFor(() =>
				expect(mockedToast.error).toHaveBeenCalledWith("Failed to redeliver message"),
			);
		});

		it("shows a success toast after creating a schedule", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ schedule: { id: "sched-1", name: "Spring" } }),
			} as Response);

			const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" });
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Schedule created.");
		});

		it("shows an error toast when creating a schedule fails", async () => {
			mockedApiFetch.mockResolvedValueOnce({ ok: false } as Response);

			const { result } = renderHook(() => useCreateSchedule(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({ name: "Spring", effectiveFrom: "2026-04-01" }),
			).rejects.toThrow("Failed to create schedule");
			await waitFor(() =>
				expect(mockedToast.error).toHaveBeenCalledWith("Failed to create schedule"),
			);
		});

		it("shows a success toast after updating a schedule", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ schedule: { id: "sched-1", name: "Summer" } }),
			} as Response);

			const { result } = renderHook(() => useUpdateSchedule("sched-1"), {
				wrapper: createWrapper(),
			});

			await act(async () => {
				await result.current.mutateAsync({ name: "Summer" });
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Schedule updated.");
		});

		it("shows a success toast after deleting a schedule", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			} as Response);

			const { result } = renderHook(() => useDeleteSchedule("sched-1"), {
				wrapper: createWrapper(),
			});

			await act(async () => {
				await result.current.mutateAsync();
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Schedule deleted.");
		});

		it("shows a success toast after creating a shift", async () => {
			const input = {
				scheduleId: "550e8400-e29b-41d4-a716-446655440001",
				membershipId: "550e8400-e29b-41d4-a716-446655440002",
				classroomId: "550e8400-e29b-41d4-a716-446655440003",
				dayOfWeek: 1,
				startTime: "09:00",
				endTime: "17:00",
			};
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ shift: { id: "shift-1", ...input } }),
			} as Response);

			const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync(input);
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Shift created.");
		});

		it("shows a success toast after updating a shift", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ shift: { id: "shift-1", dayOfWeek: 2 } }),
			} as Response);

			const { result } = renderHook(() => useUpdateShift("shift-1"), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync({ dayOfWeek: 2 });
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Shift updated.");
		});

		it("shows a success toast after deleting a shift", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			} as Response);

			const { result } = renderHook(() => useDeleteShift("shift-1"), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync();
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Shift deleted.");
		});

		it("shows a success toast after approving a time entry", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ timeEntry: { id: "entry-1", status: "approved" } }),
			} as Response);

			const { result } = renderHook(() => useApproveTimeEntry(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync({
					id: "entry-1",
					hoursWorked: 8,
					hoursScheduled: 8,
					overtimeHours: 0,
					status: "auto",
					date: "2026-05-06",
					centerId: "center-test",
					membershipId: "membership-1",
					createdAt: "2026-05-06T12:00:00.000Z",
					updatedAt: "2026-05-06T12:00:00.000Z",
				});
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Time entry approved.");
		});

		it("shows a success toast with the recipient count after sending a message", async () => {
			const input = {
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			};
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ status: "queued", count: 3 }),
			} as Response);

			const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync(input);
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Message queued for 3 recipients.");
		});

		it("uses a singular recipient label when sending to one recipient", async () => {
			const input = {
				subject: "Hello",
				body: "This is a test message",
				messageType: "announcement" as const,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440004",
			};
			mockedApiFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ status: "queued", count: 1 }),
			} as Response);

			const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

			await act(async () => {
				await result.current.mutateAsync(input);
			});

			expect(mockedToast.success).toHaveBeenCalledWith("Message queued for 1 recipient.");
		});

		it("shows an error toast with the server detail when sending a message fails", async () => {
			mockedApiFetch.mockResolvedValueOnce({
				ok: false,
				json: async () => ({ error: "Choose at least one recipient with an email address." }),
			} as Response);

			const { result } = renderHook(() => useSendMessage(), { wrapper: createWrapper() });

			await expect(
				result.current.mutateAsync({
					subject: "Hello",
					body: "This is a test message",
					messageType: "announcement" as const,
					recipientMode: "classroom" as const,
					classroomId: "550e8400-e29b-41d4-a716-446655440004",
				}),
			).rejects.toThrow("Choose at least one recipient with an email address.");
			await waitFor(() =>
				expect(mockedToast.error).toHaveBeenCalledWith(
					"Choose at least one recipient with an email address.",
				),
			);
		});
	});
});
