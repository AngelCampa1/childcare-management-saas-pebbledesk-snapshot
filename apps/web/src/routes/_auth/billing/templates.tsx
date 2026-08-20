import type { CreateInvoiceTemplateInput, UpdateInvoiceTemplateInput } from "@pebbledesk/shared";
import { formatCurrency } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Checkbox } from "@pebbledesk/ui/components/checkbox";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "../../../components/empty-state";
import {
	useCreateInvoiceTemplate,
	useDeleteInvoiceTemplate,
	useInvoiceTemplateDetail,
	useInvoiceTemplates,
	useUpdateInvoiceTemplate,
} from "../../../hooks/use-finance";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { requireDirectorOrOwner } from "../../../lib/role-guards";
import { generateId } from "../../../lib/uuid";

export const Route = createFileRoute("/_auth/billing/templates")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: InvoiceTemplatesPage,
});

interface TemplateLineItem {
	id: string;
	description: string;
	quantity: string;
	unitPrice: string;
}

const defaultLineItem = (): TemplateLineItem => ({
	id: generateId(),
	description: "",
	quantity: "1",
	unitPrice: "0",
});

export function InvoiceTemplatesPage() {
	const { data: templates, isLoading, isError } = useInvoiceTemplates();
	const createTemplate = useCreateInvoiceTemplate();
	const updateTemplate = useUpdateInvoiceTemplate();
	const deleteTemplate = useDeleteInvoiceTemplate();

	const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
	const { data: editingDetail, isLoading: editingDetailLoading } = useInvoiceTemplateDetail(
		editingTemplateId ?? undefined,
	);
	const [hydratedEditingTemplateId, setHydratedEditingTemplateId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [dueDays, setDueDays] = useState("0");
	const [isDefault, setIsDefault] = useState(false);
	const [lineItems, setLineItems] = useState<TemplateLineItem[]>([defaultLineItem()]);
	const [formError, setFormError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	useEffect(() => {
		if (!editingTemplateId || editingDetail?.invoiceTemplate.id !== editingTemplateId) return;
		if (hydratedEditingTemplateId === editingTemplateId) return;
		setName(editingDetail.invoiceTemplate.name);
		setDescription(editingDetail.invoiceTemplate.description ?? "");
		setDueDays(String(editingDetail.invoiceTemplate.dueDays));
		setIsDefault(editingDetail.invoiceTemplate.isDefault);
		setLineItems(
			editingDetail.lineItems.length > 0
				? editingDetail.lineItems.map((item) => ({
						id: item.id,
						description: item.description,
						quantity: String(item.quantity),
						unitPrice: String(item.unitPrice),
					}))
				: [defaultLineItem()],
		);
		setHydratedEditingTemplateId(editingTemplateId);
	}, [editingDetail, editingTemplateId, hydratedEditingTemplateId]);

	function resetForm() {
		setEditingTemplateId(null);
		setHydratedEditingTemplateId(null);
		setName("");
		setDescription("");
		setDueDays("0");
		setIsDefault(false);
		setLineItems([defaultLineItem()]);
		setFormError(null);
		setDeleteError(null);
	}

	async function handleDeleteTemplate(id: string) {
		setDeleteError(null);
		try {
			await deleteTemplate.mutateAsync(id);
			if (editingTemplateId === id) {
				resetForm();
			}
		} catch (error) {
			setDeleteError(extractErrorMessage(error, "Could not delete invoice template."));
		}
	}

	function updateLineItem(index: number, field: keyof TemplateLineItem, value: string) {
		setLineItems((items) =>
			items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
		);
	}

	function addLineItem() {
		setLineItems((items) => [...items, defaultLineItem()]);
	}

	function removeLineItem(index: number) {
		setLineItems((items) => items.filter((_item, itemIndex) => itemIndex !== index));
	}

	function buildInput(): CreateInvoiceTemplateInput | UpdateInvoiceTemplateInput | null {
		if (editingTemplateId && hydratedEditingTemplateId !== editingTemplateId) {
			setFormError("Template details are still loading.");
			return null;
		}
		if (dueDays.trim() === "") {
			setFormError("Due days is required.");
			return null;
		}
		const parsedDueDays = Number(dueDays);
		if (!name.trim()) {
			setFormError("Template name is required.");
			return null;
		}
		if (!Number.isInteger(parsedDueDays) || parsedDueDays < 0) {
			setFormError("Due days must be a whole number.");
			return null;
		}

		if (lineItems.length === 0) {
			setFormError("Add at least one line item");
			return null;
		}

		const parsedLineItems = lineItems.map((item, index) => {
			if (item.quantity.trim() === "") {
				throw new Error(`Line item ${index + 1} quantity is required.`);
			}
			if (item.unitPrice.trim() === "") {
				throw new Error(`Line item ${index + 1} unit price is required.`);
			}
			const quantity = Number(item.quantity);
			const unitPrice = Number(item.unitPrice);
			if (!item.description.trim() || !Number.isFinite(quantity) || quantity <= 0) {
				throw new Error(`Line item ${index + 1} needs a description and quantity.`);
			}
			if (!Number.isInteger(quantity)) {
				throw new Error(`Line item ${index + 1} quantity must be a whole number.`);
			}
			if (!Number.isFinite(unitPrice) || unitPrice < 0) {
				throw new Error(`Line item ${index + 1} needs a valid unit price.`);
			}
			return {
				description: item.description.trim(),
				quantity,
				unitPrice,
				amount: quantity * unitPrice,
			};
		});

		return {
			name: name.trim(),
			description: description.trim() || undefined,
			dueDays: parsedDueDays,
			isDefault,
			lineItems: parsedLineItems,
		};
	}

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFormError(null);
		try {
			const input = buildInput();
			if (!input) return;
			if (editingTemplateId) {
				await updateTemplate.mutateAsync({ id: editingTemplateId, input });
			} else {
				await createTemplate.mutateAsync(input as CreateInvoiceTemplateInput);
			}
			resetForm();
		} catch (error) {
			setFormError(extractErrorMessage(error, "Could not save invoice template."));
		}
	}

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-10 w-56" />
				<Skeleton className="h-80 rounded-lg" />
			</div>
		);
	}

	if (isError) {
		return (
			<div role="alert" className="rounded-lg border border-destructive/30 p-4 text-destructive">
				Failed to load invoice templates.
			</div>
		);
	}

	const savedTemplates = templates ?? [];
	const isSubmitting = createTemplate.isPending || updateTemplate.isPending;
	const editDetailsReady = !editingTemplateId || hydratedEditingTemplateId === editingTemplateId;
	const saveDisabled = isSubmitting || !editDetailsReady || lineItems.length === 0;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
						<Link to="/billing">
							<ArrowLeft className="mr-1 h-4 w-4" />
							Billing
						</Link>
					</Button>
					<h1 className="text-2xl font-bold text-foreground">Invoice templates</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Save common charges so new family invoices start with the right line items.
					</p>
				</div>
				<Button type="button" variant="outline" onClick={resetForm}>
					<Plus className="mr-1 h-4 w-4" />
					New template
				</Button>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1fr_380px]">
				<Card>
					<CardHeader>
						<CardTitle>Saved templates</CardTitle>
					</CardHeader>
					<CardContent>
						{deleteError ? (
							<p role="alert" className="mb-3 text-sm text-destructive">
								{deleteError}
							</p>
						) : null}
						{savedTemplates.length === 0 ? (
							<EmptyState
								tone="finance"
								title="No invoice templates yet"
								description="Create your first template for recurring tuition, registration fees, or weekly charges."
							/>
						) : (
							<div className="space-y-3">
								{savedTemplates.map((template) => (
									<div
										key={template.id}
										className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
									>
										<div>
											<p className="font-medium text-foreground">{template.name}</p>
											<p className="text-sm text-muted-foreground">
												Due {template.dueDays} day{template.dueDays === 1 ? "" : "s"} after issue
												{template.isDefault ? " / Default" : ""}
											</p>
											{template.description ? (
												<p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
											) : null}
										</div>
										<div className="flex gap-2">
											<Button
												type="button"
												variant="outline"
												size="sm"
												aria-label={`Edit ${template.name}`}
												onClick={() => {
													setEditingTemplateId(template.id);
													setHydratedEditingTemplateId(null);
													setFormError(null);
												}}
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												aria-label={`Delete ${template.name}`}
												disabled={deleteTemplate.isPending}
												onClick={() => handleDeleteTemplate(template.id)}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</div>
								))}
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>{editingTemplateId ? "Edit template" : "Create template"}</CardTitle>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-4" noValidate>
							<div className="space-y-1.5">
								<Label htmlFor="template-name">Template name</Label>
								<Input
									id="template-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="template-description">Description</Label>
								<Input
									id="template-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div className="space-y-1.5">
									<Label htmlFor="template-due-days">Due days</Label>
									<Input
										id="template-due-days"
										type="number"
										min={0}
										step={1}
										value={dueDays}
										onChange={(event) => setDueDays(event.target.value)}
									/>
								</div>
								<div className="flex items-end gap-2 pb-2">
									<Checkbox
										id="template-default"
										checked={isDefault}
										onCheckedChange={(checked) => setIsDefault(checked === true)}
									/>
									<Label htmlFor="template-default">Default</Label>
								</div>
							</div>

							<div className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="text-sm font-medium text-foreground">Line items</p>
									<Button type="button" variant="outline" size="sm" onClick={addLineItem}>
										Add line
									</Button>
								</div>
								{lineItems.map((item, index) => {
									const total = Number(item.quantity) * Number(item.unitPrice);
									return (
										<div key={item.id} className="space-y-2 rounded-md border border-border p-3">
											<div className="space-y-1.5">
												<Label htmlFor={`template-line-${item.id}-description`}>
													Line item {index + 1} description
												</Label>
												<Input
													id={`template-line-${item.id}-description`}
													value={item.description}
													onChange={(event) =>
														updateLineItem(index, "description", event.target.value)
													}
												/>
											</div>
											<div className="grid grid-cols-2 gap-2">
												<div className="space-y-1.5">
													<Label htmlFor={`template-line-${item.id}-quantity`}>
														Line item {index + 1} quantity
													</Label>
													<Input
														id={`template-line-${item.id}-quantity`}
														type="number"
														min={0}
														step="1"
														value={item.quantity}
														onChange={(event) =>
															updateLineItem(index, "quantity", event.target.value)
														}
													/>
												</div>
												<div className="space-y-1.5">
													<Label htmlFor={`template-line-${item.id}-unit-price`}>
														Line item {index + 1} unit price
													</Label>
													<Input
														id={`template-line-${item.id}-unit-price`}
														type="number"
														min={0}
														step="0.01"
														value={item.unitPrice}
														onChange={(event) =>
															updateLineItem(index, "unitPrice", event.target.value)
														}
													/>
												</div>
											</div>
											<div className="flex items-center justify-between text-sm">
												<span className="text-muted-foreground">Line total</span>
												<span className="font-medium text-foreground">
													{Number.isFinite(total) ? formatCurrency(total) : "$0.00"}
												</span>
											</div>
											{lineItems.length > 1 ? (
												<Button
													type="button"
													variant="ghost"
													size="sm"
													onClick={() => removeLineItem(index)}
												>
													Remove line
												</Button>
											) : null}
										</div>
									);
								})}
							</div>

							{formError ? (
								<p role="alert" className="text-sm text-destructive">
									{formError}
								</p>
							) : null}

							<div className="flex justify-end gap-2">
								{editingTemplateId ? (
									<Button type="button" variant="outline" onClick={resetForm}>
										Cancel
									</Button>
								) : null}
								<Button type="submit" disabled={saveDisabled}>
									{isSubmitting
										? "Saving..."
										: editingTemplateId && editingDetailLoading && !editDetailsReady
											? "Loading template..."
											: editingTemplateId
												? "Save changes"
												: "Save template"}
								</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
