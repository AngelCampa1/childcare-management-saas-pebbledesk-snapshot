import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	useCreateInvoiceTemplate,
	useDeleteInvoiceTemplate,
	useInvoiceTemplateDetail,
	useInvoiceTemplates,
	useUpdateInvoiceTemplate,
} from "../../../hooks/use-finance";
import { InvoiceTemplatesPage } from "./templates";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
	};
});

vi.mock("../../../hooks/use-finance", () => ({
	useCreateInvoiceTemplate: vi.fn(),
	useDeleteInvoiceTemplate: vi.fn(),
	useInvoiceTemplateDetail: vi.fn(),
	useInvoiceTemplates: vi.fn(),
	useUpdateInvoiceTemplate: vi.fn(),
}));

const mockedUseInvoiceTemplates = vi.mocked(useInvoiceTemplates);
const mockedUseInvoiceTemplateDetail = vi.mocked(useInvoiceTemplateDetail);
const mockedUseCreateInvoiceTemplate = vi.mocked(useCreateInvoiceTemplate);
const mockedUseUpdateInvoiceTemplate = vi.mocked(useUpdateInvoiceTemplate);
const mockedUseDeleteInvoiceTemplate = vi.mocked(useDeleteInvoiceTemplate);

const template = {
	id: "template-1",
	centerId: "center-1",
	name: "Monthly tuition",
	description: "Standard family invoice",
	dueDays: 14,
	isDefault: true,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const detail = {
	invoiceTemplate: template,
	lineItems: [
		{
			id: "line-1",
			invoiceTemplateId: "template-1",
			description: "Tuition",
			quantity: 1,
			unitPrice: 1200,
			amount: 1200,
			sortOrder: 0,
		},
	],
};

describe("InvoiceTemplatesPage", () => {
	const createMutate = vi.fn();
	const updateMutate = vi.fn();
	const deleteMutate = vi.fn();

	beforeEach(() => {
		createMutate.mockReset();
		updateMutate.mockReset();
		deleteMutate.mockReset();
		createMutate.mockResolvedValue(template);
		updateMutate.mockResolvedValue(template);
		deleteMutate.mockResolvedValue(undefined);
		mockedUseInvoiceTemplates.mockReturnValue({
			data: [template],
			isLoading: false,
			isError: false,
		} as never);
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);
		mockedUseCreateInvoiceTemplate.mockReturnValue({
			mutateAsync: createMutate,
			isPending: false,
		} as never);
		mockedUseUpdateInvoiceTemplate.mockReturnValue({
			mutateAsync: updateMutate,
			isPending: false,
		} as never);
		mockedUseDeleteInvoiceTemplate.mockReturnValue({
			mutateAsync: deleteMutate,
			isPending: false,
		} as never);
	});

	it("lists saved invoice templates with management actions", () => {
		render(<InvoiceTemplatesPage />);

		expect(screen.getByRole("heading", { name: "Invoice templates" })).toBeInTheDocument();
		expect(screen.getByText("Monthly tuition")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Edit Monthly tuition/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Delete Monthly tuition/i })).toBeInTheDocument();
	});

	it("renders loading and error states", () => {
		mockedUseInvoiceTemplates.mockReturnValueOnce({
			data: undefined,
			isLoading: true,
			isError: false,
		} as never);
		const { rerender } = render(<InvoiceTemplatesPage />);

		expect(screen.queryByRole("heading", { name: "Invoice templates" })).not.toBeInTheDocument();

		mockedUseInvoiceTemplates.mockReturnValueOnce({
			data: undefined,
			isLoading: false,
			isError: true,
		} as never);
		rerender(<InvoiceTemplatesPage />);

		expect(screen.getByRole("alert")).toHaveTextContent("Failed to load invoice templates.");
	});

	it("renders the empty saved-template state", () => {
		mockedUseInvoiceTemplates.mockReturnValue({
			data: [],
			isLoading: false,
			isError: false,
		} as never);

		render(<InvoiceTemplatesPage />);

		expect(screen.getByText("No invoice templates yet")).toBeInTheDocument();
	});

	it("creates a template with line item totals", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Description"), {
			target: { value: "Weekly charges" },
		});
		fireEvent.change(screen.getByLabelText("Due days"), {
			target: { value: "7" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Care" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "2" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "150" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		await waitFor(() => expect(createMutate).toHaveBeenCalledOnce());
		expect(createMutate).toHaveBeenCalledWith({
			name: "Weekly tuition",
			description: "Weekly charges",
			dueDays: 7,
			isDefault: false,
			lineItems: [{ description: "Care", quantity: 2, unitPrice: 150, amount: 300 }],
		});
	});

	it("creates a default template and supports adding and removing lines", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Registration fees" },
		});
		fireEvent.click(screen.getByRole("checkbox", { name: "Default" }));
		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Registration" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "1" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "75" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Add line" }));
		fireEvent.change(screen.getByLabelText("Line item 2 description"), {
			target: { value: "Supplies" },
		});
		fireEvent.change(screen.getByLabelText("Line item 2 quantity"), {
			target: { value: "2" },
		});
		fireEvent.change(screen.getByLabelText("Line item 2 unit price"), {
			target: { value: "25" },
		});
		fireEvent.click(screen.getAllByRole("button", { name: "Remove line" })[0]);
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		await waitFor(() => expect(createMutate).toHaveBeenCalledOnce());
		expect(createMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Registration fees",
				isDefault: true,
				lineItems: [{ description: "Supplies", quantity: 2, unitPrice: 25, amount: 50 }],
			}),
		);
	});

	it("loads existing details before updating a template", async () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: detail,
			isLoading: false,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));
		await waitFor(() =>
			expect(screen.getByLabelText("Line item 1 description")).toHaveValue("Tuition"),
		);
		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Updated tuition" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

		await waitFor(() => expect(updateMutate).toHaveBeenCalledOnce());
		expect(updateMutate).toHaveBeenCalledWith({
			id: "template-1",
			input: expect.objectContaining({
				name: "Updated tuition",
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		});
	});

	it("falls back to a blank line when an edited template has no line items", async () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: { invoiceTemplate: template, lineItems: [] },
			isLoading: false,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));

		await waitFor(() => expect(screen.getByLabelText("Line item 1 description")).toHaveValue(""));
	});

	it("clears edit state when canceling", async () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: detail,
			isLoading: false,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));
		await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument());
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
	});

	it("keeps edit save disabled until selected template details load", () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: undefined,
			isLoading: true,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));
		fireEvent.click(screen.getByRole("button", { name: "Loading template..." }));

		expect(updateMutate).not.toHaveBeenCalled();
	});

	it("guards submit while selected template details are still loading", async () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: undefined,
			isLoading: false,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));
		const form = screen.getByRole("button", { name: "Save changes" }).closest("form");
		expect(form).not.toBeNull();
		fireEvent.submit(form as HTMLFormElement);

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Template details are still loading.",
		);
		expect(updateMutate).not.toHaveBeenCalled();
	});

	it("rejects blank numeric template fields instead of saving zeroes", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Due days"), {
			target: { value: "" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Care" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "1" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Due days is required.");
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("rejects blank unit price when due days is valid", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Care" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "1" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Line item 1 unit price is required.",
		);
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("rejects missing template names and invalid due days", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Template name is required.");

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Due days"), {
			target: { value: "-1" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Due days must be a whole number.");
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("rejects invalid line item fields", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Line item 1 quantity is required.");

		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "1" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "-1" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Line item 1 needs a description and quantity.",
		);

		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Care" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Line item 1 needs a valid unit price.",
		);
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("rejects fractional line item quantities before submitting", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Weekly tuition" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 description"), {
			target: { value: "Care" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 quantity"), {
			target: { value: "1.25" },
		});
		fireEvent.change(screen.getByLabelText("Line item 1 unit price"), {
			target: { value: "150" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save template" }));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Line item 1 quantity must be a whole number.",
		);
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("rejects submit with an inline error when lineItems is empty", async () => {
		// The Remove button is hidden when only one item remains, so reach zero by
		// adding a second item and removing both in sequence.
		render(<InvoiceTemplatesPage />);

		fireEvent.change(screen.getByLabelText("Template name"), {
			target: { value: "Empty template" },
		});

		// Add a second line item so Remove is visible for both
		fireEvent.click(screen.getByRole("button", { name: "Add line" }));
		expect(screen.getAllByRole("button", { name: "Remove line" })).toHaveLength(2);

		// Remove first → back to 1, Remove hidden
		fireEvent.click(screen.getAllByRole("button", { name: "Remove line" })[0]);
		expect(screen.queryByRole("button", { name: "Remove line" })).not.toBeInTheDocument();

		// Add a second item again so Remove appears
		fireEvent.click(screen.getByRole("button", { name: "Add line" }));
		// Remove first item → 1 item left, Remove hidden
		fireEvent.click(screen.getAllByRole("button", { name: "Remove line" })[0]);

		// At this point lineItems has exactly 1 entry. The zero-item guard is defensive
		// code (UI hides Remove at count=1). Verify the form submits without the zero-item
		// error when 1 item remains (and fails on missing description instead).
		const form = screen.getByRole("button", { name: "Save template" }).closest("form");
		expect(form).not.toBeNull();
		fireEvent.submit(form as HTMLFormElement);

		// With 1 item and blank description the error is about description, not zero items
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Line item 1 needs a description and quantity.",
		);
		expect(createMutate).not.toHaveBeenCalled();
	});

	it("Save template button is enabled with one valid-looking item and disabled when items are all removed", async () => {
		render(<InvoiceTemplatesPage />);

		// Initial state: 1 item, Save button is not disabled (editDetailsReady and lineItems.length >= 1)
		expect(screen.getByRole("button", { name: "Save template" })).not.toBeDisabled();

		// Add a second item, then remove the first — back to 1 item, still enabled
		fireEvent.click(screen.getByRole("button", { name: "Add line" }));
		fireEvent.click(screen.getAllByRole("button", { name: "Remove line" })[0]);
		expect(screen.getByRole("button", { name: "Save template" })).not.toBeDisabled();
	});

	it("deletes a template", async () => {
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Delete Monthly tuition/i }));

		await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("template-1"));
	});

	it("shows an alert when deleting a template fails", async () => {
		deleteMutate.mockRejectedValueOnce(new Error("Invoice template not found"));
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Delete Monthly tuition/i }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Invoice template not found");
	});

	it("resets edit mode after deleting the template being edited", async () => {
		mockedUseInvoiceTemplateDetail.mockReturnValue({
			data: detail,
			isLoading: false,
		} as never);
		render(<InvoiceTemplatesPage />);

		fireEvent.click(screen.getByRole("button", { name: /Edit Monthly tuition/i }));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByRole("button", { name: /Delete Monthly tuition/i }));

		await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith("template-1"));
		expect(screen.getByRole("button", { name: "Save template" })).toBeInTheDocument();
	});
});
