import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

// Mock the auth middleware to be pass-through in tests
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

vi.mock("../middleware/plan.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireEntitlement: () =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
	};
});

// Mock services so we can control their behavior
vi.mock("../services/children.js", () => ({
	createChild: vi.fn(),
	enrollChild: vi.fn(),
}));

vi.mock("../services/guardians.js", () => ({
	createGuardian: vi.fn(),
}));

vi.mock("../services/invoices.js", () => ({
	createInvoice: vi.fn(),
}));

// Import after mocking
const { importsRouter } = await import("./imports.js");
const { createChild, enrollChild } = await import("../services/children.js");
const { createGuardian } = await import("../services/guardians.js");
const { createInvoice } = await import("../services/invoices.js");

function mountImports(app: Hono<AppEnv>) {
	app.route("/api/imports", importsRouter);
}

function selectResult(rows: unknown[]) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(rows),
			}),
		}),
	};
}

function objectContainsText(value: unknown, needle: string, seen = new WeakSet<object>()): boolean {
	if (typeof value === "string") return value.includes(needle);
	if (typeof value === "number" || typeof value === "boolean" || value == null) return false;
	if (typeof value === "function") return value.name.includes(needle);
	if (typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);

	return Object.entries(value).some(
		([key, entry]) => key.includes(needle) || objectContainsText(entry, needle, seen),
	);
}

const childRow = {
	firstName: "Alice",
	lastName: "Smith",
	dateOfBirth: "2022-06-01",
	ageGroup: "toddler" as const,
	enrollmentStatus: "active" as const,
	subsidyEligible: false,
};

const guardianRow = {
	firstName: "Jane",
	lastName: "Smith",
	email: "jane@example.com",
};

const invoiceRow = {
	guardianId: "00000000-0000-0000-0000-000000000001",
	periodStart: "2026-04-01",
	periodEnd: "2026-04-30",
	status: "draft" as const,
	lineItems: [
		{
			description: "Childcare April",
			quantity: 1,
			unitPrice: 1200,
			amount: 1200,
		},
	],
	subtotal: 1200,
	subsidyCredit: 0,
	amountDue: 1200,
};

const enrollRow = {
	child: {
		firstName: "Bob",
		lastName: "Jones",
		dateOfBirth: "2023-01-15",
		ageGroup: "toddler" as const,
	},
	guardians: [
		{
			type: "new" as const,
			firstName: "Mary",
			lastName: "Jones",
			isPrimary: true,
			authorizedPickup: true,
		},
	],
};

describe("imports routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("POST /api/imports/children", () => {
		it("inserts rows and returns correct counts (happy path)", async () => {
			const mockChild = { id: "child-1", ...childRow };
			vi.mocked(createChild).mockResolvedValue(
				mockChild as ReturnType<typeof createChild> extends Promise<infer T> ? T : never,
			);

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.inserted).toBe(1);
			expect(body.skipped).toBe(0);
			expect(body.errors).toHaveLength(0);
		});

		it("skips duplicate row when dedupeStrategy is skip", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-child" }]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.inserted).toBe(0);
			expect(body.skipped).toBe(1);
			expect(body.errors).toHaveLength(0);
		});

		it("throws on duplicate when dedupeStrategy is error (rolls back)", async () => {
			let txError: Error | null = null;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-child" }]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txError = err as Error;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(422);
			expect(txError).not.toBeNull();
			expect((txError as unknown as { message: string }).message).toContain("duplicate child");
		});

		it("rejects empty rows array (Zod min(1))", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db, { role: "staff" });
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(403);
		});

		it("rejects unauthenticated request if requireAuth rejects", async () => {
			// The mock passes requireAuth through, but requireRole checks role
			// An undefined role is treated as unauthenticated
			const db = createMockDb();
			const app = createTestApp(mountImports, db, { role: undefined as unknown as "owner" });
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(403);
		});

		it("collects errors and continues when dedupeStrategy is skip and insert fails", async () => {
			vi.mocked(createChild).mockRejectedValueOnce(new Error("DB constraint error"));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				skipped: number;
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.inserted).toBe(0);
			expect(body.skipped).toBe(0);
			expect(body.errors).toHaveLength(1);
			expect(body.errors[0].rowIndex).toBe(0);
		});

		it("uses 'Unknown error' message when non-Error is thrown", async () => {
			vi.mocked(createChild).mockRejectedValueOnce("a plain string error");

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.errors[0].message).toBe("Unknown error");
		});

		it("throws immediately when dedupeStrategy is error and createChild fails", async () => {
			vi.mocked(createChild).mockRejectedValueOnce(new Error("insert failed"));

			let txRolledBack = false;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txRolledBack = true;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/children",
				jsonBody({ rows: [childRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(500);
			expect(txRolledBack).toBe(true);
		});
	});

	describe("POST /api/imports/guardians", () => {
		it("inserts guardian rows (happy path)", async () => {
			const mockGuardian = { id: "guardian-1", centerId: "center-1", ...guardianRow };
			vi.mocked(createGuardian).mockResolvedValue(
				mockGuardian as ReturnType<typeof createGuardian> extends Promise<infer T> ? T : never,
			);

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.inserted).toBe(1);
			expect(body.skipped).toBe(0);
		});

		it("dedupes on email when email is present", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-guardian" }]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			expect(body.skipped).toBe(1);
			expect(body.inserted).toBe(0);
		});

		it("dedupes guardian emails case-insensitively to match the database unique index", async () => {
			const where = vi.fn().mockImplementation((condition: unknown) => ({
				limit: vi
					.fn()
					.mockResolvedValue(
						objectContainsText(condition, "lower") ? [{ id: "existing-guardian" }] : [],
					),
			}));
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({ where }),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({
					rows: [{ ...guardianRow, email: "Jane@Example.COM" }],
					dedupeStrategy: "skip",
				}),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			expect(body.skipped).toBe(1);
			expect(body.inserted).toBe(0);
			expect(vi.mocked(createGuardian)).not.toHaveBeenCalled();
		});

		it("dedupes on name+phone when no email", async () => {
			const rowNoEmail = { firstName: "Jane", lastName: "Smith", phone: "555-1234" };
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-guardian" }]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [rowNoEmail], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			expect(body.skipped).toBe(1);
		});

		it("dedupes on name only when no email and no phone (OLD behavior — now replaced)", async () => {
			// This test verifies that the old name-only dedup path is gone.
			// Two guardians with the same name but no email/no phone should NOT be deduped
			// because there is no strong identifier. Both should be inserted.
			const rowNoEmailNoPhone = { firstName: "Maria", lastName: "Garcia" };
			const mockGuardian = { id: "guardian-new", centerId: "center-1", ...rowNoEmailNoPhone };
			vi.mocked(createGuardian).mockResolvedValue(
				mockGuardian as ReturnType<typeof createGuardian> extends Promise<infer T> ? T : never,
			);

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									// dedup SELECT returns empty — no match (no strong key)
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [rowNoEmailNoPhone, rowNoEmailNoPhone], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			// Both should be inserted — no strong key means no dedup
			expect(body.inserted).toBe(2);
			expect(body.skipped).toBe(0);
		});

		it("throws on duplicate when dedupeStrategy is error", async () => {
			let txError: unknown = null;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-guardian" }]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txError = err;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(422);
			expect(txError).not.toBeNull();
		});

		it("uses 'Unknown error' message when non-Error is thrown", async () => {
			vi.mocked(createGuardian).mockRejectedValueOnce(42);

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.errors[0].message).toBe("Unknown error");
		});

		it("throws immediately when dedupeStrategy is error and createGuardian fails", async () => {
			vi.mocked(createGuardian).mockRejectedValueOnce(new Error("guardian insert failed"));

			let txRolledBack = false;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txRolledBack = true;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(500);
			expect(txRolledBack).toBe(true);
		});

		it("collects errors and continues when dedupeStrategy is skip and insert fails", async () => {
			vi.mocked(createGuardian).mockRejectedValueOnce(new Error("guardian constraint error"));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.inserted).toBe(0);
			expect(body.errors).toHaveLength(1);
			expect(body.errors[0].message).toBe("guardian constraint error");
		});

		it("rejects empty rows array", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db, { role: "staff" });
			const res = await app.request(
				"/api/imports/guardians",
				jsonBody({ rows: [guardianRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(403);
		});
	});

	describe("POST /api/imports/invoices", () => {
		it("wraps the entire invoice batch in a db.transaction", async () => {
			const mockInvoice = { id: "invoice-1", centerId: "center-1", ...invoiceRow };
			vi.mocked(createInvoice).mockResolvedValue(
				mockInvoice as unknown as ReturnType<typeof createInvoice> extends Promise<infer T>
					? T
					: never,
			);

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			expect(db.transaction).toHaveBeenCalledTimes(1);
		});

		it("inserts invoice rows (happy path)", async () => {
			const mockInvoice = { id: "invoice-1", centerId: "center-1", ...invoiceRow };
			vi.mocked(createInvoice).mockResolvedValue(
				mockInvoice as unknown as ReturnType<typeof createInvoice> extends Promise<infer T>
					? T
					: never,
			);

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.inserted).toBe(1);
			expect(body.skipped).toBe(0);
			expect(body.errors).toHaveLength(0);
		});

		it("skips duplicate invoice by (centerId, guardianId, periodStart, periodEnd) when dedupeStrategy=skip", async () => {
			const mockInvoice = { id: "invoice-1", centerId: "center-1", ...invoiceRow };
			vi.mocked(createInvoice).mockResolvedValue(
				mockInvoice as unknown as ReturnType<typeof createInvoice> extends Promise<infer T>
					? T
					: never,
			);

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							// Simulate existing invoice found
							limit: vi.fn().mockResolvedValue([{ id: "existing-invoice" }]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.skipped).toBe(1);
			expect(body.inserted).toBe(0);
			// createInvoice was NOT called since we skipped
			expect(vi.mocked(createInvoice)).not.toHaveBeenCalled();
		});

		it("returns HTTP 422 when a duplicate invoice is found and dedupeStrategy is error", async () => {
			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "existing-invoice" }]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return await fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(422);
		});

		it("rolls back all inserts when one invoice fails (dedupeStrategy=error)", async () => {
			vi.mocked(createInvoice).mockRejectedValueOnce(new Error("DB error"));

			let transactionRolledBack = false;
			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					try {
						return await fn(txDb);
					} catch (err) {
						transactionRolledBack = true;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(500);
			expect(transactionRolledBack).toBe(true);
		});

		it("upserts duplicate invoice when dedupeStrategy=upsert", async () => {
			const txUpdateWhere = vi.fn().mockResolvedValue([]);
			const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
			const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
			const txDelete = vi.fn().mockReturnValue({ where: txDeleteWhere });
			const txInsertValues = vi.fn().mockResolvedValue(undefined);
			const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
			const txDb = {
				select: vi
					.fn()
					.mockReturnValueOnce(
						selectResult([
							{
								id: "existing-invoice",
								status: "draft",
								paidAt: null,
								publicLinkToken: "old-token",
								publicLinkVersion: 3,
							},
						]),
					)
					.mockReturnValueOnce(selectResult([{ id: "00000000-0000-0000-0000-000000000001" }])),
				insert: txInsert,
				update: vi.fn().mockReturnValue({ set: txUpdateSet }),
				delete: txDelete,
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "upsert" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				updated: number;
				skipped: number;
				errors: unknown[];
			};
			// upsert increments updated, not inserted
			expect(body.inserted).toBe(0);
			expect(body.updated).toBe(1);
			expect(body.skipped).toBe(0);
			// update was called on the tx (not createInvoice)
			expect(txDb.update).toHaveBeenCalled();
			expect(txUpdateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					paidAt: null,
					publicLinkVersion: 4,
					publicLinkRotatedAt: expect.any(Date),
				}),
			);
			expect(txDelete).toHaveBeenCalled();
			expect(txInsertValues).toHaveBeenCalledWith([
				expect.objectContaining({
					invoiceId: "existing-invoice",
					description: "Childcare April",
					amount: "1200",
				}),
			]);
			expect(vi.mocked(createInvoice)).not.toHaveBeenCalled();
		});

		it("rejects invoice upserts for existing non-draft invoices", async () => {
			const txUpdate = vi.fn();
			const txDelete = vi.fn();
			const txInsert = vi.fn();
			const txDb = {
				select: vi
					.fn()
					.mockReturnValueOnce(
						selectResult([
							{
								id: "existing-invoice",
								status: "sent",
								paidAt: null,
								publicLinkToken: "old-token",
								publicLinkVersion: 3,
							},
						]),
					)
					.mockReturnValueOnce(selectResult([{ id: "00000000-0000-0000-0000-000000000001" }])),
				insert: txInsert,
				update: txUpdate.mockReturnValue({
					set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
				}),
				delete: txDelete,
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "upsert" }),
			);

			expect(res.status).toBe(409);
			expect(txUpdate).not.toHaveBeenCalled();
			expect(txDelete).not.toHaveBeenCalled();
			expect(txInsert).not.toHaveBeenCalled();
		});

		it("rejects invoice upserts when a line item child is outside the center", async () => {
			const txDelete = vi.fn();
			const txInsert = vi.fn();
			const txDb = {
				select: vi
					.fn()
					.mockReturnValueOnce(
						selectResult([
							{
								id: "existing-invoice",
								status: "draft",
								paidAt: null,
								publicLinkToken: null,
								publicLinkVersion: 1,
							},
						]),
					)
					.mockReturnValueOnce(selectResult([{ id: "00000000-0000-0000-0000-000000000001" }]))
					.mockReturnValueOnce(selectResult([])),
				insert: txInsert,
				update: vi.fn(),
				delete: txDelete,
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({
					rows: [
						{
							...invoiceRow,
							lineItems: [
								{
									...invoiceRow.lineItems[0],
									childId: "10000000-0000-0000-0000-000000000001",
								},
							],
						},
					],
					dedupeStrategy: "upsert",
				}),
			);

			expect(res.status).toBe(500);
			expect(txDelete).not.toHaveBeenCalled();
			expect(txInsert).not.toHaveBeenCalled();
		});

		it("preserves paidAt when upserting a paid invoice", async () => {
			const txUpdateWhere = vi.fn().mockResolvedValue([]);
			const txUpdateSet = vi.fn().mockReturnValue({ where: txUpdateWhere });
			const txDb = {
				select: vi
					.fn()
					.mockReturnValueOnce(
						selectResult([
							{
								id: "existing-invoice",
								status: "draft",
								paidAt: null,
								publicLinkToken: null,
								publicLinkVersion: 1,
							},
						]),
					)
					.mockReturnValueOnce(selectResult([{ id: "00000000-0000-0000-0000-000000000001" }])),
				insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
				update: vi.fn().mockReturnValue({ set: txUpdateSet }),
				delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const paidAt = "2026-04-30T17:00:00.000Z";
			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({
					rows: [{ ...invoiceRow, status: "paid", paidAt }],
					dedupeStrategy: "upsert",
				}),
			);

			expect(res.status).toBe(200);
			expect(txUpdateSet).toHaveBeenCalledWith(
				expect.objectContaining({
					status: "paid",
					paidAt: new Date(paidAt),
				}),
			);
		});

		it("rejects fresh paid invoice imports without paidAt before creating invoices", async () => {
			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({
					rows: [{ ...invoiceRow, status: "paid" }],
					dedupeStrategy: "skip",
				}),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.inserted).toBe(0);
			expect(body.errors).toEqual([
				{
					rowIndex: 0,
					message: "Paid invoices require a paidAt timestamp",
				},
			]);
			expect(vi.mocked(createInvoice)).not.toHaveBeenCalled();
		});

		it("continues on error when dedupeStrategy is skip", async () => {
			vi.mocked(createInvoice).mockRejectedValueOnce(new Error("insert failed"));

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				skipped: number;
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.inserted).toBe(0);
			expect(body.errors).toHaveLength(1);
			expect(body.errors[0].rowIndex).toBe(0);
			expect(body.errors[0].message).toBe("insert failed");
		});

		it("inserts multiple rows sequentially within one transaction", async () => {
			const mockInvoice = { id: "invoice-1", centerId: "center-1", ...invoiceRow };
			vi.mocked(createInvoice).mockResolvedValue(
				mockInvoice as unknown as ReturnType<typeof createInvoice> extends Promise<infer T>
					? T
					: never,
			);

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow, invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			expect(body.inserted).toBe(2);
			expect(body.skipped).toBe(0);
			// Exactly one transaction wrapping both inserts
			expect(db.transaction).toHaveBeenCalledTimes(1);
		});

		it("uses 'Unknown error' message when non-Error is thrown", async () => {
			vi.mocked(createInvoice).mockRejectedValueOnce("plain string");

			const txDb = {
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
				insert: vi.fn(),
				update: vi.fn(),
				delete: vi.fn(),
				transaction: vi.fn(),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.errors[0].message).toBe("Unknown error");
		});

		it("rejects empty rows array", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db, { role: "staff" });
			const res = await app.request(
				"/api/imports/invoices",
				jsonBody({ rows: [invoiceRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(403);
		});
	});

	describe("POST /api/imports/enroll", () => {
		it("enrolls rows and returns correct counts (happy path)", async () => {
			vi.mocked(enrollChild).mockResolvedValue({
				child: { id: "child-1" } as unknown as Awaited<ReturnType<typeof enrollChild>>["child"],
				guardians: [{ guardianId: "g-1", isPrimary: true }],
				classroomAssignment: null,
			});

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number; errors: unknown[] };
			expect(body.inserted).toBe(1);
			expect(body.skipped).toBe(0);
			expect(body.errors).toHaveLength(0);
		});

		it("skips duplicate enrollment when dedupeStrategy is skip", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-child" }]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { inserted: number; skipped: number };
			expect(body.skipped).toBe(1);
			expect(body.inserted).toBe(0);
		});

		it("throws on duplicate when dedupeStrategy is error", async () => {
			let txError: Error | null = null;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "existing-child" }]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txError = err as Error;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(500);
			expect(txError).toBeInstanceOf(Error);
			expect((txError as unknown as Error).message).toContain("duplicate child");
		});

		it("collects errors and continues when dedupeStrategy is skip and enroll fails", async () => {
			vi.mocked(enrollChild).mockRejectedValueOnce(new Error("Enroll error"));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				inserted: number;
				skipped: number;
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.inserted).toBe(0);
			expect(body.errors).toHaveLength(1);
			expect(body.errors[0].rowIndex).toBe(0);
		});

		it("uses 'Unknown error' message when non-Error is thrown", async () => {
			vi.mocked(enrollChild).mockRejectedValueOnce({ code: "weird" });

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				errors: Array<{ rowIndex: number; message: string }>;
			};
			expect(body.errors[0].message).toBe("Unknown error");
		});

		it("throws immediately when dedupeStrategy is error and enrollChild fails", async () => {
			vi.mocked(enrollChild).mockRejectedValueOnce(new Error("enroll insert failed"));

			let txRolledBack = false;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const tx = {
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					try {
						return await fn(tx);
					} catch (err) {
						txRolledBack = true;
						throw err;
					}
				}),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "error" }),
			);

			expect(res.status).toBe(500);
			expect(txRolledBack).toBe(true);
		});

		it("rejects empty rows array", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountImports, db, { role: "staff" });
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(403);
		});

		it("passes the transaction object (not the outer db) as the first arg to enrollChild", async () => {
			vi.mocked(enrollChild).mockResolvedValue({
				child: { id: "child-1" } as unknown as Awaited<ReturnType<typeof enrollChild>>["child"],
				guardians: [{ guardianId: "g-1", isPrimary: true }],
				classroomAssignment: null,
			});

			let capturedTx: unknown;
			const tx = {
				execute: vi.fn().mockResolvedValue([]),
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					capturedTx = tx;
					return fn(tx);
				}),
			});

			const app = createTestApp(mountImports, db);
			await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			// enrollChild must be called with the transaction object as its first arg,
			// not the outer db — so all inserts inside enrollChild participate in the tx.
			expect(vi.mocked(enrollChild)).toHaveBeenCalledWith(
				capturedTx,
				expect.any(String),
				expect.anything(),
				capturedTx,
			);
			expect(vi.mocked(enrollChild).mock.calls[0][0]).toBe(capturedTx);
			expect(vi.mocked(enrollChild).mock.calls[0][0]).not.toBe(db);
		});

		it("acquires a center-row FOR UPDATE lock before enrolling (plan-cap race guard)", async () => {
			vi.mocked(enrollChild).mockResolvedValue({
				child: { id: "child-1" } as unknown as Awaited<ReturnType<typeof enrollChild>>["child"],
				guardians: [{ guardianId: "g-1", isPrimary: true }],
				classroomAssignment: null,
			});

			const callOrder: string[] = [];
			const execute = vi.fn().mockImplementation(() => {
				callOrder.push("execute");
				return Promise.resolve([]);
			});
			const select = vi.fn().mockImplementation(() => {
				callOrder.push("select");
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			});
			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute, select }),
					),
			});

			const app = createTestApp(mountImports, db);
			const res = await app.request(
				"/api/imports/enroll",
				jsonBody({ rows: [enrollRow], dedupeStrategy: "skip" }),
			);

			expect(res.status).toBe(200);
			// A single FOR UPDATE lock must serialize the whole batch against concurrent
			// enroll/import so the plan cap cannot be exceeded via a TOCTOU race.
			expect(execute).toHaveBeenCalledTimes(1);
			expect(objectContainsText(execute.mock.calls[0]?.[0], "for update")).toBe(true);
			// The lock must be taken before any dedupe select / cap check.
			expect(callOrder[0]).toBe("execute");
		});
	});
});
