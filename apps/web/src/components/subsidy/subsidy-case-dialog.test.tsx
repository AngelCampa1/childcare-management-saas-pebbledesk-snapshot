import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/use-finance", () => ({
	useCreateSubsidyCase: vi.fn(),
	useUpdateSubsidyCase: vi.fn(),
}));

vi.mock("../../hooks/use-children", () => ({
	useChildren: vi.fn(),
}));

vi.mock("../date-input", () => ({
	DateInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input type="date" {...props} />
	),
}));

// Mock the UI Input to render as a plain text input so jsdom does not sanitize
// numeric field values — this lets us test NaN guards with strings like "abc".
vi.mock("@pebbledesk/ui/components/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="text" />,
}));

// Mock the Select component so fireEvent.change can drive value selection in jsdom.
vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({
		children,
		value,
		onValueChange,
	}: {
		children: ReactNode;
		value?: string;
		onValueChange?: (value: string) => void;
	}) => (
		<select value={value} onChange={(event) => onValueChange?.(event.target.value)}>
			{children}
		</select>
	),
	SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectValue: ({ placeholder }: { placeholder?: string }) => (
		<option value="">{placeholder ?? ""}</option>
	),
	SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
	SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
		<option value={value}>{children}</option>
	),
}));

import { beforeEach } from "vitest";
import { useChildren } from "../../hooks/use-children";
import { useCreateSubsidyCase, useUpdateSubsidyCase } from "../../hooks/use-finance";
import { SubsidyCaseDialog } from "./subsidy-case-dialog";

const mockedUseCreateSubsidyCase = vi.mocked(useCreateSubsidyCase);
const mockedUseUpdateSubsidyCase = vi.mocked(useUpdateSubsidyCase);
const mockedUseChildren = vi.mocked(useChildren);

function setup(lockedChildId?: string) {
	mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseUpdateSubsidyCase.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
	mockedUseChildren.mockReturnValue({ data: [] } as never);
	render(
		<SubsidyCaseDialog
			open={true}
			onOpenChange={vi.fn()}
			lockedChildId={lockedChildId ?? "child-1"}
		/>,
	);
}

describe("SubsidyCaseDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedUseUpdateSubsidyCase.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
	});

	it("renders the dialog title", () => {
		setup();
		expect(screen.getByText("New subsidy case")).toBeInTheDocument();
	});

	it("shows a form error and does not submit when rateDaily is non-numeric", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		// "abc" in the daily rate field — Number("abc") → NaN which must be rejected
		fireEvent.change(screen.getByLabelText(/daily rate/i), { target: { value: "abc" } });

		// Submit form directly to bypass HTML5 constraint validation in jsdom
		fireEvent.submit(screen.getByLabelText(/daily rate/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows a form error and does not submit when rateWeekly is non-numeric", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		fireEvent.change(screen.getByLabelText(/weekly rate/i), { target: { value: "xyz" } });

		fireEvent.submit(screen.getByLabelText(/weekly rate/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows a form error and does not submit when authorizedHoursWeekly is non-numeric", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		fireEvent.change(screen.getByLabelText(/hours \/ week/i), { target: { value: "notanumber" } });

		fireEvent.submit(screen.getByLabelText(/hours \/ week/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("calls mutateAsync and closes the dialog on a fully valid submission", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		const onOpenChange = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={onOpenChange} lockedChildId="child-xyz" />);

		// Program select — rendered as a native <select> via our mock
		const programSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
		fireEvent.change(programSelect, { target: { value: "ccdf" } });

		fireEvent.change(screen.getByLabelText(/case number/i), { target: { value: "CN-001" } });
		fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: "State Agency" } });
		fireEvent.change(screen.getByLabelText(/effective date/i), {
			target: { value: "2026-01-01" },
		});

		fireEvent.submit(screen.getByLabelText(/effective date/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());

		expect(mutateAsync).toHaveBeenCalledWith(
			expect.objectContaining({
				childId: "child-xyz",
				program: "ccdf",
				caseNumber: "CN-001",
				agencyName: "State Agency",
				effectiveDate: "2026-01-01",
				status: "active",
			}),
		);
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("shows an inline error and blocks submit when expirationDate is before effectiveDate", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		const programSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
		fireEvent.change(programSelect, { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText(/case number/i), { target: { value: "CN-99" } });
		fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: "Agency" } });
		fireEvent.change(screen.getByLabelText(/effective date/i), { target: { value: "2026-06-01" } });
		fireEvent.change(screen.getByLabelText(/expiration date/i), {
			target: { value: "2026-01-01" },
		});

		fireEvent.submit(screen.getByLabelText(/effective date/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByRole("alert").textContent).toMatch(/expir/i);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows an inline error and blocks submit when rateDaily is negative", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		fireEvent.change(screen.getByLabelText(/daily rate/i), { target: { value: "-5" } });

		fireEvent.submit(screen.getByLabelText(/daily rate/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows an inline error and blocks submit when rateWeekly is negative", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		fireEvent.change(screen.getByLabelText(/weekly rate/i), { target: { value: "-10" } });

		fireEvent.submit(screen.getByLabelText(/weekly rate/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows an inline error and blocks submit when authorizedHoursWeekly is negative", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={vi.fn()} lockedChildId="child-1" />);

		fireEvent.change(screen.getByLabelText(/hours \/ week/i), { target: { value: "-1" } });

		fireEvent.submit(screen.getByLabelText(/hours \/ week/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("submits successfully when expirationDate is after effectiveDate and rates are non-negative", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		const onOpenChange = vi.fn();
		mockedUseCreateSubsidyCase.mockReturnValue({ mutateAsync, isPending: false } as never);
		mockedUseChildren.mockReturnValue({ data: [] } as never);
		render(<SubsidyCaseDialog open={true} onOpenChange={onOpenChange} lockedChildId="child-abc" />);

		const programSelect = screen.getAllByRole("combobox")[0] as HTMLSelectElement;
		fireEvent.change(programSelect, { target: { value: "ccdf" } });
		fireEvent.change(screen.getByLabelText(/case number/i), { target: { value: "CN-200" } });
		fireEvent.change(screen.getByLabelText(/agency name/i), { target: { value: "Good Agency" } });
		fireEvent.change(screen.getByLabelText(/effective date/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/expiration date/i), {
			target: { value: "2026-12-31" },
		});
		fireEvent.change(screen.getByLabelText(/daily rate/i), { target: { value: "50" } });
		fireEvent.change(screen.getByLabelText(/weekly rate/i), { target: { value: "200" } });
		fireEvent.change(screen.getByLabelText(/hours \/ week/i), { target: { value: "30" } });

		fireEvent.submit(screen.getByLabelText(/effective date/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
