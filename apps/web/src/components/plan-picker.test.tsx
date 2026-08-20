import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStartCheckout, useTrialFeatureUsage } from "../hooks/use-subscription";
import { PlanPicker } from "./plan-picker";

vi.mock("../hooks/use-subscription", () => ({
	useStartCheckout: vi.fn(),
	useTrialFeatureUsage: vi.fn(),
}));

// Radix Dialog portals render into document.body; no special wrapper needed for tests.
// Suppress React act() / query-error noise.
vi.spyOn(console, "error").mockImplementation(() => {});

const mockedUseStartCheckout = vi.mocked(useStartCheckout);
const mockedUseTrialFeatureUsage = vi.mocked(useTrialFeatureUsage);

function renderPicker(props: React.ComponentProps<typeof PlanPicker> = {}) {
	return render(<PlanPicker {...props} />);
}

function makeStartCheckout(overrides?: { isPending?: boolean; mutateAsync?: () => Promise<void> }) {
	return {
		mutateAsync: overrides?.mutateAsync ?? vi.fn().mockResolvedValue(undefined),
		isPending: overrides?.isPending ?? false,
	} as never;
}

beforeEach(() => {
	mockedUseStartCheckout.mockReturnValue(makeStartCheckout());
	mockedUseTrialFeatureUsage.mockReturnValue({
		data: { usedFeatures: [] },
		isLoading: false,
	} as never);
});

describe("PlanPicker plan grid", () => {
	it("renders all four payable plan names", () => {
		renderPicker();
		expect(screen.getByText("Home")).toBeInTheDocument();
		expect(screen.getByText("Center Starter")).toBeInTheDocument();
		expect(screen.getByText("Center Pro")).toBeInTheDocument();
		expect(screen.getByText("Group")).toBeInTheDocument();
		expect(screen.queryByText("Enterprise")).not.toBeInTheDocument();
	});

	it("shows annual prices by default", () => {
		renderPicker();
		expect(screen.getByText("$8/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$26/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$40/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$80/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getAllByText("80% off the first year")).toHaveLength(4);
		expect(screen.getByText("Then $129/mo when paid yearly ($1548/year)")).toBeInTheDocument();
		expect(screen.queryByText("80% off once")).not.toBeInTheDocument();
	});

	it("shows annual totals in annual mode", () => {
		renderPicker();
		expect(screen.getByText("$93.60/year")).toBeInTheDocument();
		expect(screen.getByText("$309.60/year")).toBeInTheDocument();
	});

	it("switches to monthly prices when Monthly is selected", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
		expect(screen.getByText("$10/mo")).toBeInTheDocument();
		expect(screen.getByText("$32/mo")).toBeInTheDocument();
		expect(screen.getByText("$48/mo")).toBeInTheDocument();
		expect(screen.getByText("$96/mo")).toBeInTheDocument();
		expect(screen.getAllByText("80% off the first year")).toHaveLength(4);
		expect(screen.getByText("Then $159/mo")).toBeInTheDocument();
		expect(screen.queryByText("80% off for 12 months")).not.toBeInTheDocument();
	});

	it("hides annual totals when monthly cadence is selected", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
		expect(screen.queryByText("$309.60/year")).not.toBeInTheDocument();
	});

	it("renders four Choose plan buttons", () => {
		renderPicker();
		const buttons = screen.getAllByRole("button", { name: /Choose/ });
		expect(buttons).toHaveLength(4);
	});

	it("renders feature checklists with Check for included features", () => {
		renderPicker();
		// Group plan includes all features; every feature label appears at least once
		expect(screen.getAllByText("Subsidy billing").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("QuickBooks sync").length).toBeGreaterThanOrEqual(1);
	});

	it("disables Choose buttons while checkout is pending", () => {
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ isPending: true }));
		renderPicker();
		const buttons = screen.getAllByRole("button", { name: /Choose/ });
		for (const btn of buttons) {
			expect(btn).toBeDisabled();
		}
	});
});

describe("PlanPicker confirm dialog", () => {
	it("opens the confirm dialog when a plan is clicked", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByText("Confirm Home plan")).toBeInTheDocument();
	});

	it("shows annual billing description in confirm dialog", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.getByText("$309.60/year paid upfront annually")).toBeInTheDocument();
		expect(screen.getByText("Then $129/mo when paid yearly ($1548/year).")).toBeInTheDocument();
		expect(screen.queryByText(/Normally \$1548\/year/)).not.toBeInTheDocument();
		expect(screen.queryByText("80% off once")).not.toBeInTheDocument();
	});

	it("shows monthly billing description when monthly cadence is selected", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByText("$10/mo paid monthly")).toBeInTheDocument();
		expect(screen.queryByText(/Normally \$49\/mo/)).not.toBeInTheDocument();
	});

	it("shows Continue button without warning when no trial features were used", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: [] },
			isLoading: false,
		} as never);
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(
			screen.getByRole("button", { name: "Continue with Center Starter" }),
		).toBeInTheDocument();
		expect(screen.queryByText("Features you've used aren't included")).not.toBeInTheDocument();
	});

	it("shows no warning when chosen plan covers all used features", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["subsidies"] },
			isLoading: false,
		} as never);
		renderPicker();
		// center_pro covers subsidies
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Pro" }));
		expect(screen.queryByText("Features you've used aren't included")).not.toBeInTheDocument();
	});

	it("shows warning when chosen plan does not cover used features", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker();
		// center_starter does not include quickbooks
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.getByText("Features you've used aren't included")).toBeInTheDocument();
		expect(screen.getByText(/During your trial you used/)).toBeInTheDocument();
	});

	it("shows trial end date in warning when trialEndsAt is provided", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker({ trialEndsAt: "2026-06-01T00:00:00.000Z" });
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.getByText(/You'd lose access on/)).toBeInTheDocument();
	});

	it("falls back to UTC for the trial end date when no center timezone is provided", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		// With no center timezone supplied, anchor to UTC so the day is stable and
		// does not shift in the viewer's browser zone.
		renderPicker({ trialEndsAt: "2026-06-01T00:00:00.000Z" });
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.getByText(/You'd lose access on June 1, 2026/)).toBeInTheDocument();
		expect(screen.queryByText(/May 31, 2026/)).not.toBeInTheDocument();
	});

	it("renders the trial end date in the center timezone, matching the billing card", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		// Midnight UTC on Jun 1 is the evening of May 31 in America/Chicago. The
		// loss-of-access date must use the center timezone so it matches the
		// "Trial ends" value shown on the billing subscription card.
		renderPicker({
			trialEndsAt: "2026-06-01T00:00:00.000Z",
			centerTimezone: "America/Chicago",
		});
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.getByText(/You'd lose access on May 31, 2026/)).toBeInTheDocument();
		expect(screen.queryByText(/June 1, 2026/)).not.toBeInTheDocument();
	});

	it("omits trial end date sentence when trialEndsAt is not provided", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		expect(screen.queryByText(/You'd lose access on/)).not.toBeInTheDocument();
	});

	it("shows Upgrade button pointing to minimum covering plan when there is a gap", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		// quickbooks requires center_pro
		expect(screen.getByRole("button", { name: "Upgrade to Center Pro" })).toBeInTheDocument();
	});

	it("hides Upgrade button when recommended plan equals the chosen plan", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker();
		// center_pro covers quickbooks; no upgrade needed
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Pro" }));
		expect(screen.queryByRole("button", { name: /Upgrade to/ })).not.toBeInTheDocument();
	});

	it("clicking Upgrade replaces the dialog with the recommended plan", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["quickbooks"] },
			isLoading: false,
		} as never);
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		fireEvent.click(screen.getByRole("button", { name: "Upgrade to Center Pro" }));
		expect(screen.getByText("Confirm Center Pro plan")).toBeInTheDocument();
	});

	it("clicking Cancel closes the confirm dialog", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByText("Confirm Home plan")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByText("Confirm Home plan")).not.toBeInTheDocument();
	});

	it("pressing Escape closes the confirm dialog via onOpenChange", () => {
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByText("Confirm Home plan")).toBeInTheDocument();
		fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
		expect(screen.queryByText("Confirm Home plan")).not.toBeInTheDocument();
	});

	it("calls startCheckout with the selected plan and cadence", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Center Starter" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Center Starter" }));
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				plan: "center_starter",
				cadence: "annual",
				promoCode: undefined,
			});
		});
	});

	it("passes the promoCode to checkout when provided", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker({ promoCode: "SAVE20" });
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				plan: "home",
				cadence: "annual",
				promoCode: "SAVE20",
			});
		});
	});

	it("omits promoCode from checkout when the prop is an empty string", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker({ promoCode: "  " });
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				plan: "home",
				cadence: "annual",
				promoCode: undefined,
			});
		});
	});

	it("calls checkout with monthly cadence when monthly is selected", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
		fireEvent.click(screen.getByRole("button", { name: "Choose Group" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Group" }));
		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				plan: "group",
				cadence: "monthly",
				promoCode: undefined,
			});
		});
	});

	it("shows Starting checkout while the mutation is pending", () => {
		// First render: isPending false so the Choose button is clickable.
		// After click → re-render: isPending true, so dialog shows "Starting checkout…".
		mockedUseStartCheckout.mockReturnValueOnce(makeStartCheckout({ isPending: false }));
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ isPending: true }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByRole("button", { name: "Starting checkout..." })).toBeDisabled();
		expect(screen.queryByRole("button", { name: "Continue with Home" })).not.toBeInTheDocument();
	});

	it("shows error when checkout fails", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Stripe is down"));
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Stripe is down");
	});

	it("falls back to generic error message for non-Error rejections", async () => {
		const mutateAsync = vi.fn().mockRejectedValue("offline");
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Could not start checkout.");
	});

	it("closes the confirm dialog after a successful checkout", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		expect(screen.getByText("Confirm Home plan")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		await waitFor(() => {
			expect(screen.queryByText("Confirm Home plan")).not.toBeInTheDocument();
		});
	});

	it("keeps the confirm dialog open when checkout fails", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Payment error"));
		mockedUseStartCheckout.mockReturnValue(makeStartCheckout({ mutateAsync }));
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Home" }));
		fireEvent.click(screen.getByRole("button", { name: "Continue with Home" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Payment error");
		expect(screen.getByText("Confirm Home plan")).toBeInTheDocument();
	});
});

describe("PlanPicker no upgrade button when gap plan equals chosen", () => {
	it("group plan with multi_center usage shows no upgrade button", () => {
		mockedUseTrialFeatureUsage.mockReturnValue({
			data: { usedFeatures: ["multi_center"] },
			isLoading: false,
		} as never);
		renderPicker();
		fireEvent.click(screen.getByRole("button", { name: "Choose Group" }));
		// group is already the minimum plan covering multi_center
		expect(screen.queryByRole("button", { name: /Upgrade to/ })).not.toBeInTheDocument();
		expect(screen.queryByText("Features you've used aren't included")).not.toBeInTheDocument();
	});
});
