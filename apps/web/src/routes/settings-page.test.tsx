import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: vi.fn(() =>
		vi.fn((options: Record<string, unknown>) => ({
			...options,
			useSearch: vi.fn(() => ({ quickbooks: undefined, reason: undefined })),
		})),
	),
	redirect: vi.fn((opts: unknown) => opts),
}));

vi.mock("@pebbledesk/ui/components/select", async () => {
	const React = await import("react");

	type SelectCtx = {
		value?: string;
		onChange?: (v: string) => void;
		options: { value: string; label: ReactNode }[];
		addOption: (value: string, label: ReactNode) => void;
	};

	const SelectContext = React.createContext<SelectCtx>({
		options: [],
		addOption: () => {},
	});

	return {
		Select: ({
			children,
			value,
			onValueChange,
		}: {
			children: ReactNode;
			value?: string;
			onValueChange?: (value: string) => void;
		}) => {
			const [options, setOptions] = React.useState<{ value: string; label: ReactNode }[]>([]);
			const addOption = React.useCallback((v: string, label: ReactNode) => {
				setOptions((prev) => {
					if (prev.some((o) => o.value === v)) return prev;
					return [...prev, { value: v, label }];
				});
			}, []);
			return (
				<SelectContext.Provider value={{ value, onChange: onValueChange, options, addOption }}>
					{children}
				</SelectContext.Provider>
			);
		},
		SelectTrigger: ({
			children: _children,
			id,
			"aria-label": ariaLabel,
		}: {
			children?: ReactNode;
			id?: string;
			"aria-label"?: string;
		}) => {
			const ctx = React.useContext(SelectContext);
			return (
				<select
					id={id}
					aria-label={ariaLabel}
					value={ctx.value ?? ""}
					onChange={(e) => ctx.onChange?.(e.target.value)}
				>
					<option value="">--</option>
					{ctx.options.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
			);
		},
		SelectValue: () => null,
		SelectContent: ({ children }: { children: ReactNode }) => (
			<div style={{ display: "none" }}>{children}</div>
		),
		SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
			const ctx = React.useContext(SelectContext);
			React.useEffect(() => {
				ctx.addOption(value, children);
			}, [value, children, ctx]);
			return null;
		},
	};
});

vi.mock("../hooks/use-subscription", () => ({
	useOpenBillingPortal: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
}));

vi.mock("../hooks/use-quickbooks", () => ({
	useQuickBooksStatus: vi.fn(),
	useQuickBooksSyncHistory: vi.fn(),
	useQuickBooksReconciliation: vi.fn(),
	useStartQuickBooksConnect: vi.fn(),
	useDisconnectQuickBooks: vi.fn(),
	useRunQuickBooksSync: vi.fn(),
	useApproveQuickBooksReconciliation: vi.fn(),
	useDismissQuickBooksReconciliation: vi.fn(),
}));

vi.mock("../hooks/use-finance", () => ({
	useInvoices: vi.fn(() => ({ data: [] })),
}));

vi.mock("../hooks/use-guardians", () => ({
	useGuardians: vi.fn(() => ({ data: [] })),
}));

vi.mock("../hooks/use-members", () => ({
	useMembers: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
	useInviteMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
	useRemoveMember: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			user: { id: "u-1", name: "Angel" },
			membership: { id: "m-1", centerId: "center-1", role: "owner" },
			center: {
				id: "center-1",
				name: "Sunshine",
				state: "TX",
				timezone: "America/Chicago",
				subscriptionPlan: "center_pro",
				subscriptionStatus: "active",
			},
			classroomIds: [],
		},
	})),
}));

vi.mock("../hooks/use-center", () => ({
	useCurrentCenter: vi.fn(() => ({ data: null, isLoading: false })),
	useUpdateCenter: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));

import { useAuthSession } from "../hooks/use-auth-session";
import { useCurrentCenter, useUpdateCenter } from "../hooks/use-center";
import { useInvoices } from "../hooks/use-finance";
import { useGuardians } from "../hooks/use-guardians";
import { useInviteMember, useMembers, useRemoveMember } from "../hooks/use-members";
import {
	useApproveQuickBooksReconciliation,
	useDisconnectQuickBooks,
	useDismissQuickBooksReconciliation,
	useQuickBooksReconciliation,
	useQuickBooksStatus,
	useQuickBooksSyncHistory,
	useRunQuickBooksSync,
	useStartQuickBooksConnect,
} from "../hooks/use-quickbooks";
import { SettingsPage, Route as SettingsRoute } from "./_auth/settings";

const mockedStatus = vi.mocked(useQuickBooksStatus);
const mockedHistory = vi.mocked(useQuickBooksSyncHistory);
const mockedRec = vi.mocked(useQuickBooksReconciliation);
const mockedStart = vi.mocked(useStartQuickBooksConnect);
const mockedDisconnect = vi.mocked(useDisconnectQuickBooks);
const mockedSync = vi.mocked(useRunQuickBooksSync);
const mockedApprove = vi.mocked(useApproveQuickBooksReconciliation);
const mockedDismiss = vi.mocked(useDismissQuickBooksReconciliation);

function setupBaseMocks(overrides: { isConfigured?: boolean; connection?: unknown } = {}) {
	mockedStatus.mockReturnValue({
		data: {
			connection: overrides.connection ?? null,
			openReconciliationCount: 0,
			isConfigured: overrides.isConfigured ?? true,
			configurationIssue: null,
		},
		isLoading: false,
	} as never);
	mockedHistory.mockReturnValue({ data: [], isLoading: false } as never);
	mockedRec.mockReturnValue({ data: [], isLoading: false } as never);
	mockedStart.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedDisconnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedSync.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedApprove.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
	mockedDismiss.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
}

describe("SettingsPage QuickBooks treatments", () => {
	it("renders one Connect QuickBooks button without a 'Not connected' badge when disconnected", () => {
		setupBaseMocks({ isConfigured: true, connection: null });
		render(<SettingsPage />);

		expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
		expect(screen.queryByText("QuickBooks unavailable")).not.toBeInTheDocument();
		const button = screen.getByRole("button", { name: /Connect QuickBooks/ });
		expect(button).not.toBeDisabled();
	});

	it("disables the Connect button without warning chrome when QuickBooks is not configured", () => {
		setupBaseMocks({ isConfigured: false, connection: null });
		render(<SettingsPage />);

		const button = screen.getByRole("button", { name: /Connect QuickBooks/ });
		expect(button).toBeDisabled();
		expect(button.className).not.toMatch(/text-warning/);
		expect(button.className).not.toMatch(/bg-warning/);
	});

	it("synthesizes an env-setup hint when QuickBooks is unconfigured and no issue string is provided", () => {
		setupBaseMocks({ isConfigured: false, connection: null });
		render(<SettingsPage />);

		expect(screen.getByText(/QuickBooks isn't configured in this environment/)).toBeInTheDocument();
		expect(screen.getByText("QUICKBOOKS_CLIENT_ID")).toBeInTheDocument();
		expect(screen.getByText("QUICKBOOKS_CLIENT_SECRET")).toBeInTheDocument();
		expect(screen.getByText("QUICKBOOKS_REDIRECT_URI")).toBeInTheDocument();
		expect(screen.getByText("apps/api/.dev.vars")).toBeInTheDocument();
	});

	it("prefers the server-provided configurationIssue over the synthesized hint", () => {
		mockedStatus.mockReturnValue({
			data: {
				connection: null,
				openReconciliationCount: 0,
				isConfigured: false,
				configurationIssue: "Intuit returned a scoped-token error; contact support.",
			},
			isLoading: false,
		} as never);
		mockedHistory.mockReturnValue({ data: [], isLoading: false } as never);
		mockedRec.mockReturnValue({ data: [], isLoading: false } as never);
		mockedStart.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedDisconnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedSync.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedApprove.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedDismiss.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<SettingsPage />);

		expect(
			screen.getByText("Intuit returned a scoped-token error; contact support."),
		).toBeInTheDocument();
		expect(
			screen.queryByText(/QuickBooks isn't configured in this environment/),
		).not.toBeInTheDocument();
	});

	it("uses the high-contrast solid primary fill for the Owner only badge", () => {
		setupBaseMocks();
		render(<SettingsPage />);

		const ownerBadge = screen.getByText("Owner only");
		expect(ownerBadge.className).toMatch(/bg-primary(?!\/)/);
		expect(ownerBadge.className).toMatch(/text-primary-foreground/);
	});

	it("lifts the disconnected warning to a single page-level banner", () => {
		setupBaseMocks({ isConfigured: true, connection: null });
		render(<SettingsPage />);

		const banner = screen.getByTestId("quickbooks-not-connected-banner");
		expect(banner.textContent).toMatch(/QuickBooks isn't connected/);
		// The in-card peach banner that used to repeat the same warning is gone.
		expect(screen.queryByText(/Start the Intuit consent flow/)).not.toBeInTheDocument();
	});

	it("shows section navigation and a focused QuickBooks review queue summary", () => {
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme",
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		mockedStatus.mockReturnValue({
			data: {
				connection: {
					realmId: "realm-1",
					companyName: "Acme",
					connectedAt: "2026-04-01T00:00:00.000Z",
					lastSyncAt: null,
					tokenExpiresAt: "2026-05-01T00:00:00.000Z",
				},
				openReconciliationCount: 2,
				isConfigured: true,
				configurationIssue: null,
			},
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Bookkeeping" })).toHaveAttribute(
			"href",
			"#bookkeeping",
		);
		expect(screen.getByText("QuickBooks review queue")).toBeInTheDocument();
		expect(screen.getByText("2 waiting")).toBeInTheDocument();
	});

	it("hides the page-level banner once a QuickBooks connection exists", () => {
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme",
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		render(<SettingsPage />);

		expect(screen.queryByTestId("quickbooks-not-connected-banner")).not.toBeInTheDocument();
	});

	it("renders the team roster with pending invites marked Invited", () => {
		setupBaseMocks();
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-04-01T00:00:00.000Z",
					acceptedAt: "2026-04-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-2",
					centerId: "c-1",
					userId: "u-2",
					role: "staff",
					joinedAt: "2026-04-02T00:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-02T00:00:00.000Z",
					userName: null,
					userEmail: "staff@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Angel")).toBeInTheDocument();
		expect(screen.getByText("staff@example.com")).toBeInTheDocument();
		expect(screen.getByText("Invited")).toBeInTheDocument();
		expect(screen.getByText("Active")).toBeInTheDocument();
	});

	it("submits an invite and closes the dialog", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useInviteMember).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Invite$/i }));
		fireEvent.change(screen.getByLabelText(/Email/i), {
			target: { value: "new@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Send invite/i }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({ email: "new@example.com", role: "staff" });
		});
	});

	it("surfaces invite errors from the mutation", async () => {
		setupBaseMocks();
		const mutateAsync = vi
			.fn()
			.mockRejectedValue(
				new Error(
					"We couldn't send that invite. Ask them to sign up with PebbleDesk first, or confirm they aren't already on your team.",
				),
			);
		vi.mocked(useInviteMember).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Invite$/i }));
		fireEvent.change(screen.getByLabelText(/Email/i), {
			target: { value: "missing@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Send invite/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent(/Ask them to sign up/);
	});

	it("renders center name in read mode from the loaded center", () => {
		setupBaseMocks();
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine Learning",
				address: "123 Elm",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Sunshine Learning")).toBeInTheDocument();
		expect(screen.getByText("123 Elm")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
	});

	it("reveals a pre-populated form when Edit is clicked", () => {
		setupBaseMocks();
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine Learning",
				address: "123 Elm",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		expect((screen.getByLabelText(/Center name/i) as HTMLInputElement).value).toBe(
			"Sunshine Learning",
		);
		expect((screen.getByLabelText(/Address/i) as HTMLInputElement).value).toBe("123 Elm");
		expect((screen.getByLabelText(/City/i) as HTMLInputElement).value).toBe("Austin");
	});

	it("calls mutateAsync with only changed fields on save", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine Learning",
				address: "123 Elm",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Center name/i), {
			target: { value: "Sunshine Academy" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({ name: "Sunshine Academy" });
		});
	});

	it("surfaces an error from a rejected center update", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Invalid state"));
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine Learning",
				address: "123 Elm",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Center name/i), {
			target: { value: "Broken" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

		expect(await screen.findByText(/Invalid state/)).toBeInTheDocument();
	});

	it("shows a Connected badge in the header when a connection exists", () => {
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme",
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		render(<SettingsPage />);

		const badges = screen.getAllByText("Connected");
		expect(badges.length).toBeGreaterThan(0);
	});

	it("opens the Stripe billing portal from the settings billing card", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({ url: "https://stripe.example/portal" });
		const { useOpenBillingPortal } = await import("../hooks/use-subscription");
		vi.mocked(useOpenBillingPortal).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
	});

	it("surfaces an error when opening the billing portal fails", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Stripe unreachable"));
		const { useOpenBillingPortal } = await import("../hooks/use-subscription");
		vi.mocked(useOpenBillingPortal).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Stripe unreachable");
	});

	it("renders the connected QuickBooks state with Export/Import/Full sync and Disconnect buttons", () => {
		const runMutate = vi.fn();
		const disconnectMutate = vi.fn();
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme Child Care",
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: "2026-04-05T00:00:00.000Z",
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		mockedSync.mockReturnValue({ mutate: runMutate, isPending: false } as never);
		mockedDisconnect.mockReturnValue({ mutate: disconnectMutate, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Export$/ }));
		fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
		fireEvent.click(screen.getByRole("button", { name: /Full sync/ }));
		fireEvent.click(screen.getByRole("button", { name: /Disconnect/ }));

		expect(runMutate).toHaveBeenCalledWith("export");
		expect(runMutate).toHaveBeenCalledWith("import");
		expect(runMutate).toHaveBeenCalledWith("full");
		expect(disconnectMutate).toHaveBeenCalled();
		expect(screen.getByText("Acme Child Care")).toBeInTheDocument();
		expect(screen.queryByText("Not yet synced")).not.toBeInTheDocument();
	});

	it("shows a 'Not yet synced' placeholder when a connection has never synced", () => {
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: null,
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		render(<SettingsPage />);

		expect(screen.getByText("Not yet synced")).toBeInTheDocument();
		expect(screen.getByText("Connected account")).toBeInTheDocument();
	});

	it("starts the Intuit consent flow and redirects when Connect QuickBooks succeeds", () => {
		setupBaseMocks({ isConfigured: true, connection: null });
		const assign = vi.fn();
		const originalLocation = window.location;
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, assign },
		});
		const mutate = vi.fn(
			(_input: undefined, opts?: { onSuccess?: (out: { url: string }) => void }) =>
				opts?.onSuccess?.({ url: "https://intuit.example/consent" }),
		);
		mockedStart.mockReturnValue({ mutate, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Connect QuickBooks/ }));

		expect(mutate).toHaveBeenCalled();
		expect(assign).toHaveBeenCalledWith("https://intuit.example/consent");

		Object.defineProperty(window, "location", {
			configurable: true,
			value: originalLocation,
		});
	});

	it("shows a QuickBooks sync-history skeleton while loading and an empty state when there is no history", () => {
		setupBaseMocks();
		mockedHistory.mockReturnValue({ data: undefined, isLoading: true } as never);
		const { rerender } = render(<SettingsPage />);
		expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

		mockedHistory.mockReturnValue({ data: [], isLoading: false } as never);
		rerender(<SettingsPage />);
		expect(screen.getByText("This center hasn't synced with QuickBooks.")).toBeInTheDocument();
	});

	it("renders sync-history rows with entity type, direction/status, and target QuickBooks id", () => {
		setupBaseMocks();
		mockedHistory.mockReturnValue({
			data: [
				{
					id: "hist-1",
					entityType: "invoice",
					entityId: "inv-1",
					direction: "export",
					status: "success",
					qbEntityId: "qb-42",
					syncedAt: "2026-04-01T00:00:00.000Z",
				},
				{
					id: "hist-2",
					entityType: "customer",
					entityId: "guardian-1",
					direction: "import",
					status: "failed",
					qbEntityId: null,
					syncedAt: "2026-04-02T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("invoice inv-1")).toBeInTheDocument();
		expect(screen.getByText(/export success/)).toBeInTheDocument();
		expect(screen.getByText(/to qb-42/)).toBeInTheDocument();
		expect(screen.getByText("customer guardian-1")).toBeInTheDocument();
		expect(screen.getByText(/import failed/)).toBeInTheDocument();
	});

	it("shows a skeleton while the reconciliation queue is loading", () => {
		setupBaseMocks();
		mockedRec.mockReturnValue({ data: undefined, isLoading: true } as never);
		render(<SettingsPage />);

		expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("enables Approve on a local-origin reconciliation item once a QuickBooks id is entered", () => {
		setupBaseMocks();
		const approve = vi.fn();
		const dismiss = vi.fn();
		mockedApprove.mockReturnValue({ mutate: approve, isPending: false } as never);
		mockedDismiss.mockReturnValue({ mutate: dismiss, isPending: false } as never);
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-1",
					origin: "pebbledesk",
					entityType: "invoice",
					entityId: "inv-1",
					qbEntityId: null,
					qbEntityType: "Invoice",
					title: "Missing QuickBooks link",
					description: "Attach this invoice to its QuickBooks counterpart.",
					proposedChanges: { amount: "$250" },
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText(/QuickBooks entity id for rec-1/), {
			target: { value: "qb-999" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		expect(approve).toHaveBeenCalledWith(
			expect.objectContaining({ id: "rec-1", qbEntityId: "qb-999" }),
		);

		fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
		expect(dismiss).toHaveBeenCalledWith("rec-1");
	});

	it("requires a local guardian/invoice match for QuickBooks-origin reconciliation items", () => {
		setupBaseMocks();
		vi.mocked(useMembers).mockReturnValue({ data: [], isLoading: false, isError: false } as never);
		const approve = vi.fn();
		mockedApprove.mockReturnValue({ mutate: approve, isPending: false } as never);
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-2",
					origin: "quickbooks",
					entityType: "customer",
					entityId: "qb-cust-1",
					qbEntityId: "qb-cust-1",
					qbEntityType: "Customer",
					title: "Unmatched QuickBooks customer",
					description: "Link this QuickBooks customer to a local guardian.",
					proposedChanges: {
						lineItems: [{ id: "li-1", amount: "$100" }],
					},
					createdAt: "2026-04-03T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		vi.mocked(useGuardians).mockReturnValue({
			data: [{ id: "g-1", firstName: "Sam", lastName: "Reed", email: "sam@example.com" }],
		} as never);

		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText(/Local guardian for rec-2/), {
			target: { value: "g-1" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		expect(approve).toHaveBeenCalledWith(
			expect.objectContaining({ id: "rec-2", localTargetId: "g-1" }),
		);
	});

	it("renders full invite roster including fallback 'Pending invite' when user has no name or email", () => {
		setupBaseMocks();
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "director",
					joinedAt: "2026-04-01T00:00:00.000Z",
					acceptedAt: null,
					invitedAt: "2026-04-01T00:00:00.000Z",
					userName: null,
					userEmail: null,
				},
			],
			isLoading: false,
			isError: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Pending invite")).toBeInTheDocument();
		expect(screen.getByText("director")).toBeInTheDocument();
	});

	it("shows an error fallback when the team roster fails to load", () => {
		setupBaseMocks();
		vi.mocked(useMembers).mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Could not load the team roster.")).toBeInTheDocument();
	});

	it("shows a loading skeleton and empty-roster copy for the team card", () => {
		setupBaseMocks();
		vi.mocked(useMembers).mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
		} as never);
		const { rerender } = render(<SettingsPage />);
		expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);

		vi.mocked(useMembers).mockReturnValue({
			data: [],
			isLoading: false,
			isError: false,
		} as never);
		rerender(<SettingsPage />);
		expect(screen.getByText("No members yet.")).toBeInTheDocument();
	});

	it("cancels the invite dialog and clears error state when closed via Cancel", () => {
		setupBaseMocks();
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Invite$/ }));
		fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
		expect(screen.queryByLabelText(/Email/)).not.toBeInTheDocument();
	});

	it("sends changes for each editable center profile field on save", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: null,
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Address/i), { target: { value: "2 B" } });
		fireEvent.change(screen.getByLabelText(/City/i), { target: { value: "Dallas" } });
		fireEvent.change(screen.getByLabelText(/^State$/i), { target: { value: "ca" } });
		fireEvent.change(screen.getByLabelText(/ZIP/i), { target: { value: "75001" } });
		fireEvent.change(screen.getByLabelText(/Phone/i), { target: { value: "(555) 555-0101" } });
		fireEvent.change(screen.getByLabelText(/License number/i), { target: { value: "LIC-9" } });
		fireEvent.change(screen.getByLabelText(/Timezone/i), {
			target: { value: "America/Los_Angeles" },
		});
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				address: "2 B",
				city: "Dallas",
				state: "CA",
				zip: "75001",
				phone: "(555) 555-0101",
				licenseNumber: "LIC-9",
				timezone: "America/Los_Angeles",
			});
		});
	});

	it("closes the center edit form without calling mutateAsync when there are no changes", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn();
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
		});
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("discards edits when Cancel is clicked on the center profile form", () => {
		setupBaseMocks();
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Center name/i), { target: { value: "Other" } });
		fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
		expect(screen.queryByLabelText(/Center name/i)).not.toBeInTheDocument();
		expect(screen.getByText("Sunshine")).toBeInTheDocument();
	});

	it("renders a '—' placeholder for unset licenseNumber in the read-mode center profile", () => {
		setupBaseMocks();
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: null,
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("shows the post-OAuth success banner when search params indicate a completed connection", () => {
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme",
				connectedAt: "2026-04-01T00:00:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		vi.mocked(SettingsRoute.useSearch).mockReturnValueOnce({
			quickbooks: "connected",
			reason: undefined,
		});
		render(<SettingsPage />);
		expect(screen.getByText("QuickBooks connected successfully.")).toBeInTheDocument();
	});

	it("renders a fallback failure banner when the OAuth redirect supplies no reason", () => {
		setupBaseMocks();
		vi.mocked(SettingsRoute.useSearch).mockReturnValueOnce({
			quickbooks: "error",
			reason: undefined,
		});
		render(<SettingsPage />);
		expect(screen.getByText("QuickBooks connection could not be completed.")).toBeInTheDocument();
	});

	it("passes through a server-provided OAuth error reason in the failure banner", () => {
		setupBaseMocks();
		vi.mocked(SettingsRoute.useSearch).mockReturnValueOnce({
			quickbooks: "error",
			reason: "State mismatch — please reconnect.",
		});
		render(<SettingsPage />);
		expect(screen.getByText("State mismatch — please reconnect.")).toBeInTheDocument();
	});

	it("uses safe fallbacks when QuickBooks status is undefined", () => {
		mockedStatus.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedHistory.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedRec.mockReturnValue({ data: undefined, isLoading: false } as never);
		mockedStart.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedDisconnect.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedSync.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedApprove.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
		mockedDismiss.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);

		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: /Connect QuickBooks/ })).not.toBeDisabled();
	});

	it("renders a reconciliation row with only lineItems proposedChanges", () => {
		setupBaseMocks();
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-only-lines",
					origin: "pebbledesk",
					entityType: "invoice",
					entityId: "inv-9",
					qbEntityId: "qb-9",
					qbEntityType: "Invoice",
					title: "Invoice line items changed",
					description: "Review the invoice line items.",
					proposedChanges: { lineItems: [{ id: "li-1" }] },
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("1 line item")).toBeInTheDocument();
	});

	it("renders nothing extra when a reconciliation item has no proposedChanges", () => {
		setupBaseMocks();
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-empty",
					origin: "pebbledesk",
					entityType: "invoice",
					entityId: "inv-empty",
					qbEntityId: "qb-empty",
					qbEntityType: "Invoice",
					title: "Minimal",
					description: "No changes",
					proposedChanges: null,
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Minimal")).toBeInTheDocument();
	});

	it("supports switching the invite role selection to director", () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useInviteMember).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Invite$/ }));
		fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "dir@example.com" } });
		fireEvent.change(screen.getByLabelText(/Role/), { target: { value: "director" } });
		fireEvent.click(screen.getByRole("button", { name: /Send invite/ }));

		return waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({ email: "dir@example.com", role: "director" });
		});
	});

	it("leaves licenseNumber out of the update payload when it was cleared during editing", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/License number/i), { target: { value: "" } });
		fireEvent.change(screen.getByLabelText(/Center name/i), { target: { value: "Other" } });
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({ name: "Other" });
		});
	});

	it("ignores an unsupported timezone selection when diffing the center profile update", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockResolvedValue({});
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: null,
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Timezone/i), {
			target: { value: "Mars/Olympus_Mons" },
		});
		fireEvent.change(screen.getByLabelText(/Center name/i), { target: { value: "Moved" } });
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalled();
		});
		const call = mutateAsync.mock.calls[0][0];
		expect(call).not.toHaveProperty("timezone");
	});

	it("requires a local invoice match on QuickBooks-origin payment reconciliation items", () => {
		setupBaseMocks();
		const approve = vi.fn();
		mockedApprove.mockReturnValue({ mutate: approve, isPending: false } as never);
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-pay",
					origin: "quickbooks",
					entityType: "payment",
					entityId: "qb-pay-1",
					qbEntityId: "qb-pay-1",
					qbEntityType: "Payment",
					title: "Unmatched QuickBooks payment",
					description: "Match to a local invoice.",
					proposedChanges: null,
					createdAt: "2026-04-04T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		vi.mocked(useInvoices).mockReturnValue({
			data: [{ id: "inv-7", status: "sent", amountDue: 125.5 }],
		} as never);

		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
		fireEvent.change(screen.getByLabelText(/Local invoice for rec-pay/), {
			target: { value: "inv-7" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		expect(approve).toHaveBeenCalledWith(
			expect.objectContaining({ id: "rec-pay", localTargetId: "inv-7" }),
		);
	});

	it("keeps the Approve button enabled on a non-quickbooks item whose qbEntityId is already set", () => {
		setupBaseMocks();
		const approve = vi.fn();
		mockedApprove.mockReturnValue({ mutate: approve, isPending: false } as never);
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-ready",
					origin: "pebbledesk",
					entityType: "invoice",
					entityId: "inv-ready",
					qbEntityId: "qb-existing",
					qbEntityType: "Invoice",
					title: "Already linked",
					description: "QuickBooks id already attached.",
					proposedChanges: { amount: "$10", note: "late fee", when: "Apr" },
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: "Approve" })).not.toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));
		expect(approve).toHaveBeenCalledWith(
			expect.objectContaining({ id: "rec-ready", qbEntityId: "qb-existing" }),
		);
	});

	it("falls back to generic copy when invite, center update, and billing portal reject with non-Error values", async () => {
		setupBaseMocks();
		const inviteAsync = vi.fn().mockRejectedValue("nope");
		vi.mocked(useInviteMember).mockReturnValue({
			mutateAsync: inviteAsync,
			isPending: false,
		} as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /^Invite$/ }));
		fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "x@y.z" } });
		fireEvent.click(screen.getByRole("button", { name: /Send invite/ }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Could not invite member.");
	});

	it("falls back to generic copy when the center update rejects with a non-Error value", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockRejectedValue("bad");
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		fireEvent.change(screen.getByLabelText(/Center name/i), { target: { value: "Other" } });
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

		expect(await screen.findByText("Could not update center.")).toBeInTheDocument();
	});

	it("falls back to generic copy when opening the billing portal rejects with a non-Error value", async () => {
		setupBaseMocks();
		const mutateAsync = vi.fn().mockRejectedValue({ status: 502 });
		const { useOpenBillingPortal } = await import("../hooks/use-subscription");
		vi.mocked(useOpenBillingPortal).mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: "Manage billing" }));

		expect(await screen.findByText("Could not open the billing portal.")).toBeInTheDocument();
	});

	it("shows pending-state button copy while invite, center-update, and billing-portal mutations are running", async () => {
		setupBaseMocks();
		vi.mocked(useInviteMember).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);
		vi.mocked(useCurrentCenter).mockReturnValue({
			data: {
				id: "center-1",
				name: "Sunshine",
				address: "1 A",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "(512) 555-0100",
				licenseNumber: "LIC-1",
				timezone: "America/Chicago",
				createdAt: "2026-03-01T00:00:00.000Z",
				updatedAt: "2026-03-01T00:00:00.000Z",
			},
			isLoading: false,
		} as never);
		vi.mocked(useUpdateCenter).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);
		const { useOpenBillingPortal } = await import("../hooks/use-subscription");
		vi.mocked(useOpenBillingPortal).mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: true,
		} as never);

		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: /Opening…/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
		expect(screen.getByRole("button", { name: /Saving…/ })).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /^Invite$/ }));
		fireEvent.change(screen.getByLabelText(/Email/), { target: { value: "a@b.c" } });
		expect(screen.getByRole("button", { name: /Sending…/ })).toBeInTheDocument();
	});

	it("renders a reconciliation summary with proposed-changes object that has no meaningful entries", () => {
		setupBaseMocks();
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-nothing",
					origin: "pebbledesk",
					entityType: "invoice",
					entityId: "inv-nothing",
					qbEntityId: "qb-nothing",
					qbEntityType: "Invoice",
					title: "Empty changes",
					description: "Just structure.",
					proposedChanges: {},
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		render(<SettingsPage />);

		expect(screen.getByText("Empty changes")).toBeInTheDocument();
	});

	it("exposes a validateSearch guard that keeps only string quickbooks/reason values", () => {
		expect(SettingsRoute.validateSearch({ quickbooks: "connected", reason: "ok" })).toEqual({
			quickbooks: "connected",
			reason: "ok",
		});
		expect(SettingsRoute.validateSearch({ quickbooks: 42, reason: null })).toEqual({
			quickbooks: undefined,
			reason: undefined,
		});
	});

	it("enables QuickBooks query options for legacy full-access trial centers before plan selection", () => {
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "trial",
					subscriptionStatus: "trialing",
				},
				classroomIds: [],
			},
		} as never);
		setupBaseMocks();

		render(<SettingsPage />);

		expect(mockedStatus).toHaveBeenCalledWith({ enabled: true });
		expect(mockedHistory).toHaveBeenCalledWith({ enabled: true });
		expect(mockedRec).toHaveBeenCalledWith("open", { enabled: true });
		expect(screen.getByTestId("quickbooks-not-connected-banner")).toBeInTheDocument();
	});

	it("disables QuickBooks query options for selected trials below the QuickBooks plan", () => {
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_starter",
					subscriptionStatus: "trialing",
				},
				classroomIds: [],
			},
		} as never);
		setupBaseMocks();

		render(<SettingsPage />);

		expect(mockedStatus).toHaveBeenCalledWith({ enabled: false });
		expect(mockedHistory).toHaveBeenCalledWith({ enabled: false });
		expect(mockedRec).toHaveBeenCalledWith("open", { enabled: false });
		expect(screen.queryByTestId("quickbooks-not-connected-banner")).not.toBeInTheDocument();
	});

	it("formats the QuickBooks connection timestamps with the shared date-time helper", () => {
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		setupBaseMocks({
			connection: {
				realmId: "realm-1",
				companyName: "Acme",
				connectedAt: "2026-04-01T15:30:00.000Z",
				lastSyncAt: null,
				tokenExpiresAt: "2026-05-01T00:00:00.000Z",
			},
		});
		render(<SettingsPage />);

		// The shared formatDateTime renders "Mon D, YYYY h:MM AM/PM" rather than a
		// raw ISO string. Assert the date portion is present and the ISO is gone.
		expect(screen.getAllByText(/Apr 1, 2026/).length).toBeGreaterThan(0);
		expect(screen.queryByText("2026-04-01T15:30:00.000Z")).not.toBeInTheDocument();
	});

	it("shows the center profile card skeleton while the auth session is loading", () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		render(<SettingsPage />);

		expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
	});

	it("renders invoice amount in the reconciliation drop-down using formatCurrency (comma separators, no manual $)", async () => {
		setupBaseMocks();
		// Reset auth session to ensure hasQuickBooksFeature is true (center_pro plan).
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		// Provide a reconciliation item with entityType "payment" (which also
		// shows the local invoice selector) so the Select renders with invoice options.
		const approve = vi.fn();
		mockedApprove.mockReturnValue({ mutate: approve, isPending: false } as never);
		mockedRec.mockReturnValue({
			data: [
				{
					id: "rec-inv-big",
					origin: "quickbooks",
					entityType: "payment",
					entityId: "qb-pay-big",
					qbEntityId: "qb-pay-big",
					qbEntityType: "Payment",
					title: "Unmatched payment",
					description: "Match to a local invoice.",
					proposedChanges: null,
					createdAt: "2026-04-01T00:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);
		// Invoice with amountDue > 999 so comma separator is required
		vi.mocked(useInvoices).mockReturnValue({
			data: [
				{
					id: "inv-big",
					status: "open",
					amountDue: 1234.5,
				},
			],
		} as never);

		render(<SettingsPage />);

		// The SelectTrigger mock renders a native <select> with <option> children
		// populated from SelectItem via useEffect. Once the select is rendered,
		// find the option whose value is "inv-big" and assert it contains "$1,234.50".
		const select = screen.getByLabelText(/Local invoice for rec-inv-big/i);
		const option = Array.from(select.querySelectorAll("option")).find((o) => o.value === "inv-big");
		expect(option).toBeDefined();
		expect(option?.textContent).toContain("$1,234.50");
		expect(option?.textContent).not.toContain("$1234.50");
	});

	it("renders a Remove button for another member's row when the current user is an owner", () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-2",
					centerId: "c-1",
					userId: "u-2",
					role: "staff",
					joinedAt: "2026-02-01T00:00:00.000Z",
					acceptedAt: "2026-02-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Carol",
					userEmail: "carol@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);

		render(<SettingsPage />);

		expect(screen.getByRole("button", { name: /remove member/i })).toBeInTheDocument();
	});

	it("does NOT render a Remove button for the current user's own row", () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-2",
					centerId: "c-1",
					userId: "u-2",
					role: "staff",
					joinedAt: "2026-02-01T00:00:00.000Z",
					acceptedAt: "2026-02-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Carol",
					userEmail: "carol@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);

		render(<SettingsPage />);

		// Only one Remove button (for Carol), not one for Angel (current user, id "m-1")
		const removeBtns = screen.getAllByRole("button", { name: /remove member/i });
		expect(removeBtns).toHaveLength(1);
	});

	it("does NOT render any Remove button when the current user is not an owner", () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-99", name: "Bob", email: "bob@example.com" },
				membership: { id: "m-99", centerId: "center-1", role: "staff" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-99",
					centerId: "c-1",
					userId: "u-99",
					role: "staff",
					joinedAt: "2026-02-01T00:00:00.000Z",
					acceptedAt: "2026-02-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Bob",
					userEmail: "bob@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);

		render(<SettingsPage />);

		expect(screen.queryByRole("button", { name: /remove member/i })).toBeNull();
	});

	it("shows the confirm dialog with the member name when Remove is clicked", async () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-2",
					centerId: "c-1",
					userId: "u-2",
					role: "staff",
					joinedAt: "2026-02-01T00:00:00.000Z",
					acceptedAt: "2026-02-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Carol",
					userEmail: "carol@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);

		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /remove member/i }));

		await waitFor(() => {
			expect(screen.getByText("Remove member?")).toBeInTheDocument();
		});
		expect(screen.getAllByText(/Carol/).length).toBeGreaterThan(0);
	});

	it("calls removeMember.mutate with the correct member id when the confirm button is clicked", async () => {
		setupBaseMocks();
		vi.mocked(useAuthSession).mockReturnValue({
			data: {
				user: { id: "u-1", name: "Angel", email: "angel@example.com" },
				membership: { id: "m-1", centerId: "center-1", role: "owner" },
				center: {
					id: "center-1",
					name: "Sunshine",
					state: "TX",
					timezone: "America/Chicago",
					subscriptionPlan: "center_pro",
					subscriptionStatus: "active",
				},
				classroomIds: [],
			},
		} as never);
		const mutate = vi.fn();
		vi.mocked(useRemoveMember).mockReturnValue({ mutate, isPending: false } as never);
		vi.mocked(useMembers).mockReturnValue({
			data: [
				{
					id: "m-1",
					centerId: "c-1",
					userId: "u-1",
					role: "owner",
					joinedAt: "2026-01-01T00:00:00.000Z",
					acceptedAt: "2026-01-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Angel",
					userEmail: "angel@example.com",
				},
				{
					id: "m-2",
					centerId: "c-1",
					userId: "u-2",
					role: "staff",
					joinedAt: "2026-02-01T00:00:00.000Z",
					acceptedAt: "2026-02-01T00:00:00.000Z",
					invitedAt: null,
					userName: "Carol",
					userEmail: "carol@example.com",
				},
			],
			isLoading: false,
			isError: false,
		} as never);

		render(<SettingsPage />);

		fireEvent.click(screen.getByRole("button", { name: /remove member/i }));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: "Remove" }));

		await waitFor(() => {
			expect(mutate).toHaveBeenCalledWith("m-2");
		});
	});
});
