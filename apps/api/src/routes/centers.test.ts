import { TRIAL_DAYS } from "@pebbledesk/shared/constants";
import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		requireCenter: createMiddleware(async (_c, next) => {
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
	};
});

const { centersRoutes } = await import("./centers.js");

beforeEach(() => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ id: "email-1" }),
			text: async () => "ok",
		}),
	);
});

function mountCenters(app: Hono<AppEnv>) {
	app.route("/api/centers", centersRoutes);
}

type PendingInvitationSelectRow = {
	membershipId: string;
	centerId: string;
	role: "owner" | "director" | "staff";
	centerName: string;
	invitedAt: Date | null;
	createdAt: Date;
	emailVerified: boolean;
};

function pendingInvitationSelectResult(rows: PendingInvitationSelectRow[]) {
	const chain = {
		innerJoin: vi.fn(),
		where: vi.fn().mockResolvedValue(rows),
	};
	chain.innerJoin.mockReturnValue(chain);
	return {
		from: vi.fn().mockReturnValue(chain),
	};
}

describe("centers routes", () => {
	it("creates a center and owner membership in a transaction", async () => {
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			phone: null,
			licenseNumber: null,
			timezone: "America/Chicago",
			subscriptionPlan: "trial",
		};
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		let insertCallCount = 0;
		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockImplementation(() => {
				insertCallCount++;
				return {
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue(insertCallCount === 1 ? [center] : [membership]),
					}),
				};
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
			{
				POSTHOG_PROJECT_API_KEY: "phc_test",
				POSTHOG_HOST: "https://us.i.posthog.com",
			},
		);

		expect(res.status).toBe(201);
		expect(db.transaction).toHaveBeenCalledTimes(1);
		const body = (await res.json()) as { center: { id: string }; membership: { role: string } };
		expect(body.center.id).toBe("center-2");
		expect(body.membership.role).toBe("owner");
		const fetchMock = vi.mocked(fetch);
		const posthogBodies = fetchMock.mock.calls
			.filter(([url]) => String(url) === "https://us.i.posthog.com/capture/")
			.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
		expect(posthogBodies).toEqual([
			expect.objectContaining({
				event: "center_created",
				distinct_id: expect.stringMatching(/^center:[a-f0-9]{64}$/),
				properties: {
					plan: "trial",
					state: "TX",
					timezone: "America/Chicago",
					self_serve: true,
				},
			}),
		]);
		expect(JSON.stringify(posthogBodies)).not.toContain("center-2");
		expect(JSON.stringify(posthogBodies)).not.toContain("user-1");
	});

	it("uses the default center timezone when timezone is omitted", async () => {
		const insertedCenters: Array<Record<string, unknown>> = [];
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			phone: null,
			licenseNumber: null,
			timezone: "America/Chicago",
		};
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockImplementation(() => {
				return {
					values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
						if ("slug" in values) {
							insertedCenters.push(values);
							return {
								returning: vi.fn().mockResolvedValue([center]),
							};
						}

						return {
							returning: vi.fn().mockResolvedValue([membership]),
						};
					}),
				};
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
			}),
		);

		expect(res.status).toBe(201);
		expect(insertedCenters).toHaveLength(1);
		expect(insertedCenters[0]).toMatchObject({
			timezone: "America/Chicago",
			subscriptionStatus: "trialing",
			subscriptionPlan: "trial",
		});
		expect(insertedCenters[0]).toHaveProperty("trialEndsAt");
		expect(insertedCenters[0]).toHaveProperty("currentPeriodEnd");
	});

	it("persists numeric licensed capacity when creating a center", async () => {
		const insertedCenters: Array<Record<string, unknown>> = [];
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			licensedCapacity: 72,
			timezone: "America/Chicago",
		};
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
					if ("slug" in values) {
						insertedCenters.push(values);
						return { returning: vi.fn().mockResolvedValue([center]) };
					}

					return { returning: vi.fn().mockResolvedValue([membership]) };
				}),
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				licensedCapacity: 72,
			}),
		);

		expect(res.status).toBe(201);
		expect(insertedCenters).toHaveLength(1);
		expect(insertedCenters[0]).toMatchObject({ licensedCapacity: 72 });
	});

	it("always starts on the 'trial' plan with trialing status and 30-day trial window", async () => {
		const insertedCenters: Array<Record<string, unknown>> = [];
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			phone: null,
			licenseNumber: null,
			timezone: "America/Chicago",
			subscriptionStatus: "trialing",
			subscriptionPlan: "trial",
		};
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const before = Date.now();
		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockImplementation(() => {
				return {
					values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
						if ("slug" in values) {
							insertedCenters.push(values);
							return {
								returning: vi.fn().mockResolvedValue([center]),
							};
						}

						return {
							returning: vi.fn().mockResolvedValue([membership]),
						};
					}),
				};
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);
		const after = Date.now();

		expect(res.status).toBe(201);
		expect(insertedCenters).toHaveLength(1);
		const insertedCenter = insertedCenters[0];
		expect(insertedCenter).toMatchObject({
			subscriptionStatus: "trialing",
			subscriptionPlan: "trial",
		});
		expect(insertedCenter.trialEndsAt).toBeInstanceOf(Date);
		expect(insertedCenter.currentPeriodEnd).toBe(insertedCenter.trialEndsAt);
		const expectedStart = before + TRIAL_DAYS * 24 * 60 * 60 * 1000;
		const expectedEnd = after + TRIAL_DAYS * 24 * 60 * 60 * 1000;
		const trialEndsAt = insertedCenter.trialEndsAt as Date;
		expect(trialEndsAt.getTime()).toBeGreaterThanOrEqual(expectedStart);
		expect(trialEndsAt.getTime()).toBeLessThanOrEqual(expectedEnd);
	});

	it("preserves selected onboarding subscription plan intent during center creation", async () => {
		const insertedCenters: Array<Record<string, unknown>> = [];
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			phone: null,
			licenseNumber: null,
			timezone: "America/Chicago",
			subscriptionStatus: "trialing",
			subscriptionPlan: "group",
		};
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((values: Record<string, unknown>) => {
					if ("slug" in values) {
						insertedCenters.push(values);
						return { returning: vi.fn().mockResolvedValue([center]) };
					}

					return { returning: vi.fn().mockResolvedValue([membership]) };
				}),
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
				subscriptionPlan: "group",
			}),
		);

		expect(res.status).toBe(201);
		expect(insertedCenters).toHaveLength(1);
		expect(insertedCenters[0]).toMatchObject({
			subscriptionStatus: "trialing",
			subscriptionPlan: "group",
		});
	});

	it("blocks center creation when the signed-in user still has a pending invitation", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue(
				pendingInvitationSelectResult([
					{
						membershipId: "membership-2",
						centerId: "center-2",
						role: "staff",
						centerName: "Pebble North",
						invitedAt: new Date("2026-04-09T10:00:00.000Z"),
						createdAt: new Date("2026-04-09T09:00:00.000Z"),
						emailVerified: false,
					},
				]),
			),
		});

		const app = createTestApp(mountCenters, db, {
			centerId: "",
			membershipId: "",
		});
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({
			error: "Invitation pending",
			code: "invite_pending",
			invitation: {
				membershipId: "membership-2",
				centerId: "center-2",
				centerName: "Pebble North",
				role: "staff",
			},
		});
		expect(db.transaction).not.toHaveBeenCalled();
	});

	it("returns 500 when center creation returns no row from the transaction", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					select: vi.fn(),
					update: vi.fn(),
					delete: vi.fn(),
					transaction: vi.fn(),
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Ghost Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(500);
	});

	it("returns 500 when owner membership creation fails inside the transaction", async () => {
		const center = {
			id: "center-2",
			name: "Pebble Center",
			slug: "pebble-center",
			address: "1 Main St",
			city: "Austin",
			state: "TX",
			zip: "78701",
			phone: null,
			licenseNumber: null,
			timezone: "America/Chicago",
		};

		let insertCallCount = 0;
		const txDb = {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockImplementation(() => {
				insertCallCount++;
				return {
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue(insertCallCount === 1 ? [center] : []),
					}),
				};
			}),
			update: vi.fn(),
			delete: vi.fn(),
			transaction: vi.fn(),
		};

		const db = createMockDb({
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txDb)),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(500);
		expect(db.transaction).toHaveBeenCalledTimes(1);
	});

	it("does not persist a center when owner membership creation fails", async () => {
		const persistedCenters: Array<{ id: string; name: string }> = [];
		let insertCallCount = 0;

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const stagedCenters: Array<{ id: string; name: string }> = [];
				const txDb = {
					select: vi.fn(),
					update: vi.fn(),
					delete: vi.fn(),
					transaction: vi.fn(),
					insert: vi.fn().mockImplementation(() => {
						insertCallCount++;
						return {
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockImplementation(async () => {
									if (insertCallCount === 1) {
										const createdCenter = { id: "center-rollback", name: "Rollback Center" };
										stagedCenters.push(createdCenter);
										return [createdCenter];
									}

									return [];
								}),
							}),
						};
					}),
				};

				try {
					const result = await fn(txDb);
					persistedCenters.push(...stagedCenters);
					return result;
				} catch (error) {
					return Promise.reject(error);
				}
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Rollback Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(500);
		expect(persistedCenters).toEqual([]);
	});

	it("retries center creation when the slug collides concurrently", async () => {
		const duplicateError = Object.assign(
			new Error("duplicate key value violates centers_slug_unique"),
			{
				code: "23505",
				constraint: "centers_slug_unique",
			},
		);
		let transactionAttempts = 0;
		const attemptedSlugs: string[] = [];
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				transactionAttempts += 1;

				const txDb = {
					select: vi.fn(),
					update: vi.fn(),
					delete: vi.fn(),
					transaction: vi.fn(),
					insert: vi.fn().mockImplementation(() => ({
						values: vi.fn().mockImplementation((values: { slug?: string }) => {
							if ("slug" in values) {
								attemptedSlugs.push(values.slug ?? "");

								return {
									returning: vi.fn().mockImplementation(async () => {
										if (transactionAttempts === 1) {
											throw duplicateError;
										}

										return [
											{
												id: "center-2",
												name: "Pebble Center",
												slug: values.slug,
											},
										];
									}),
								};
							}

							return {
								returning: vi.fn().mockResolvedValue([membership]),
							};
						}),
					})),
				};

				return fn(txDb);
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(201);
		expect(transactionAttempts).toBe(2);
		expect(attemptedSlugs[0]).toBe("pebble-center");
		expect(attemptedSlugs[1]).toMatch(/^pebble-center-/);
	});

	it("retries center creation when drizzle wraps a slug collision in cause", async () => {
		const wrappedDuplicateError = Object.assign(new Error("Failed query"), {
			cause: Object.assign(new Error("duplicate key value violates unique constraint"), {
				code: "23505",
				constraint: "centers_slug_unique",
			}),
		});
		let transactionAttempts = 0;
		const attemptedSlugs: string[] = [];
		const membership = {
			id: "membership-2",
			centerId: "center-2",
			userId: "user-1",
			role: "owner",
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				transactionAttempts += 1;

				const txDb = {
					select: vi.fn(),
					update: vi.fn(),
					delete: vi.fn(),
					transaction: vi.fn(),
					insert: vi.fn().mockImplementation(() => ({
						values: vi.fn().mockImplementation((values: { slug?: string }) => {
							if ("slug" in values) {
								attemptedSlugs.push(values.slug ?? "");

								return {
									returning: vi.fn().mockImplementation(async () => {
										if (transactionAttempts === 1) {
											throw wrappedDuplicateError;
										}

										return [
											{
												id: "center-2",
												name: "Pebble Center",
												slug: values.slug,
											},
										];
									}),
								};
							}

							return {
								returning: vi.fn().mockResolvedValue([membership]),
							};
						}),
					})),
				};

				return fn(txDb);
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "Pebble Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);

		expect(res.status).toBe(201);
		expect(transactionAttempts).toBe(2);
		expect(attemptedSlugs[0]).toBe("pebble-center");
		expect(attemptedSlugs[1]).toMatch(/^pebble-center-/);
	});

	it("returns 401 when creating a center without an authenticated user", async () => {
		const app = createTestApp(mountCenters, createMockDb(), { userId: "" });
		const res = await app.request(
			"/api/centers",
			jsonBody({
				name: "No Auth Center",
				address: "1 Main St",
				city: "Austin",
				state: "TX",
				zip: "78701",
				phone: "555-0100",
				timezone: "America/Chicago",
			}),
		);
		expect(res.status).toBe(401);
	});

	it("returns a center when the current membership has access", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								name: "Pebble Center",
								timezone: "America/Chicago",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request("/api/centers/center-1");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { center: { id: string; name: string } };
		expect(body.center.name).toBe("Pebble Center");
	});

	it("returns 403 when requesting a different center", async () => {
		const app = createTestApp(mountCenters, createMockDb(), {
			centerId: "center-1",
		});
		const res = await app.request("/api/centers/center-2");

		expect(res.status).toBe(403);
	});

	it("returns 401 when getting a center without an authenticated user", async () => {
		const app = createTestApp(mountCenters, createMockDb(), { userId: "" });
		const res = await app.request("/api/centers/center-1");
		expect(res.status).toBe(401);
	});

	it("returns 404 when the center is missing", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request("/api/centers/center-1");

		expect(res.status).toBe(404);
	});

	it("updates a center for owner role", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([
							{
								id: "center-1",
								name: "Updated Center",
								timezone: "America/Chicago",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers/center-1",
			patchBody({
				name: "Updated Center",
			}),
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { center: { name: string } };
		expect(body.center.name).toBe("Updated Center");
	});

	it("updates all address and contact fields when provided", async () => {
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "center-1",
						name: "Pebble Center",
						address: "2 Oak Ave",
						city: "Houston",
						state: "TX",
						zip: "77001",
						phone: "555-9999",
						timezone: "America/Chicago",
					},
				]),
			}),
		});
		const db = createMockDb({ update: vi.fn().mockReturnValue({ set }) });

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers/center-1",
			patchBody({
				address: "2 Oak Ave",
				city: "Houston",
				state: "TX",
				zip: "77001",
				phone: "555-9999",
			}),
		);

		expect(res.status).toBe(200);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				address: "2 Oak Ave",
				city: "Houston",
				state: "TX",
				zip: "77001",
				phone: "555-9999",
			}),
		);
	});

	it("persists numeric licensed capacity when updating a center", async () => {
		const set = vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([
					{
						id: "center-1",
						name: "Updated Center",
						licensedCapacity: 96,
						timezone: "America/Chicago",
					},
				]),
			}),
		});
		const db = createMockDb({
			update: vi.fn().mockReturnValue({ set }),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers/center-1",
			patchBody({
				licensedCapacity: 96,
			}),
		);

		expect(res.status).toBe(200);
		expect(set).toHaveBeenCalledWith(
			expect.objectContaining({
				licensedCapacity: 96,
			}),
		);
	});

	it("returns 403 when updating a different center", async () => {
		const app = createTestApp(mountCenters, createMockDb(), {
			centerId: "center-1",
		});
		const res = await app.request("/api/centers/center-2", patchBody({ name: "Denied" }));

		expect(res.status).toBe(403);
	});

	it("returns 404 when updating a missing center", async () => {
		const db = createMockDb({
			update: vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request("/api/centers/center-1", patchBody({ name: "Missing" }));

		expect(res.status).toBe(404);
	});

	it("lists members through the documented center team route", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					leftJoin: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([
							{
								id: "membership-1",
								centerId: "center-1",
								userId: "user-1",
								role: "owner",
								joinedAt: new Date(),
								acceptedAt: new Date("2026-04-01T08:00:00.000Z"),
								invitedAt: null,
								userName: "Taylor Reed",
								userEmail: "taylor@example.com",
							},
						]),
					}),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request("/api/centers/center-1/members");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { members: Array<{ userEmail: string }> };
		expect(body.members).toHaveLength(1);
		expect(body.members[0].userEmail).toBe("taylor@example.com");
	});

	it("creates invites through the documented center team route", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ name: "Test Center" }]),
						}),
					}),
				}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "membership-2",
							centerId: "center-1",
							userId: null,
							inviteEmail: "staff@example.com",
							role: "staff",
						},
					]),
				}),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers/center-1/invites",
			jsonBody({ email: "staff@example.com", role: "staff" }),
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { membership: { role: string } };
		expect(body.membership.role).toBe("staff");
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("deletes members through the documented center team route", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([
							{
								id: "00000000-0000-0000-0000-000000000002",
								centerId: "center-1",
								role: "staff",
							},
						]),
					}),
				}),
			}),
			delete: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			}),
		});

		const app = createTestApp(mountCenters, db);
		const res = await app.request(
			"/api/centers/center-1/members/00000000-0000-0000-0000-000000000002",
			{ method: "DELETE" },
		);

		expect(res.status).toBe(200);
		const body = (await res.json()) as { success: boolean };
		expect(body.success).toBe(true);
	});

	it("rejects documented center team routes for a different center", async () => {
		const db = createMockDb();
		const app = createTestApp(mountCenters, db, { centerId: "center-1" });
		const res = await app.request("/api/centers/center-2/members");

		expect(res.status).toBe(403);
		expect(db.select).not.toHaveBeenCalled();
	});
});
