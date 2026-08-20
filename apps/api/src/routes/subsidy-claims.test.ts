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
		requireCenter: createMiddleware(async (_c, next) => {
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

const { subsidyClaimsRoutes } = await import("./subsidy-claims.js");

function mountSubsidyClaims(app: Hono<AppEnv>) {
	app.route("/api/subsidy-claims", subsidyClaimsRoutes);
}

const noCenterMembership = { centerId: undefined as never };

describe("subsidy claims routes", () => {
	it("lists subsidy claims", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([
								{
									id: "30000000-0000-0000-0000-000000000001",
									centerId: "center-1",
									subsidyCaseId: "10000000-0000-0000-0000-000000000001",
									status: "draft",
								},
							]),
						}),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyClaims: Array<{ id: string }> };
		expect(body.subsidyClaims).toHaveLength(1);
	});

	it("rejects list requests without center membership", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db, noCenterMembership);
		const res = await app.request("/api/subsidy-claims");
		expect(res.status).toBe(403);
	});

	it("accepts pagination query params", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({ limit }),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims?limit=5&cursor=0");

		expect(res.status).toBe(200);
		expect(limit).toHaveBeenCalledWith(5);
		expect(offset).toHaveBeenCalledWith(0);
	});

	it("rejects invalid subsidy case list filters before querying", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims?subsidyCaseId=not-a-uuid");

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("filters subsidy claims by subsidy case id", async () => {
		const limit = vi.fn().mockReturnValue({
			offset: vi.fn().mockResolvedValue([]),
		});
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({ limit }),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims?subsidyCaseId=10000000-0000-0000-0000-000000000001",
		);

		expect(res.status).toBe(200);
		expect(limit).toHaveBeenCalledWith(50);
	});

	it("creates a subsidy claim", async () => {
		const created = {
			id: "30000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-30",
			daysAttended: 10,
			hoursAttended: 60,
			amountClaimed: 650,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([created]),
				}),
			}),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(201);
	});

	it("maps the subsidy_claims_no_overlap exclusion violation (23P01) to a 409", async () => {
		const tx = {
			// app-level overlap read passes (race: concurrent insert slipped in)
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			// DB exclusion constraint rejects the concurrent write
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(
						Object.assign(new Error("conflicting key value violates exclusion constraint"), {
							code: "23P01",
							constraint: "subsidy_claims_no_overlap",
						}),
					),
				}),
			}),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("claim_period_overlap");
	});

	it("unwraps a driver-nested cause chain to map 23P01 to 409", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockRejectedValue(
						Object.assign(new Error("query failed"), {
							cause: Object.assign(new Error("conflicting key value"), {
								code: "23P01",
								constraint: "subsidy_claims_no_overlap",
							}),
						}),
					),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(409);
	});

	it("re-throws a non-23P01 DB error from the claim insert as a 500", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi
						.fn()
						.mockRejectedValue(Object.assign(new Error("some other failure"), { code: "23505" })),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(500);
	});

	it.each([
		["terminated", "terminated"],
		["expired", "expired"],
		["pending", "pending"],
	] as const)("rejects claim creation when the parent subsidy case status is '%s'", async (_label, caseStatus) => {
		const tx = { insert: vi.fn() };
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: caseStatus },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Cannot create a claim against a non-active subsidy case");
		expect(tx.insert).not.toHaveBeenCalled();
	});

	it("returns 400 for non-UUID subsidy claim id on get", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/not-a-uuid");
		expect(res.status).toBe(400);
	});

	it("returns 404 when reading a missing subsidy claim", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001");
		expect(res.status).toBe(404);
	});

	it("reads a subsidy claim by id", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								centerId: "center-1",
								status: "draft",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { subsidyClaim: { status: string } };
		expect(body.subsidyClaim.status).toBe("draft");
	});

	it("returns 400 for non-UUID subsidy claim id on patch", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/not-a-uuid",
			patchBody({ status: "submitted", submittedAt: "2026-04-30T15:00:00.000Z" }),
		);
		expect(res.status).toBe(400);
	});

	it("returns 404 when updating a missing subsidy claim", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ status: "submitted", submittedAt: "2026-04-30T15:00:00.000Z" }),
		);
		expect(res.status).toBe(404);
	});

	it("returns 404 when moving a subsidy claim to a missing subsidy case", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(
								selectCallCount === 1
									? [
											{
												id: "30000000-0000-0000-0000-000000000001",
												subsidyCaseId: "10000000-0000-0000-0000-000000000001",
												periodStart: "2026-04-01",
												periodEnd: "2026-04-30",
												daysAttended: 10,
												hoursAttended: "60",
												amountClaimed: "650",
												amountApproved: null,
												amountPaid: null,
												status: "draft",
												submittedAt: null,
												paidAt: null,
											},
										]
									: [],
							),
						}),
					}),
				};
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ subsidyCaseId: "10000000-0000-0000-0000-000000000099" }),
		);

		expect(res.status).toBe(404);
	});

	it("returns 404 when a subsidy claim update is lost during write", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ status: "submitted", submittedAt: "2026-04-30T15:00:00.000Z" }),
		);

		expect(res.status).toBe(404);
	});

	it("updates a subsidy claim", async () => {
		const updated = {
			id: "30000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			status: "submitted",
			submittedAt: new Date(),
		};
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ status: "submitted", submittedAt: "2026-04-30T15:00:00.000Z" }),
		);

		expect(res.status).toBe(200);
	});

	it("rejects source-field edits after a subsidy claim is submitted", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "submitted",
								submittedAt: "2026-04-30T15:00:00.000Z",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								status: "submitted",
								periodStart: "2026-03-01",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ periodStart: "2026-03-01" }),
		);

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({
			error: "claim_locked",
			message: "Submitted subsidy claims cannot edit source claim fields",
		});
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects reverting a submitted subsidy claim back to draft", async () => {
		// Reopening a submitted claim to draft would unlock the source-field lock,
		// letting a follow-up PATCH edit immutable financial fields. There is no
		// reopen flow, so the transition must be rejected outright.
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "submitted",
								submittedAt: "2026-04-30T15:00:00.000Z",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ status: "draft" }),
		);

		expect(res.status).toBe(409);
		await expect(res.json()).resolves.toEqual({
			error: "invalid_status_transition",
			message: "Cannot revert a 'submitted' subsidy claim back to draft",
		});
		expect(db.update).not.toHaveBeenCalled();
	});

	it("submits a draft subsidy claim with a timestamp", async () => {
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "30000000-0000-0000-0000-000000000001",
						centerId: "center-1",
						status: "submitted",
						submittedAt: new Date("2026-05-26T10:00:00.000Z"),
					},
				]),
			}),
		});
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "draft",
				},
			]),
			update: vi.fn().mockReturnValue({ set }),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit",
			{ method: "POST" },
		);

		expect(res.status).toBe(200);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "submitted",
				submittedAt: expect.any(Date),
				updatedAt: expect.any(Date),
			}),
		);
	});

	it("returns 400 for non-UUID subsidy claim id on submit", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/not-a-uuid/submit", { method: "POST" });
		expect(res.status).toBe(400);
	});

	it("returns 404 when submitting a missing subsidy claim", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([]),
			update: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit",
			{ method: "POST" },
		);
		expect(res.status).toBe(404);
	});

	it("returns 404 when a subsidy claim submit write is lost", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					status: "draft",
				},
			]),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit",
			{ method: "POST" },
		);
		expect(res.status).toBe(404);
	});

	it("rechecks draft status inside the submit transaction before submitting a subsidy claim", async () => {
		const dbUpdateSet = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "30000000-0000-0000-0000-000000000001",
						status: "submitted",
					},
				]),
			}),
		});
		const txUpdate = vi.fn();
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					status: "paid",
				},
			]),
			update: txUpdate,
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "draft" }]),
					}),
				}),
			}),
			update: vi.fn().mockReturnValue({ set: dbUpdateSet }),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit",
			{ method: "POST" },
		);

		expect(res.status).toBe(409);
		expect(txUpdate).not.toHaveBeenCalled();
		expect(dbUpdateSet).not.toHaveBeenCalled();
	});

	it("deletes a draft subsidy claim", async () => {
		const deleteWhere = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "draft",
				},
			]),
		});
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "draft",
				},
			]),
			delete: vi.fn().mockReturnValue({
				where: deleteWhere,
			}),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({
			deleted: true,
			id: "30000000-0000-0000-0000-000000000001",
		});
		expect(deleteWhere).toHaveBeenCalledOnce();
	});

	it("returns 400 for non-UUID subsidy claim id on delete", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/not-a-uuid", { method: "DELETE" });
		expect(res.status).toBe(400);
	});

	it("returns 404 when deleting a missing subsidy claim", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([]),
			delete: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});

	it("returns 404 when a subsidy claim delete write is lost", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([{ status: "draft" }]),
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

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});
		expect(res.status).toBe(404);
	});

	it("rechecks draft status inside the delete transaction before deleting a subsidy claim", async () => {
		const dbDelete = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([{ id: "30000000-0000-0000-0000-000000000001" }]),
			}),
		});
		const txDelete = vi.fn();
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					status: "submitted",
				},
			]),
			delete: txDelete,
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ status: "draft" }]),
					}),
				}),
			}),
			delete: dbDelete,
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		expect(txDelete).not.toHaveBeenCalled();
		expect(dbDelete).not.toHaveBeenCalled();
	});

	it("rejects submitting a non-draft subsidy claim", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "paid",
				},
			]),
			update: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit",
			{ method: "POST" },
		);

		expect(res.status).toBe(409);
		expect(tx.update).not.toHaveBeenCalled();
	});

	it("rejects deleting a submitted subsidy claim", async () => {
		const tx = {
			execute: vi.fn().mockResolvedValue([
				{
					id: "30000000-0000-0000-0000-000000000001",
					centerId: "center-1",
					status: "submitted",
				},
			]),
			delete: vi.fn(),
		};
		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request("/api/subsidy-claims/30000000-0000-0000-0000-000000000001", {
			method: "DELETE",
		});

		expect(res.status).toBe(409);
		expect(tx.delete).not.toHaveBeenCalled();
	});

	it("rejects partial updates that would make paid amount exceed approved amount", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2026-04-01",
								periodEnd: "2026-04-30",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: "500",
								amountPaid: "400",
								status: "approved",
								submittedAt: "2026-04-30T15:00:00.000Z",
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			update: vi.fn(),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ amountPaid: 600 }),
		);

		expect(res.status).toBe(400);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("validates replacement subsidy cases before updating a claim", async () => {
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "30000000-0000-0000-0000-000000000001",
						subsidyCaseId: "10000000-0000-0000-0000-000000000001",
						status: "paid",
					},
				]),
			}),
		});
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({ set }),
		};
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "30000000-0000-0000-0000-000000000001",
										subsidyCaseId: "10000000-0000-0000-0000-000000000001",
										periodStart: "2026-04-01",
										periodEnd: "2026-04-30",
										daysAttended: 10,
										hoursAttended: "60",
										amountClaimed: "650",
										amountApproved: null,
										amountPaid: null,
										status: "draft",
										submittedAt: null,
										paidAt: null,
									},
								]),
							}),
						}),
					};
				}
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "10000000-0000-0000-0000-000000000001" }]),
						}),
					}),
				};
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 12,
				hoursAttended: 66,
				amountClaimed: 780,
				amountApproved: 760,
				amountPaid: 760,
				status: "paid",
				submittedAt: "2026-04-30T15:00:00.000Z",
				paidAt: "2026-05-05T15:00:00.000Z",
			}),
		);

		expect(res.status).toBe(200);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				amountApproved: 760,
				amountPaid: 760,
				status: "paid",
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			}),
		);
	});

	it("rejects reconciliation requests without all required query params", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001",
		);

		expect(res.status).toBe(400);
	});

	it("rejects reconciliation requests with invalid claim period dates before querying", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-02-30&periodEnd=2026-04-30",
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("rejects reconciliation requests with inverted claim periods before querying", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-05-01&periodEnd=2026-04-30",
		);

		expect(res.status).toBe(400);
		expect(db.select).not.toHaveBeenCalled();
	});

	it("returns 404 for reconciliation when the subsidy case is missing", async () => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-04-01&periodEnd=2026-04-30",
		);

		expect(res.status).toBe(404);
	});

	it("builds a reconciliation draft from attendance and daily rate", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "10000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										childId: "20000000-0000-0000-0000-000000000001",
										rateDaily: 65,
										rateWeekly: null,
										authorizedHoursWeekly: 40,
									},
								]),
							}),
						}),
					};
				}
				if (selectCallCount === 2) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "checkin-1",
								checkedInAt: new Date("2026-04-01T08:00:00.000Z"),
								checkedOutAt: new Date("2026-04-01T14:00:00.000Z"),
							},
							{
								id: "checkin-2",
								checkedInAt: new Date("2026-04-02T08:00:00.000Z"),
								checkedOutAt: new Date("2026-04-02T13:00:00.000Z"),
							},
						]),
					}),
				};
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-04-01&periodEnd=2026-04-30",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summary: { daysAttended: number; hoursAttended: number; amountClaimed: number };
		};
		expect(body.summary.daysAttended).toBe(2);
		expect(body.summary.hoursAttended).toBe(11);
		expect(body.summary.amountClaimed).toBe(130);
	});

	it("marks reconciliation as manual when rate data is missing", async () => {
		let selectCallCount = 0;
		const db = createMockDb({
			select: vi.fn().mockImplementation(() => {
				selectCallCount += 1;
				if (selectCallCount === 1) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([
									{
										id: "10000000-0000-0000-0000-000000000001",
										centerId: "center-1",
										childId: "20000000-0000-0000-0000-000000000001",
										rateDaily: null,
										rateWeekly: null,
										authorizedHoursWeekly: null,
									},
								]),
							}),
						}),
					};
				}
				if (selectCallCount === 2) {
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
							}),
						}),
					};
				}

				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "checkin-1",
								checkedInAt: new Date("2026-04-01T08:00:00.000Z"),
								checkedOutAt: new Date("2026-04-01T14:00:00.000Z"),
							},
						]),
					}),
				};
			}),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-04-01&periodEnd=2026-04-30",
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			summary: { requiresManualAmount: boolean; amountClaimed: number };
		};
		expect(body.summary.requiresManualAmount).toBe(true);
		expect(body.summary.amountClaimed).toBe(0);
	});

	it.each([
		["GET", "/api/subsidy-claims", undefined],
		[
			"GET",
			"/api/subsidy-claims/reconciliation?subsidyCaseId=10000000-0000-0000-0000-000000000001&periodStart=2026-04-01&periodEnd=2026-04-30",
			undefined,
		],
		["GET", "/api/subsidy-claims/30000000-0000-0000-0000-000000000001", undefined],
		[
			"POST",
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-30",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		],
		[
			"PATCH",
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ status: "submitted", submittedAt: "2026-04-30T15:00:00.000Z" }),
		],
		["POST", "/api/subsidy-claims/30000000-0000-0000-0000-000000000001/submit", { method: "POST" }],
		["DELETE", "/api/subsidy-claims/30000000-0000-0000-0000-000000000001", { method: "DELETE" }],
	] as const)("rejects %s subsidy claim requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountSubsidyClaims, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});

	// === Overlap guard tests ===

	it("POST returns 409 claim_period_overlap when an overlapping claim exists for the same case", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "30000000-0000-0000-0000-000000000002",
							subsidyCaseId: "10000000-0000-0000-0000-000000000001",
							periodStart: "2024-01-01",
							periodEnd: "2024-01-31",
						},
					]),
				}),
			}),
			insert: vi.fn(),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2024-01-15",
				periodEnd: "2024-02-15",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string; message: string };
		expect(body.error).toBe("claim_period_overlap");
		expect(tx.insert).not.toHaveBeenCalled();
	});

	it("POST returns 201 when the existing claim period does NOT overlap (non-adjacent)", async () => {
		const created = {
			id: "30000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			periodStart: "2024-03-01",
			periodEnd: "2024-03-31",
			daysAttended: 10,
			hoursAttended: 60,
			amountClaimed: 650,
			status: "draft",
		};
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([created]),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2024-03-01",
				periodEnd: "2024-03-31",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(201);
	});

	it("POST boundary: shared endpoint (existing 2024-01-01..2024-01-15, new 2024-01-15..2024-01-31) is a conflict (inclusive)", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "30000000-0000-0000-0000-000000000002",
							periodStart: "2024-01-01",
							periodEnd: "2024-01-15",
						},
					]),
				}),
			}),
			insert: vi.fn(),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2024-01-15",
				periodEnd: "2024-01-31",
				daysAttended: 10,
				hoursAttended: 60,
				amountClaimed: 650,
			}),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("claim_period_overlap");
		expect(tx.insert).not.toHaveBeenCalled();
	});

	it("POST boundary: adjacent non-overlapping (existing ..2024-01-15, new 2024-01-16..) does NOT conflict", async () => {
		const created = {
			id: "30000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			periodStart: "2024-01-16",
			periodEnd: "2024-01-31",
			daysAttended: 5,
			hoursAttended: 30,
			amountClaimed: 325,
			status: "draft",
		};
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([created]),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi
							.fn()
							.mockResolvedValue([
								{ id: "10000000-0000-0000-0000-000000000001", status: "active" },
							]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims",
			jsonBody({
				subsidyCaseId: "10000000-0000-0000-0000-000000000001",
				periodStart: "2024-01-16",
				periodEnd: "2024-01-31",
				daysAttended: 5,
				hoursAttended: 30,
				amountClaimed: 325,
			}),
		);

		expect(res.status).toBe(201);
	});

	it("PATCH returns 409 when re-periodizing a draft claim to overlap a different claim on the same case", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							id: "30000000-0000-0000-0000-000000000002",
							periodStart: "2024-02-01",
							periodEnd: "2024-02-28",
						},
					]),
				}),
			}),
			update: vi.fn(),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2024-01-01",
								periodEnd: "2024-01-31",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ periodStart: "2024-01-15", periodEnd: "2024-02-15" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("claim_period_overlap");
		expect(tx.update).not.toHaveBeenCalled();
	});

	it("PATCH does not 409 against the claim being updated (excluded id)", async () => {
		const updated = {
			id: "30000000-0000-0000-0000-000000000001",
			centerId: "center-1",
			subsidyCaseId: "10000000-0000-0000-0000-000000000001",
			periodStart: "2024-01-01",
			periodEnd: "2024-01-20",
			status: "draft",
		};
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2024-01-01",
								periodEnd: "2024-01-31",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ periodEnd: "2024-01-20" }),
		);

		expect(res.status).toBe(200);
	});

	it("PATCH maps the subsidy_claims_no_overlap exclusion violation (23P01) to a 409", async () => {
		// Race: the in-transaction overlap read passes (no conflicting row visible
		// yet), but a concurrent write commits an overlapping period before this
		// UPDATE, so the GiST exclusion constraint rejects it. The PATCH handler
		// must map that to a clean 409 exactly as POST does — never leak a raw 500.
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockRejectedValue(
							Object.assign(new Error("conflicting key value violates exclusion constraint"), {
								code: "23P01",
								constraint: "subsidy_claims_no_overlap",
							}),
						),
					}),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2024-01-01",
								periodEnd: "2024-01-31",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ periodStart: "2024-01-15", periodEnd: "2024-02-15" }),
		);

		expect(res.status).toBe(409);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("claim_period_overlap");
	});

	it("PATCH re-throws a non-23P01 DB error from the claim update as a 500", async () => {
		const tx = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi
							.fn()
							.mockRejectedValue(Object.assign(new Error("some other failure"), { code: "23505" })),
					}),
				}),
			}),
		};
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "30000000-0000-0000-0000-000000000001",
								subsidyCaseId: "10000000-0000-0000-0000-000000000001",
								periodStart: "2024-01-01",
								periodEnd: "2024-01-31",
								daysAttended: 10,
								hoursAttended: "60",
								amountClaimed: "650",
								amountApproved: null,
								amountPaid: null,
								status: "draft",
								submittedAt: null,
								paidAt: null,
							},
						]),
					}),
				}),
			}),
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)),
		});

		const app = createTestApp(mountSubsidyClaims, db);
		const res = await app.request(
			"/api/subsidy-claims/30000000-0000-0000-0000-000000000001",
			patchBody({ periodEnd: "2024-01-20" }),
		);

		expect(res.status).toBe(500);
	});
});
