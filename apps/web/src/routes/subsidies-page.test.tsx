import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
		SelectTrigger: ({ id }: { children?: ReactNode; id?: string; className?: string }) => {
			const ctx = React.useContext(SelectContext);
			return (
				<select id={id} value={ctx.value ?? ""} onChange={(e) => ctx.onChange?.(e.target.value)}>
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

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
	};
});

vi.mock("../hooks/use-finance", () => ({
	useSubsidyCases: vi.fn(),
	useSubsidyClaims: vi.fn(),
	useCreateSubsidyCase: vi.fn(),
	useCreateSubsidyClaim: vi.fn(),
	useUpdateSubsidyCase: vi.fn(),
	useSubmitSubsidyClaim: vi.fn(),
	useDeleteSubsidyClaim: vi.fn(),
	useUpdateSubsidyClaim: vi.fn(),
}));

vi.mock("../lib/plan-gate", () => ({
	usePlanCheck: vi.fn(() => ({ allowed: true, currentPlan: "center_starter" })),
	PlanGate: ({ fallback }: { plans: string[]; children: ReactNode; fallback?: ReactNode }) =>
		fallback ?? null,
}));

vi.mock("../hooks/use-children", () => ({
	useChildren: vi.fn(),
}));

import { useChildren } from "../hooks/use-children";
import {
	useCreateSubsidyCase,
	useCreateSubsidyClaim,
	useDeleteSubsidyClaim,
	useSubmitSubsidyClaim,
	useSubsidyCases,
	useSubsidyClaims,
	useUpdateSubsidyCase,
	useUpdateSubsidyClaim,
} from "../hooks/use-finance";
import { SubsidiesPage } from "./_auth/subsidies/index";

const mockedUseSubsidyCases = vi.mocked(useSubsidyCases);
const mockedUseSubsidyClaims = vi.mocked(useSubsidyClaims);
const mockedUseCreateSubsidyCase = vi.mocked(useCreateSubsidyCase);
const mockedUseCreateSubsidyClaim = vi.mocked(useCreateSubsidyClaim);
const mockedUseUpdateSubsidyCase = vi.mocked(useUpdateSubsidyCase);
const mockedUseSubmitSubsidyClaim = vi.mocked(useSubmitSubsidyClaim);
const mockedUseDeleteSubsidyClaim = vi.mocked(useDeleteSubsidyClaim);
const mockedUseUpdateSubsidyClaim = vi.mocked(useUpdateSubsidyClaim);
const mockedUseChildren = vi.mocked(useChildren);

function mutationSpy(overrides: Partial<{ mutateAsync: ReturnType<typeof vi.fn> }> = {}) {
	return {
		mutate: vi.fn(),
		mutateAsync: overrides.mutateAsync ?? vi.fn().mockResolvedValue(undefined),
		isPending: false,
	};
}

describe("SubsidiesPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedUseSubsidyCases.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseSubsidyClaims.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseCreateSubsidyCase.mockReturnValue(mutationSpy() as never);
		mockedUseCreateSubsidyClaim.mockReturnValue(mutationSpy() as never);
		mockedUseUpdateSubsidyCase.mockReturnValue(mutationSpy() as never);
		mockedUseSubmitSubsidyClaim.mockReturnValue(mutationSpy() as never);
		mockedUseDeleteSubsidyClaim.mockReturnValue(mutationSpy() as never);
		mockedUseUpdateSubsidyClaim.mockReturnValue(mutationSpy() as never);
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "550e8400-e29b-41d4-a716-446655440000",
					firstName: "Ava",
					lastName: "Johnson",
				},
			],
			isLoading: false,
		} as never);
	});

	it("renders a 'New case' CTA in the header", () => {
		render(<SubsidiesPage />);

		const buttons = screen.getAllByRole("button", { name: /New case/i });
		expect(buttons.length).toBeGreaterThan(0);
	});

	it("opens the new subsidy case dialog when the CTA is clicked", () => {
		render(<SubsidiesPage />);

		fireEvent.click(screen.getAllByRole("button", { name: /New case/i })[0]);

		expect(screen.getByText("New subsidy case")).toBeInTheDocument();
		expect(screen.getByLabelText("Child")).toBeInTheDocument();
	});

	it("submits the subsidy case with the selected payload", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({ id: "case-new" });
		mockedUseCreateSubsidyCase.mockReturnValue(mutationSpy({ mutateAsync }) as never);

		render(<SubsidiesPage />);
		fireEvent.click(screen.getAllByRole("button", { name: /New case/i })[0]);

		const selects = screen.getAllByRole("combobox");
		fireEvent.change(selects[0], {
			target: { value: "550e8400-e29b-41d4-a716-446655440000" },
		});
		fireEvent.change(selects[1], { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText("Case number"), { target: { value: "CASE-1" } });
		fireEvent.change(screen.getByLabelText("Agency name"), { target: { value: "County" } });
		fireEvent.change(screen.getByLabelText("Effective date"), {
			target: { value: "2026-04-01" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Create case" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				childId: "550e8400-e29b-41d4-a716-446655440000",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County",
				effectiveDate: "2026-04-01",
				status: "active",
			});
		});
	});

	it("surfaces inline errors from the create subsidy case mutation", async () => {
		const mutateAsync = vi.fn().mockRejectedValue(new Error("Case number already exists"));
		mockedUseCreateSubsidyCase.mockReturnValue(mutationSpy({ mutateAsync }) as never);

		render(<SubsidiesPage />);
		fireEvent.click(screen.getAllByRole("button", { name: /New case/i })[0]);

		const selects = screen.getAllByRole("combobox");
		fireEvent.change(selects[0], {
			target: { value: "550e8400-e29b-41d4-a716-446655440000" },
		});
		fireEvent.change(selects[1], { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText("Case number"), { target: { value: "CASE-1" } });
		fireEvent.change(screen.getByLabelText("Agency name"), { target: { value: "County" } });
		fireEvent.change(screen.getByLabelText("Effective date"), {
			target: { value: "2026-04-01" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Create case" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Case number already exists");
		});
	});

	it("shows a 'New claim' CTA after a case row is selected", () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		render(<SubsidiesPage />);

		expect(screen.queryByRole("button", { name: /New claim/i })).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /CASE-123/ }));
		expect(screen.getByRole("button", { name: /New claim/i })).toBeInTheDocument();
	});

	it("submits a new subsidy claim against the selected case", async () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		const mutateAsync = vi.fn().mockResolvedValue({ id: "claim-new" });
		mockedUseCreateSubsidyClaim.mockReturnValue(mutationSpy({ mutateAsync }) as never);

		render(<SubsidiesPage />);

		fireEvent.click(screen.getByRole("button", { name: /CASE-123/ }));
		fireEvent.click(screen.getByRole("button", { name: /New claim/i }));

		fireEvent.change(screen.getByLabelText("Period start"), { target: { value: "2026-04-01" } });
		fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2026-04-07" } });
		fireEvent.change(screen.getByLabelText("Days attended"), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText("Hours attended"), { target: { value: "25" } });
		fireEvent.change(screen.getByLabelText("Amount claimed"), { target: { value: "300" } });

		fireEvent.click(screen.getByRole("button", { name: "Create claim" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				subsidyCaseId: "case-1",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				daysAttended: 5,
				hoursAttended: 25,
				amountClaimed: 300,
				status: "draft",
			});
		});
	});

	it("Edit button opens dialog with pre-populated fields", () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		render(<SubsidiesPage />);

		// Select the case row to reveal the Edit button
		fireEvent.click(screen.getByRole("button", { name: /CASE-123/ }));
		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

		// The edit dialog title should be shown
		expect(screen.getByText("Edit subsidy case")).toBeInTheDocument();

		// The case number field should be pre-populated
		const caseNumberInput = screen.getByLabelText("Case number");
		expect(caseNumberInput).toHaveValue("CASE-123");

		// The agency name field should be pre-populated
		const agencyNameInput = screen.getByLabelText("Agency name");
		expect(agencyNameInput).toHaveValue("County Services");
	});

	it("Save changes calls PATCH with edited fields", async () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		const mutateAsync = vi.fn().mockResolvedValue({ id: "case-1" });
		mockedUseUpdateSubsidyCase.mockReturnValue(mutationSpy({ mutateAsync }) as never);

		render(<SubsidiesPage />);

		// Open the edit dialog
		fireEvent.click(screen.getByRole("button", { name: /CASE-123/ }));
		fireEvent.click(screen.getByRole("button", { name: /Edit/i }));

		// Update the agency name
		fireEvent.change(screen.getByLabelText("Agency name"), {
			target: { value: "State Agency" },
		});

		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith(
				expect.objectContaining({
					id: "case-1",
					input: expect.objectContaining({
						agencyName: "State Agency",
						caseNumber: "CASE-123",
						program: "ccdf",
					}),
				}),
			);
		});
	});

	it("Status transition to terminated shows confirmation, then PATCHes status", async () => {
		mockedUseSubsidyCases.mockReturnValue({
			data: [
				{
					id: "case-1",
					centerId: "center-1",
					childId: "child-1",
					program: "ccdf",
					caseNumber: "CASE-123",
					agencyName: "County Services",
					effectiveDate: "2026-01-01",
					status: "active",
					createdAt: "2026-01-01T12:00:00.000Z",
					updatedAt: "2026-01-01T12:00:00.000Z",
				},
			],
			isLoading: false,
		} as never);

		const mutateAsync = vi.fn().mockResolvedValue({ id: "case-1" });
		mockedUseUpdateSubsidyCase.mockReturnValue(mutationSpy({ mutateAsync }) as never);

		render(<SubsidiesPage />);

		// Select the case row to reveal status controls
		fireEvent.click(screen.getByRole("button", { name: /CASE-123/ }));

		// Click the "Mark terminated" button to open confirmation dialog
		fireEvent.click(screen.getByRole("button", { name: /Mark terminated/i }));

		// Confirmation alertdialog should appear
		expect(
			screen.getByRole("alertdialog", { name: /Mark case as terminated\?/i }),
		).toBeInTheDocument();

		// Confirm the destructive action
		fireEvent.click(screen.getByRole("button", { name: /Mark terminated/i, hidden: false }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				id: "case-1",
				input: { status: "terminated" },
			});
		});
	});
});
