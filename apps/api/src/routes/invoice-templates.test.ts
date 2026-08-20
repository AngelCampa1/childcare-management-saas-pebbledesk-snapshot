import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
			await next();
		}),
	};
});

const { invoiceTemplatesRoutes } = await import("./invoice-templates.js");

function mountInvoiceTemplates(app: Hono<AppEnv>) {
	app.route("/api/invoice-templates", invoiceTemplatesRoutes);
}

describe("invoice templates routes", () => {
	it("lists invoice templates with pagination chain", async () => {
		const limitFn = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([
				{
					id: "40000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					name: "Monthly Tuition",
				},
			]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: limitFn,
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { invoiceTemplates: Array<{ name: string }> };
		expect(body.invoiceTemplates[0]?.name).toBe("Monthly Tuition");
	});

	it("applies a bounded limit — defaults to PAGE_DEFAULT (50)", async () => {
		const limitFn = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: limitFn,
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		await app.request("/api/invoice-templates");

		// Default limit must be 50 (PAGE_DEFAULT), never unbounded
		expect(limitFn).toHaveBeenCalledWith(50);
	});

	it("respects a custom limit up to PAGE_MAX (200)", async () => {
		const limitFn = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: limitFn,
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		await app.request("/api/invoice-templates?limit=100");

		expect(limitFn).toHaveBeenCalledWith(100);
	});

	it("clamps limit to PAGE_MAX (200) when caller exceeds it", async () => {
		const limitFn = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: limitFn,
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		// limit=201 exceeds PAGE_MAX — zValidator should reject it with 400
		const res = await app.request("/api/invoice-templates?limit=201");

		expect(res.status).toBe(400);
	});

	it("applies the cursor as an offset", async () => {
		const offsetFn = vi.fn().mockResolvedValue([]);
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: offsetFn,
							}),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		await app.request("/api/invoice-templates?cursor=25");

		expect(offsetFn).toHaveBeenCalledWith(25);
	});

	it("returns deterministic ordering (orderBy called)", async () => {
		const orderByFn = vi.fn().mockReturnValue({
			limit: vi.fn().mockReturnValue({
				offset: vi.fn().mockResolvedValue([]),
			}),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: orderByFn,
					}),
				}),
			}),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		await app.request("/api/invoice-templates");

		expect(orderByFn).toHaveBeenCalledOnce();
	});

	it("reads an invoice template with sorted line items", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "40000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								name: "Monthly Tuition",
							},
						]),
					}),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockResolvedValue([
							{
								id: "line-1",
								invoiceTemplateId: "40000000-0000-0000-0000-000000000001",
								description: "Tuition",
								sortOrder: 0,
							},
						]),
					}),
				}),
			});
		const db = createMockDb({ select });

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates/40000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { lineItems: Array<{ description: string }> };
		expect(body.lineItems[0]?.description).toBe("Tuition");
	});

	it("returns 400 for non-UUID invoice template ids on read before querying", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates/not-a-uuid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("creates an invoice template with line items", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "40000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										name: "Monthly Tuition",
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates",
			jsonBody({
				name: "Monthly Tuition",
				dueDays: 5,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(201);
	});

	it("clears existing default templates when creating a new default", async () => {
		const update = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		});
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					update,
					insert: vi
						.fn()
						.mockReturnValueOnce({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "40000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										name: "Monthly Tuition",
										isDefault: true,
									},
								]),
							}),
						})
						.mockReturnValueOnce({
							values: vi.fn().mockResolvedValue(undefined),
						}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates",
			jsonBody({
				name: "Monthly Tuition",
				dueDays: 5,
				isDefault: true,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(201);
		expect(update).toHaveBeenCalledOnce();
	});

	it("returns an internal error when creation does not return a template", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates",
			jsonBody({
				name: "Monthly Tuition",
				dueDays: 5,
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(500);
	});

	it("updates an invoice template", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "40000000-0000-0000-0000-000000000001",
										name: "Updated Template",
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(undefined),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates/40000000-0000-0000-0000-000000000001",
			patchBody({ name: "Updated Template" }),
		);

		expect(res.status).toBe(200);
	});

	it("clears other default templates when updating a template to default", async () => {
		const update = vi
			.fn()
			.mockReturnValueOnce({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			})
			.mockReturnValueOnce({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "40000000-0000-0000-0000-000000000001",
								name: "Updated Template",
								isDefault: true,
							},
						]),
					}),
				}),
			});
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					update,
					delete: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(undefined),
					}),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockResolvedValue(undefined),
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates/40000000-0000-0000-0000-000000000001",
			patchBody({ isDefault: true }),
		);

		expect(res.status).toBe(200);
		expect(update).toHaveBeenCalledTimes(2);
	});

	it("returns 400 for non-UUID invoice template ids on update before opening a transaction", async () => {
		const db = createMockDb();
		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates/not-a-uuid",
			patchBody({ name: "Updated Template" }),
		);

		expect(res.status).toBe(400);
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns 404 when updating a missing invoice template", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates/40000000-0000-0000-0000-000000000001",
			patchBody({ name: "Updated Template" }),
		);

		expect(res.status).toBe(404);
	});

	it("replaces line items when updating an invoice template", async () => {
		const deleteWhere = vi.fn().mockResolvedValue(undefined);
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "40000000-0000-0000-0000-000000000001",
										name: "Updated Template",
									},
								]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({
						where: deleteWhere,
					}),
					insert: vi.fn().mockReturnValue({
						values: insertValues,
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request(
			"/api/invoice-templates/40000000-0000-0000-0000-000000000001",
			patchBody({
				lineItems: [
					{
						description: "Tuition",
						quantity: 1,
						unitPrice: 1200,
						amount: 1200,
					},
				],
			}),
		);

		expect(res.status).toBe(200);
		expect(deleteWhere).toHaveBeenCalledOnce();
		expect(insertValues).toHaveBeenCalledWith([
			expect.objectContaining({ centerId: "center-1", description: "Tuition", sortOrder: 0 }),
		]);
	});

	it("deletes an invoice template and its line items", async () => {
		const selectLimit = vi.fn().mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440001" }]);
		const deleteLineItemsWhere = vi.fn().mockResolvedValue(undefined);
		const deleteTemplateWhere = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: selectLimit,
							}),
						}),
					}),
					delete: vi
						.fn()
						.mockReturnValueOnce({
							where: deleteLineItemsWhere,
						})
						.mockReturnValueOnce({
							where: deleteTemplateWhere,
						}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates/550e8400-e29b-41d4-a716-446655440001", {
			method: "DELETE",
		});

		expect(res.status).toBe(204);
		expect(deleteLineItemsWhere).toHaveBeenCalledOnce();
		expect(deleteTemplateWhere).toHaveBeenCalledOnce();
	});

	it("does not delete template line items before center ownership is proven", async () => {
		const deleteLineItemsWhere = vi.fn().mockResolvedValue(undefined);
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
					delete: vi.fn().mockReturnValue({
						where: deleteLineItemsWhere,
					}),
				}),
			),
		});

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates/550e8400-e29b-41d4-a716-446655440001", {
			method: "DELETE",
		});

		expect(res.status).toBe(404);
		expect(deleteLineItemsWhere).not.toHaveBeenCalled();
	});

	it("returns 400 for non-UUID invoice template ids on delete", async () => {
		const deleteMock = vi.fn();
		const db = createMockDb({ delete: deleteMock });

		const app = createTestApp(mountInvoiceTemplates, db);
		const res = await app.request("/api/invoice-templates/not-a-uuid", {
			method: "DELETE",
		});

		expect(res.status).toBe(400);
		expect(deleteMock).not.toHaveBeenCalled();
	});

	it.each([
		["GET", "/api/invoice-templates", undefined],
		["GET", "/api/invoice-templates/40000000-0000-0000-0000-000000000001", undefined],
		[
			"POST",
			"/api/invoice-templates",
			jsonBody({
				name: "Monthly Tuition",
				dueDays: 5,
				lineItems: [{ description: "Tuition", quantity: 1, unitPrice: 1200, amount: 1200 }],
			}),
		],
		[
			"PATCH",
			"/api/invoice-templates/40000000-0000-0000-0000-000000000001",
			patchBody({ name: "Updated Template" }),
		],
		["DELETE", "/api/invoice-templates/40000000-0000-0000-0000-000000000001", { method: "DELETE" }],
	] as const)("rejects %s invoice template requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountInvoiceTemplates, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});
});
