import type { CheckIn, StaffCheckIn } from "@pebbledesk/shared";
import {
	ANALYTICS_EVENTS,
	checkInResponseSchema,
	checkInsResponseSchema,
	staffCheckInResponseSchema,
	staffCheckInsResponseSchema,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import { parseJsonResponse } from "../lib/parse-json-response";
import { toast } from "../lib/toast";
import { useActiveCenterId } from "./use-memberships";

interface CheckInFilters {
	classroomId?: string;
	date?: string;
	childId?: string;
}

interface StaffCheckInFilters {
	classroomId?: string;
	date?: string;
}

type AttendanceSubjectType = "child" | "staff";

function trackAttendanceFailed(
	action: "check_in" | "check_out",
	subjectType: AttendanceSubjectType,
) {
	track(
		action === "check_in"
			? ANALYTICS_EVENTS.attendanceCheckinFailed
			: ANALYTICS_EVENTS.attendanceCheckoutFailed,
		{
			feature_name: "attendance",
			action,
			result: "failed",
			subject_type: subjectType,
			error_code: "response_error",
		},
	);
}

function trackAttendanceCheckoutCompleted(subjectType: AttendanceSubjectType) {
	track(ANALYTICS_EVENTS.attendanceCheckoutCompleted, {
		feature_name: "attendance",
		action: "check_out",
		result: "success",
		subject_type: subjectType,
	});
}

function trackAttendanceCheckinCompleted(subjectType: AttendanceSubjectType) {
	track(ANALYTICS_EVENTS.attendanceCheckinCompleted, {
		feature_name: "attendance",
		action: "check_in",
		result: "success",
		subject_type: subjectType,
	});
}

export function useCheckIns(filters?: CheckInFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "checkIns", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.classroomId) params.set("classroomId", filters.classroomId);
			if (filters?.date) params.set("date", filters.date);
			if (filters?.childId) params.set("childId", filters.childId);

			const query = params.toString();
			const path = `/api/check-ins${query ? `?${query}` : ""}`;
			const res = await apiFetch(path);
			const data = await parseJsonResponse(
				res,
				checkInsResponseSchema,
				"Failed to fetch check-ins",
			);
			return data.checkIns as unknown as CheckIn[];
		},
	});
}

export function useCheckInHistory(childId: string, from: string, to: string) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "checkInHistory", childId, from, to],
		queryFn: async () => {
			const params = new URLSearchParams({ childId, from, to });
			const res = await apiFetch(`/api/check-ins/history?${params.toString()}`);
			const data = await parseJsonResponse(
				res,
				checkInsResponseSchema,
				"Failed to fetch check-in history",
			);
			return data.checkIns as unknown as CheckIn[];
		},
		enabled: !!childId && !!from && !!to,
	});
}

export function useStaffCheckIns(filters?: StaffCheckInFilters) {
	const activeCenterId = useActiveCenterId();
	return useQuery({
		queryKey: [activeCenterId, "staffCheckIns", filters],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (filters?.classroomId) params.set("classroomId", filters.classroomId);
			if (filters?.date) params.set("date", filters.date);

			const query = params.toString();
			const path = `/api/staff-check-ins${query ? `?${query}` : ""}`;
			const res = await apiFetch(path);
			const data = await parseJsonResponse(
				res,
				staffCheckInsResponseSchema,
				"Failed to fetch staff check-ins",
			);
			return data.staffCheckIns as unknown as StaffCheckIn[];
		},
	});
}

interface CheckInMutationInput {
	childId: string;
	classroomId: string;
	notes?: string;
	isLate?: boolean;
	signatureData?: string;
}

export function useCheckIn() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: CheckInMutationInput) => {
			const res = await apiFetch("/api/check-ins", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(res, checkInResponseSchema, "Failed to check in");
			return data.checkIn as unknown as CheckIn;
		},
		onMutate: async (input) => {
			await queryClient.cancelQueries({ queryKey: [activeCenterId, "checkIns"] });

			const previousCheckIns = queryClient.getQueriesData<CheckIn[]>({
				queryKey: [activeCenterId, "checkIns"],
			});

			const tempCheckIn: CheckIn = {
				id: `temp-${Date.now()}`,
				centerId: "",
				childId: input.childId,
				classroomId: input.classroomId,
				checkedInAt: new Date().toISOString(),
				checkedInBy: "",
				notes: input.notes,
				isLate: input.isLate ?? false,
			};

			for (const [queryKey, data] of previousCheckIns) {
				if (data) {
					queryClient.setQueryData(queryKey, [...data, tempCheckIn]);
				}
			}

			return { previousCheckIns };
		},
		onError: (err, _input, context) => {
			if (context?.previousCheckIns) {
				for (const [queryKey, data] of context.previousCheckIns) {
					queryClient.setQueryData(queryKey, data);
				}
			}
			trackAttendanceFailed("check_in", "child");
			toast.error(extractErrorMessage(err));
		},
		onSuccess: () => {
			trackAttendanceCheckinCompleted("child");
			toast.success("Checked in.");
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "checkIns"] });
			// The attendance calendar reads a child's month via useCheckInHistory under a
			// separate ["checkInHistory", ...] key, so invalidating "checkIns" alone leaves
			// it stale — a same-day check-in must refresh the calendar's attended days.
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "checkInHistory"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratios"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioSnapshots"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioViolations"] });
		},
	});
}

export function useCheckOut() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async ({
			id,
			notes,
			signatureData,
		}: {
			id: string;
			notes?: string;
			signatureData?: string;
		}) => {
			const res = await apiFetch(`/api/check-ins/${id}/check-out`, {
				method: "PATCH",
				body: JSON.stringify({ notes, signatureData }),
			});
			const data = await parseJsonResponse(res, checkInResponseSchema, "Failed to check out");
			return data.checkIn as unknown as CheckIn;
		},
		onMutate: async ({ id }) => {
			await queryClient.cancelQueries({ queryKey: [activeCenterId, "checkIns"] });

			const previousCheckIns = queryClient.getQueriesData<CheckIn[]>({
				queryKey: [activeCenterId, "checkIns"],
			});

			for (const [queryKey, data] of previousCheckIns) {
				if (data) {
					queryClient.setQueryData(
						queryKey,
						data.map((checkIn) =>
							checkIn.id === id ? { ...checkIn, checkedOutAt: new Date().toISOString() } : checkIn,
						),
					);
				}
			}

			return { previousCheckIns };
		},
		onError: (err, _input, context) => {
			if (context?.previousCheckIns) {
				for (const [queryKey, data] of context.previousCheckIns) {
					queryClient.setQueryData(queryKey, data);
				}
			}
			trackAttendanceFailed("check_out", "child");
			toast.error(extractErrorMessage(err));
		},
		onSuccess: () => {
			trackAttendanceCheckoutCompleted("child");
			toast.success("Checked out.");
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "checkIns"] });
			// Check-out sets checkedOutAt, which changes the calendar's per-day totalHours
			// and partial-day counts; the separately-keyed history query must refresh too.
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "checkInHistory"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratios"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioSnapshots"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioViolations"] });
		},
	});
}

export function useStaffClockIn() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (input: { classroomId: string; membershipId?: string }) => {
			const res = await apiFetch("/api/staff-check-ins", {
				method: "POST",
				body: JSON.stringify(input),
			});
			const data = await parseJsonResponse(
				res,
				staffCheckInResponseSchema,
				"Failed to clock in staff",
			);
			return data.staffCheckIn as unknown as StaffCheckIn;
		},
		onSuccess: () => {
			trackAttendanceCheckinCompleted("staff");
			toast.success("Clocked in.");
		},
		onError: (err) => {
			trackAttendanceFailed("check_in", "staff");
			toast.error(extractErrorMessage(err));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "staffCheckIns"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratios"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioSnapshots"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioViolations"] });
		},
	});
}

export function useStaffClockOut() {
	const queryClient = useQueryClient();
	const activeCenterId = useActiveCenterId();

	return useMutation({
		mutationFn: async (id: string) => {
			const res = await apiFetch(`/api/staff-check-ins/${id}/clock-out`, {
				method: "PATCH",
			});
			const data = await parseJsonResponse(
				res,
				staffCheckInResponseSchema,
				"Failed to clock out staff",
			);
			return data.staffCheckIn as unknown as StaffCheckIn;
		},
		onSuccess: () => {
			trackAttendanceCheckoutCompleted("staff");
			toast.success("Clocked out.");
		},
		onError: (err) => {
			trackAttendanceFailed("check_out", "staff");
			toast.error(extractErrorMessage(err));
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "staffCheckIns"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratios"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioSnapshots"] });
			queryClient.invalidateQueries({ queryKey: [activeCenterId, "ratioViolations"] });
		},
	});
}
