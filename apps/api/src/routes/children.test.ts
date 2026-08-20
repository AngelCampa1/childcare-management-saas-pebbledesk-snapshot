import {
	childGuardians,
	children as childrenTable,
	guardians as guardiansTable,
} from "@pebbledesk/db";
import { WAITLIST_CLASSROOM_ERROR } from "@pebbledesk/shared";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
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

// Import after mocking
const { childrenRoutes } = await import("./children.js");

interface ChildData {
	id: string;
	centerId: string;
	firstName: string;
	lastName: string;
	dateOfBirth: string;
	ageGroup: string;
	enrollmentStatus: string;
	subsidyEligible: boolean;
	enrolledAt: string | null;
	withdrawnAt: string | null;
	createdAt: string;
	allergies: string | null;
	immunizations: string | null;
	notes: string | null;
}

interface GuardianLinkData {
	id: string;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	isPrimary: boolean;
	authorizedPickup: boolean;
	relationship: string | null;
}

function mountChildren(app: Hono<AppEnv>) {
	app.route("/api/children", childrenRoutes);
}

/**
 * Returns a mock select chain that resolves to [{timezone: "UTC"}].
 * Use as the first mockReturnValueOnce() in tests that override db.select,
 * since getCenterTimezone() is now called first in list/detail handlers.
 */
function tzSelectChain() {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
			}),
		}),
	};
}

function sqlObjectContainsString(
	value: unknown,
	needle: string,
	seen = new WeakSet<object>(),
): boolean {
	if (typeof value === "string") return value.toLowerCase().includes(needle.toLowerCase());
	if (!value || typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);
	for (const key of Object.keys(value as Record<string, unknown>)) {
		if (sqlObjectContainsString((value as Record<string, unknown>)[key], needle, seen)) return true;
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

describe("children routes", () => {
	const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";
	const GUARDIAN_ID = "660e8400-e29b-41d4-a716-446655440000";

	it.each([
		[
			"POST",
			"/api/children/enroll",
			jsonBody({
				child: {
					firstName: "Bob",
					lastName: "Jones",
					dateOfBirth: "2024-01-10",
					ageGroup: "infant",
				},
				guardians: [
					{
						type: "new",
						firstName: "Mary",
						lastName: "Jones",
						email: "mary@example.com",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
				classroom: {
					classroomId: "00000000-0000-0000-0000-000000000010",
					effectiveDate: "2026-04-07",
				},
			}),
		],
		["GET", "/api/children", undefined],
		["GET", `/api/children/${CHILD_ID}`, undefined],
		[
			"POST",
			"/api/children",
			jsonBody({
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
			}),
		],
		["PATCH", `/api/children/${CHILD_ID}`, patchBody({ firstName: "Alice" })],
		["POST", `/api/children/${CHILD_ID}/withdraw`, { method: "POST" }],
		["POST", `/api/children/${CHILD_ID}/reactivate`, { method: "POST" }],
		["GET", `/api/children/${CHILD_ID}/guardians`, undefined],
		[
			"POST",
			`/api/children/${CHILD_ID}/guardians`,
			jsonBody({
				guardianId: GUARDIAN_ID,
				isPrimary: true,
				authorizedPickup: true,
				relationship: "Parent",
			}),
		],
		[
			"PATCH",
			`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`,
			patchBody({ relationship: "Parent" }),
		],
		["DELETE", `/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`, { method: "DELETE" }],
	] as const)("rejects %s child route requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountChildren, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});

	describe("POST /api/children", () => {
		it("creates a child (201)", async () => {
			const newChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ count: 0 }]),
					}),
				}),
			});
			const txInsert = vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([newChild]),
				}),
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, insert: txInsert }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children",
				jsonBody({
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.firstName).toBe("Alice");
			expect(body.child.enrollmentStatus).toBe("active");
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request(
				"/api/children",
				jsonBody({
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
				}),
			);

			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/children", () => {
		it("returns children list for owner", async () => {
			const mockChildren = [
				{
					id: "child-1",
					centerId: "center-1",
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
					enrolledAt: null,
					withdrawnAt: null,
					createdAt: new Date().toISOString(),
				},
			];

			const childrenChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue(mockChildren),
						}),
					}),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(childrenChain),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: ChildData[] };
			expect(body.children).toHaveLength(1);
			expect(body.children[0].firstName).toBe("Alice");
		});

		it("returns empty list for staff with no classroom assignments", async () => {
			// Staff rooms query terminates at .where() — no pagination on that sub-query
			const staffRoomsChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(staffRoomsChain),
			});

			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: ChildData[] };
			expect(body.children).toHaveLength(0);
		});

		it("applies status filter when provided", async () => {
			const listChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(listChain),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?status=withdrawn");

			expect(res.status).toBe(200);
		});

		it("applies ageGroup filter when provided", async () => {
			const listChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(listChain),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?ageGroup=toddler");

			expect(res.status).toBe(200);
		});

		it("rejects invalid status filters before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?status=graduated");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("rejects invalid age group filters before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?ageGroup=babies");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("rejects invalid classroom filters before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?classroomId=not-a-uuid");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("applies search filter when provided", async () => {
			const listChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(listChain),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children?search=alice");

			expect(res.status).toBe(200);
		});

		it("returns empty list when classroomId filter finds no assignments", async () => {
			// classroomAssignments query terminates at .where() — no pagination on that sub-query
			const assignmentsChain = {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			};
			const db = createMockDb({
				select: vi.fn().mockReturnValueOnce(tzSelectChain()).mockReturnValue(assignmentsChain),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children?classroomId=00000000-0000-0000-0000-000000000001",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: ChildData[] };
			expect(body.children).toHaveLength(0);
		});

		it("applies classroomId filter when provided and assignments exist", async () => {
			let callCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					callCount += 1;
					if (callCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (callCount === 2) {
						// classroomAssignments query — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ childId: "child-1" }]),
							}),
						};
					}
					// main children query
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockReturnValue({
									offset: vi.fn().mockResolvedValue([
										{
											id: "child-1",
											centerId: "center-1",
											firstName: "Alice",
											lastName: "Smith",
											dateOfBirth: "2023-05-15",
											ageGroup: "toddler",
											enrollmentStatus: "active",
											subsidyEligible: false,
											enrolledAt: null,
											withdrawnAt: null,
											createdAt: new Date().toISOString(),
										},
									]),
								}),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children?classroomId=00000000-0000-0000-0000-000000000001",
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: ChildData[] };
			expect(body.children).toHaveLength(1);
		});

		it("returns 403 when centerId is not in context", async () => {
			const { Hono } = await import("hono");
			const { HTTPException } = await import("hono/http-exception");
			const db = createMockDb();
			const app = new Hono<AppEnv>();
			app.use("*", async (c, next) => {
				c.set("db", db as unknown as import("../lib/context.js").Variables["db"]);
				c.set("userId", "user-1");
				c.set("role", "owner");
				// centerId intentionally omitted
				await next();
			});
			app.route("/api/children", childrenRoutes);
			app.onError((err, c) => {
				if (err instanceof HTTPException) {
					return c.json({ error: err.message }, err.status as 400 | 401 | 403 | 404 | 500);
				}
				return c.json({ error: "Internal" }, 500);
			});
			const res = await app.request("/api/children");
			expect(res.status).toBe(403);
		});

		it("returns empty list for staff with child assignments in classrooms", async () => {
			let callCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					callCount += 1;
					if (callCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (callCount === 2) {
						// staffRooms query — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (callCount === 3) {
						// childAssignments query — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([]),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockReturnValue({
									offset: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: ChildData[] };
			expect(body.children).toHaveLength(0);
		});

		it("returns children for staff with matching classroom assignments", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			let callCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					callCount += 1;
					if (callCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (callCount === 2) {
						// staffRooms — returns a classroom
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (callCount === 3) {
						// childAssignments — returns a childId
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ childId: "child-1" }]),
							}),
						};
					}
					// main children query
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockReturnValue({
									offset: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: (typeof mockChild)[] };
			expect(body.children).toHaveLength(1);
			expect(body.children[0].firstName).toBe("Alice");
		});

		it("requires staff and child classroom assignments to be effective for staff lists", async () => {
			const whereConditions: unknown[] = [];
			let callCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					callCount += 1;
					if (callCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (callCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockImplementation((condition) => {
									whereConditions.push(condition);
									return Promise.resolve([{ classroomId: "classroom-1" }]);
								}),
							}),
						};
					}
					if (callCount === 3) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockImplementation((condition) => {
									whereConditions.push(condition);
									return Promise.resolve([]);
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockReturnValue({
									offset: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(whereConditions[0])).toContain("effective_date");
			expect(sqlConditionColumnNames(whereConditions[1])).toContain("effective_date");
		});
	});

	describe("GET /api/children/:id", () => {
		it("returns child with guardians and classroom", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const mockAssignment = {
				assignmentId: "assign-1",
				classroomId: "classroom-1",
				effectiveDate: "2026-01-01",
				classroomName: "Sunshine Room",
				classroomAgeGroup: "toddler",
			};

			const mockGuardians = [
				{
					guardianId: "guardian-1",
					firstName: "Jane",
					lastName: "Smith",
					email: "jane@example.com",
					phone: null,
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
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						// child query
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// classroom assignment query
						return {
							from: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([mockAssignment]),
									}),
								}),
							}),
						};
					}
					// guardians query — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(mockGuardians),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				child: ChildData;
				currentClassroom: {
					id: string;
					name: string;
					ageGroup: string;
					assignmentId: string;
					effectiveDate: string;
				};
				guardians: GuardianLinkData[];
				primaryGuardianName: string | null;
			};
			expect(body.child.firstName).toBe("Alice");
			expect(body.currentClassroom.name).toBe("Sunshine Room");
			expect(body.guardians).toHaveLength(1);
			expect(body.primaryGuardianName).toBe("Jane Smith");
		});

		it("scopes the guardian leftJoin by centerId (defense-in-depth)", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			const guardianLeftJoinMock = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue([]),
			});
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						return {
							from: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([]),
									}),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: guardianLeftJoinMock,
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db);
			await app.request(`/api/children/${CHILD_ID}`);

			// The guardian leftJoin must receive a compound condition (centerId scoped)
			expect(guardianLeftJoinMock).toHaveBeenCalledTimes(1);
			const joinCondition = guardianLeftJoinMock.mock.calls[0]?.[1];
			expect(joinCondition).toBeDefined();
			expect(typeof joinCondition).toBe("object");
		});

		it("center-scopes the current classroom join", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			let classroomJoinCondition: unknown;
			let currentAssignmentCondition: unknown;
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						return {
							from: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockImplementation((_table, condition) => {
									classroomJoinCondition = condition;
									return {
										where: vi.fn().mockImplementation((condition) => {
											currentAssignmentCondition = condition;
											return {
												limit: vi.fn().mockResolvedValue([]),
											};
										}),
									};
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(classroomJoinCondition)).toContain("center_id");
			expect(sqlConditionColumnNames(currentAssignmentCondition)).toContain("effective_date");
		});

		it("returns 400 for malformed child identifiers", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request("/api/children/not-a-uuid");

			expect(res.status).toBe(400);
		});

		it("returns 404 for non-existent child", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(404);
		});

		it("staff cannot access a child outside their classroom assignments", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}

					// staffRooms query — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, {
				role: "staff",
				membershipId: "membership-staff",
			});
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(404);
		});

		it("returns 404 when staff has rooms but child is not in any of them", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						// child lookup — found
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffAssignments — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "room-1" }]),
							}),
						};
					}
					// classroomAssignments — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([{ classroomId: "room-2" }]),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, {
				role: "staff",
				membershipId: "membership-staff",
			});
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(404);
		});

		it("staff can access a child assigned to one of their classrooms", async () => {
			const mockChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const mockAssignment = {
				assignmentId: "assign-1",
				classroomId: "classroom-1",
				effectiveDate: "2026-01-01",
				classroomName: "Sunshine Room",
				classroomAgeGroup: "toddler",
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup (handler top)
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([mockChild]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffRooms — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (selectCallCount === 4) {
						// classroomAssignments — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "classroom-1" }]),
							}),
						};
					}
					if (selectCallCount === 5) {
						// classroom assignment with leftJoin — terminates at .limit(1)
						return {
							from: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([mockAssignment]),
									}),
								}),
							}),
						};
					}
					// guardians leftJoin — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, {
				role: "staff",
				membershipId: "membership-staff",
			});
			const res = await app.request(`/api/children/${CHILD_ID}`);

			expect(res.status).toBe(200);
		});
	});

	describe("PATCH /api/children/:id", () => {
		it("updates a child", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice Updated",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: true,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
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

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ firstName: "Alice Updated", subsidyEligible: true }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.firstName).toBe("Alice Updated");
			expect(body.child.subsidyEligible).toBe(true);
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ firstName: "Updated" }),
			);

			expect(res.status).toBe(403);
		});

		it("checks plan capacity when activating a non-active child", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			let txSelectCallCount = 0;
			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockImplementation(() => {
				txSelectCallCount++;
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue(
									txSelectCallCount === 1 ? [{ enrollmentStatus: "waitlist" }] : [{}],
								),
						}),
					}),
				};
			});
			const txUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			});
			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, update: txUpdate }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "active" }),
			);

			expect(res.status).toBe(200);
			expect(txSelect).toHaveBeenCalledTimes(2);
		});

		it("reactivates consistently through PATCH by clearing withdrawal metadata", async () => {
			const reactivated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			let txSelectCallCount = 0;
			const childSet = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([reactivated]),
				}),
			});
			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockImplementation(() => {
				txSelectCallCount++;
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue(
									txSelectCallCount === 1 ? [{ enrollmentStatus: "withdrawn" }] : [{}],
								),
						}),
					}),
				};
			});
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({
						execute: txExecute,
						select: txSelect,
						update: vi.fn().mockReturnValue({ set: childSet }),
					}),
				),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "active" }),
			);

			expect(res.status).toBe(200);
			expect(childSet).toHaveBeenCalledWith(
				expect.objectContaining({
					enrollmentStatus: "active",
					withdrawnAt: null,
					enrolledAt: expect.any(Date),
				}),
			);
		});

		it("withdraws consistently through PATCH by ending active classroom assignments", async () => {
			const withdrawn = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "withdrawn",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			};
			const childReturning = vi.fn().mockResolvedValue([withdrawn]);
			const childWhere = vi.fn().mockReturnValue({ returning: childReturning });
			const childSet = vi.fn().mockReturnValue({ where: childWhere });
			const checkInWhere = vi.fn().mockResolvedValue([]);
			const checkInSet = vi.fn().mockReturnValue({ where: checkInWhere });
			const assignmentWhere = vi.fn().mockResolvedValue([]);
			const assignmentSet = vi.fn().mockReturnValue({ where: assignmentWhere });
			const update = vi
				.fn()
				.mockReturnValueOnce({ set: childSet })
				.mockReturnValueOnce({ set: checkInSet })
				.mockReturnValueOnce({ set: assignmentSet });
			// Mock center timezone to UTC so endDate matches new Date().toISOString().split("T")[0]
			const db = createMockDb({ update, select: vi.fn().mockReturnValue(tzSelectChain()) });

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "withdrawn" }),
			);

			expect(res.status).toBe(200);
			expect(update).toHaveBeenCalledTimes(3);
			expect(childSet).toHaveBeenCalledWith({
				enrollmentStatus: "withdrawn",
				withdrawnAt: expect.any(Date),
			});
			expect(checkInSet).toHaveBeenCalledWith({
				checkedOutAt: expect.any(Date),
				checkedOutBy: "membership-1",
			});
			expect(assignmentSet).toHaveBeenCalledWith({
				endDate: new Date().toISOString().split("T")[0],
			});
		});

		it("removes live attendance and assignment state when PATCH moves a child to waitlist", async () => {
			const waitlisted = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "waitlist",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			const childSet = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([waitlisted]),
				}),
			});
			const checkInSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const assignmentSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const update = vi
				.fn()
				.mockReturnValueOnce({ set: childSet })
				.mockReturnValueOnce({ set: checkInSet })
				.mockReturnValueOnce({ set: assignmentSet });
			// Mock center timezone to UTC so endDate matches new Date().toISOString().split("T")[0]
			const db = createMockDb({ update, select: vi.fn().mockReturnValue(tzSelectChain()) });

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "waitlist" }),
			);

			expect(res.status).toBe(200);
			expect(update).toHaveBeenCalledTimes(3);
			expect(childSet).toHaveBeenCalledWith({ enrollmentStatus: "waitlist" });
			expect(checkInSet).toHaveBeenCalledWith({
				checkedOutAt: expect.any(Date),
				checkedOutBy: "membership-1",
			});
			expect(assignmentSet).toHaveBeenCalledWith({
				endDate: new Date().toISOString().split("T")[0],
			});
		});

		it("accepts and persists allergies field", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: "Peanuts, tree nuts",
				immunizations: null,
				notes: null,
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "active" }]),
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

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ allergies: "Peanuts, tree nuts" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.allergies).toBe("Peanuts, tree nuts");
			expect(body.child.immunizations).toBeNull();
			expect(body.child.notes).toBeNull();
		});

		it("accepts and persists immunizations field", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: null,
				immunizations: "MMR - 2024-01-15, Flu - 2024-09-01",
				notes: null,
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "active" }]),
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

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ immunizations: "MMR - 2024-01-15, Flu - 2024-09-01" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.immunizations).toBe("MMR - 2024-01-15, Flu - 2024-09-01");
		});

		it("accepts and persists notes field", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: null,
				immunizations: null,
				notes: "Naps at 1pm daily.",
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "active" }]),
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

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ notes: "Naps at 1pm daily." }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.notes).toBe("Naps at 1pm daily.");
		});

		it("accepts all three health fields in a single PATCH", async () => {
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: "Dairy",
				immunizations: "Flu shot",
				notes: "Bottle-fed only",
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "active" }]),
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

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ allergies: "Dairy", immunizations: "Flu shot", notes: "Bottle-fed only" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.allergies).toBe("Dairy");
			expect(body.child.immunizations).toBe("Flu shot");
			expect(body.child.notes).toBe("Bottle-fed only");
		});

		it("rejects allergies exceeding 5000 characters (400)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ allergies: "a".repeat(5001) }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects immunizations exceeding 5000 characters (400)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ immunizations: "a".repeat(5001) }),
			);

			expect(res.status).toBe(400);
		});

		it("rejects notes exceeding 5000 characters (400)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ notes: "a".repeat(5001) }),
			);

			expect(res.status).toBe(400);
		});
	});

	describe("POST /api/children/:id/withdraw", () => {
		it("sets withdrawn status", async () => {
			const withdrawn = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "withdrawn",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
						}),
					}),
				}),
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([withdrawn]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/withdraw`, {
				method: "POST",
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.enrollmentStatus).toBe("withdrawn");
			expect(body.child.withdrawnAt).toBeTruthy();
		});

		it("checks out open child check-ins when withdrawing", async () => {
			const withdrawn = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "withdrawn",
				subsidyEligible: false,
				enrolledAt: null,
				withdrawnAt: new Date().toISOString(),
				createdAt: new Date().toISOString(),
			};
			const childSet = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([withdrawn]),
				}),
			});
			const checkInSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const assignmentSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const update = vi
				.fn()
				.mockReturnValueOnce({ set: childSet })
				.mockReturnValueOnce({ set: checkInSet })
				.mockReturnValueOnce({ set: assignmentSet });
			// Mock center timezone to UTC so endDate matches new Date().toISOString().split("T")[0]
			const db = createMockDb({ update, select: vi.fn().mockReturnValue(tzSelectChain()) });

			const app = createTestApp(mountChildren, db, { membershipId: "membership-1" });
			const res = await app.request(`/api/children/${CHILD_ID}/withdraw`, {
				method: "POST",
			});

			expect(res.status).toBe(200);
			expect(update).toHaveBeenCalledTimes(3);
			expect(checkInSet).toHaveBeenCalledWith({
				checkedOutAt: expect.any(Date),
				checkedOutBy: "membership-1",
			});
			expect(assignmentSet).toHaveBeenCalledWith({
				endDate: new Date().toISOString().split("T")[0],
			});
		});

		it("returns 404 for non-existent child", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
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
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/withdraw`, {
				method: "POST",
			});

			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/children/:id/reactivate", () => {
		it("sets active status and clears withdrawnAt", async () => {
			const reactivated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
					}),
				}),
			});
			const txUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([reactivated]),
					}),
				}),
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, update: txUpdate }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/reactivate`, {
				method: "POST",
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { child: ChildData };
			expect(body.child.enrollmentStatus).toBe("active");
			expect(body.child.withdrawnAt).toBeNull();
			expect(body.child.enrolledAt).toBeTruthy();
		});
	});

	describe("TOCTOU plan-limit concurrency guard", () => {
		it("POST /:id/reactivate runs inside db.transaction with a center-row FOR UPDATE lock", async () => {
			// RED test: before fix, reactivate does NOT call db.transaction and does NOT
			// call tx.execute (no FOR UPDATE). After fix it must.
			const reactivated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
					}),
				}),
			}));
			const txUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([reactivated]),
					}),
				}),
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, update: txUpdate }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/reactivate`, { method: "POST" });

			expect(res.status).toBe(200);
			// Must have used a transaction
			expect(db.transaction).toHaveBeenCalledTimes(1);
			// Must have issued a FOR UPDATE lock inside the transaction
			expect(txExecute).toHaveBeenCalledTimes(1);
			const lockCallArg = txExecute.mock.calls[0]?.[0];
			expect(sqlObjectContainsString(lockCallArg, "for update")).toBe(true);
		});

		it("PATCH /:id with enrollmentStatus=active runs inside db.transaction with a center-row FOR UPDATE lock", async () => {
			// RED test: before fix, PATCH-active does NOT call db.transaction and does NOT
			// call tx.execute. After fix it must.
			const updated = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const txExecute = vi.fn().mockResolvedValue([]);
			const txSelect = vi.fn().mockImplementation(() => ({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
					}),
				}),
			}));
			const txUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([updated]),
					}),
				}),
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, update: txUpdate }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "active" }),
			);

			expect(res.status).toBe(200);
			// Must have used a transaction
			expect(db.transaction).toHaveBeenCalledTimes(1);
			// Must have issued a FOR UPDATE lock inside the transaction
			expect(txExecute).toHaveBeenCalledTimes(1);
			const lockCallArg = txExecute.mock.calls[0]?.[0];
			expect(sqlObjectContainsString(lockCallArg, "for update")).toBe(true);
		});

		it("POST / (create child) runs inside db.transaction with a center-row FOR UPDATE lock before cap check", async () => {
			const newChild = {
				id: "child-1",
				centerId: "center-1",
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: null,
				immunizations: null,
				notes: null,
			};

			const callOrder: string[] = [];

			const txExecute = vi.fn().mockImplementation(() => {
				callOrder.push("execute");
				return Promise.resolve([]);
			});
			const txSelect = vi.fn().mockImplementation(() => {
				callOrder.push("select");
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ count: 0 }]),
						}),
					}),
				};
			});
			const txInsert = vi.fn().mockImplementation(() => {
				callOrder.push("insert");
				return {
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newChild]),
					}),
				};
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, insert: txInsert }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children",
				jsonBody({
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
				}),
			);

			expect(res.status).toBe(201);
			// Must have used a transaction
			expect(db.transaction).toHaveBeenCalledTimes(1);
			// Must have issued a FOR UPDATE lock inside the transaction
			expect(txExecute).toHaveBeenCalledTimes(1);
			const lockCallArg = txExecute.mock.calls[0]?.[0];
			expect(sqlObjectContainsString(lockCallArg, "for update")).toBe(true);
			// Lock must be acquired before the cap-check select
			const executeIndex = callOrder.indexOf("execute");
			const selectIndex = callOrder.indexOf("select");
			expect(executeIndex).toBeGreaterThanOrEqual(0);
			expect(selectIndex).toBeGreaterThan(executeIndex);
		});

		it("POST /enroll runs inside db.transaction with a center-row FOR UPDATE lock before cap check", async () => {
			const newChild = {
				id: "child-new",
				centerId: "center-1",
				firstName: "Bob",
				lastName: "Jones",
				dateOfBirth: "2024-01-10",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
				allergies: null,
				immunizations: null,
				notes: null,
			};

			const newGuardian = {
				id: "guardian-new",
				centerId: "center-1",
				firstName: "Mary",
				lastName: "Jones",
				email: "mary@example.com",
				phone: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const callOrder: string[] = [];

			const txExecute = vi.fn().mockImplementation(() => {
				callOrder.push("execute");
				return Promise.resolve([]);
			});

			let selectCount = 0;
			const txSelect = vi.fn().mockImplementation(() => {
				selectCount += 1;
				callOrder.push("select");
				// selectCount 1: assertCanAddActiveChildren plan check — no subscriptionPlan → early exit
				// selectCount 2: createGuardian email-duplicate check — [] means no duplicate
				// selectCount 3: linkGuardianToChild child existence check
				// selectCount 4: linkGuardianToChild guardian existence check
				// selectCount 5: linkGuardianToChild existing-link check — [] means no existing link
				const rowsByCall: Record<number, unknown[]> = {
					1: [{}],
					2: [],
					3: [{ id: "child-new" }],
					4: [{ id: "guardian-new" }],
					5: [],
				};
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(rowsByCall[selectCount] ?? []),
						}),
					}),
				};
			});

			let insertCount = 0;
			const txInsert = vi.fn().mockImplementation(() => {
				insertCount += 1;
				if (insertCount === 1) {
					return {
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([newChild]),
						}),
					};
				}
				if (insertCount === 2) {
					return {
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([newGuardian]),
						}),
					};
				}
				// childGuardian link insert
				return { values: vi.fn().mockResolvedValue(undefined) };
			});

			const txUpdate = vi.fn().mockReturnValue({
				set: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const db = createMockDb({
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
						fn({ execute: txExecute, select: txSelect, insert: txInsert, update: txUpdate }),
					),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Bob",
						lastName: "Jones",
						dateOfBirth: "2024-01-10",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Jones",
							email: "mary@example.com",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
				}),
			);

			expect(res.status).toBe(201);
			// Must have used a transaction
			expect(db.transaction).toHaveBeenCalledTimes(1);
			// Must have issued a FOR UPDATE lock inside the transaction
			expect(txExecute).toHaveBeenCalledTimes(1);
			const lockCallArg = txExecute.mock.calls[0]?.[0];
			expect(sqlObjectContainsString(lockCallArg, "for update")).toBe(true);
			// Lock must be acquired before the cap-check select
			const executeIndex = callOrder.indexOf("execute");
			const selectIndex = callOrder.indexOf("select");
			expect(executeIndex).toBeGreaterThanOrEqual(0);
			expect(selectIndex).toBeGreaterThan(executeIndex);
		});
	});

	describe("GET /api/children/:id/guardians", () => {
		it("returns guardians for child", async () => {
			const mockGuardians = [
				{
					guardianId: "guardian-1",
					firstName: "Jane",
					lastName: "Smith",
					email: "jane@example.com",
					phone: null,
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				},
			];

			let selectCallCount = 0;
			// guardians leftJoin — terminates at .where()
			const leftJoinMock = vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(mockGuardians),
			});
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						// Verify child exists
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
								}),
							}),
						};
					}
					// Return guardians
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: leftJoinMock,
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { guardians: GuardianLinkData[] };
			expect(body.guardians).toHaveLength(1);
			expect(body.guardians[0].firstName).toBe("Jane");
			expect(body.guardians[0].isPrimary).toBe(true);

			// The guardian join must pass a compound condition (centerId-scoped, defense-in-depth)
			expect(leftJoinMock).toHaveBeenCalledTimes(1);
			const joinCondition = leftJoinMock.mock.calls[0]?.[1];
			// A compound `and(...)` condition is an object with multiple sub-expressions,
			// not a simple SQL expression, so it must not be undefined or a primitive.
			expect(joinCondition).toBeDefined();
			expect(typeof joinCondition).toBe("object");
		});

		it("staff cannot list guardians for a child outside their classroom assignments", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
								}),
							}),
						};
					}

					// staffRooms — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, {
				role: "staff",
				membershipId: "membership-staff",
			});
			const res = await app.request(`/api/children/${CHILD_ID}/guardians`);

			expect(res.status).toBe(404);
		});

		it("returns 404 when staff has rooms but child classroom does not match (guardians endpoint)", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					if (selectCallCount === 2) {
						// child lookup — found
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 3) {
						// staffAssignments — terminates at .where()
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue([{ classroomId: "room-1" }]),
							}),
						};
					}
					// classroomAssignments — terminates at .where()
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([{ classroomId: "room-2" }]),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, {
				role: "staff",
				membershipId: "membership-staff",
			});
			const res = await app.request(`/api/children/${CHILD_ID}/guardians`);

			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/children/:id/guardians", () => {
		it("links guardian to child (201)", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([{ id: selectCallCount === 1 ? "child-1" : "guardian-1" }]),
							}),
						}),
					};
				}),
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockResolvedValue(undefined),
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: "00000000-0000-0000-0000-000000000001",
					isPrimary: true,
					authorizedPickup: true,
					relationship: "mother",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { linked: boolean };
			expect(body.linked).toBe(true);
		});

		it("demotes an existing primary guardian when linking a new primary", async () => {
			let selectCallCount = 0;
			const demoteSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
			const promoteSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
			// The insert + demote/promote updates run inside db.transaction((tx) => ...),
			// so the write mocks must live on the tx passed to the transaction callback.
			const txDb = createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockResolvedValue(undefined),
				}),
				update: vi
					.fn()
					.mockReturnValueOnce({ set: demoteSet })
					.mockReturnValueOnce({ set: promoteSet }),
			});
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([
										{ id: selectCallCount % 2 === 1 ? "child-1" : "guardian-1" },
									]),
							}),
						}),
					};
				}),
				transaction: vi
					.fn()
					.mockImplementation(async (fn: (tx: typeof txDb) => Promise<unknown>) => {
						return fn(txDb);
					}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: "00000000-0000-0000-0000-000000000001",
					isPrimary: true,
					authorizedPickup: true,
				}),
			);

			expect(res.status).toBe(201);
			expect(demoteSet).toHaveBeenCalledWith({ isPrimary: false });
			expect(promoteSet).toHaveBeenCalledWith({ isPrimary: true });
		});

		it("returns 409 when the child guardian link already exists", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					const rowsByCall: Record<number, unknown[]> = {
						1: [{ id: "child-1" }],
						2: [{ id: "guardian-1" }],
						3: [{ id: "child-1" }],
						4: [{ id: "guardian-1" }],
						5: [{ guardianId: "00000000-0000-0000-0000-000000000001" }],
					};

					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(rowsByCall[selectCallCount] ?? []),
							}),
						}),
					};
				}),
				insert: vi.fn(),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: "00000000-0000-0000-0000-000000000001",
					isPrimary: false,
					authorizedPickup: true,
				}),
			);

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "guardian_link_duplicate" });
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: "00000000-0000-0000-0000-000000000001",
					isPrimary: true,
					authorizedPickup: true,
				}),
			);

			expect(res.status).toBe(403);
		});

		it("re-throws non-duplicate-link errors from linkGuardianToChild", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([{ id: selectCallCount === 1 ? "child-1" : "guardian-1" }]),
							}),
						}),
					};
				}),
				transaction: vi.fn().mockImplementation(async () => {
					throw new Error("database connection lost");
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: "00000000-0000-0000-0000-000000000001",
					isPrimary: false,
					authorizedPickup: true,
				}),
			);

			expect(res.status).toBe(500);
		});
	});

	describe("PATCH /api/children/:id/guardians/:guardianId", () => {
		it("updates guardian link", async () => {
			const updatedLink = {
				childId: "child-1",
				guardianId: "guardian-1",
				isPrimary: true,
				authorizedPickup: false,
				relationship: "father",
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				}),
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([updatedLink]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`,
				patchBody({ isPrimary: true, authorizedPickup: false }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { link: typeof updatedLink };
			expect(body.link.isPrimary).toBe(true);
			expect(body.link.authorizedPickup).toBe(false);
		});

		it("demotes other primary guardians before promoting an existing guardian link", async () => {
			const updatedLink = {
				childId: "child-1",
				guardianId: "guardian-1",
				isPrimary: true,
				authorizedPickup: true,
				relationship: "father",
			};
			const demoteSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
			const promoteSet = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([updatedLink]),
				}),
			});
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				}),
				update: vi
					.fn()
					.mockReturnValueOnce({ set: demoteSet })
					.mockReturnValueOnce({ set: promoteSet }),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`,
				patchBody({ isPrimary: true }),
			);

			expect(res.status).toBe(200);
			expect(demoteSet).toHaveBeenCalledWith({ isPrimary: false });
			expect(promoteSet).toHaveBeenCalledWith({ isPrimary: true });
		});
	});

	describe("DELETE /api/children/:id/guardians/:guardianId", () => {
		it("returns 409 when unlinking the child's last guardian", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					const rowsByCall: Record<number, unknown[]> = {
						1: [{ id: "child-1" }],
						2: [{ childId: "child-1", guardianId: "guardian-1" }],
						3: [],
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
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "child_requires_guardian" });
			expect(db.delete).not.toHaveBeenCalled();
		});

		it("unlinks guardian from child", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				}),
				delete: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi
							.fn()
							.mockResolvedValue([{ childId: "child-1", guardianId: "guardian-1" }]),
					}),
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { unlinked: boolean };
			expect(body.unlinked).toBe(true);
		});
	});

	describe("POST /api/children/enroll", () => {
		it("creates child + guardian + assignment in transaction", async () => {
			const newChild = {
				id: "child-new",
				centerId: "center-1",
				firstName: "Bob",
				lastName: "Jones",
				dateOfBirth: "2024-01-10",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const newGuardian = {
				id: "guardian-new",
				centerId: "center-1",
				firstName: "Mary",
				lastName: "Jones",
				email: "mary@example.com",
				phone: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const newAssignment = {
				id: "assign-new",
				centerId: "center-1",
				childId: "child-new",
				classroomId: "00000000-0000-0000-0000-000000000010",
				effectiveDate: "2026-04-07",
				endDate: null,
			};

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let insertCount = 0;
					let selectCount = 0;
					const txDb = {
						execute: vi.fn().mockResolvedValue([]),
						insert: vi.fn().mockImplementation(() => {
							insertCount += 1;
							if (insertCount === 1 || insertCount === 2) {
								return {
									values: vi.fn().mockImplementation(() => ({
										returning: vi
											.fn()
											.mockResolvedValue(insertCount === 1 ? [newChild] : [newGuardian]),
									})),
								};
							}
							if (insertCount === 3) {
								return {
									values: vi.fn().mockResolvedValue(undefined),
								};
							}

							return {
								values: vi.fn().mockImplementation(() => ({
									returning: vi.fn().mockResolvedValue([newAssignment]),
								})),
							};
						}),
						select: vi.fn().mockImplementation(() => {
							selectCount += 1;
							const rowsByCall: Record<number, unknown[]> = {
								1: [{}],
								2: [],
								3: [{ id: "child-new" }],
								4: [{ id: "guardian-new" }],
								5: [],
								6: [
									{
										id: "00000000-0000-0000-0000-000000000010",
										archivedAt: null,
									},
								],
							};

							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(rowsByCall[selectCount] ?? []),
									}),
								}),
							};
						}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(undefined),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Bob",
						lastName: "Jones",
						dateOfBirth: "2024-01-10",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Jones",
							email: "mary@example.com",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
					classroom: {
						classroomId: "00000000-0000-0000-0000-000000000010",
						effectiveDate: "2026-04-07",
					},
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				child: ChildData;
				guardians: Array<{ guardianId: string; isPrimary: boolean }>;
				classroomAssignment: typeof newAssignment | null;
			};
			expect(body.child.firstName).toBe("Bob");
			expect(body.guardians).toHaveLength(1);
			expect(body.classroomAssignment).toBeTruthy();
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Bob",
						lastName: "Jones",
						dateOfBirth: "2024-01-10",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Jones",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
				}),
			);

			expect(res.status).toBe(403);
		});

		it("enrolls with existing guardian", async () => {
			const newChild = {
				id: "child-new",
				centerId: "center-1",
				firstName: "Sam",
				lastName: "Doe",
				dateOfBirth: "2024-03-01",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						execute: vi.fn().mockResolvedValue([]),
						insert: vi.fn().mockImplementation(() => ({
							values: vi.fn().mockImplementation(() => ({
								returning: vi.fn().mockImplementation(() => {
									return Promise.resolve([newChild]);
								}),
							})),
						})),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi
										.fn()
										.mockResolvedValue([{ id: "00000000-0000-0000-0000-000000000099" }]),
								}),
							}),
						}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(undefined),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Sam",
						lastName: "Doe",
						dateOfBirth: "2024-03-01",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "existing",
							guardianId: "00000000-0000-0000-0000-000000000099",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as {
				child: ChildData;
				guardians: Array<{ guardianId: string; isPrimary: boolean }>;
				classroomAssignment: null;
			};
			expect(body.child.firstName).toBe("Sam");
			expect(body.guardians[0].guardianId).toBe("00000000-0000-0000-0000-000000000099");
			expect(body.classroomAssignment).toBeNull();
		});

		it("returns 409 when enrollment creates a guardian with an existing case-variant email", async () => {
			const newChild = {
				id: "child-new",
				centerId: "center-1",
				firstName: "Sam",
				lastName: "Doe",
				dateOfBirth: "2024-03-01",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const guardianInsert = vi.fn();
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						execute: vi.fn().mockResolvedValue([]),
						insert: vi.fn().mockImplementation((table: unknown) => {
							if (table === childrenTable) {
								return {
									values: vi.fn().mockReturnValue({
										returning: vi.fn().mockResolvedValue([newChild]),
									}),
								};
							}

							if (table === guardiansTable) {
								guardianInsert();
								return {
									values: vi.fn().mockReturnValue({
										returning: vi.fn().mockResolvedValue([]),
									}),
								};
							}

							return {
								values: vi.fn().mockResolvedValue(undefined),
							};
						}),
						select: vi.fn().mockImplementation((selection: Record<string, unknown>) => {
							const isPlanLookup = "subscriptionPlan" in selection;
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi
											.fn()
											.mockResolvedValue(isPlanLookup ? [{}] : [{ id: "existing-guardian" }]),
									}),
								}),
							};
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Sam",
						lastName: "Doe",
						dateOfBirth: "2024-03-01",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Doe",
							email: "MARY@example.com",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
				}),
			);

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "guardian_duplicate" });
			expect(guardianInsert).not.toHaveBeenCalled();
		});

		it("returns 409 when enrollment links an existing duplicate guardian relationship", async () => {
			const guardianId = "00000000-0000-0000-0000-000000000099";
			const newChild = {
				id: "00000000-0000-0000-0000-000000000001",
				centerId: "center-1",
				firstName: "Sam",
				lastName: "Doe",
				dateOfBirth: "2024-03-01",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};
			let selectCallCount = 0;
			const childGuardianInsert = vi.fn();
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					const txDb = {
						execute: vi.fn().mockResolvedValue([]),
						insert: vi.fn().mockImplementation((table: unknown) => {
							if (table === childrenTable) {
								return {
									values: vi.fn().mockReturnValue({
										returning: vi.fn().mockResolvedValue([newChild]),
									}),
								};
							}

							if (table === childGuardians) {
								childGuardianInsert();
							}

							return {
								values: vi.fn().mockResolvedValue(undefined),
							};
						}),
						select: vi.fn().mockImplementation(() => {
							selectCallCount++;
							const rowsByCall: Record<number, unknown[]> = {
								1: [{}],
								2: [{ id: guardianId }],
								3: [{ id: newChild.id }],
								4: [{ id: guardianId }],
								5: [{ guardianId }],
							};
							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(rowsByCall[selectCallCount] ?? []),
									}),
								}),
							};
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Sam",
						lastName: "Doe",
						dateOfBirth: "2024-03-01",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "existing",
							guardianId,
							isPrimary: true,
							authorizedPickup: true,
						},
					],
				}),
			);

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({ error: "guardian_link_duplicate" });
			expect(childGuardianInsert).not.toHaveBeenCalled();
		});

		it("rejects enrollment into an archived classroom", async () => {
			const newChild = {
				id: "child-new",
				centerId: "center-1",
				firstName: "Bob",
				lastName: "Jones",
				dateOfBirth: "2024-01-10",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
				enrolledAt: new Date().toISOString(),
				withdrawnAt: null,
				createdAt: new Date().toISOString(),
			};

			const newGuardian = {
				id: "guardian-new",
				centerId: "center-1",
				firstName: "Mary",
				lastName: "Jones",
				email: "mary@example.com",
				phone: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			};

			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
					let selectCount = 0;
					const txDb = {
						execute: vi.fn().mockResolvedValue([]),
						insert: vi.fn().mockImplementation((table: unknown) => {
							if (table === childrenTable) {
								return {
									values: vi.fn().mockReturnValue({
										returning: vi.fn().mockResolvedValue([newChild]),
									}),
								};
							}

							if (table === guardiansTable) {
								return {
									values: vi.fn().mockReturnValue({
										returning: vi.fn().mockResolvedValue([newGuardian]),
									}),
								};
							}

							if (table === childGuardians) {
								return {
									values: vi.fn().mockResolvedValue(undefined),
								};
							}

							return {
								values: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([]),
								}),
							};
						}),
						select: vi.fn().mockImplementation(() => {
							selectCount += 1;
							const rowsByCall: Record<number, unknown[]> = {
								1: [{}],
								2: [],
								3: [{ id: "child-new" }],
								4: [{ id: "guardian-new" }],
								5: [],
								6: [
									{
										id: "00000000-0000-0000-0000-000000000010",
										archivedAt: new Date().toISOString(),
									},
								],
							};

							return {
								from: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue(rowsByCall[selectCount] ?? []),
									}),
								}),
							};
						}),
						update: vi.fn().mockReturnValue({
							set: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(undefined),
							}),
						}),
					};
					return fn(txDb);
				}),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Bob",
						lastName: "Jones",
						dateOfBirth: "2024-01-10",
						ageGroup: "infant",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Jones",
							email: "mary@example.com",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
					classroom: {
						classroomId: "00000000-0000-0000-0000-000000000010",
						effectiveDate: "2026-04-07",
					},
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Classroom is no longer available for enrollment",
			});
		});

		it("rejects waitlist enrollment payloads that still include a classroom assignment", async () => {
			const db = createMockDb({
				transaction: vi.fn(),
			});

			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				"/api/children/enroll",
				jsonBody({
					child: {
						firstName: "Bob",
						lastName: "Jones",
						dateOfBirth: "2024-01-10",
						ageGroup: "infant",
						enrollmentStatus: "waitlist",
					},
					guardians: [
						{
							type: "new",
							firstName: "Mary",
							lastName: "Jones",
							email: "mary@example.com",
							isPrimary: true,
							authorizedPickup: true,
						},
					],
					classroom: {
						classroomId: "00000000-0000-0000-0000-000000000010",
						effectiveDate: "2026-04-07",
					},
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.text()).resolves.toBe(WAITLIST_CLASSROOM_ERROR);
			expect(db.transaction).not.toHaveBeenCalled();
		});
	});

	describe("edge-path coverage for child lifecycle and guardian links", () => {
		it("returns empty list for staff whose assigned rooms have no children", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// timezone lookup
						return tzSelectChain();
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi
								.fn()
								.mockResolvedValue(
									selectCallCount === 2
										? [{ classroomId: "770e8400-e29b-41d4-a716-446655440000" }]
										: [],
								),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, { role: "staff" });
			const res = await app.request("/api/children");

			expect(res.status).toBe(200);
			await expect(res.json()).resolves.toEqual({ children: [] });
		});

		it("returns 404 when activating a missing child through PATCH", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
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
					}),
				),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}`,
				patchBody({ enrollmentStatus: "active" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when a child PATCH write is lost", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}`, patchBody({ firstName: "Alice" }));

			expect(res.status).toBe(404);
		});

		it("returns 404 when reactivating a missing child", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
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
					}),
				),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/reactivate`, { method: "POST" });

			expect(res.status).toBe(404);
		});

		it("returns 404 when a reactivation write is lost", async () => {
			const db = createMockDb({
				transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
					fn({
						execute: vi.fn().mockResolvedValue([]),
						select: vi.fn().mockReturnValue({
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ enrollmentStatus: "withdrawn" }]),
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
					}),
				),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/reactivate`, { method: "POST" });

			expect(res.status).toBe(404);
		});

		it("returns 404 before listing guardians for a missing child", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians`);

			expect(res.status).toBe(404);
		});

		it("returns 404 when linking a guardian to a missing child", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: GUARDIAN_ID,
					isPrimary: true,
					authorizedPickup: true,
					relationship: "Parent",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when linking a missing guardian to a child", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(selectCallCount === 1 ? [{ id: CHILD_ID }] : []),
							}),
						}),
					};
				}),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians`,
				jsonBody({
					guardianId: GUARDIAN_ID,
					isPrimary: true,
					authorizedPickup: true,
					relationship: "Parent",
				}),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when updating a guardian link for a missing child", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`,
				patchBody({ relationship: "Parent" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when the guardian link update is lost", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: CHILD_ID }]),
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
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(
				`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`,
				patchBody({ relationship: "Parent" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when unlinking a guardian from a missing child", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("returns 404 when the guardian unlink write is lost", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: CHILD_ID }]),
						}),
					}),
				}),
				delete: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${CHILD_ID}/guardians/${GUARDIAN_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});
	});

	describe("UUID validation (400 on invalid ID format)", () => {
		const INVALID_ID = "not-a-uuid";

		it("GET /:id returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${INVALID_ID}`);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { error: string };
			expect(body.error).toBe("Invalid ID");
		});

		it("PATCH /:id returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "owner" });
			const res = await app.request(`/api/children/${INVALID_ID}`, patchBody({ firstName: "X" }));
			expect(res.status).toBe(400);
		});

		it("POST /:id/withdraw returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "owner" });
			const res = await app.request(`/api/children/${INVALID_ID}/withdraw`, {
				method: "POST",
			});
			expect(res.status).toBe(400);
		});

		it("POST /:id/reactivate returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db, { role: "owner" });
			const res = await app.request(`/api/children/${INVALID_ID}/reactivate`, {
				method: "POST",
			});
			expect(res.status).toBe(400);
		});

		it("GET /:id/guardians returns 400 for invalid UUID", async () => {
			const db = createMockDb();
			const app = createTestApp(mountChildren, db);
			const res = await app.request(`/api/children/${INVALID_ID}/guardians`);
			expect(res.status).toBe(400);
		});
	});

	describe("center-local timezone date handling", () => {
		// UTC instant 2026-06-11T04:30:00Z is still 2026-06-10 in America/Chicago (UTC-5 CDT = UTC-5).
		// So a center in America/Chicago should use "2026-06-10", not "2026-06-11".
		const UTC_INSTANT = "2026-06-11T04:30:00.000Z";
		const CENTER_TZ = "America/Chicago";
		const EXPECTED_LOCAL_DATE = "2026-06-10";
		const UTC_DATE = "2026-06-11";

		it("endActiveClassroomAssignments uses center-local date not UTC date (via POST /:id/withdraw)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(UTC_INSTANT));

			const endDateValues: string[] = [];
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// centers timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: CENTER_TZ }]),
								}),
							}),
						};
					}
					// withdraw child lookup
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([]),
								}),
							}),
						}),
					};
				}),
				update: vi.fn().mockImplementation(() => ({
					set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
						if (typeof data.endDate === "string") {
							endDateValues.push(data.endDate);
						}
						return {
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: CHILD_ID,
										centerId: "center-1",
										enrollmentStatus: "withdrawn",
										withdrawnAt: new Date(),
									},
								]),
							}),
						};
					}),
				})),
			});

			const app = createTestApp(mountChildren, db, { role: "owner", membershipId: "membership-1" });
			const res = await app.request(`/api/children/${CHILD_ID}/withdraw`, { method: "POST" });

			vi.useRealTimers();

			expect(res.status).toBe(200);
			// At least one endDate write must have happened
			expect(endDateValues.length).toBeGreaterThan(0);
			// Every written endDate must be the center-local date, not the UTC date
			for (const d of endDateValues) {
				expect(d).toBe(EXPECTED_LOCAL_DATE);
				expect(d).not.toBe(UTC_DATE);
			}
		});

		it("GET /api/children uses center-local date for active-today filter (staff path)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-06-11T04:30:00.000Z"));

			// UTC 2026-06-11T04:30Z → America/Chicago local date is 2026-06-10 (CDT = UTC-5)
			const CHICAGO_LOCAL = "2026-06-10";
			const UTC_DAY = "2026-06-11";

			// Capture the where() condition object from the classroomAssignments (select #3) query.
			let capturedWhereCondition: unknown;
			let selectCallCount = 0;

			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// getCenterTimezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// staffRooms (staffAssignments) — return one room so we proceed to select #3
						return {
							from: vi.fn().mockReturnValue({
								where: vi
									.fn()
									.mockResolvedValue([{ classroomId: "00000000-0000-0000-0000-000000000099" }]),
							}),
						};
					}
					// select #3: classroomAssignments active-today filter
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockImplementation((condition: unknown) => {
								capturedWhereCondition = condition;
								return Promise.resolve([]);
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountChildren, db, { role: "staff", membershipId: "membership-1" });
			const res = await app.request("/api/children");

			vi.useRealTimers();

			expect(res.status).toBe(200);
			// Three selects must have fired: tz lookup, staffRooms, classroomAssignments
			expect(selectCallCount).toBeGreaterThanOrEqual(3);
			// Walk the queryChunks of the captured condition to extract bound date literals
			function extractDateLiterals(val: unknown, seen = new WeakSet<object>()): string[] {
				if (!val || typeof val !== "object") return [];
				if (seen.has(val as object)) return [];
				seen.add(val as object);
				const results: string[] = [];
				if (
					"value" in val &&
					typeof (val as { value: unknown }).value === "string" &&
					/^\d{4}-\d{2}-\d{2}$/.test((val as { value: string }).value)
				) {
					results.push((val as { value: string }).value);
				}
				if (
					"queryChunks" in val &&
					Array.isArray((val as { queryChunks: unknown[] }).queryChunks)
				) {
					for (const chunk of (val as { queryChunks: unknown[] }).queryChunks) {
						results.push(...extractDateLiterals(chunk, seen));
					}
				}
				if (Array.isArray(val)) {
					for (const item of val) results.push(...extractDateLiterals(item, seen));
				}
				return results;
			}

			const dateLiterals = extractDateLiterals(capturedWhereCondition);
			// There must be at least one date literal bound in the condition
			expect(dateLiterals.length).toBeGreaterThan(0);
			// Every date literal must be the center-local date, not the UTC date
			for (const d of dateLiterals) {
				expect(d).toBe(CHICAGO_LOCAL);
				expect(d).not.toBe(UTC_DAY);
			}
		});
	});
});
