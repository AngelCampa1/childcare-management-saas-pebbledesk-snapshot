import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./use-auth-session", () => ({
	useAuthSession: vi.fn(),
}));

vi.mock("./use-classrooms", () => ({
	useClassrooms: vi.fn(),
}));

vi.mock("./use-children", () => ({
	useChildren: vi.fn(),
}));

vi.mock("./use-guardians", () => ({
	useGuardians: vi.fn(),
}));

vi.mock("../routes/_auth/-billing-state", () => ({
	getBillingState: vi.fn(
		(status: string | undefined) =>
			status === "active" || status === "trialing" || status === "past_due",
	),
}));

import { useAuthSession } from "./use-auth-session";
import { useChildren } from "./use-children";
import { useClassrooms } from "./use-classrooms";
import { useGuardians } from "./use-guardians";
import { useSetupProgress } from "./use-setup-progress";

const mockedUseAuthSession = vi.mocked(useAuthSession);
const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseChildren = vi.mocked(useChildren);
const mockedUseGuardians = vi.mocked(useGuardians);

function makeSession(
	role: "owner" | "director" | "staff" = "owner",
	subscriptionStatus = "active",
) {
	return {
		data: {
			membership: { role },
			center: { subscriptionStatus },
		},
		isLoading: false,
	};
}

describe("useSetupProgress", () => {
	it("returns allDone=true when center is fully set up", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "r1", archivedAt: null }],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [{ id: "c1", enrollmentStatus: "active" }],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g1" }],
			isLoading: false,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(true);
		expect(result.current.isLoading).toBe(false);
	});

	it("returns allDone=false when center has no classrooms", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(false);
		expect(result.current.isLoading).toBe(false);
	});

	it("returns isLoading=true and allDone=false while session is loading", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.isLoading).toBe(true);
		expect(result.current.allDone).toBe(false);
	});

	it("returns isLoading=true when classrooms are loading", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.isLoading).toBe(true);
	});

	it("does not claim allDone when loading (no flash-hide)", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		mockedUseClassrooms.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseChildren.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseGuardians.mockReturnValue({ data: undefined, isLoading: true } as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(false);
	});

	it("treats archived classrooms as not having classrooms", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "r1", archivedAt: "2025-01-01" }],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [{ id: "c1", enrollmentStatus: "active" }],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g1" }],
			isLoading: false,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(false);
	});

	it("only counts active/waitlist children for hasChildren", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: [{ id: "r1", archivedAt: null }],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [{ id: "c1", enrollmentStatus: "withdrawn" }],
			isLoading: false,
		} as never);
		mockedUseGuardians.mockReturnValue({
			data: [{ id: "g1" }],
			isLoading: false,
		} as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(false);
	});

	it("returns allDone=false and isLoading=false for staff role (fetches disabled)", () => {
		mockedUseAuthSession.mockReturnValue(makeSession("staff") as never);
		mockedUseClassrooms.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseChildren.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({ data: undefined, isLoading: false } as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.allDone).toBe(false);
		expect(result.current.isLoading).toBe(false);
	});

	it("exposes currentStep from computeSetupProgress", () => {
		mockedUseAuthSession.mockReturnValue(makeSession() as never);
		mockedUseClassrooms.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseChildren.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);

		const { result } = renderHook(() => useSetupProgress());
		expect(result.current.currentStep?.label).toBe("Add a classroom");
	});
});
