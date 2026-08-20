import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/use-finance", () => ({
	useCreateSubsidyClaim: vi.fn(),
}));

vi.mock("../date-input", () => ({
	DateInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input type="date" {...props} />
	),
}));

import { useCreateSubsidyClaim } from "../../hooks/use-finance";
import { SubsidyClaimDialog } from "./subsidy-claim-dialog";

const mockedUseCreateSubsidyClaim = vi.mocked(useCreateSubsidyClaim);

function setup() {
	mockedUseCreateSubsidyClaim.mockReturnValue({
		mutateAsync: vi.fn().mockResolvedValue({}),
		isPending: false,
	} as never);
	render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);
}

function fillRequiredFields() {
	fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
	fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
	fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "20" } });
	fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "160" } });
	fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "1200" } });
}

describe("SubsidyClaimDialog", () => {
	it("renders the dialog title", () => {
		setup();
		expect(screen.getByText("New subsidy claim")).toBeInTheDocument();
	});

	it("shows required indicator (*) next to Hours attended label", () => {
		setup();
		const label = screen.getByLabelText(/hours attended/i).closest(".space-y-1\\.5");
		expect(label?.textContent).toContain("*");
	});

	it("marks Hours attended input as aria-required", () => {
		setup();
		const input = screen.getByLabelText(/hours attended/i);
		expect(input).toHaveAttribute("aria-required", "true");
	});

	it("shows required indicator (*) next to Days attended label", () => {
		setup();
		const input = screen.getByLabelText(/days attended/i);
		const wrapper = input.closest(".space-y-1\\.5");
		expect(wrapper?.textContent).toContain("*");
	});

	it("shows required indicator (*) next to Amount claimed label", () => {
		setup();
		const input = screen.getByLabelText(/amount claimed/i);
		const wrapper = input.closest(".space-y-1\\.5");
		expect(wrapper?.textContent).toContain("*");
	});

	it("does not show required indicator on optional Amount approved label", () => {
		setup();
		const input = screen.getByLabelText(/amount approved/i);
		const wrapper = input.closest(".space-y-1\\.5");
		expect(wrapper?.textContent).not.toContain("*");
	});

	it("shows a form error and does not submit when daysAttended is empty", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		// Fill all required fields except daysAttended (leave it empty)
		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		// daysAttended left empty — state remains ""
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });

		// Submit the form directly to bypass HTML5 constraint validation in jsdom
		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows a form error and does not submit when hoursAttended is empty or zero", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		// Leave hoursAttended empty — Number("") → 0, which is <= 0 and must be rejected
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows a form error and does not submit when amountClaimed is empty", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		// amountClaimed left empty — state remains ""

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("calls mutateAsync with correct shape including status:'draft' on valid submission", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		const onOpenChange = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={onOpenChange} subsidyCaseId="case-abc" />);

		fillRequiredFields();

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());

		expect(mutateAsync).toHaveBeenCalledWith({
			subsidyCaseId: "case-abc",
			periodStart: "2026-01-01",
			periodEnd: "2026-01-31",
			daysAttended: 20,
			hoursAttended: 160,
			amountClaimed: 1200,
			status: "draft",
		});
	});

	it("includes amountApproved: 0 when the field is set to '0'", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fillRequiredFields();
		fireEvent.change(screen.getByLabelText(/amount approved/i), { target: { value: "0" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());

		expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ amountApproved: 0 }));
	});

	it("omits amountApproved when the field contains a non-numeric value like 'abc'", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fillRequiredFields();
		fireEvent.change(screen.getByLabelText(/amount approved/i), { target: { value: "abc" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());

		const calledWith = mutateAsync.mock.calls[0][0] as Record<string, unknown>;
		expect(calledWith).not.toHaveProperty("amountApproved");
	});

	it("shows an inline error and blocks submit when periodEnd is before periodStart", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-02-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByRole("alert").textContent).toMatch(/period/i);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows an inline error and blocks submit when amountApproved exceeds amountClaimed", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });
		fireEvent.change(screen.getByLabelText(/amount approved/i), { target: { value: "600" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByRole("alert").textContent).toMatch(/approved/i);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("shows an inline error and blocks submit when amountPaid exceeds amountApproved", () => {
		const mutateAsync = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={vi.fn()} subsidyCaseId="case-1" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });
		fireEvent.change(screen.getByLabelText(/amount approved/i), { target: { value: "400" } });
		fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: "450" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		expect(screen.getByRole("alert")).toBeInTheDocument();
		expect(screen.getByRole("alert").textContent).toMatch(/paid/i);
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("submits successfully when amountApproved and amountPaid are within bounds", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		const onOpenChange = vi.fn();
		mockedUseCreateSubsidyClaim.mockReturnValue({ mutateAsync, isPending: false } as never);
		render(<SubsidyClaimDialog open={true} onOpenChange={onOpenChange} subsidyCaseId="case-xyz" />);

		fireEvent.change(screen.getByLabelText(/period start/i), { target: { value: "2026-01-01" } });
		fireEvent.change(screen.getByLabelText(/period end/i), { target: { value: "2026-01-31" } });
		fireEvent.change(screen.getByLabelText(/days attended/i), { target: { value: "5" } });
		fireEvent.change(screen.getByLabelText(/hours attended/i), { target: { value: "40" } });
		fireEvent.change(screen.getByLabelText(/amount claimed/i), { target: { value: "500" } });
		fireEvent.change(screen.getByLabelText(/amount approved/i), { target: { value: "400" } });
		fireEvent.change(screen.getByLabelText(/amount paid/i), { target: { value: "350" } });

		fireEvent.submit(screen.getByLabelText(/period start/i).closest("form") as HTMLFormElement);

		await vi.waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});
