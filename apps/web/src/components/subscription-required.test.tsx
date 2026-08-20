import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api";
import { SubscriptionRequired } from "./subscription-required";

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

function renderWithClient(ui: ReactNode) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const originalLocation = window.location;

// Default apiFetch behaviour: trial-usage returns empty, checkout succeeds (overridden per test).
function mockApiFetch(checkoutUrl?: string) {
	mockedApiFetch.mockImplementation((url: string) => {
		if (url === "/api/subscriptions/trial-usage") {
			return Promise.resolve({
				ok: true,
				json: async () => ({ usedFeatures: [] }),
			} as Response);
		}
		if (url === "/api/subscriptions/checkout" && checkoutUrl) {
			return Promise.resolve({
				ok: true,
				json: async () => ({ url: checkoutUrl }),
			} as Response);
		}
		return Promise.resolve({
			ok: false,
			json: async () => ({}),
		} as Response);
	});
}

beforeEach(() => {
	mockedApiFetch.mockReset();
	mockApiFetch();
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: { href: "" } as Location,
	});
});

afterEach(() => {
	Object.defineProperty(window, "location", {
		configurable: true,
		writable: true,
		value: originalLocation,
	});
});

describe("SubscriptionRequired", () => {
	it("renders the non-owner message for directors and staff", () => {
		renderWithClient(<SubscriptionRequired userRole="director" subscriptionStatus="canceled" />);

		expect(screen.getByText("Billing setup required")).toBeInTheDocument();
		expect(
			screen.getByText(
				"Ask your owner to complete billing setup to unlock PebbleDesk for your team.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText("Your subscription was canceled. Reactivate to continue using PebbleDesk."),
		).toBeInTheDocument();
	});

	it("renders the non-owner message without status copy for active-adjacent states", () => {
		renderWithClient(<SubscriptionRequired userRole="staff" subscriptionStatus="trialing" />);

		expect(screen.getByText("Billing setup required")).toBeInTheDocument();
		expect(screen.queryByText(/Your subscription was canceled/)).not.toBeInTheDocument();
	});

	it("hides the status copy banner when subscriptionStatus has no message", () => {
		const { container } = renderWithClient(
			<SubscriptionRequired userRole="owner" subscriptionStatus="active" />,
		);

		expect(screen.getByText("Choose your PebbleDesk plan")).toBeInTheDocument();
		expect(container.querySelector(".bg-warning\\/10")).toBeNull();
	});

	it("renders the plan picker for owners with all four plans and promo input", () => {
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="none" />);

		expect(screen.getByText("Choose your PebbleDesk plan")).toBeInTheDocument();
		expect(screen.getByText("Home")).toBeInTheDocument();
		expect(screen.getByText("Center Starter")).toBeInTheDocument();
		expect(screen.getByText("Center Pro")).toBeInTheDocument();
		expect(screen.getByText("Group")).toBeInTheDocument();
		expect(screen.getByText("$8/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$26/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$40/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getByText("$80/mo when paid yearly")).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: /Choose/ })).toHaveLength(4);
		expect(screen.getByLabelText("Promo code")).toBeInTheDocument();
		expect(
			screen.getByText("Limited offer: M80OFF for monthly. Y80OFF for yearly."),
		).toBeInTheDocument();
		expect(screen.getByPlaceholderText("M80OFF or Y80OFF")).toBeInTheDocument();
		expect(screen.getByText(/30-day money-back guarantee/)).toBeInTheDocument();
	});

	it("starts checkout for the selected plan and redirects on success", async () => {
		mockApiFetch("https://checkout.stripe.com/test-session");
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="canceled" />);

		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[0]);

		const confirmButton = await screen.findByRole("button", { name: "Continue with Home" });
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "home", cadence: "annual" }),
			});
		});
		await waitFor(() => {
			expect(window.location.href).toBe("https://checkout.stripe.com/test-session");
		});
	});

	it("passes the promo code to checkout when filled", async () => {
		mockApiFetch("https://checkout.stripe.com/test-session");
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="canceled" />);

		fireEvent.change(screen.getByLabelText("Promo code"), { target: { value: "Y80OFF" } });
		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[0]);

		const confirmButton = await screen.findByRole("button", { name: "Continue with Home" });
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "home", cadence: "annual", promoCode: "Y80OFF" }),
			});
		});
	});

	it("omits the promo code when the input is blank", async () => {
		mockApiFetch("https://checkout.stripe.com/test-session");
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="none" />);

		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[1]);

		const confirmButton = await screen.findByRole("button", {
			name: "Continue with Center Starter",
		});
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "center_starter", cadence: "annual" }),
			});
		});
	});

	it("sends monthly cadence when the buyer selects monthly", async () => {
		mockApiFetch("https://checkout.stripe.com/test-session");
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="none" />);

		fireEvent.click(screen.getByRole("button", { name: "Monthly" }));
		expect(screen.getByText("$32/mo")).toBeInTheDocument();

		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[1]);
		const confirmButton = await screen.findByRole("button", {
			name: "Continue with Center Starter",
		});
		fireEvent.click(confirmButton);

		await waitFor(() => {
			expect(mockedApiFetch).toHaveBeenCalledWith("/api/subscriptions/checkout", {
				method: "POST",
				body: JSON.stringify({ plan: "center_starter", cadence: "monthly" }),
			});
		});
	});

	it("surfaces the server error when checkout fails", async () => {
		mockedApiFetch.mockImplementation((url: string) => {
			if (url === "/api/subscriptions/trial-usage") {
				return Promise.resolve({
					ok: true,
					json: async () => ({ usedFeatures: [] }),
				} as Response);
			}
			return Promise.resolve({
				ok: false,
				status: 500,
				json: async () => ({ error: "stripe is down" }),
			} as Response);
		});

		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="past_due" />);

		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[0]);
		const confirmButton = await screen.findByRole("button", { name: "Continue with Home" });
		fireEvent.click(confirmButton);

		expect(await screen.findByRole("alert")).toHaveTextContent("stripe is down");
	});

	it("leads with restore-access recovery copy for past-due owners", () => {
		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="past_due" />);

		expect(screen.getByText("Restore PebbleDesk access")).toBeInTheDocument();
		expect(screen.getByText("Payment needs attention")).toBeInTheDocument();
		expect(screen.getByText(/Pick a plan below to restart checkout/i)).toBeInTheDocument();
	});

	it("falls back to the default checkout error message for non-Error rejections", async () => {
		mockedApiFetch.mockImplementation((url: string) => {
			if (url === "/api/subscriptions/trial-usage") {
				return Promise.resolve({
					ok: true,
					json: async () => ({ usedFeatures: [] }),
				} as Response);
			}
			return Promise.resolve({
				ok: false,
				status: 0,
				json: async () => ({}),
			} as Response);
		});

		renderWithClient(<SubscriptionRequired userRole="owner" subscriptionStatus="unpaid" />);

		fireEvent.click(screen.getAllByRole("button", { name: /Choose/ })[0]);
		const confirmButton = await screen.findByRole("button", { name: "Continue with Home" });
		fireEvent.click(confirmButton);

		expect(await screen.findByRole("alert")).toHaveTextContent("Could not start checkout");
	});
});
