import { zValidator } from "@hono/zod-validator";
import { invoiceTemplateLineItems, invoiceTemplates } from "@pebbledesk/db";
import { createInvoiceTemplateSchema, updateInvoiceTemplateSchema } from "@pebbledesk/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { paginationSchema, resolvePagination } from "../lib/pagination.js";
import { requireAuth, requireCenter, requireRole } from "../middleware/auth.js";

const invoiceTemplatesRoutes = new Hono<AppEnv>();

invoiceTemplatesRoutes.use("*", requireAuth, requireCenter);

function parseInvoiceTemplateId(value: string) {
	const parsed = idSchema.safeParse(value);
	if (!parsed.success) badRequest("Invalid invoice template id");
	return parsed.data;
}

async function clearDefaultInvoiceTemplates(
	db: Pick<AppEnv["Variables"]["db"], "update">,
	centerId: string,
) {
	await db
		.update(invoiceTemplates)
		.set({ isDefault: false, updatedAt: new Date() })
		.where(and(eq(invoiceTemplates.centerId, centerId), eq(invoiceTemplates.isDefault, true)));
}

invoiceTemplatesRoutes.get(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("query", paginationSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const { limit, offset } = resolvePagination(c.req.valid("query"));

		const results = await db
			.select()
			.from(invoiceTemplates)
			.where(eq(invoiceTemplates.centerId, centerId))
			.orderBy(desc(invoiceTemplates.createdAt), desc(invoiceTemplates.id))
			.limit(limit)
			.offset(offset);

		return c.json({ invoiceTemplates: results });
	},
);

invoiceTemplatesRoutes.get("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const templateId = parseInvoiceTemplateId(c.req.param("id"));
	const [invoiceTemplate] = await db
		.select()
		.from(invoiceTemplates)
		.where(and(eq(invoiceTemplates.id, templateId), eq(invoiceTemplates.centerId, centerId)))
		.limit(1);

	if (!invoiceTemplate) notFound("Invoice template not found");

	const lineItems = await db
		.select()
		.from(invoiceTemplateLineItems)
		.where(
			and(
				eq(invoiceTemplateLineItems.invoiceTemplateId, invoiceTemplate.id),
				eq(invoiceTemplateLineItems.centerId, centerId),
			),
		)
		.orderBy(asc(invoiceTemplateLineItems.sortOrder));

	return c.json({ invoiceTemplate, lineItems });
});

invoiceTemplatesRoutes.post(
	"/",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", createInvoiceTemplateSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");

		const result = await db.transaction(async (tx) => {
			if (data.isDefault) {
				await clearDefaultInvoiceTemplates(tx, centerId);
			}

			const [invoiceTemplate] = await tx
				.insert(invoiceTemplates)
				.values({
					centerId,
					name: data.name,
					description: data.description,
					dueDays: data.dueDays,
					isDefault: data.isDefault,
				})
				.returning();

			if (!invoiceTemplate) {
				throw new Error("Failed to create invoice template");
			}

			await tx.insert(invoiceTemplateLineItems).values(
				data.lineItems.map((lineItem, index) => ({
					centerId,
					invoiceTemplateId: invoiceTemplate.id,
					description: lineItem.description,
					quantity: lineItem.quantity,
					unitPrice: String(lineItem.unitPrice),
					amount: String(lineItem.amount),
					sortOrder: index,
				})),
			);

			return invoiceTemplate;
		});

		return c.json({ invoiceTemplate: result }, 201);
	},
);

invoiceTemplatesRoutes.patch(
	"/:id",
	requireAuth,
	requireRole("owner", "director"),
	zValidator("json", updateInvoiceTemplateSchema),
	async (c) => {
		const centerId = c.get("centerId");
		if (!centerId) forbidden("No center membership found");

		const db = c.get("db");
		const data = c.req.valid("json");
		const templateId = parseInvoiceTemplateId(c.req.param("id"));
		const result = await db.transaction(async (tx) => {
			if (data.isDefault) {
				await clearDefaultInvoiceTemplates(tx, centerId);
			}

			const [invoiceTemplate] = await tx
				.update(invoiceTemplates)
				.set({
					name: data.name,
					description: data.description,
					dueDays: data.dueDays,
					isDefault: data.isDefault,
					updatedAt: new Date(),
				})
				.where(and(eq(invoiceTemplates.id, templateId), eq(invoiceTemplates.centerId, centerId)))
				.returning();

			if (!invoiceTemplate) notFound("Invoice template not found");

			if (data.lineItems !== undefined) {
				await tx
					.delete(invoiceTemplateLineItems)
					.where(
						and(
							eq(invoiceTemplateLineItems.invoiceTemplateId, invoiceTemplate.id),
							eq(invoiceTemplateLineItems.centerId, centerId),
						),
					);
				await tx.insert(invoiceTemplateLineItems).values(
					data.lineItems.map((lineItem, index) => ({
						centerId,
						invoiceTemplateId: invoiceTemplate.id,
						description: lineItem.description,
						quantity: lineItem.quantity,
						unitPrice: String(lineItem.unitPrice),
						amount: String(lineItem.amount),
						sortOrder: index,
					})),
				);
			}

			return invoiceTemplate;
		});

		return c.json({ invoiceTemplate: result });
	},
);

invoiceTemplatesRoutes.delete("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
	const centerId = c.get("centerId");
	if (!centerId) forbidden("No center membership found");

	const db = c.get("db");
	const templateId = parseInvoiceTemplateId(c.req.param("id"));

	await db.transaction(async (tx) => {
		const [existingTemplate] = await tx
			.select({ id: invoiceTemplates.id })
			.from(invoiceTemplates)
			.where(and(eq(invoiceTemplates.id, templateId), eq(invoiceTemplates.centerId, centerId)))
			.limit(1);

		if (!existingTemplate) notFound("Invoice template not found");

		await tx
			.delete(invoiceTemplateLineItems)
			.where(
				and(
					eq(invoiceTemplateLineItems.invoiceTemplateId, templateId),
					eq(invoiceTemplateLineItems.centerId, centerId),
				),
			);

		await tx
			.delete(invoiceTemplates)
			.where(and(eq(invoiceTemplates.id, templateId), eq(invoiceTemplates.centerId, centerId)));
	});

	return c.body(null, 204);
});

export { invoiceTemplatesRoutes };
