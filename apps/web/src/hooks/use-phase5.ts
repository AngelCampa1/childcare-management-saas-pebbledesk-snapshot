import type {
	CreateMessageInput,
	CreateScheduleInput,
	CreateShiftInput,
	Message,
	Schedule,
	Shift,
	TimeEntry,
	UpdateScheduleInput,
	UpdateShiftInput,
} from "@pebbledesk/shared";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { isUuid } from "../lib/is-uuid";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

/**
 * Permissive response schemas for the phase 5 endpoints. Each validates only
 * the fields the UI relies on (an `id` on every record); unknown fields pass
 * through so backend additions don't break the client.
 */
const SchedulesResponseSchema = z
	.object({ schedules: z.array(z.object({ id: z.string() }).passthrough()) })
	.passthrough();

const ShiftsResponseSchema = z
	.object({ shifts: z.array(z.object({ id: z.string() }).passthrough()) })
	.passthrough();

const TimeEntriesResponseSchema = z
	.object({ timeEntries: z.array(z.object({ id: z.string() }).passthrough()) })
	.passthrough();

const MessagesResponseSchema = z
	.object({ messages: z.array(z.object({ id: z.string() }).passthrough()) })
	.passthrough();

const MessageDetailResponseSchema = z
	.object({ message: z.object({ id: z.string() }).passthrough() })
	.passthrough();

const MessageInboxResponseSchema = z
	.object({ replies: z.array(z.object({}).passthrough()) })
	.passthrough();

const SendMessageResponseSchema = z.object({
	status: z.literal("queued"),
	count: z.number(),
});

const CreateScheduleResponseSchema = z
	.object({ schedule: z.object({ id: z.string() }).passthrough() })
	.passthrough();

const UpdateScheduleResponseSchema = z
	.object({ schedule: z.object({ id: z.string() }).passthrough() })
	.passthrough();

const CreateShiftResponseSchema = z
	.object({ shift: z.object({ id: z.string() }).passthrough() })
	.passthrough();

const UpdateShiftResponseSchema = z
	.object({ shift: z.object({ id: z.string() }).passthrough() })
	.passthrough();

interface MessageDetailResponse {
	message: Message;
	replies: MessageReplyThreadItem[];
	recipients: Array<{
		messageRecipients: {
			id: string;
			deliveredAt?: string;
			readAt?: string;
		};
		guardians: {
			id: string;
			firstName: string;
			lastName: string;
			email?: string;
		};
	}>;
}

interface MessageReply {
	id: string;
	messageId: string;
	guardianId?: string | null;
	fromEmail: string;
	fromName?: string | null;
	body: string;
	receivedAt: string;
	readAt?: string | null;
}

interface MessageReplyThreadItem {
	messageReplies: MessageReply;
	guardians: {
		id: string;
		firstName: string;
		lastName: string;
		email?: string | null;
	} | null;
}

interface MessageInboxItem {
	reply: MessageReply;
	message: Message;
	guardian: {
		id: string;
		firstName: string;
		lastName: string;
		email?: string | null;
	} | null;
}

interface SendMessageResult {
	status: "queued";
	count: number;
}

interface ShiftFilters {
	scheduleId?: string;
	membershipId?: string;
	classroomId?: string;
	dayOfWeek?: number;
}

interface TimeEntryFilters {
	from?: string;
	to?: string;
	membershipId?: string;
	classroomId?: string;
	status?: string;
}

interface MessageFilters {
	messageType?: string;
	classroomId?: string;
	search?: string;
}

function getMessageAnalyticsProperties(input: CreateMessageInput) {
	return {
		feature_name: "messages",
		action: "send_message",
		message_type: input.messageType,
		recipient_mode: input.recipientMode,
		has_classroom_target: input.recipientMode === "classroom",
	};
}

function buildQuery(filters: Record<string, string | number | undefined>) {
	const params = new URLSearchParams();

	for (const [key, value] of Object.entries(filters)) {
		if (value !== undefined && value !== "") {
			params.set(key, String(value));
		}
	}

	const query = params.toString();
	return query ? `?${query}` : "";
}

export function useSchedules() {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "schedules"],
		queryFn: async () => {
			const res = await apiFetch("/api/schedules");
			const data = await parseJsonResponse(
				res,
				SchedulesResponseSchema,
				"Failed to fetch schedules",
			);
			return data.schedules as unknown as Schedule[];
		},
	});
}

export function useShifts(filters?: ShiftFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "shifts", filters],
		queryFn: async () => {
			const res = await apiFetch(
				`/api/shifts${buildQuery({
					scheduleId: filters?.scheduleId,
					membershipId: filters?.membershipId,
					classroomId: filters?.classroomId,
					dayOfWeek: filters?.dayOfWeek,
				})}`,
			);
			const data = await parseJsonResponse(res, ShiftsResponseSchema, "Failed to fetch shifts");
			return data.shifts as unknown as Shift[];
		},
	});
}

export function useTimeEntries(filters?: TimeEntryFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "timeEntries", filters],
		queryFn: async () => {
			// Time entries are transactional records that grow without bound (one row
			// per staff shift, accumulating indefinitely), and the backend caps every
			// page at PAGE_MAX=200 defaulting to just 50 (apps/api/src/lib/pagination.ts).
			// A single un-paginated GET would silently drop every entry past the first
			// page, so we drain all pages here — mirroring useSubsidyClaims.
			const PAGE_SIZE = 200;
			const allEntries: TimeEntry[] = [];
			let cursor = 0;

			for (;;) {
				const res = await apiFetch(
					`/api/time-entries${buildQuery({
						from: filters?.from,
						to: filters?.to,
						membershipId: filters?.membershipId,
						classroomId: filters?.classroomId,
						status: filters?.status,
						limit: PAGE_SIZE,
						cursor,
					})}`,
				);
				const data = await parseJsonResponse(
					res,
					TimeEntriesResponseSchema,
					"Failed to fetch time entries",
				);
				const page = data.timeEntries as unknown as TimeEntry[];
				allEntries.push(...page);
				if (page.length < PAGE_SIZE) break;
				cursor += PAGE_SIZE;
			}

			return allEntries;
		},
	});
}

export function useMessages(filters?: MessageFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "messages", filters],
		queryFn: async () => {
			const res = await apiFetch(
				`/api/messages${buildQuery({
					messageType: filters?.messageType,
					classroomId: filters?.classroomId,
					search: filters?.search,
				})}`,
			);
			const data = await parseJsonResponse(res, MessagesResponseSchema, "Failed to fetch messages");
			return data.messages as unknown as Message[];
		},
	});
}

export function useMessage(messageId: string) {
	const activeCenterId = useActiveCenterId();
	const validMessageId = isUuid(messageId) ? messageId : "";

	return useQuery({
		queryKey: [activeCenterId, "message", validMessageId],
		enabled: validMessageId.length > 0,
		queryFn: async () => {
			const res = await apiFetch(`/api/messages/${validMessageId}`);
			const raw = await parseJsonResponse(
				res,
				MessageDetailResponseSchema,
				"Failed to fetch message",
			);
			return raw as unknown as MessageDetailResponse;
		},
	});
}

export function useMessageInbox() {
	const activeCenterId = useActiveCenterId();

	return useQuery({
		queryKey: [activeCenterId, "messages", "inbox"],
		queryFn: async () => {
			const res = await apiFetch("/api/messages/inbox");
			const data = await parseJsonResponse(
				res,
				MessageInboxResponseSchema,
				"Failed to fetch message inbox",
			);
			return data.replies as unknown as MessageInboxItem[];
		},
	});
}

const MarkRepliesReadResponseSchema = z.object({ markedRead: z.number() }).passthrough();

export function useMarkMessageRepliesRead(messageId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/messages/${messageId}/replies/read`, {
				method: "POST",
			});
			if (!res.ok) throw new Error("Failed to mark replies read");
			const raw: unknown = await res.json();
			return MarkRepliesReadResponseSchema.parse(raw);
		},
		onSuccess: (data) => {
			if (data.markedRead > 0) {
				track(ANALYTICS_EVENTS.messageRepliesRead, { count: data.markedRead });
			}
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "messages", "inbox"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "message", messageId] });
		},
	});
}

export function useRedeliverMessage(messageId: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/messages/${messageId}/redeliver`, {
				method: "POST",
			});
			if (!res.ok) throw new Error("Failed to redeliver message");
			return res.json();
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.messageRedelivered, {});
			toast.success("Message redelivery started.");
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "message", messageId] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "messages"] });
		},
	});
}

export function useCreateSchedule() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateScheduleInput) => {
			const res = await apiFetch("/api/schedules", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				CreateScheduleResponseSchema,
				"Failed to create schedule",
			);
			return data.schedule as unknown as Schedule;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.scheduleCreated, {});
			toast.success("Schedule created.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "schedules"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateSchedule(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: UpdateScheduleInput) => {
			const res = await apiFetch(`/api/schedules/${id}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				UpdateScheduleResponseSchema,
				"Failed to update schedule",
			);
			return data.schedule as unknown as Schedule;
		},
		onSuccess: (_data, input) => {
			track(ANALYTICS_EVENTS.scheduleUpdated, { field_count: Object.keys(input).length });
			toast.success("Schedule updated.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "schedules"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "schedules", id] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useDeleteSchedule(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/schedules/${id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete schedule");
		},
		onSuccess: () => {
			toast.success("Schedule deleted.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "schedules"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useCreateShift() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateShiftInput) => {
			const res = await apiFetch("/api/shifts", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				CreateShiftResponseSchema,
				"Failed to create shift",
			);
			return data.shift as unknown as Shift;
		},
		onSuccess: () => {
			track(ANALYTICS_EVENTS.shiftCreated, {});
			toast.success("Shift created.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "shifts"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useUpdateShift(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: UpdateShiftInput) => {
			const res = await apiFetch(`/api/shifts/${id}`, {
				method: "PATCH",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				UpdateShiftResponseSchema,
				"Failed to update shift",
			);
			return data.shift as unknown as Shift;
		},
		onSuccess: (_data, input) => {
			track(ANALYTICS_EVENTS.shiftUpdated, { field_count: Object.keys(input).length });
			toast.success("Shift updated.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "shifts"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "shifts", id] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useDeleteShift(id: string) {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async () => {
			const res = await apiFetch(`/api/shifts/${id}`, {
				method: "DELETE",
			});
			if (!res.ok) throw new Error("Failed to delete shift");
		},
		onSuccess: () => {
			toast.success("Shift deleted.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "shifts"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useApproveTimeEntry() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (entry: TimeEntry) => {
			const res = await apiFetch(`/api/time-entries/${entry.id}`, {
				method: "PATCH",
				body: JSON.stringify({
					hoursWorked: entry.hoursWorked,
					hoursScheduled: entry.hoursScheduled,
					overtimeHours: entry.overtimeHours,
					status: "approved",
				}),
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				throw new Error(body?.error ?? "Failed to approve time entry");
			}
			const data: { timeEntry: TimeEntry } = await res.json();
			return data.timeEntry;
		},
		onSuccess: () => {
			toast.success("Time entry approved.");
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "timeEntries"] });
		},
		onError: (error) => {
			toast.error(extractErrorMessage(error));
		},
	});
}

export function useSendMessage() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CreateMessageInput) => {
			const res = await apiFetch("/api/messages", {
				method: "POST",
				body: JSON.stringify(input),
			});
			if (!res.ok) {
				const body =
					typeof res.json === "function"
						? ((await res.json().catch(() => null)) as { error?: string } | null)
						: null;
				throw new Error(body?.error ?? "Failed to send message");
			}
			return (await parseJsonResponse(
				res,
				SendMessageResponseSchema,
				"Failed to send message",
			)) as SendMessageResult;
		},
		onSuccess: (data, input) => {
			track(ANALYTICS_EVENTS.messageSendCompleted, {
				...getMessageAnalyticsProperties(input),
				result: "success",
				recipient_count: data.count,
			});
			toast.success(`Message queued for ${data.count} recipient${data.count === 1 ? "" : "s"}.`);
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "messages"] });
		},
		onError: (error, input) => {
			track(ANALYTICS_EVENTS.messageSendFailed, {
				...getMessageAnalyticsProperties(input),
				result: "failed",
				error_code: "response_error",
			});
			toast.error(extractErrorMessage(error));
		},
	});
}
