import type { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

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

// Mock ratio service
vi.mock("../services/ratio.js", () => ({
	evaluateRoomRatio: vi.fn().mockResolvedValue({
		childrenCount: 1,
		staffCount: 1,
		ratioRequired: 0.25,
		ratioActual: 1,
		inCompliance: true,
	}),
}));

// Import after mocking
const { checkInsRoutes } = await import("./check-ins.js");

interface CheckInData {
	id: string;
	centerId: string;
	childId: string;
	classroomId: string;
	checkedInAt: string;
	checkedOutAt: string | null;
	checkedInBy: string;
	checkedOutBy: string | null;
	notes: string | null;
	isLate?: boolean;
	checkInSignature?: string | null;
	checkOutSignature?: string | null;
}

function mountCheckIns(app: Hono<AppEnv>) {
	app.route("/api/check-ins", checkInsRoutes);
}

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

function sqlConditionColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) {
		return [];
	}

	const names: string[] = [];
	for (const chunk of value.queryChunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if ("name" in chunk && typeof chunk.name === "string") {
			names.push(chunk.name);
		}
		names.push(...sqlConditionColumnNames(chunk, seen));
	}

	return names;
}

function createSelectWithTimezone(records: CheckInData[], timezone = "America/Chicago") {
	return vi
		.fn()
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ timezone }]),
				}),
			}),
		})
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue(records),
					}),
				}),
			}),
		});
}

function createSelectWithTimezoneAndLimit(
	records: CheckInData[],
	timezone = "America/Chicago",
): { selectFn: ReturnType<typeof vi.fn>; limitFn: ReturnType<typeof vi.fn> } {
	const limitFn = vi.fn().mockResolvedValue(records);
	const selectFn = vi
		.fn()
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ timezone }]),
				}),
			}),
		})
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: limitFn,
					}),
				}),
			}),
		});
	return { selectFn, limitFn };
}

const mockCheckIn: CheckInData = {
	id: "c1ec1234-0000-0000-0000-000000000001",
	centerId: "center-1",
	childId: "00000000-0000-0000-0000-000000000001",
	classroomId: "00000000-0000-0000-0000-000000000010",
	checkedInAt: new Date().toISOString(),
	checkedOutAt: null,
	checkedInBy: "membership-1",
	checkedOutBy: null,
	notes: null,
	isLate: false,
	checkInSignature: null,
	checkOutSignature: null,
};

describe("check-in routes", () => {
	describe("POST /api/check-ins", () => {
		it("creates a check-in (201)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount === 2
										? [{ id: "record-1", enrollmentStatus: "active" }]
										: selectCallCount <= 4
											? [{ id: `record-${selectCallCount}` }]
											: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { checkIn: CheckInData };
			expect(body.checkIn.childId).toBe("00000000-0000-0000-0000-000000000001");
			expect(body.checkIn.checkedOutAt).toBeNull();
		});

		it("persists isLate=true and checkInSignature when provided (201)", async () => {
			const lateCheckIn: CheckInData = {
				...mockCheckIn,
				isLate: true,
				checkInSignature: "data:image/png;base64,abc123",
			};
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount === 2
										? [{ id: "record-1", enrollmentStatus: "active" }]
										: selectCallCount <= 4
											? [{ id: `record-${selectCallCount}` }]
											: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([lateCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
					isLate: true,
					signatureData: "data:image/png;base64,abc123",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { checkIn: CheckInData };
			expect(body.checkIn.isLate).toBe(true);
			expect(body.checkIn.checkInSignature).toBe("data:image/png;base64,abc123");
		});

		it("rejects a check-in signature exceeding 200KB (413)", async () => {
			const oversizedSignature = `data:image/png;base64,${"A".repeat(200 * 1024 + 1)}`;
			const db = createMockDb();

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
					signatureData: oversizedSignature,
				}),
			);

			expect(res.status).toBe(413);
		});

		it("rejects duplicate check-in (400)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount <= 4
										? [
												selectCallCount === 2
													? { id: "record-1", enrollmentStatus: "active" }
													: { id: `record-${selectCallCount}` },
											]
										: [{ id: "checkin-existing" }];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(400);
		});

		it("rejects a child from another center (404)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
						insert: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000099",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("rejects checking in a non-active child even with a stale active assignment", async () => {
			const insert = vi.fn();
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const rowsByCall: Record<number, unknown[]> = {
								1: [{ timezone: "UTC" }],
								2: [{ id: "child-1", enrollmentStatus: "waitlist" }],
								3: [{ id: "classroom-1" }],
								4: [{ id: "assignment-1" }],
							};
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(rowsByCall[selectCallCount] ?? []),
									}),
								}),
							};
						}),
						insert,
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Only active children can be checked in",
			});
			expect(insert).not.toHaveBeenCalled();
		});

		it("rejects checking a child into an archived classroom", async () => {
			const insert = vi.fn();
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const rowsByCall: Record<number, unknown[]> = {
								1: [{ timezone: "UTC" }],
								2: [{ id: "child-1", enrollmentStatus: "active" }],
								3: [{ id: "classroom-1", archivedAt: new Date().toISOString() }],
								4: [{ id: "assignment-1" }],
							};
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(rowsByCall[selectCallCount] ?? []),
									}),
								}),
							};
						}),
						insert,
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Cannot check children into an archived classroom",
			});
			expect(insert).not.toHaveBeenCalled();
		});

		it("rejects a classroom from another center (404)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount === 2
										? [{ id: "child-1", enrollmentStatus: "active" }]
										: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000099",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("rejects checking a child into a classroom they are not actively assigned to (404)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount <= 3
										? [
												selectCallCount === 2
													? { id: "record-1", enrollmentStatus: "active" }
													: { id: `record-${selectCallCount}` },
											]
										: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000011",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("requires child classroom assignments to be effective before check-in", async () => {
			let assignmentCondition: unknown;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockImplementation((condition) => {
										if (selectCallCount === 4) {
											assignmentCondition = condition;
										}
										return {
											limit: vi
												.fn()
												.mockResolvedValue(
													selectCallCount === 1
														? [{ timezone: "UTC" }]
														: selectCallCount === 2
															? [{ id: "record-1", enrollmentStatus: "active" }]
															: selectCallCount <= 4
																? [{ id: `record-${selectCallCount}` }]
																: [],
												),
										};
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(201);
			expect(sqlConditionColumnNames(assignmentCondition)).toContain("effective_date");
		});

		it("treats future-ended child classroom assignments as active before check-in", async () => {
			let assignmentCondition: unknown;
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockImplementation((condition) => {
										if (selectCallCount === 4) {
											assignmentCondition = condition;
										}
										return {
											limit: vi
												.fn()
												.mockResolvedValue(
													selectCallCount === 1
														? [{ timezone: "UTC" }]
														: selectCallCount === 2
															? [{ id: "record-1", enrollmentStatus: "active" }]
															: selectCallCount <= 4
																? [{ id: `record-${selectCallCount}` }]
																: [],
												),
										};
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(201);
			const endDateReferences = sqlConditionColumnNames(assignmentCondition).filter(
				(name) => name === "end_date",
			);
			expect(endDateReferences).toHaveLength(2);
		});

		it("rejects staff check-in for an unassigned classroom (403)", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							// calls 1-6 use limit; call 7 (staff assignments) resolves directly
							if (selectCallCount <= 6) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue(
												selectCallCount === 1
													? [{ timezone: "UTC" }] // ensureCenterOwned timezone
													: selectCallCount === 2
														? [{ id: "record-1", enrollmentStatus: "active" }] // child
														: selectCallCount <= 4
															? [{ id: "record-1" }] // classroom, assignment
															: selectCallCount === 5
																? [] // no duplicate check-in
																: [{ timezone: "UTC" }], // getAssignedStaff timezone
											),
										}),
									}),
								};
							}
							// call 7: staff assignments (no limit, resolves directly from where)
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue([]),
								}),
							};
						}),
						insert: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff" });
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(403);
		});

		it("allows staff check-in for an assigned classroom", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							// calls 1-6 use limit; call 7 (staff assignments) resolves directly
							if (selectCallCount <= 6) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue(
												selectCallCount === 1
													? [{ timezone: "UTC" }] // ensureCenterOwned timezone
													: selectCallCount === 2
														? [{ id: "record-1", enrollmentStatus: "active" }] // child
														: selectCallCount <= 4
															? [{ id: "record-1" }] // classroom, assignment
															: selectCallCount === 5
																? [] // no duplicate check-in
																: [{ timezone: "UTC" }], // getAssignedStaff timezone
											),
										}),
									}),
								};
							}
							// call 7: staff assignments with the classroom → access granted
							return {
								from: vi.fn().mockReturnValue({
									where: vi
										.fn()
										.mockResolvedValue([{ classroomId: "00000000-0000-0000-0000-000000000010" }]),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff" });
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(201);
		});

		it("returns 500 if a valid check-in insert returns no row", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount === 2
										? [{ id: "record-1", enrollmentStatus: "active" }]
										: selectCallCount <= 4
											? [{ id: `record-${selectCallCount}` }]
											: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(500);
		});

		it("returns 500 when auth context is missing membership for check-in", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							const result =
								selectCallCount === 1
									? [{ timezone: "UTC" }]
									: selectCallCount === 2
										? [{ id: "record-1", enrollmentStatus: "active" }]
										: selectCallCount <= 4
											? [{ id: `record-${selectCallCount}` }]
											: [];
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(result),
									}),
								}),
							};
						}),
						insert: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db, { membershipId: "" });
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			expect(res.status).toBe(500);
		});
	});

	describe("PATCH /api/check-ins/:id/check-out", () => {
		it("checks out a child (200)", async () => {
			const checkedOut = {
				...mockCheckIn,
				checkedOutAt: new Date().toISOString(),
				checkedOutBy: "membership-1",
			};
			const updateWhere = vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([checkedOut]),
			});

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockCheckIn]),
								}),
							}),
						}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: updateWhere,
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/c1ec1234-0000-0000-0000-000000000001/check-out",
				patchBody({}),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIn: CheckInData };
			expect(body.checkIn.checkedOutAt).toBeTruthy();
			expect(body.checkIn.checkedOutBy).toBe("membership-1");
			expect(collectStringValues(updateWhere.mock.calls[0]?.[0])).toContain("center-1");
		});

		it("persists checkOutSignature when provided (200)", async () => {
			const checkedOut = {
				...mockCheckIn,
				checkedOutAt: new Date().toISOString(),
				checkedOutBy: "membership-1",
				checkOutSignature: "data:image/png;base64,sig456",
			};

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockCheckIn]),
								}),
							}),
						}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([checkedOut]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/c1ec1234-0000-0000-0000-000000000001/check-out",
				patchBody({ signatureData: "data:image/png;base64,sig456" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIn: CheckInData };
			expect(body.checkIn.checkOutSignature).toBe("data:image/png;base64,sig456");
		});

		it("rejects a check-out signature exceeding 200KB (413)", async () => {
			const oversizedSignature = `data:image/png;base64,${"B".repeat(200 * 1024 + 1)}`;
			const db = createMockDb();

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/c1ec1234-0000-0000-0000-000000000001/check-out",
				patchBody({ signatureData: oversizedSignature }),
			);

			expect(res.status).toBe(413);
		});

		it("rejects invalid check-in ids", async () => {
			const db = createMockDb();
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins/not-a-uuid/check-out", patchBody({}));

			expect(res.status).toBe(400);
		});

		it("returns 404 if check-in not found", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/00000000-0000-0000-0000-000000000000/check-out",
				patchBody({}),
			);

			expect(res.status).toBe(404);
		});

		it("returns 500 when auth context is missing membership for checkout", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockCheckIn]),
								}),
							}),
						}),
						update: vi.fn(),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db, { membershipId: "" });
			const res = await app.request(
				"/api/check-ins/c1ec1234-0000-0000-0000-000000000001/check-out",
				patchBody({}),
			);

			expect(res.status).toBe(500);
		});

		it("returns 404 if the check-in is checked out by a concurrent request", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockCheckIn]),
								}),
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
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/c1ec1234-0000-0000-0000-000000000001/check-out",
				patchBody({}),
			);

			expect(res.status).toBe(404);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/already checked out/i);
		});
	});

	describe("GET /api/check-ins", () => {
		it("returns today's attendance log", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns).toHaveLength(1);
			expect(body.checkIns[0].id).toBe("c1ec1234-0000-0000-0000-000000000001");
		});

		it("returns filtered by classroomId", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins?classroomId=00000000-0000-0000-0000-000000000010",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns).toHaveLength(1);
		});

		it("returns filtered by childId", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins?childId=00000000-0000-0000-0000-000000000001");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns[0]?.childId).toBe("00000000-0000-0000-0000-000000000001");
		});

		it("returns 500 if the center timezone date cannot be formatted", async () => {
			const stableIntl = globalThis.Intl;
			vi.stubGlobal(
				"Intl",
				Object.assign({}, stableIntl, {
					DateTimeFormat: class {
						formatToParts() {
							return [];
						}
					},
				}),
			);
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			try {
				const app = createTestApp(mountCheckIns, db);
				const res = await app.request("/api/check-ins");

				expect(res.status).toBe(500);
			} finally {
				vi.stubGlobal("Intl", stableIntl);
			}
		});

		it("staff see their own check-ins only", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff" });
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(200);
		});

		it("returns 500 when staff attendance auth context is missing membership", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff", membershipId: "" });
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(500);
		});

		it("bounds the attendance query with orderBy+limit(2001) as an overflow guard", async () => {
			const { selectFn, limitFn } = createSelectWithTimezoneAndLimit([mockCheckIn]);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(200);
			expect(limitFn).toHaveBeenCalledWith(2001);
		});

		it("returns 400 when attendance result set overflows ATTENDANCE_LIST_LIMIT", async () => {
			const overflowRecords = Array.from({ length: 2001 }, (_, i) => ({
				...mockCheckIn,
				id: `c1ec1234-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const { selectFn } = createSelectWithTimezoneAndLimit(overflowRecords);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/too many check-in records for this day/i);
		});

		it("returns all rows when attendance result set is at or below ATTENDANCE_LIST_LIMIT", async () => {
			const records = Array.from({ length: 5 }, (_, i) => ({
				...mockCheckIn,
				id: `c1ec1234-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const { selectFn } = createSelectWithTimezoneAndLimit(records);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns).toHaveLength(5);
		});
	});

	describe("GET /api/check-ins/history", () => {
		it("returns historical records for a child", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns).toHaveLength(1);
		});

		it("rejects request without required childId", async () => {
			const db = createMockDb();
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request("/api/check-ins/history?from=2026-01-01&to=2026-12-31");

			expect(res.status).toBe(400);
		});

		it("staff see only their own historical records", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff" });
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
		});

		it("returns 500 when staff history auth context is missing membership", async () => {
			const db = createMockDb({
				select: createSelectWithTimezone([mockCheckIn]),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff", membershipId: "" });
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(500);
		});

		it("bounds the history query with orderBy+limit(5001) as an overflow guard", async () => {
			const { selectFn, limitFn } = createSelectWithTimezoneAndLimit([mockCheckIn]);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
			expect(limitFn).toHaveBeenCalledWith(5001);
		});

		it("returns 400 when history result set overflows CHECK_IN_HISTORY_LIMIT", async () => {
			const overflowRecords = Array.from({ length: 5001 }, (_, i) => ({
				...mockCheckIn,
				id: `c1ec1234-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const { selectFn } = createSelectWithTimezoneAndLimit(overflowRecords);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toMatch(/narrow the date range/i);
		});

		it("returns all rows when history result set is at or below CHECK_IN_HISTORY_LIMIT", async () => {
			const records = Array.from({ length: 3 }, (_, i) => ({
				...mockCheckIn,
				id: `c1ec1234-0000-0000-0000-${String(i).padStart(12, "0")}`,
			}));
			const { selectFn } = createSelectWithTimezoneAndLimit(records);
			const db = createMockDb({ select: selectFn });
			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { checkIns: CheckInData[] };
			expect(body.checkIns).toHaveLength(3);
		});
	});

	describe("timezone-aware assignment validity (POST /api/check-ins)", () => {
		afterEach(() => {
			vi.useRealTimers();
		});

		it("treats a classroom assignment ending tomorrow (local) as still active when UTC is already on the next day", async () => {
			// At 03:00 UTC on 2026-06-10, America/Chicago (UTC-5 in June) is still
			// 2026-06-09 22:00. An assignment with endDate "2026-06-10" should be
			// valid (gt endDate > today_local "2026-06-09").
			// Bug: UTC "today" would be "2026-06-10" which equals endDate, so
			// gt("2026-06-10", "2026-06-10") is false → 404.
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							// call 1: center timezone lookup
							if (selectCallCount === 1) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
										}),
									}),
								};
							}
							// call 2: child lookup → active
							if (selectCallCount === 2) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi
												.fn()
												.mockResolvedValue([{ id: "child-1", enrollmentStatus: "active" }]),
										}),
									}),
								};
							}
							// call 3: classroom lookup → not archived
							if (selectCallCount === 3) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
										}),
									}),
								};
							}
							// call 4: assignment lookup — should succeed because local date is "2026-06-09"
							// and endDate "2026-06-10" > "2026-06-09". Return the assignment row.
							if (selectCallCount === 4) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ id: "assignment-1" }]),
										}),
									}),
								};
							}
							// call 5: duplicate check-in → none
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([]),
									}),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db);
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			// Should succeed (201) — assignment is still active in center-local time
			expect(res.status).toBe(201);
		});

		it("uses center-local date for staff assignment check in getAssignedStaffClassroomIds", async () => {
			// Same scenario: 03:00 UTC = still 2026-06-09 in America/Chicago.
			// Staff is assigned with endDate "2026-06-10"; should be seen as active.
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCallCount = 0;
					const txDb = {
						select: vi.fn().mockImplementation(() => {
							selectCallCount += 1;
							// call 1: center timezone for ensureCenterOwnedCheckInRelations
							if (selectCallCount === 1) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
										}),
									}),
								};
							}
							// call 2: child
							if (selectCallCount === 2) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi
												.fn()
												.mockResolvedValue([{ id: "child-1", enrollmentStatus: "active" }]),
										}),
									}),
								};
							}
							// call 3: classroom
							if (selectCallCount === 3) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
										}),
									}),
								};
							}
							// call 4: child assignment
							if (selectCallCount === 4) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ id: "assignment-1" }]),
										}),
									}),
								};
							}
							// call 5: duplicate check-in
							if (selectCallCount === 5) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([]),
										}),
									}),
								};
							}
							// call 6: center timezone for getAssignedStaffClassroomIds
							if (selectCallCount === 6) {
								return {
									from: vi.fn().mockReturnValue({
										where: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
										}),
									}),
								};
							}
							// call 7: staff assignment lookup — return the classroom so staff access is granted
							return {
								from: vi.fn().mockReturnValue({
									where: vi
										.fn()
										.mockResolvedValue([{ classroomId: "00000000-0000-0000-0000-000000000010" }]),
								}),
							};
						}),
						insert: vi.fn().mockReturnValue({
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([mockCheckIn]),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff" });
			const res = await app.request(
				"/api/check-ins",
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					classroomId: "00000000-0000-0000-0000-000000000010",
				}),
			);

			// Staff assignment still active locally → should succeed (201)
			expect(res.status).toBe(201);
		});

		it("uses center-local date for staff-scoped /history assignment check when UTC is already next day", async () => {
			// At 03:00 UTC on 2026-06-10, America/Chicago is still 2026-06-09.
			// An assignment with endDate "2026-06-10" should be treated as active (endDate
			// > today_local "2026-06-09"). The old bug used UTC today "2026-06-10" which
			// equals endDate and therefore excluded the assignment, returning no records.
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const where = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([mockCheckIn]),
				}),
			});

			const db = createMockDb({
				select: vi
					.fn()
					// call 1: getCenterTimezone
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
							}),
						}),
					})
					// call 2: the history records query
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({ where }),
					}),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff", membershipId: "membership-1" });
			const res = await app.request(
				"/api/check-ins/history?childId=00000000-0000-0000-0000-000000000001&from=2026-01-01&to=2026-12-31",
			);

			expect(res.status).toBe(200);

			// The SQL condition for staff scoping must use the local date "2026-06-09",
			// not the UTC date "2026-06-10".
			const serialized = collectStringValues(where.mock.calls[0][0]).join(" ");
			expect(serialized).toContain("2026-06-09");
			expect(serialized).not.toContain("2026-06-10");
		});

		it("uses center-local date for staff-scoped GET / attendance when UTC is already next day", async () => {
			// Same scenario: UTC 2026-06-10T03:00Z → Chicago still 2026-06-09.
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-10T03:00:00Z"));

			const where = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([mockCheckIn]),
				}),
			});

			const db = createMockDb({
				select: vi
					.fn()
					// call 1: getCenterTimezone
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
							}),
						}),
					})
					// call 2: attendance records query
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({ where }),
					}),
			});

			const app = createTestApp(mountCheckIns, db, { role: "staff", membershipId: "membership-1" });
			const res = await app.request("/api/check-ins");

			expect(res.status).toBe(200);

			// The SQL condition for staff scoping must reference "2026-06-09", not "2026-06-10".
			const serialized = collectStringValues(where.mock.calls[0][0]).join(" ");
			expect(serialized).toContain("2026-06-09");
			expect(serialized).not.toContain("2026-06-10");
		});
	});
});
