import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		useNavigate: () => vi.fn(),
	};
});

vi.mock("../../../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(),
	useCreateClassroom: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

vi.mock("../../../hooks/use-ratios", () => ({
	useRatios: vi.fn(),
}));

vi.mock("../../../hooks/use-setup-progress", () => ({
	useSetupProgress: vi.fn(() => ({ allDone: false, isLoading: false, currentStep: null })),
}));

vi.mock("../../../components/guidance", () => ({
	GuidancePanel: ({ guideId }: { guideId: string }) => (
		<div data-testid={`guidance-panel-${guideId}`} />
	),
}));

import { useClassrooms } from "../../../hooks/use-classrooms";
import { useRatios } from "../../../hooks/use-ratios";
import { useSetupProgress } from "../../../hooks/use-setup-progress";
import { ClassroomsPage } from "./index";

const mockedUseClassrooms = vi.mocked(useClassrooms);
const mockedUseRatios = vi.mocked(useRatios);
const mockedUseSetupProgress = vi.mocked(useSetupProgress);

describe("ClassroomsPage", () => {
	it("shows compliance summary and short visible card actions with full accessible labels", () => {
		mockedUseClassrooms.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "room-1",
					name: "Sunshine Room",
					ageGroup: "preschool",
					childCount: 10,
					staffCount: 2,
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 6,
					archivedAt: null,
				},
				{
					id: "room-2",
					name: "Cloud Room",
					ageGroup: "pre_k",
					childCount: 12,
					staffCount: 1,
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 10,
					archivedAt: null,
				},
			],
		} as never);
		mockedUseRatios.mockReturnValue({
			data: [
				{ classroomId: "room-1", inCompliance: true, nearLimit: false },
				{ classroomId: "room-2", inCompliance: false, nearLimit: false },
			],
		} as never);

		render(<ClassroomsPage />);

		expect(screen.getByRole("region", { name: "Compliance summary" })).toBeInTheDocument();
		expect(screen.getByText("Rooms OK")).toBeInTheDocument();
		expect(screen.getByText("Needs review")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "View details for Sunshine Room" }),
		).toHaveTextContent("View");
	});

	it("shows an error state with a retry control instead of a false empty state on load failure", () => {
		const refetch = vi.fn();
		mockedUseClassrooms.mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch,
		} as never);
		mockedUseRatios.mockReturnValue({ data: [] } as never);

		render(<ClassroomsPage />);

		// A failed load must NOT masquerade as "you have no classrooms yet".
		expect(screen.queryByText("Your first classroom is next")).not.toBeInTheDocument();
		expect(screen.getByText(/Failed to load classrooms/i)).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
		expect(refetch).toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// GuidancePanel visibility — setup checklist gate
// ---------------------------------------------------------------------------

describe("ClassroomsPage GuidancePanel visibility", () => {
	beforeEach(() => {
		mockedUseClassrooms.mockReturnValue({ isLoading: false, data: [] } as never);
		mockedUseRatios.mockReturnValue({ data: [] } as never);
	});

	it("renders the owner-start-here guidance panel when setup is NOT complete", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: false,
			isLoading: false,
			currentStep: null,
		});

		render(<ClassroomsPage />);

		expect(screen.getByTestId("guidance-panel-owner-start-here")).toBeInTheDocument();
	});

	it("hides the owner-start-here guidance panel when setup IS complete", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: true,
			isLoading: false,
			currentStep: null,
		});

		render(<ClassroomsPage />);

		expect(screen.queryByTestId("guidance-panel-owner-start-here")).not.toBeInTheDocument();
	});

	it("hides the owner-start-here guidance panel while setup status is loading", () => {
		mockedUseSetupProgress.mockReturnValue({
			allDone: false,
			isLoading: true,
			currentStep: null,
		});

		render(<ClassroomsPage />);

		expect(screen.queryByTestId("guidance-panel-owner-start-here")).not.toBeInTheDocument();
	});
});
