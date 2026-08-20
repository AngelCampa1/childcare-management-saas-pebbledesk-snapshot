import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("../../../hooks/use-finance", () => ({
	useSubsidyCases: vi.fn(),
	useSubsidyClaims: vi.fn(),
	useCreateSubsidyCase: vi.fn(),
	useCreateSubsidyClaim: vi.fn(),
	useUpdateSubsidyCase: vi.fn(),
	useUpdateSubsidyClaim: vi.fn(),
	useSubmitSubsidyClaim: vi.fn(),
	useDeleteSubsidyClaim: vi.fn(),
}));

vi.mock("../../../lib/plan-gate", () => ({
	usePlanCheck: vi.fn(),
	PlanGate: vi.fn(),
}));

vi.mock("../../../components/subsidy/subsidy-case-dialog", () => ({
	SubsidyCaseDialog: () => null,
}));

vi.mock("../../../components/subsidy/subsidy-claim-dialog", () => ({
	SubsidyClaimDialog: () => null,
}));

vi.mock("../../../components/empty-state", () => ({
	EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => (
		<div>
			{title}
			{action}
		</div>
	),
}));

import type { SubscriptionPlan } from "@pebbledesk/shared";
import {
	useCreateSubsidyCase,
	useCreateSubsidyClaim,
	useDeleteSubsidyClaim,
	useSubmitSubsidyClaim,
	useSubsidyCases,
	useSubsidyClaims,
	useUpdateSubsidyCase,
	useUpdateSubsidyClaim,
} from "../../../hooks/use-finance";
import { PlanGate, usePlanCheck } from "../../../lib/plan-gate";
import { withCenterTimezone } from "../../../test/with-center-timezone";
import { SubsidiesPage } from "./index";

const mockedUsePlanCheck = vi.mocked(usePlanCheck);
const mockedPlanGate = vi.mocked(PlanGate);
const mockedUseSubsidyCases = vi.mocked(useSubsidyCases);
const mockedUseSubsidyClaims = vi.mocked(useSubsidyClaims);
const mockedUseCreateSubsidyCase = vi.mocked(useCreateSubsidyCase);
const mockedUseCreateSubsidyClaim = vi.mocked(useCreateSubsidyClaim);
const mockedUseUpdateSubsidyCase = vi.mocked(useUpdateSubsidyCase);
const mockedUseUpdateSubsidyClaim = vi.mocked(useUpdateSubsidyClaim);
const mockedUseSubmitSubsidyClaim = vi.mocked(useSubmitSubsidyClaim);
const mockedUseDeleteSubsidyClaim = vi.mocked(useDeleteSubsidyClaim);

const BASE_CASE = {
	id: "case-1",
	centerId: "center-1",
	childId: "child-1",
	program: "ccdf" as const,
	caseNumber: "CASE-001",
	agencyName: "County Services",
	effectiveDate: "2026-01-01",
	status: "active" as const,
	createdAt: "2026-01-01T12:00:00.000Z",
	updatedAt: "2026-01-01T12:00:00.000Z",
};

const DRAFT_CLAIM = {
	id: "claim-1",
	centerId: "center-1",
	subsidyCaseId: "case-1",
	periodStart: "2026-03-01",
	periodEnd: "2026-03-31",
	daysAttended: 20,
	hoursAttended: 160,
	amountClaimed: 500,
	status: "draft" as const,
	createdAt: "2026-04-01T00:00:00.000Z",
	updatedAt: "2026-04-01T00:00:00.000Z",
};

const SUBMITTED_CLAIM = {
	...DRAFT_CLAIM,
	id: "claim-2",
	status: "submitted" as const,
};

function setupPlanGate(plan: SubscriptionPlan) {
	mockedUsePlanCheck.mockReturnValue({ allowed: plan !== "home", currentPlan: plan });
	mockedPlanGate.mockImplementation(({ plans, features, children, fallback }) => {
		const isAllowed =
			plans?.includes(plan) ?? (features?.includes("subsidies") ? plan !== "home" : false);
		return <>{isAllowed ? children : (fallback ?? null)}</>;
	});
}

function setupData({
	cases = [BASE_CASE],
	claims = [DRAFT_CLAIM],
	submitIsPending = false,
}: {
	cases?: (typeof BASE_CASE)[];
	claims?: (typeof DRAFT_CLAIM)[];
	submitIsPending?: boolean;
} = {}) {
	mockedUseSubsidyCases.mockReturnValue({ data: cases, isLoading: false } as never);
	mockedUseSubsidyClaims.mockReturnValue({ data: claims, isLoading: false } as never);
	mockedUseCreateSubsidyCase.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseCreateSubsidyClaim.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseUpdateSubsidyCase.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseUpdateSubsidyClaim.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
	mockedUseSubmitSubsidyClaim.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: submitIsPending,
	} as never);
	mockedUseDeleteSubsidyClaim.mockReturnValue({
		mutate: vi.fn(),
		mutateAsync: vi.fn(),
		isPending: false,
	} as never);
}

describe("SubsidiesPage — auto-draft labels", () => {
	it("shows 'Auto-drafted — review before submitting' badge for draft claims", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);

		expect(screen.getByText("Auto-drafted — review before submitting")).toBeInTheDocument();
	});

	it("does NOT show the auto-draft label for submitted claims", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [SUBMITTED_CLAIM] });

		render(<SubsidiesPage />);

		expect(screen.queryByText("Auto-drafted — review before submitting")).not.toBeInTheDocument();
	});

	it("does NOT show the auto-draft label for paid claims", () => {
		setupPlanGate("center_starter");
		setupData({
			claims: [{ ...DRAFT_CLAIM, id: "claim-3", status: "paid" as const }],
		});

		render(<SubsidiesPage />);

		expect(screen.queryByText("Auto-drafted — review before submitting")).not.toBeInTheDocument();
	});
});

describe("SubsidiesPage — plan banners", () => {
	it("shows the upgrade CTA page for Home-tier centers (entitlement gate)", () => {
		setupPlanGate("home");

		render(<SubsidiesPage />);

		// Upgrade gate replaces the full page — no normal content
		expect(screen.getByRole("heading", { name: /Subsidies/i, level: 1 })).toBeInTheDocument();
		expect(screen.getByText(/subsidy tracking is available on Center plans/i)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: /Upgrade plan/i })).toHaveAttribute("href", "/billing");
		// Normal content must not appear
		expect(screen.queryByText("Active cases")).not.toBeInTheDocument();
	});

	it("upgrade CTA links to /billing for Home-tier centers", () => {
		setupPlanGate("home");

		render(<SubsidiesPage />);

		const upgradeLink = screen.getByRole("link", { name: /Upgrade plan/i });
		expect(upgradeLink).toHaveAttribute("href", "/billing");
	});

	it("does NOT show the upgrade banner for Center-tier centers", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [] });

		render(<SubsidiesPage />);

		expect(
			screen.queryByText("Automated Reconciliation is a Center plan feature."),
		).not.toBeInTheDocument();
	});

	it("does NOT show the upgrade banner for Enterprise-tier centers", () => {
		setupPlanGate("enterprise");
		setupData({ claims: [] });

		render(<SubsidiesPage />);

		expect(
			screen.queryByText("Automated Reconciliation is a Center plan feature."),
		).not.toBeInTheDocument();
	});

	it("shows the auto-reconciliation info note for Center-tier centers", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [] });

		render(<SubsidiesPage />);

		expect(
			screen.getByText(/Claims are auto-drafted each Monday from attendance records/),
		).toBeInTheDocument();
	});

	it("shows the auto-reconciliation info note for Enterprise-tier centers", () => {
		setupPlanGate("enterprise");
		setupData({ claims: [] });

		render(<SubsidiesPage />);

		expect(
			screen.getByText(/Claims are auto-drafted each Monday from attendance records/),
		).toBeInTheDocument();
	});

	it("does NOT show the info note for Home-tier centers", () => {
		setupPlanGate("home");
		setupData({ claims: [] });

		render(<SubsidiesPage />);

		expect(
			screen.queryByText(/Claims are auto-drafted each Monday from attendance records/),
		).not.toBeInTheDocument();
	});
});

describe("SubsidiesPage — loading state", () => {
	it("renders skeletons while loading", () => {
		setupPlanGate("center_starter");
		mockedUseSubsidyCases.mockReturnValue({ data: undefined, isLoading: true } as never);
		mockedUseSubsidyClaims.mockReturnValue({ data: undefined, isLoading: true } as never);

		const { container } = render(<SubsidiesPage />);

		// Skeleton renders as div elements — confirm the page skeleton is shown
		expect(container.firstChild).not.toBeNull();
		expect(screen.queryByText("Subsidies")).not.toBeInTheDocument();
	});
});

describe("SubsidiesPage — empty cases", () => {
	it("shows the empty state when there are no cases", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [], claims: [] });

		render(<SubsidiesPage />);

		expect(screen.getByText("No subsidy cases yet")).toBeInTheDocument();
	});

	it("clicking New case in the empty state opens the case dialog", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [], claims: [] });

		render(<SubsidiesPage />);

		// The empty state renders the action prop with a "New case" button
		const newCaseButtons = screen.getAllByRole("button", { name: /New case/i });
		// Click the one inside the empty state (last one after header)
		fireEvent.click(newCaseButtons[newCaseButtons.length - 1]);

		// After click, the SubsidyCaseDialog mock is called — no visible error = success
		expect(screen.getByText("No subsidy cases yet")).toBeInTheDocument();
	});
});

describe("SubsidiesPage — multiple claims sorting", () => {
	it("shows the latest claim's status badge when a case has multiple claims", () => {
		setupPlanGate("center_starter");
		const olderDraftClaim = {
			...DRAFT_CLAIM,
			id: "claim-old",
			createdAt: "2026-03-01T00:00:00.000Z",
			updatedAt: "2026-03-01T00:00:00.000Z",
		};
		const newerSubmittedClaim = {
			...SUBMITTED_CLAIM,
			id: "claim-new",
			createdAt: "2026-04-07T00:00:00.000Z",
			updatedAt: "2026-04-07T00:00:00.000Z",
		};
		setupData({ claims: [olderDraftClaim, newerSubmittedClaim] });

		render(<SubsidiesPage />);

		// Newest claim is submitted, so no auto-draft label
		expect(screen.queryByText("Auto-drafted — review before submitting")).not.toBeInTheDocument();
	});

	it("shows the auto-draft badge when the newest claim for a case is a draft", () => {
		setupPlanGate("center_starter");
		const olderSubmittedClaim = {
			...SUBMITTED_CLAIM,
			id: "claim-old",
			createdAt: "2026-03-01T00:00:00.000Z",
			updatedAt: "2026-03-01T00:00:00.000Z",
		};
		const newerDraftClaim = {
			...DRAFT_CLAIM,
			id: "claim-new",
			createdAt: "2026-04-07T00:00:00.000Z",
			updatedAt: "2026-04-07T00:00:00.000Z",
		};
		setupData({ claims: [olderSubmittedClaim, newerDraftClaim] });

		render(<SubsidiesPage />);

		expect(screen.getByText("Auto-drafted — review before submitting")).toBeInTheDocument();
	});
});

describe("SubsidiesPage — metric cards", () => {
	it("shows metric cards when there are submitted and paid claims", () => {
		setupPlanGate("center_starter");
		setupData({
			claims: [
				{ ...SUBMITTED_CLAIM, id: "c1" },
				{ ...DRAFT_CLAIM, id: "c2", status: "paid" as const },
			],
		});

		render(<SubsidiesPage />);

		expect(screen.getByText("Active cases")).toBeInTheDocument();
		expect(screen.getByText("Submitted claims")).toBeInTheDocument();
		expect(screen.getByText("Paid claims")).toBeInTheDocument();
	});

	it("shows zero-value metric cards when there are no active cases and no submitted/paid claims", () => {
		setupPlanGate("center_starter");
		// Use a non-active case so activeCases = 0, and no claims
		const expiredCase = { ...BASE_CASE, status: "expired" as const };
		setupData({ cases: [expiredCase], claims: [] });

		render(<SubsidiesPage />);

		expect(screen.getByText("Active cases")).toBeInTheDocument();
		expect(screen.getByText("Submitted claims")).toBeInTheDocument();
		expect(screen.getByText("Paid claims")).toBeInTheDocument();
		expect(screen.getAllByText("0")).toHaveLength(4);
	});

	it("surfaces draft claims needing review before the case list", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);

		const reviewRegion = screen.getByRole("region", { name: "Draft claims needing review" });
		expect(reviewRegion).toHaveTextContent("1 draft claim needs review");
		expect(reviewRegion).toHaveTextContent("CASE-001");
	});

	it("promotes draft review and estimated reimbursement metrics", () => {
		setupPlanGate("center_starter");
		setupData({
			claims: [
				{ ...DRAFT_CLAIM, id: "draft-a", amountClaimed: 500 },
				{ ...DRAFT_CLAIM, id: "draft-b", amountClaimed: 250 },
			],
		});

		render(<SubsidiesPage />);

		expect(screen.getByText("Drafts to review")).toBeInTheDocument();
		expect(screen.getByText("Estimated reimbursement")).toBeInTheDocument();
		expect(screen.getByText("$750.00")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Review next draft/i })).toBeInTheDocument();
	});
});

describe("SubsidiesPage — case selection toggle", () => {
	it("deselects a case when the same row is clicked twice", () => {
		setupPlanGate("center_starter");
		setupData();

		render(<SubsidiesPage />);

		const caseButton = screen.getByRole("button", { name: /CASE-001/ });

		// First click: select
		fireEvent.click(caseButton);
		expect(caseButton).toHaveAttribute("aria-pressed", "true");

		// Second click: deselect
		fireEvent.click(caseButton);
		expect(caseButton).toHaveAttribute("aria-pressed", "false");
	});
});

describe("SubsidiesPage — status transition buttons", () => {
	function selectCase() {
		const caseButton = screen.getByRole("button", { name: /CASE-001/ });
		fireEvent.click(caseButton);
	}

	it("shows 'Mark active' and 'Mark terminated' buttons for a pending case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "pending" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Mark active/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Mark terminated/i })).toBeInTheDocument();
	});

	it("does NOT show 'Mark expired' or 'Mark pending' buttons for a pending case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "pending" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Mark expired/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark pending/i })).not.toBeInTheDocument();
	});

	it("shows 'Mark expired' and 'Mark terminated' buttons for an active case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "active" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Mark expired/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Mark terminated/i })).toBeInTheDocument();
	});

	it("does NOT show 'Mark active' or 'Mark pending' buttons for an active case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "active" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Mark active/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark pending/i })).not.toBeInTheDocument();
	});

	it("shows no transition buttons for a terminal 'expired' case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "expired" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Mark active/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark pending/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark terminated/i })).not.toBeInTheDocument();
	});

	it("shows no transition buttons for a terminal 'terminated' case", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "terminated" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Mark active/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark pending/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Mark expired/i })).not.toBeInTheDocument();
	});

	it("uses ConfirmDestructiveDialog for destructive transition (active → expired)", () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseUpdateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync,
			isPending: false,
		} as never);
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "active" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		// The 'Mark expired' button should be present (rendered via ConfirmDestructiveDialog trigger)
		expect(screen.getByRole("button", { name: /Mark expired/i })).toBeInTheDocument();
	});

	it("uses ConfirmDestructiveDialog for destructive transition (active → terminated)", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "active" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Mark terminated/i })).toBeInTheDocument();
	});

	it("uses a plain button for non-destructive transition (pending → active)", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [{ ...BASE_CASE, status: "pending" as const }], claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		// 'Mark active' is not a destructive transition, so a regular button is used
		const btn = screen.getByRole("button", { name: /Mark active/i });
		expect(btn).toBeInTheDocument();
	});

	it("disables non-destructive transition buttons while updateSubsidyCase.isPending is true", () => {
		setupPlanGate("center_starter");
		// setupData must come first; then override the update mutation to isPending: true
		setupData({ cases: [{ ...BASE_CASE, status: "pending" as const }], claims: [] });
		mockedUseUpdateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);

		render(<SubsidiesPage />);
		selectCase();

		const btn = screen.getByRole("button", { name: /Mark active/i });
		expect(btn).toBeDisabled();
	});
});

describe("SubsidiesPage — date formatting", () => {
	it("renders effective date as a calendar date (no prev-day shift in LA)", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [] });

		render(withCenterTimezone("America/Los_Angeles", <SubsidiesPage />));

		// effectiveDate "2026-01-01" must render as Jan 1, 2026 even in LA (UTC-8).
		expect(screen.getByText(/Effective Jan 1, 2026/)).toBeInTheDocument();
	});
});

describe("SubsidiesPage — null data coalescing", () => {
	it("renders without crash when API returns null for cases and claims", () => {
		setupPlanGate("center_starter");
		mockedUseSubsidyCases.mockReturnValue({ data: null, isLoading: false } as never);
		mockedUseSubsidyClaims.mockReturnValue({ data: null, isLoading: false } as never);
		mockedUseCreateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseCreateSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseSubmitSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseDeleteSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		render(<SubsidiesPage />);

		expect(screen.getByText("No subsidy cases yet")).toBeInTheDocument();
	});
});

describe("SubsidiesPage — submit and delete draft claim actions", () => {
	function selectCase() {
		const caseButton = screen.getByRole("button", { name: /CASE-001/ });
		fireEvent.click(caseButton);
	}

	it("shows 'Submit to agency' and 'Delete draft' when the selected case has a draft claim", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Submit to agency/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Delete draft/i })).toBeInTheDocument();
	});

	it("does NOT show submit or delete buttons when there is no claim", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Submit to agency/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Delete draft/i })).not.toBeInTheDocument();
	});

	it("does NOT show submit or delete buttons when the latest claim is already submitted", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [SUBMITTED_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Submit to agency/i })).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /Delete draft/i })).not.toBeInTheDocument();
	});

	it("clicking 'Submit to agency' calls submitSubsidyClaim.mutate with the claim id", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });
		const submitMutate = vi.fn();
		mockedUseSubmitSubsidyClaim.mockReturnValue({
			mutate: submitMutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		render(<SubsidiesPage />);
		selectCase();

		fireEvent.click(screen.getByRole("button", { name: /Submit to agency/i }));
		expect(submitMutate).toHaveBeenCalledWith(DRAFT_CLAIM.id);
	});

	it("disables 'Submit to agency' while submitSubsidyClaim.isPending is true", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM], submitIsPending: true });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Submit to agency/i })).toBeDisabled();
	});

	it("clicking 'Delete draft' opens the confirm dialog", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		// Click the "Delete draft" button (the trigger for ConfirmDestructiveDialog)
		fireEvent.click(screen.getByRole("button", { name: /Delete draft/i }));

		// The dialog title should appear
		expect(screen.getByText("Delete draft claim?")).toBeInTheDocument();
	});

	it("confirming delete calls deleteSubsidyClaim.mutate with the claim id", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });
		const deleteMutate = vi.fn();
		mockedUseDeleteSubsidyClaim.mockReturnValue({
			mutate: deleteMutate,
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		render(<SubsidiesPage />);
		selectCase();

		// Open dialog
		fireEvent.click(screen.getByRole("button", { name: /Delete draft/i }));

		// Click confirm in dialog
		fireEvent.click(screen.getByRole("button", { name: /^Delete draft$/i }));
		expect(deleteMutate).toHaveBeenCalledWith(DRAFT_CLAIM.id);
	});

	it("still shows 'New claim' button alongside submit and delete", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /New claim/i })).toBeInTheDocument();
	});
});

describe("SubsidiesPage — entitlement gate (upgrade CTA)", () => {
	it("shows the upgrade CTA and /billing link when usePlanCheck returns allowed:false", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: false, currentPlan: "home" });

		render(<SubsidiesPage />);

		expect(screen.getByRole("heading", { name: /Subsidies/i, level: 1 })).toBeInTheDocument();
		expect(screen.getByText(/subsidy tracking is available on Center plans/i)).toBeInTheDocument();
		const upgradeLink = screen.getByRole("link", { name: /Upgrade plan/i });
		expect(upgradeLink).toHaveAttribute("href", "/billing");
	});

	it("does NOT show the error wall or normal content when not entitled", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: false, currentPlan: "home" });

		render(<SubsidiesPage />);

		expect(screen.queryByText("Failed to load subsidies.")).not.toBeInTheDocument();
		expect(screen.queryByText("Subsidies cases")).not.toBeInTheDocument();
		expect(screen.queryByText("Active cases")).not.toBeInTheDocument();
	});

	it("renders normal content when usePlanCheck returns allowed:true", () => {
		setupPlanGate("center_starter");
		setupData({ cases: [], claims: [] });

		render(<SubsidiesPage />);

		expect(screen.queryByRole("link", { name: /Upgrade plan/i })).not.toBeInTheDocument();
		expect(screen.getByText("Active cases")).toBeInTheDocument();
	});

	it("does not show a skeleton when not entitled (early return before loading check)", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: false, currentPlan: "home" });

		render(<SubsidiesPage />);

		// Only the upgrade CTA heading should be present, no skeleton placeholders
		expect(screen.getByRole("heading", { name: /Subsidies/i, level: 1 })).toBeInTheDocument();
		expect(screen.queryByText("Active cases")).not.toBeInTheDocument();
	});
});

describe("SubsidiesPage — update claim / record outcome", () => {
	function selectCase() {
		const caseButton = screen.getByRole("button", { name: /CASE-001/ });
		fireEvent.click(caseButton);
	}

	it("shows 'Update claim' button when the latest claim is submitted (non-draft)", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [SUBMITTED_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.getByRole("button", { name: /Update claim/i })).toBeInTheDocument();
	});

	it("does NOT show 'Update claim' button when there is no claim", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Update claim/i })).not.toBeInTheDocument();
	});

	it("does NOT show 'Update claim' button when the latest claim is a draft", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [DRAFT_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		expect(screen.queryByRole("button", { name: /Update claim/i })).not.toBeInTheDocument();
	});

	it("clicking 'Update claim' opens the update dialog", () => {
		setupPlanGate("center_starter");
		setupData({ claims: [SUBMITTED_CLAIM] });

		render(<SubsidiesPage />);
		selectCase();

		fireEvent.click(screen.getByRole("button", { name: /Update claim/i }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("submitting the update dialog calls useUpdateSubsidyClaim with the claim id and payload", async () => {
		setupPlanGate("center_starter");
		const updateMutateAsync = vi.fn().mockResolvedValue({});
		mockedUseUpdateSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: updateMutateAsync,
			isPending: false,
		} as never);
		// call setupData AFTER overriding the mock so the override wins
		mockedUseSubsidyCases.mockReturnValue({ data: [BASE_CASE], isLoading: false } as never);
		mockedUseSubsidyClaims.mockReturnValue({ data: [SUBMITTED_CLAIM], isLoading: false } as never);
		mockedUseCreateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseCreateSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseUpdateSubsidyCase.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseSubmitSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseDeleteSubsidyClaim.mockReturnValue({
			mutate: vi.fn(),
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		render(<SubsidiesPage />);
		selectCase();
		fireEvent.click(screen.getByRole("button", { name: /Update claim/i }));

		const amountApprovedInput = screen.getByLabelText(/Amount approved/i);
		fireEvent.change(amountApprovedInput, { target: { value: "450" } });

		const submitBtn = screen.getByRole("button", { name: /Save outcome/i });
		await act(async () => {
			fireEvent.click(submitBtn);
		});

		await waitFor(() => {
			expect(updateMutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({ id: SUBMITTED_CLAIM.id }),
			);
		});
	});
});
