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

// Import after mocking
const { guardiansRoutes } = await import("./guardians.js");
const { createRateLimit } = await import("../middleware/rate-limit.js");

// Mirror the app-level, method-gated rate limit from src/index.ts so tests
// exercise the same pre-auth guardrail that runs in production.
function attachGuardianCreateRateLimit(app: Hono<AppEnv>) {
	const rl = createRateLimit({
		windowMs: 60_000,
		max: 10,
		message: "Too many guardian creates, please try again shortly.",
	});
	app.use("/api/guardians", async (c, next) => {
		if (c.req.method === "POST") return rl(c, next);
		return next();
	});
}

interface GuardianData {
	id: string;
	centerId: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	createdAt: string;
	updatedAt: string;
}

interface LinkedChild {
	id: string;
	firstName: string;
	lastName: string;
	enrollmentStatus: string;
	classroomName: string | null;
	isPrimary: boolean;
	authorizedPickup: boolean;
	relationship: string | null;
}

interface GuardianDirectoryChildSummary {
	id: string;
	firstName: string;
	lastName: string;
	authorizedPickup: boolean;
}

interface GuardianDirectoryEntry extends GuardianData {
	children: GuardianDirectoryChildSummary[];
}

function mountGuardians(app: Hono<AppEnv>) {
	app.route("/api/guardians", guardiansRoutes);
}

function objectGraphIncludesString(value: unknown, expected: string, seen = new WeakSet<object>()) {
	if (typeof value === "string") return value === expected;
	if (!value || typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);

	for (const key of Reflect.ownKeys(value)) {
		const record = value as Record<PropertyKey, unknown>;
		if (typeof key === "string" && key === expected) return true;
		if (objectGraphIncludesString(record[key], expected, seen)) return true;
	}

	return false;
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

function createGuardianListSelectMock(mockGuardians: unknown[], mockChildLinks: unknown[] = []) {
	let selectCallCount = 0;
	return vi.fn().mockImplementation(() => {
		selectCallCount += 1;
		if (selectCallCount === 1) {
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue(mockGuardians),
						}),
					}),
				}),
			};
		}

		return {
			from: vi.fn().mockReturnValue({
				leftJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(mockChildLinks),
				}),
			}),
		};
	});
}

describe("guardians routes", () => {
	const GUARDIAN_ID = "550e8400-e29b-41d4-a716-446655440000";

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("GET /api/guardians", () => {
		it("returns guardians list for owner", async () => {
			const mockGuardians = [
				{
					id: "guardian-1",
					centerId: "center-1",
					firstName: "John",
					lastName: "Doe",
					email: "john@example.com",
					phone: "555-1234",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMockDb({
				select: createGuardianListSelectMock(mockGuardians),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request("/api/guardians");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardians: GuardianData[] };
			expect(body.guardians).toHaveLength(1);
			expect(body.guardians[0].firstName).toBe("John");
		});

		it("returns guardians list for director", async () => {
			const mockGuardians = [
				{
					id: "guardian-1",
					centerId: "center-1",
					firstName: "Jane",
					lastName: "Smith",
					email: "jane@example.com",
					phone: "555-5678",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMockDb({
				select: createGuardianListSelectMock(mockGuardians),
			});

			const app = createTestApp(mountGuardians, db, { role: "director" });
			const res = await app.request("/api/guardians");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardians: GuardianData[] };
			expect(body.guardians).toHaveLength(1);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request("/api/guardians");

			expect(res.status).toBe(403);
		});

		it("supports search query parameter", async () => {
			const mockGuardians = [
				{
					id: "guardian-1",
					centerId: "center-1",
					firstName: "John",
					lastName: "Doe",
					email: "john@example.com",
					phone: "555-1234",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			const db = createMockDb({
				select: createGuardianListSelectMock(mockGuardians),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request("/api/guardians?search=John");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardians: GuardianData[] };
			expect(body.guardians).toHaveLength(1);
		});

		it("returns guardians with linked child summaries for directory display", async () => {
			const mockGuardians = [
				{
					id: "guardian-1",
					centerId: "center-1",
					firstName: "Jane",
					lastName: "Smith",
					email: "jane@example.com",
					phone: "555-5678",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: "guardian-2",
					centerId: "center-1",
					firstName: "Miguel",
					lastName: "Rivera",
					email: null,
					phone: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];
			const mockChildLinks = [
				{
					guardianId: "guardian-1",
					id: "child-1",
					firstName: "Ava",
					lastName: "Smith",
					authorizedPickup: true,
				},
				{
					guardianId: "guardian-1",
					id: "child-2",
					firstName: "Noah",
					lastName: "Smith",
					authorizedPickup: false,
				},
			];

			const childSummaryLeftJoin = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(mockChildLinks),
			});
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockReturnValue({
										offset: vi.fn().mockResolvedValue(mockGuardians),
									}),
								}),
							}),
						};
					}

					return {
						from: vi.fn().mockReturnValue({
							leftJoin: childSummaryLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request("/api/guardians");

			expect(res.status).toBe(200);
			expect(selectCallCount).toBe(2);
			expect(childSummaryLeftJoin).toHaveBeenCalledTimes(1);
			const childSummaryJoinCondition = childSummaryLeftJoin.mock.calls[0]?.[1];
			expect(objectGraphIncludesString(childSummaryJoinCondition, "child_id")).toBe(true);
			expect(objectGraphIncludesString(childSummaryJoinCondition, "center_id")).toBe(true);
			const childSummaryWhere = childSummaryLeftJoin.mock.results[0]?.value.where as
				| ReturnType<typeof vi.fn>
				| undefined;
			expect(childSummaryWhere).toHaveBeenCalledTimes(1);
			const childSummaryWhereCondition = childSummaryWhere?.mock.calls[0]?.[0];
			expect(objectGraphIncludesString(childSummaryWhereCondition, "center_id")).toBe(true);
			expect(objectGraphIncludesString(childSummaryWhereCondition, "guardian_id")).toBe(true);
			const body = (await res.json()) as { guardians: GuardianDirectoryEntry[] };
			expect(body.guardians).toEqual([
				{
					...mockGuardians[0],
					createdAt: mockGuardians[0].createdAt.toISOString(),
					updatedAt: mockGuardians[0].updatedAt.toISOString(),
					children: [
						{
							id: "child-1",
							firstName: "Ava",
							lastName: "Smith",
							authorizedPickup: true,
						},
						{
							id: "child-2",
							firstName: "Noah",
							lastName: "Smith",
							authorizedPickup: false,
						},
					],
				},
				{
					...mockGuardians[1],
					createdAt: mockGuardians[1].createdAt.toISOString(),
					updatedAt: mockGuardians[1].updatedAt.toISOString(),
					children: [],
				},
			]);
		});
	});

	describe("GET /api/guardians/:id", () => {
		it("returns guardian with linked children", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockLinkedChildren = [
				{
					id: "child-1",
					firstName: "Alice",
					lastName: "Doe",
					enrollmentStatus: "active",
					classroomName: "Sunshine Room",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				},
			];

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					const whereResult = vi.fn().mockResolvedValue(mockLinkedChildren);
					const thirdLeftJoin = vi.fn().mockReturnValue({ where: whereResult });
					const secondLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: thirdLeftJoin, where: whereResult });
					const firstLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: secondLeftJoin, where: whereResult });
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardian: GuardianData; children: LinkedChild[] };
			expect(body.guardian.firstName).toBe("John");
			expect(body.children).toHaveLength(1);
			expect(body.children[0].firstName).toBe("Alice");
		});

		it("center-scopes the linked child join", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			let childJoinCondition: unknown;
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}

					const whereResult = vi.fn().mockResolvedValue([]);
					const thirdLeftJoin = vi.fn().mockReturnValue({ where: whereResult });
					const secondLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: thirdLeftJoin, where: whereResult });
					const firstLeftJoin = vi.fn().mockImplementation((_table, condition) => {
						childJoinCondition = condition;
						return { leftJoin: secondLeftJoin, where: whereResult };
					});
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(childJoinCondition)).toContain("center_id");
		});

		it("center-scopes the linked classroom join", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			let classroomAssignmentJoinCondition: unknown;
			let classroomJoinCondition: unknown;
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}

					const whereResult = vi.fn().mockResolvedValue([]);
					const thirdLeftJoin = vi.fn().mockImplementation((_table, condition) => {
						classroomJoinCondition = condition;
						return { where: whereResult };
					});
					const secondLeftJoin = vi.fn().mockImplementation((_table, condition) => {
						classroomAssignmentJoinCondition = condition;
						return { leftJoin: thirdLeftJoin, where: whereResult };
					});
					const firstLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: secondLeftJoin, where: whereResult });
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(classroomAssignmentJoinCondition)).toContain("effective_date");
			expect(sqlConditionColumnNames(classroomJoinCondition)).toContain("center_id");
		});

		it("returns 400 for malformed guardian identifiers", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db);
			const res = await app.request("/api/guardians/not-a-uuid");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("returns 404 for non-existent guardian", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(404);
		});

		it("denies staff access when the guardian is not linked to their classroom", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(404);
		});

		it("allows staff access when the guardian is linked to one of their classrooms", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockLinkedChildren = [
				{
					id: "child-1",
					firstName: "Alice",
					lastName: "Doe",
					enrollmentStatus: "active",
					classroomName: "Sunshine Room",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				},
			];

			const accessConditions: unknown[] = [];
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// center timezone lookup (GET /:id handler)
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffAssignments (assertStaffGuardianAccess)
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockImplementation((condition) => {
									accessConditions.push(condition);
									return Promise.resolve([{ childId: "child-1", classroomId: "classroom-1" }]);
								}),
							}),
						};
					}
					if (selectCallCount === 4) {
						// childGuardians (assertStaffGuardianAccess)
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ childId: "child-1" }]),
							}),
						};
					}
					if (selectCallCount === 5) {
						// classroomAssignments (assertStaffGuardianAccess)
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockImplementation((condition) => {
									accessConditions.push(condition);
									return Promise.resolve([{ childId: "child-1", classroomId: "classroom-1" }]);
								}),
							}),
						};
					}
					const whereResult = vi.fn().mockResolvedValue(mockLinkedChildren);
					const thirdLeftJoin = vi.fn().mockReturnValue({ where: whereResult });
					const secondLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: thirdLeftJoin, where: whereResult });
					const firstLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: secondLeftJoin, where: whereResult });
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			await res.arrayBuffer();
			expect(sqlConditionColumnNames(accessConditions[0])).toContain("effective_date");
			expect(sqlConditionColumnNames(accessConditions[1])).toContain("effective_date");
		});

		it("filters out guardian children that are outside the staff member's classrooms", async () => {
			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockLinkedChildren = [
				{
					id: "child-1",
					firstName: "Alice",
					lastName: "Doe",
					enrollmentStatus: "active",
					classroomName: "Sunshine Room",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				},
				{
					id: "child-2",
					firstName: "Ben",
					lastName: "Doe",
					enrollmentStatus: "active",
					classroomName: "Moon Room",
					isPrimary: false,
					authorizedPickup: false,
					relationship: "mother",
				},
			];

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffAssignments
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (selectCallCount === 4) {
						// childGuardians
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ childId: "child-1" }, { childId: "child-2" }]),
							}),
						};
					}
					if (selectCallCount === 5) {
						// classroomAssignments
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					const whereResult = vi
						.fn()
						.mockResolvedValue(mockLinkedChildren.filter((child) => child.id === "child-1"));
					const thirdLeftJoin = vi.fn().mockReturnValue({ where: whereResult });
					const secondLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: thirdLeftJoin, where: whereResult });
					const firstLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: secondLeftJoin, where: whereResult });
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: LinkedChild[] };
			expect(body.children).toHaveLength(1);
			expect(body.children[0].id).toBe("child-1");
		});
	});

	describe("POST /api/guardians", () => {
		it("creates a guardian (201)", async () => {
			const newGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const db = createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newGuardian]),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				"/api/guardians",
				jsonBody({
					firstName: "John",
					lastName: "Doe",
					email: "john@example.com",
					phone: "555-1234",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { guardian: GuardianData };
			expect(body.guardian.firstName).toBe("John");
			expect(body.guardian.lastName).toBe("Doe");
		});

		it("creates a guardian without optional fields", async () => {
			const newGuardian = {
				id: "guardian-2",
				centerId: "center-1",
				firstName: "Jane",
				lastName: "Smith",
				email: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const db = createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newGuardian]),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				"/api/guardians",
				jsonBody({
					firstName: "Jane",
					lastName: "Smith",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { guardian: GuardianData };
			expect(body.guardian.firstName).toBe("Jane");
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request(
				"/api/guardians",
				jsonBody({
					firstName: "John",
					lastName: "Doe",
				}),
			);

			expect(res.status).toBe(403);
		});

		it("rejects invalid input (400)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				"/api/guardians",
				jsonBody({
					firstName: "",
					lastName: "Doe",
				}),
			);

			expect(res.status).toBe(400);
		});

		it("returns 409 when creating a guardian with an existing case-variant email", async () => {
			const insert = vi.fn();
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "existing-guardian" }]),
						}),
					}),
				}),
				insert,
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				"/api/guardians",
				jsonBody({
					firstName: "Jane",
					lastName: "Smith",
					email: "Jane@Example.COM",
				}),
			);

			expect(res.status).toBe(409);
			expect(insert).not.toHaveBeenCalled();
		});
	});

	describe("PATCH /api/guardians/:id", () => {
		it("updates a guardian", async () => {
			const updated = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "Jonathan",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([updated]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				`/api/guardians/${GUARDIAN_ID}`,
				patchBody({ firstName: "Jonathan" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardian: GuardianData };
			expect(body.guardian.firstName).toBe("Jonathan");
		});

		it("returns 404 for non-existent guardian", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				`/api/guardians/${GUARDIAN_ID}`,
				patchBody({ firstName: "Jonathan" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 409 when updating to an existing case-variant guardian email", async () => {
			const update = vi.fn();
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "other-guardian" }]),
						}),
					}),
				}),
				update,
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				`/api/guardians/${GUARDIAN_ID}`,
				patchBody({ email: "Jane@Example.COM" }),
			);

			expect(res.status).toBe(409);
			expect(update).not.toHaveBeenCalled();
		});

		it("clears email to null and skips the duplicate-email lookup", async () => {
			const set = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: "guardian-1",
							centerId: "center-1",
							firstName: "John",
							lastName: "Doe",
							email: null,
							phone: "555-1234",
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					]),
				}),
			});
			// A null email must never reach the duplicate-email SELECT (it would crash on
			// .toLowerCase()) and must be written to the column, not silently omitted.
			const select = vi.fn();
			const db = createMockDb({
				select,
				update: vi.fn().mockReturnValue({ set }),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, patchBody({ email: null }));

			expect(res.status).toBe(200);
			expect(select).not.toHaveBeenCalled();
			expect(set).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request(
				`/api/guardians/${GUARDIAN_ID}`,
				patchBody({ firstName: "Jonathan" }),
			);

			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/guardians/:id/children", () => {
		it("returns children linked to guardian", async () => {
			const linkedChildren = [
				{
					childId: "child-1",
					firstName: "Alice",
					lastName: "Doe",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				},
			];

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(linkedChildren),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: LinkedChild[] };
			expect(body.children).toHaveLength(1);
			expect(body.children[0].firstName).toBe("Alice");
		});

		it("center-scopes the children join", async () => {
			let childJoinCondition: unknown;
			const db = createMockDb({
				select: vi
					.fn()
					.mockImplementationOnce(() => ({
						// center timezone lookup
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
							}),
						}),
					}))
					.mockImplementationOnce(() => ({
						// guardian lookup
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
							}),
						}),
					}))
					.mockImplementationOnce(() => {
						const whereResult = vi.fn().mockResolvedValue([]);
						const firstLeftJoin = vi.fn().mockImplementation((_table, condition) => {
							childJoinCondition = condition;
							return { where: whereResult };
						});
						return {
							from: vi.fn().mockReturnValue({
								leftJoin: firstLeftJoin,
							}),
						};
					}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(childJoinCondition)).toContain("center_id");
		});

		it("returns 404 for non-existent guardian", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);

			expect(res.status).toBe(404);
		});

		it("denies staff access when none of the guardian's children are in their classroom", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);

			expect(res.status).toBe(404);
		});

		it("updates a guardian with all optional fields", async () => {
			const updated = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "Jane",
				lastName: "Smith",
				email: "jane@example.com",
				phone: "555-9999",
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([updated]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountGuardians, db);
			const res = await app.request(
				`/api/guardians/${GUARDIAN_ID}`,
				patchBody({
					firstName: "Jane",
					lastName: "Smith",
					email: "jane@example.com",
					phone: "555-9999",
				}),
			);
			expect(res.status).toBe(200);
		});
	});

	describe("missing-centerId branches across guardians routes", () => {
		async function makeNoCenterApp() {
			const { Hono } = await import("hono");
			const { HTTPException } = await import("hono/http-exception");
			const app = new Hono<AppEnv>();
			app.use("*", async (c, next) => {
				c.set("db", createMockDb() as unknown as import("../lib/context.js").Variables["db"]);
				c.set("role", "owner");
				c.set("userId", "user-1");
				c.set("membershipId", "m-1");
				await next();
			});
			app.route("/api/guardians", guardiansRoutes);
			app.onError((err, c) => {
				if (
					err instanceof HTTPException ||
					typeof (err as { status?: number }).status === "number"
				) {
					const status = ((err as { status?: number }).status ?? 500) as 400 | 403 | 404 | 500;
					return c.json({ error: (err as { message?: string }).message }, status);
				}
				return c.json({ error: "Internal" }, 500);
			});
			return app;
		}

		it("GET / — returns 403 when centerId is missing", async () => {
			const app = await makeNoCenterApp();
			const res = await app.request("/api/guardians");
			expect(res.status).toBe(403);
		});

		it("GET /:id — returns 403 when centerId is missing", async () => {
			const app = await makeNoCenterApp();
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);
			expect(res.status).toBe(403);
		});

		it("POST / — returns 403 when centerId is missing", async () => {
			const app = await makeNoCenterApp();
			const res = await app.request("/api/guardians", jsonBody({ firstName: "X", lastName: "Y" }));
			expect(res.status).toBe(403);
		});

		it("PATCH /:id — returns 403 when centerId is missing", async () => {
			const app = await makeNoCenterApp();
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, patchBody({ firstName: "X" }));
			expect(res.status).toBe(403);
		});

		it("GET /:id/children — returns 403 when centerId is missing", async () => {
			const app = await makeNoCenterApp();
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);
			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/guardians/:id/children — additional branches", () => {
		it("only returns children inside the staff member's classrooms", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// guardian lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffAssignments
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (selectCallCount === 4) {
						// childGuardians
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ childId: "child-1" }, { childId: "child-2" }]),
							}),
						};
					}
					if (selectCallCount === 5) {
						// classroomAssignments
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([
									{
										childId: "child-1",
										firstName: "Alice",
										lastName: "Doe",
										dateOfBirth: "2023-05-15",
										ageGroup: "toddler",
										isPrimary: true,
										authorizedPickup: true,
										relationship: "mother",
									},
								]),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}/children`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				children: Array<{ childId: string; firstName: string }>;
			};
			expect(body.children).toHaveLength(1);
			expect(body.children[0].childId).toBe("child-1");
		});
	});

	describe("DELETE /api/guardians/:id", () => {
		it("returns 409 instead of deleting a guardian with invoices", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue(
										selectCallCount === 1 ? [{ id: "guardian-1" }] : [{ id: "invoice-1" }],
									),
							}),
						}),
					};
				}),
				delete: vi.fn(),
				transaction: vi.fn(),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "guardian_has_invoices" });
			expect(db.transaction).not.toHaveBeenCalled();
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("returns 409 instead of leaving a linked child without guardians", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					const rowsByCall: Record<number, unknown[]> = {
						1: [{ id: "guardian-1" }],
						2: [],
						3: [{ childId: "child-1" }],
						4: [],
					};

					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(rowsByCall[selectCallCount] ?? []),
							}),
						}),
					};
				}),
				delete: vi.fn(),
				transaction: vi.fn(),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "child_requires_guardian" });
			expect(db.transaction).not.toHaveBeenCalled();
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("deletes a guardian and cascades child-guardian links (200)", async () => {
			const existingGuardian = { id: "guardian-1", centerId: "center-1" };
			const deleteCalls: unknown[] = [];

			const txDb = {
				delete: vi.fn().mockImplementation((table: unknown) => {
					deleteCalls.push(table);
					return {
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
						}),
					};
				}),
			};

			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([existingGuardian]),
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
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					}),
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, { method: "DELETE" });

			expect(res.status).toBe(200);
			const body = (await res.json()) as { ok: boolean };
			expect(body.ok).toBe(true);
			expect(db.transaction).toHaveBeenCalledTimes(1);
			// Two delete calls inside the transaction: one for child_guardians links, one for guardians
			expect(deleteCalls).toHaveLength(2);
		});

		it("returns 404 when guardian belongs to another center", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, { method: "DELETE" });

			expect(res.status).toBe(404);
			expect(db.transaction).not.toHaveBeenCalled();
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db, { role: "staff" });
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, { method: "DELETE" });

			expect(res.status).toBe(403);
		});

		it("returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db);
			const res = await app.request("/api/guardians/not-a-uuid", { method: "DELETE" });

			expect(res.status).toBe(400);
		});

		it("returns 403 when centerId is missing", async () => {
			const { Hono } = await import("hono");
			const { HTTPException } = await import("hono/http-exception");
			const app = new Hono<AppEnv>();
			app.use("*", async (c, next) => {
				c.set("db", createMockDb() as unknown as import("../lib/context.js").Variables["db"]);
				c.set("role", "owner");
				c.set("userId", "user-1");
				c.set("membershipId", "m-1");
				await next();
			});
			app.route("/api/guardians", guardiansRoutes);
			app.onError((err, c) => {
				if (
					err instanceof HTTPException ||
					typeof (err as { status?: number }).status === "number"
				) {
					const status = ((err as { status?: number }).status ?? 500) as 400 | 403 | 404 | 500;
					return c.json({ error: (err as { message?: string }).message }, status);
				}
				return c.json({ error: "Internal" }, 500);
			});
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`, { method: "DELETE" });
			expect(res.status).toBe(403);
		});
	});

	describe("UUID validation (400 on invalid ID format)", () => {
		const INVALID_ID = "not-a-uuid";

		it("GET /:id returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${INVALID_ID}`);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toBe("Invalid ID");
		});

		it("PATCH /:id returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db, { role: "owner" });
			const res = await app.request(`/api/guardians/${INVALID_ID}`, patchBody({ firstName: "X" }));
			expect(res.status).toBe(400);
		});

		it("GET /:id/children returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountGuardians, db);
			const res = await app.request(`/api/guardians/${INVALID_ID}/children`);
			expect(res.status).toBe(400);
		});
	});

	describe("center-local 'today' in assertStaffGuardianAccess and GET /:id handler", () => {
		it("queries staffAssignments with center-local day not raw UTC when timezone differs", async () => {
			// Use a timezone that is significantly behind UTC so that near midnight UTC
			// the local day is still the previous calendar day.
			// We set the center timezone to "Pacific/Honolulu" (UTC-10) and freeze the
			// clock at 2026-06-10T05:00:00Z — UTC day is "2026-06-10" but Honolulu local
			// day is "2026-06-09".
			const frozenNow = new Date("2026-06-10T05:00:00Z");
			vi.setSystemTime(frozenNow);

			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const staffAssignmentWhereConditions: unknown[] = [];
			let selectCallCount = 0;

			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					// call 1: center timezone lookup (GET /:id handler)
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "Pacific/Honolulu" }]),
								}),
							}),
						};
					}
					// call 2: guardian lookup
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					// call 3: staffAssignments — capture where condition
					if (selectCallCount === 3) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockImplementation((condition) => {
									staffAssignmentWhereConditions.push(condition);
									// Return empty to trigger 404 (staff has no rooms)
									return Promise.resolve([]);
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			// 404 because staff has no room assignments — that's expected
			expect(res.status).toBe(404);

			// Verify the center timezone was queried
			expect(selectCallCount).toBeGreaterThanOrEqual(3);

			// The staffAssignments where condition must use local day "2026-06-09",
			// not UTC day "2026-06-10".
			expect(staffAssignmentWhereConditions).toHaveLength(1);
			expect(objectGraphIncludesString(staffAssignmentWhereConditions[0], "2026-06-09")).toBe(true);
			expect(objectGraphIncludesString(staffAssignmentWhereConditions[0], "2026-06-10")).toBe(
				false,
			);

			vi.useRealTimers();
		});

		it("GET /:id uses center-local day (not UTC) in the linked-children classroom join", async () => {
			const frozenNow = new Date("2026-06-10T05:00:00Z");
			vi.setSystemTime(frozenNow);

			const mockGuardian = {
				id: "guardian-1",
				centerId: "center-1",
				firstName: "John",
				lastName: "Doe",
				email: "john@example.com",
				phone: "555-1234",
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// Capture the classroomAssignments join condition (second leftJoin in the final select)
			let classroomAssignmentJoinCondition: unknown;
			let selectCallCount = 0;

			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					// call 1: center timezone lookup (GET /:id handler)
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "Pacific/Honolulu" }]),
								}),
							}),
						};
					}
					// call 2: guardian lookup
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockGuardian]),
								}),
							}),
						};
					}
					// call 3: the joined children/classrooms query — owner role skips assertStaffGuardianAccess
					const whereResult = vi.fn().mockResolvedValue([]);
					const thirdLeftJoin = vi.fn().mockReturnValue({ where: whereResult });
					const secondLeftJoin = vi.fn().mockImplementation((_table, condition) => {
						classroomAssignmentJoinCondition = condition;
						return { leftJoin: thirdLeftJoin, where: whereResult };
					});
					const firstLeftJoin = vi
						.fn()
						.mockReturnValue({ leftJoin: secondLeftJoin, where: whereResult });
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: firstLeftJoin,
						}),
					};
				}),
			});

			const app = createTestApp(mountGuardians, db, { role: "owner" });
			const res = await app.request(`/api/guardians/${GUARDIAN_ID}`);

			expect(res.status).toBe(200);

			// The classroomAssignment join condition must reference "2026-06-09" not "2026-06-10"
			expect(objectGraphIncludesString(classroomAssignmentJoinCondition, "2026-06-09")).toBe(true);
			expect(objectGraphIncludesString(classroomAssignmentJoinCondition, "2026-06-10")).toBe(false);

			vi.useRealTimers();
		});
	});

	describe("POST /api/guardians — rate limiting", () => {
		interface RateLimitState {
			count: number;
			windowStart: number;
		}

		function makeMockRateLimiterNamespace(): DurableObjectNamespace {
			const instances = new Map<string, Map<string, RateLimitState>>();
			function getStorage(name: string): Map<string, RateLimitState> {
				if (!instances.has(name)) instances.set(name, new Map());
				return instances.get(name) as Map<string, RateLimitState>;
			}
			const makeStub = (name: string) => ({
				checkLimit: async (
					key: string,
					limit: number,
					windowMs: number,
				): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
					const storage = getStorage(name);
					const now = Date.now();
					const stored = storage.get(key);
					const windowStart = stored?.windowStart ?? now;
					const count = stored?.count ?? 0;
					if (now - windowStart > windowMs) {
						storage.set(key, { count: 1, windowStart: now });
						return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
					}
					const resetAt = windowStart + windowMs;
					if (count >= limit) {
						return { allowed: false, remaining: 0, resetAt };
					}
					storage.set(key, { count: count + 1, windowStart });
					return { allowed: true, remaining: limit - count - 1, resetAt };
				},
			});
			return {
				newUniqueId: () => ({ toString: () => "unique-id" }) as DurableObjectId,
				idFromName: (name: string) => ({ toString: () => name, name }) as DurableObjectId,
				idFromString: (id: string) => ({ toString: () => id }) as DurableObjectId,
				get: (id: DurableObjectId) => makeStub(id.toString()) as unknown as DurableObjectStub,
				jurisdiction: () => ({}) as DurableObjectNamespace,
			} as unknown as DurableObjectNamespace;
		}

		function makeCreateGuardianDb() {
			const newGuardian = {
				id: "guardian-rl",
				centerId: "center-1",
				firstName: "Rate",
				lastName: "Limited",
				email: null,
				phone: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};
			return createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newGuardian]),
					}),
				}),
			});
		}

		it("11th request from same IP within the window returns 429", async () => {
			const ns = makeMockRateLimiterNamespace();
			const ip = "198.51.100.10";
			const requestInit = {
				...jsonBody({ firstName: "Rate", lastName: "Limited" }),
				headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
			};

			// Exhaust the 10-request limit — all allowed
			for (let i = 0; i < 10; i++) {
				const db = makeCreateGuardianDb();
				const app = createTestApp(mountGuardians, db, undefined, attachGuardianCreateRateLimit);
				const res = await app.request("/api/guardians", requestInit, { RATE_LIMITER: ns });
				expect(res.status).toBe(201);
			}

			// 11th request should be rate-limited
			const db = makeCreateGuardianDb();
			const app = createTestApp(mountGuardians, db, undefined, attachGuardianCreateRateLimit);
			const res = await app.request("/api/guardians", requestInit, { RATE_LIMITER: ns });
			expect(res.status).toBe(429);
			const body = (await res.json()) as { error: string };
			expect(body.error).toContain("Too many guardian creates");
		});
	});
});
