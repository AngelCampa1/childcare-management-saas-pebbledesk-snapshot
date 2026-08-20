import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { track } from "../lib/analytics";
import {
	useCheckIn,
	useCheckInHistory,
	useCheckIns,
	useCheckOut,
	useStaffCheckIns,
	useStaffClockIn,
	useStaffClockOut,
} from "./use-attendance";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("./use-memberships", () => ({
	useActiveCenterId: vi.fn(() => "center-test"),
}));

vi.mock("../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

import { toast } from "../lib/toast";

const mockedToast = vi.mocked(toast);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedTrack = vi.mocked(track);

function createResponse<T>(payload: T) {
	return {
		ok: true,
		json: async () => payload,
	} as Response;
}

function createWrapper() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return {
		client,
		Wrapper({ children }: { children: ReactNode }) {
			return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
		},
	};
}

describe("use-attendance hooks", () => {
	beforeEach(() => {
		mockedApiFetch.mockReset();
		mockedTrack.mockReset();
		mockedToast.success.mockReset();
		mockedToast.error.mockReset();
	});

	it("omits empty attendance filters from the query string", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIns: [] }));

		const { result } = renderHook(
			() => useCheckIns({ classroomId: "room-1", date: "", childId: "child-1" }),
			{ wrapper: createWrapper().Wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/check-ins?classroomId=room-1&childId=child-1",
		);
	});

	it("does not fetch attendance history until child and date range are available", () => {
		const { result } = renderHook(() => useCheckInHistory("", "2026-04-01", "2026-04-09"), {
			wrapper: createWrapper().Wrapper,
		});

		expect(result.current.fetchStatus).toBe("idle");
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("loads attendance history when the child and date range are provided", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIns: [{ id: "check-in-1" }] }));

		const { result } = renderHook(() => useCheckInHistory("child-1", "2026-04-01", "2026-04-09"), {
			wrapper: createWrapper().Wrapper,
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/check-ins/history?childId=child-1&from=2026-04-01&to=2026-04-09",
		);
		expect(result.current.data).toEqual([{ id: "check-in-1" }]);
	});

	it("invalidates check-ins and ratios after a successful check-in", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIn: { id: "check-in-1" } }));
		const { client, Wrapper } = createWrapper();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useCheckIn(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ childId: "child-1", classroomId: "room-1" });
		});

		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "checkIns"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "checkInHistory"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratios"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratioSnapshots"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "ratioViolations"],
		});
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkin_completed", {
			feature_name: "attendance",
			action: "check_in",
			result: "success",
			subject_type: "child",
		});
	});

	it("rolls back optimistic check-ins when a check-in fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		} as Response);
		const { client, Wrapper } = createWrapper();
		client.setQueryData(
			["center-test", "checkIns", { classroomId: "room-1" }],
			[{ id: "existing-check-in" }],
		);

		const { result } = renderHook(() => useCheckIn(), { wrapper: Wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync({ childId: "child-1", classroomId: "room-1" });
			}),
		).rejects.toThrow("Failed to check in");

		expect(client.getQueryData(["center-test", "checkIns", { classroomId: "room-1" }])).toEqual([
			{ id: "existing-check-in" },
		]);
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkin_failed", {
			feature_name: "attendance",
			action: "check_in",
			result: "failed",
			subject_type: "child",
			error_code: "response_error",
		});
	});

	it("loads staff check-ins with filters", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ staffCheckIns: [] }));

		const { result } = renderHook(
			() => useStaffCheckIns({ classroomId: "room-1", date: "2026-04-09" }),
			{ wrapper: createWrapper().Wrapper },
		);

		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		expect(mockedApiFetch).toHaveBeenCalledWith(
			"/api/staff-check-ins?classroomId=room-1&date=2026-04-09",
		);
	});

	it("invalidates check-ins and ratios after checking out", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIn: { id: "check-in-1" } }));
		const { client, Wrapper } = createWrapper();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useCheckOut(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ id: "check-in-1", notes: "Picked up early" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/check-ins/check-in-1/check-out", {
			method: "PATCH",
			body: JSON.stringify({ notes: "Picked up early" }),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "checkIns"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "checkInHistory"],
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratios"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratioSnapshots"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "ratioViolations"],
		});
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkout_completed", {
			feature_name: "attendance",
			action: "check_out",
			result: "success",
			subject_type: "child",
		});
	});

	it("rolls back optimistic check-outs when a check-out fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({}),
		} as Response);
		const { client, Wrapper } = createWrapper();
		const existingCheckIn = { id: "check-in-1", checkedOutAt: null };
		client.setQueryData(["center-test", "checkIns", { classroomId: "room-1" }], [existingCheckIn]);

		const { result } = renderHook(() => useCheckOut(), { wrapper: Wrapper });

		await expect(
			act(async () => {
				await result.current.mutateAsync({ id: "check-in-1" });
			}),
		).rejects.toThrow("Failed to check out");

		expect(client.getQueryData(["center-test", "checkIns", { classroomId: "room-1" }])).toEqual([
			existingCheckIn,
		]);
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkout_failed", {
			feature_name: "attendance",
			action: "check_out",
			result: "failed",
			subject_type: "child",
			error_code: "response_error",
		});
	});

	it("invalidates staff check-ins and ratios after staff clock-in", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ staffCheckIn: { id: "staff-1" } }));
		const { client, Wrapper } = createWrapper();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useStaffClockIn(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync({ classroomId: "room-1", membershipId: "membership-1" });
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/staff-check-ins", {
			method: "POST",
			body: JSON.stringify({ classroomId: "room-1", membershipId: "membership-1" }),
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "staffCheckIns"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratios"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratioSnapshots"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "ratioViolations"],
		});
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkin_completed", {
			feature_name: "attendance",
			action: "check_in",
			result: "success",
			subject_type: "staff",
		});
	});

	it("invalidates staff check-ins and ratios after staff clock-out", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ staffCheckIn: { id: "staff-1" } }));
		const { client, Wrapper } = createWrapper();
		const invalidateQueries = vi.spyOn(client, "invalidateQueries");

		const { result } = renderHook(() => useStaffClockOut(), { wrapper: Wrapper });

		await act(async () => {
			await result.current.mutateAsync("staff-1");
		});

		expect(mockedApiFetch).toHaveBeenCalledWith("/api/staff-check-ins/staff-1/clock-out", {
			method: "PATCH",
		});
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "staffCheckIns"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratios"] });
		expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["center-test", "ratioSnapshots"] });
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["center-test", "ratioViolations"],
		});
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkout_completed", {
			feature_name: "attendance",
			action: "check_out",
			result: "success",
			subject_type: "staff",
		});
	});

	it("surfaces a schema parse error when the check-ins payload shape drifts", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIns: [{ noId: true }] }));

		const { result } = renderHook(() => useCheckIns(), { wrapper: createWrapper().Wrapper });

		await waitFor(() => expect(result.current.isError).toBe(true));
	});

	it("shows a success toast after a successful check-in", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIn: { id: "check-in-1" } }));
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useCheckIn(), { wrapper: Wrapper });
		await act(async () => {
			await result.current.mutateAsync({ childId: "child-1", classroomId: "room-1" });
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast and rolls back when a check-in fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Room is full" }),
		} as Response);
		const { client, Wrapper } = createWrapper();
		client.setQueryData(
			["center-test", "checkIns", { classroomId: "room-1" }],
			[{ id: "existing-check-in" }],
		);

		const { result } = renderHook(() => useCheckIn(), { wrapper: Wrapper });
		await expect(
			act(async () => {
				await result.current.mutateAsync({ childId: "child-1", classroomId: "room-1" });
			}),
		).rejects.toThrow("Room is full");

		expect(mockedToast.error).toHaveBeenCalledWith("Room is full");
		expect(client.getQueryData(["center-test", "checkIns", { classroomId: "room-1" }])).toEqual([
			{ id: "existing-check-in" },
		]);
	});

	it("shows a success toast after a successful check-out", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ checkIn: { id: "check-in-1" } }));
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useCheckOut(), { wrapper: Wrapper });
		await act(async () => {
			await result.current.mutateAsync({ id: "check-in-1" });
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast and rolls back when a check-out fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Already checked out" }),
		} as Response);
		const { client, Wrapper } = createWrapper();
		const existing = { id: "check-in-1", checkedOutAt: null };
		client.setQueryData(["center-test", "checkIns", { classroomId: "room-1" }], [existing]);

		const { result } = renderHook(() => useCheckOut(), { wrapper: Wrapper });
		await expect(
			act(async () => {
				await result.current.mutateAsync({ id: "check-in-1" });
			}),
		).rejects.toThrow("Already checked out");

		expect(mockedToast.error).toHaveBeenCalledWith("Already checked out");
		expect(client.getQueryData(["center-test", "checkIns", { classroomId: "room-1" }])).toEqual([
			existing,
		]);
	});

	it("shows a success toast after staff clock-in", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ staffCheckIn: { id: "staff-1" } }));
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useStaffClockIn(), { wrapper: Wrapper });
		await act(async () => {
			await result.current.mutateAsync({ classroomId: "room-1" });
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when staff clock-in fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Not authorized" }),
		} as Response);
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useStaffClockIn(), { wrapper: Wrapper });
		await expect(
			act(async () => {
				await result.current.mutateAsync({ classroomId: "room-1" });
			}),
		).rejects.toThrow("Not authorized");

		expect(mockedToast.error).toHaveBeenCalledWith("Not authorized");
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkin_failed", {
			feature_name: "attendance",
			action: "check_in",
			result: "failed",
			subject_type: "staff",
			error_code: "response_error",
		});
	});

	it("shows a success toast after staff clock-out", async () => {
		mockedApiFetch.mockResolvedValueOnce(createResponse({ staffCheckIn: { id: "staff-1" } }));
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useStaffClockOut(), { wrapper: Wrapper });
		await act(async () => {
			await result.current.mutateAsync("staff-1");
		});

		expect(mockedToast.success).toHaveBeenCalledTimes(1);
	});

	it("shows an error toast when staff clock-out fails", async () => {
		mockedApiFetch.mockResolvedValueOnce({
			ok: false,
			json: async () => ({ error: "Clock-out failed" }),
		} as Response);
		const { Wrapper } = createWrapper();

		const { result } = renderHook(() => useStaffClockOut(), { wrapper: Wrapper });
		await expect(
			act(async () => {
				await result.current.mutateAsync("staff-1");
			}),
		).rejects.toThrow("Clock-out failed");

		expect(mockedToast.error).toHaveBeenCalledWith("Clock-out failed");
		expect(mockedTrack).toHaveBeenCalledWith("attendance_checkout_failed", {
			feature_name: "attendance",
			action: "check_out",
			result: "failed",
			subject_type: "staff",
			error_code: "response_error",
		});
	});
});
