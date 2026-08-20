import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanCheck } from "../lib/plan-gate";
import { PlanRequirementBadge } from "./plan-requirement-badge";

vi.mock("../lib/plan-gate", () => ({
	usePlanCheck: vi.fn(),
}));

const mockedUsePlanCheck = vi.mocked(usePlanCheck);

beforeEach(() => {
	mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "center_pro" });
});

describe("PlanRequirementBadge", () => {
	it("renders nothing when currentPlan is not trial", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "center_pro" });
		const { container } = render(<PlanRequirementBadge feature="subsidies" />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when currentPlan is null", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: false, currentPlan: null });
		const { container } = render(<PlanRequirementBadge feature="subsidies" />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders nothing when currentPlan is home", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "home" });
		const { container } = render(<PlanRequirementBadge feature="subsidies" />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders a badge with the minimum plan label when currentPlan is trial", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="subsidies" />);
		expect(screen.getByText("Center Starter feature")).toBeInTheDocument();
	});

	it("shows Center Pro feature for quickbooks", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="quickbooks" />);
		expect(screen.getByText("Center Pro feature")).toBeInTheDocument();
	});

	it("shows Center Starter feature for imports", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="imports" />);
		expect(screen.getByText("Center Starter feature")).toBeInTheDocument();
	});

	it("shows Group feature for multi_center", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="multi_center" />);
		expect(screen.getByText("Group feature")).toBeInTheDocument();
	});

	it("shows Center Pro feature for larger_center_reporting", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="larger_center_reporting" />);
		expect(screen.getByText("Center Pro feature")).toBeInTheDocument();
	});

	it("shows Center Starter feature for public_payment_links", () => {
		mockedUsePlanCheck.mockReturnValue({ allowed: true, currentPlan: "trial" });
		render(<PlanRequirementBadge feature="public_payment_links" />);
		expect(screen.getByText("Center Starter feature")).toBeInTheDocument();
	});
});
