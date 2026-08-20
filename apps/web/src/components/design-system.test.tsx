import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
	ComplianceSummary,
	ConfirmDestructiveDialog,
	DataTableAction,
	PageHeader,
	ReadinessStrip,
	SectionPanel,
	StatusPanel,
	SummaryMetric,
} from "./design-system";

describe("authenticated app design system", () => {
	it("renders a page header with one primary action region", () => {
		render(
			<PageHeader
				title="Billing"
				description="Send invoices and track payments."
				primaryAction={<button type="button">Create invoice</button>}
				secondaryActions={<a href="/billing/payments">Payment history</a>}
			/>,
		);

		expect(screen.getByRole("heading", { level: 1, name: "Billing" })).toBeInTheDocument();
		expect(screen.getByText("Send invoices and track payments.")).toBeInTheDocument();
		expect(screen.getByLabelText("Primary page action")).toHaveTextContent("Create invoice");
		expect(screen.getByLabelText("Secondary page actions")).toHaveTextContent("Payment history");
	});

	it("keeps metric labels and values scannable", () => {
		render(<SummaryMetric label="Drafts needing review" value={3} tone="warning" />);

		expect(screen.getByText("Drafts needing review")).toBeInTheDocument();
		expect(screen.getByText("3")).toHaveClass("tabular-nums");
	});

	it("renders status panels with semantic tone attributes", () => {
		render(
			<StatusPanel
				tone="destructive"
				title="Ratio violation"
				description="Toddlers need one more staff member."
				action={<a href="/attendance">Fix in Attendance</a>}
			/>,
		);

		const panel = screen.getByRole("region", { name: "Ratio violation" });
		expect(panel).toHaveAttribute("data-tone", "destructive");
		expect(panel).toHaveTextContent("Fix in Attendance");
	});

	it("shows readiness checks with a derived next action", () => {
		render(
			<ReadinessStrip
				title="Record readiness"
				items={[
					{ label: "Classroom", status: "ok", detail: "Toddlers" },
					{ label: "Guardian", status: "attention", detail: "Missing primary guardian" },
				]}
				action={<button type="button">Add guardian</button>}
			/>,
		);

		expect(screen.getByRole("region", { name: "Record readiness" })).toBeInTheDocument();
		expect(screen.getByText("Missing primary guardian")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Add guardian" })).toBeInTheDocument();
	});

	it("provides short visible table actions with full accessible names", () => {
		render(
			<DataTableAction
				href="/children/child-1"
				label="View"
				ariaLabel="View details for Ada Lovelace"
			/>,
		);

		expect(screen.getByRole("link", { name: "View details for Ada Lovelace" })).toHaveTextContent(
			"View",
		);
	});

	it("combines capacity and ratio facts in a compliance summary", () => {
		render(
			<ComplianceSummary
				title="Toddlers coverage"
				tone="warning"
				items={[
					{ label: "Children", value: 9 },
					{ label: "Staff", value: 1 },
					{ label: "Required ratio", value: "1:6" },
				]}
				action={<button type="button">Assign staff</button>}
			/>,
		);

		expect(screen.getByRole("region", { name: "Toddlers coverage" })).toBeInTheDocument();
		expect(screen.getByText("Required ratio")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Assign staff" })).toBeInTheDocument();
	});

	it("renders a section panel with stable heading hierarchy", () => {
		render(
			<SectionPanel title="Invoices" description="Open balances first.">
				<p>Invoice rows</p>
			</SectionPanel>,
		);

		expect(screen.getByRole("heading", { level: 2, name: "Invoices" })).toBeInTheDocument();
		expect(screen.getByText("Open balances first.")).toBeInTheDocument();
	});

	it("confirms destructive actions with clear app dialog copy", async () => {
		const onConfirm = vi.fn();

		render(
			<ConfirmDestructiveDialog
				trigger={<button type="button">Delete shift</button>}
				title="Delete this shift?"
				description="This removes the shift from the weekly schedule."
				confirmLabel="Delete shift"
				onConfirm={onConfirm}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Delete shift" }));
		expect(screen.getByRole("alertdialog", { name: "Delete this shift?" })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Delete shift" }));

		expect(onConfirm).toHaveBeenCalledTimes(1);
	});
});
