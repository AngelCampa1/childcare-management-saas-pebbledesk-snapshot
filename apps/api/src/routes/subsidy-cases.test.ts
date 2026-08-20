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

vi.mock("../middleware/plan.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	return {
		requireEntitlement: () =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
	};
});

const { subsidyCasesRoutes } = await import("./subsidy-cases.js");

function mountSubsidyCases(app: Hono<AppEnv>) {
	app.route("/api/subsidy-cases", subsidyCasesRoutes);
}

describe("subsidy cases routes", () => {
	it("lists subsidy cases for owner", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([
									{
										id: "10000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										childId: "20000000-0000-0000-0000-000000000001",
										program: "ccdf",
										caseNumber: "CASE-1",
										agencyName: "County Subsidy Office",
										status: "active",
									},
								]),
							}),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyCases: Array<{ id: string }> };
		expect(body.subsidyCases).toHaveLength(1);
	});

	it("applies pagination limit and offset to the subsidy cases list query", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({ limit }),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases?limit=10&cursor=20");

		expect(res.status).toBe(200);
		expect(limit).toHaveBeenCalledWith(10);
		expect(offset).toHaveBeenCalledWith(20);
	});

	it("rejects list requests without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { centerId: undefined });
		const res = await app.request("/api/subsidy-cases");

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed child ID filter", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases?childId=child-1");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("accepts a valid child ID filter when listing subsidy cases", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue({
							limit: vi.fn().mockReturnValue({
								offset: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
				}),
			}),
		});
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases?childId=20000000-0000-0000-0000-000000000001",
		);

		expect(res.status).toBe(200);
		expect(db.select).toHaveBeenCalledOnce();
	});

	it("reads a subsidy case by id", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "10000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								caseNumber: "CASE-1",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyCase: { caseNumber: string } };
		expect(body.subsidyCase.caseNumber).toBe("CASE-1");
	});

	it("returns not found when reading a missing subsidy case", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(404);
	});

	it("rejects read requests without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { centerId: undefined });
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed subsidy case IDs before reading", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/not-a-uuid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("creates a subsidy case", async () => {
		const created = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			childId: "20000000-0000-0000-0000-000000000001",
			program: "ccdf",
			caseNumber: "CASE-1",
			agencyName: "County Subsidy Office",
			authorizedHoursWeekly: 40,
			rateDaily: 65,
			rateWeekly: null,
			effectiveDate: "2026-04-01",
			expirationDate: null,
			status: "active",
			createdAt: new Date(),
			updatedAt: new Date(),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "20000000-0000-0000-0000-000000000001" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([created]),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases",
			jsonBody({
				childId: "20000000-0000-0000-0000-000000000001",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County Subsidy Office",
				authorizedHoursWeekly: 40,
				rateDaily: 65,
				effectiveDate: "2026-04-01",
			}),
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { subsidyCase: { caseNumber: string } };
		expect(body.subsidyCase.caseNumber).toBe("CASE-1");
	});

	it("rejects create requests without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { centerId: undefined });
		const res = await app.request(
			"/api/subsidy-cases",
			jsonBody({
				childId: "20000000-0000-0000-0000-000000000001",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County Subsidy Office",
				effectiveDate: "2026-04-01",
			}),
		);

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns not found when creating for a child outside the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases",
			jsonBody({
				childId: "20000000-0000-0000-0000-000000000001",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County Subsidy Office",
				effectiveDate: "2026-04-01",
			}),
		);

		expect(res.status).toBe(404);
	});

	it("surfaces a failed subsidy case insert", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "20000000-0000-0000-0000-000000000001" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases",
			jsonBody({
				childId: "20000000-0000-0000-0000-000000000001",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County Subsidy Office",
				effectiveDate: "2026-04-01",
			}),
		);

		expect(res.status).toBe(500);
	});

	it("updates a subsidy case (no status change)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			childId: "20000000-0000-0000-0000-000000000001",
			program: "ccdf",
			caseNumber: "CASE-1",
			agencyName: "Updated Agency",
			status: "active",
			updatedAt: new Date(),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ status: "active", effectiveDate: "2026-04-01", expirationDate: null },
							]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ agencyName: "Updated Agency" }),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyCase: { agencyName: string } };
		expect(body.subsidyCase.agencyName).toBe("Updated Agency");
	});

	it("rejects partial subsidy case date updates that invert the stored authorization window", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								status: "active",
								effectiveDate: "2026-04-01",
								expirationDate: "2026-04-30",
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ effectiveDate: "2026-05-01" }),
		);

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("deletes a subsidy case", async () => {
		const deleteWhere = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "10000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "active",
				},
			]),
		});
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "10000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "active",
				},
			]),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			delete: vi.fn().mockReturnValue({
				where: deleteWhere,
			}),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			deleted: true,
			id: "10000000-0000-0000-0000-000000000001",
		});
		expect(deleteWhere).toHaveBeenCalledOnce();
	});

	it("rejects deleting a subsidy case that already has claims", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "10000000-0000-0000-0000-000000000001",
					centerId: "center-1",
				},
			]),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "30000000-0000-0000-0000-000000000001" }]),
					}),
				}),
			}),
			delete: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		expect(tx.delete).not.toHaveBeenCalled();
	});

	it("rechecks claims inside the delete transaction before deleting a subsidy case", async () => {
		let selectCallCount = 0;
		const deleteReturning = vi.fn().mockResolvedValue([
			{
				id: "10000000-0000-0000-0000-000000000001",
				centerId: "center-1",
			},
		]);
		const dbDelete = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({ returning: deleteReturning }),
		});
		const txDelete = vi.fn();
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "10000000-0000-0000-0000-000000000001",
				},
			]),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "30000000-0000-0000-0000-000000000001" }]),
					}),
				}),
			}),
			delete: txDelete,
		};
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue(
									selectCallCount === 1
										? [{ id: "10000000-0000-0000-0000-000000000001", centerId: "center-1" }]
										: [],
								),
						}),
					}),
				};
			}),
			delete: dbDelete,
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		expect(txDelete).not.toHaveBeenCalled();
		expect(dbDelete).not.toHaveBeenCalled();
	});

	it("returns 400 for non-UUID subsidy case id on delete", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/not-a-uuid", { method: "DELETE" });
		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 404 when deleting a missing subsidy case", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([]),
			select: vi.fn(),
			delete: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});

	it("returns 404 when a subsidy case delete is lost during write", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([{ id: "10000000-0000-0000-0000-000000000001" }]),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});

	it("rejects deleting a subsidy case without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { centerId: "" });
		const res = await app.request("/api/subsidy-cases/10000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});
		expect(res.status).toBe(403);
	});

	it("returns not found when updating a missing subsidy case", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ agencyName: "Updated Agency" }),
		);

		expect(res.status).toBe(404);
	});

	it("rejects update requests without a center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { centerId: undefined });
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ agencyName: "Updated Agency" }),
		);

		expect(res.status).toBe(403);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("returns 400 for malformed subsidy case IDs before updating", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/not-a-uuid",
			patchBody({ agencyName: "Updated Agency" }),
		);

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("validates a replacement child before updating a subsidy case", async () => {
		const makeChain = (result: unknown) => ({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(result),
				}),
			}),
		});
		const select = vi
			.fn()
			.mockReturnValueOnce(
				makeChain([{ status: "active", effectiveDate: "2026-04-01", expirationDate: null }]),
			)
			.mockReturnValueOnce(makeChain([{ id: "20000000-0000-0000-0000-000000000001" }]));
		const db = createMockDb({
			select,
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "10000000-0000-0000-0000-000000000001",
								childId: "20000000-0000-0000-0000-000000000001",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ childId: "20000000-0000-0000-0000-000000000001" }),
		);

		expect(res.status).toBe(200);
		expect(select).toHaveBeenCalledTimes(2);
	});

	it("rejects staff mutations", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyCases, db, { role: "staff" });
		const res = await app.request(
			"/api/subsidy-cases",
			jsonBody({
				childId: "20000000-0000-0000-0000-000000000001",
				program: "ccdf",
				caseNumber: "CASE-1",
				agencyName: "County Subsidy Office",
				effectiveDate: "2026-04-01",
			}),
		);

		expect(res.status).toBe(403);
	});

	// Status transition tests
	it("allows a valid status transition (pending → active)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			status: "active",
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "pending" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "active" }),
		);

		expect(res.status).toBe(200);
	});

	it("allows a valid status transition (pending → terminated)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			status: "terminated",
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "pending" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "terminated" }),
		);

		expect(res.status).toBe(200);
	});

	it("allows a valid status transition (active → expired)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			status: "expired",
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "active" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "expired" }),
		);

		expect(res.status).toBe(200);
	});

	it("allows a valid status transition (active → terminated)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			status: "terminated",
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "active" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "terminated" }),
		);

		expect(res.status).toBe(200);
	});

	it("returns 409 case_terminal for a status patch on a terminal case (expired → active)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "expired" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "active" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("case_terminal");
	});

	it("returns 409 case_terminal for a status patch on a terminal case (terminated → active)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "terminated" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "active" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("case_terminal");
	});

	it("returns 409 case_terminal for a status patch on a terminal case (terminated → expired)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "terminated" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "expired" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("case_terminal");
	});

	it("returns 409 for a disallowed status transition (active → pending)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "active" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "pending" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invalid_status_transition");
	});

	it("returns 409 for a disallowed status transition (pending → expired)", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "pending" }]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "expired" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invalid_status_transition");
	});

	it("returns 409 with case_terminal when patching rateDaily on a terminated case", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "terminated" }]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ rateDaily: 75 }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("case_terminal");
		expect(db.update).not.toHaveBeenCalled();
	});

	it("returns 409 with case_terminal when patching rateDaily on an expired case", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "expired" }]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ rateDaily: 75 }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("case_terminal");
		expect(db.update).not.toHaveBeenCalled();
	});

	it("allows a normal PATCH on an active case (regression)", async () => {
		const updated = {
			id: "10000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			rateDaily: 75,
			status: "active",
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "active" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ rateDaily: 75 }),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyCase: { rateDaily: number } };
		expect(body.subsidyCase.rateDaily).toBe(75);
	});

	it("returns 404 when transitioning status for a missing case", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyCases, db);
		const res = await app.request(
			"/api/subsidy-cases/10000000-0000-0000-0000-000000000001",
			patchBody({ status: "active" }),
		);

		expect(res.status).toBe(404);
	});
});
