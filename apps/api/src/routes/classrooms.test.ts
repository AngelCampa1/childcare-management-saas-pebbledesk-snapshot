import { toLocalDay } from "@pebbledesk/shared";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

// Mock the auth middleware to be pass-through in tests
// The test setup already injects userId, centerId, role via context
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
const { classroomsRoutes } = await import("./classrooms.js");

interface ClassroomData {
	id: string;
	centerId: string;
	name: string;
	ageGroup: string;
	maxCapacity: number;
	minRatioStaff: number;
	minRatioChildren: number;
	createdAt: string;
	archivedAt: string | null;
	childCount?: number;
	staffCount?: number;
}

interface AssignmentData {
	id: string;
	centerId: string;
	childId?: string;
	membershipId?: string;
	classroomId: string;
	effectiveDate: string;
	endDate: string | null;
}

function mountClassrooms(app: Hono<AppEnv>) {
	app.route("/api/classrooms", classroomsRoutes);
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

function tzSelectChain(timezone = "UTC") {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue([{ timezone }]),
			}),
		}),
	};
}

describe("classrooms routes", () => {
	const CLASSROOM_ID = "550e8400-e29b-41d4-a716-446655440000";
	const CHILD_ID = "660e8400-e29b-41d4-a716-446655440000";
	const MEMBERSHIP_ID = "770e8400-e29b-41d4-a716-446655440000";

	it.each([
		["GET", "/api/classrooms", undefined],
		["GET", `/api/classrooms/${CLASSROOM_ID}`, undefined],
		[
			"POST",
			"/api/classrooms",
			jsonBody({
				name: "Sunshine Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
			}),
		],
		["PATCH", `/api/classrooms/${CLASSROOM_ID}`, patchBody({ name: "Updated Room" })],
		["POST", `/api/classrooms/${CLASSROOM_ID}/archive`, { method: "POST" }],
		["POST", `/api/classrooms/${CLASSROOM_ID}/unarchive`, { method: "POST" }],
		["GET", `/api/classrooms/${CLASSROOM_ID}/children`, undefined],
		["GET", `/api/classrooms/${CLASSROOM_ID}/staff`, undefined],
		[
			"POST",
			`/api/classrooms/${CLASSROOM_ID}/children`,
			jsonBody({ childId: CHILD_ID, effectiveDate: "2026-04-01" }),
		],
		["DELETE", `/api/classrooms/${CLASSROOM_ID}/children/${CHILD_ID}`, { method: "DELETE" }],
		[
			"POST",
			`/api/classrooms/${CLASSROOM_ID}/staff`,
			jsonBody({ membershipId: MEMBERSHIP_ID, effectiveDate: "2026-04-01" }),
		],
		["DELETE", `/api/classrooms/${CLASSROOM_ID}/staff/${MEMBERSHIP_ID}`, { method: "DELETE" }],
	] as const)("rejects %s classroom route requests without a center membership", async (_method, path, init) => {
		const db = createMockDb();
		const app = createTestApp(mountClassrooms, db, { centerId: "" });
		const res = await app.request(path, init);

		expect(res.status).toBe(403);
	});

	describe("GET /api/classrooms", () => {
		it("returns classrooms list", async () => {
			const mockClassrooms = [
				{
					id: "classroom-1",
					centerId: "center-1",
					name: "Sunshine Room",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 4,
					createdAt: new Date(),
					archivedAt: null,
					childCount: 3,
					staffCount: 1,
				},
			];

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue(mockClassrooms),
								}),
							}),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classrooms: ClassroomData[] };
			expect(body.classrooms).toHaveLength(1);
			expect(body.classrooms[0].name).toBe("Sunshine Room");
			expect(body.classrooms[0].childCount).toBe(3);
			expect(body.classrooms[0].staffCount).toBe(1);
		});

		it("allows staff to list assigned classrooms for attendance metadata", async () => {
			const mockClassrooms = [
				{
					id: "classroom-1",
					centerId: "center-1",
					name: "Sunshine Room",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 4,
					createdAt: new Date(),
					archivedAt: null,
					childCount: 3,
					staffCount: 1,
				},
			];

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockResolvedValue(mockClassrooms),
								}),
							}),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db, {
				role: "staff",
				membershipId: "membership-1",
			});
			const res = await app.request("/api/classrooms");

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classrooms: ClassroomData[] };
			expect(body.classrooms).toHaveLength(1);
		});

		it("applies archived and age-group filters", async () => {
			const groupBy = vi.fn().mockResolvedValue([]);
			const where = vi.fn().mockReturnValue({ groupBy });
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({ where }),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms?includeArchived=true&ageGroup=infant");

			expect(res.status).toBe(200);
			expect(where).toHaveBeenCalledOnce();
			expect(groupBy).toHaveBeenCalledOnce();
		});

		it("center-scopes assignment count joins", async () => {
			const joinConditions: unknown[] = [];
			const groupBy = vi.fn().mockResolvedValue([]);
			const where = vi.fn().mockReturnValue({ groupBy });
			const secondLeftJoin = vi.fn().mockImplementation((_table, condition) => {
				joinConditions.push(condition);
				return { where };
			});
			const firstLeftJoin = vi.fn().mockImplementation((_table, condition) => {
				joinConditions.push(condition);
				return { leftJoin: secondLeftJoin };
			});
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: firstLeftJoin,
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms");

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(joinConditions[0])).toContain("center_id");
			expect(sqlConditionColumnNames(joinConditions[1])).toContain("center_id");
			expect(sqlConditionColumnNames(joinConditions[0])).toContain("effective_date");
			expect(sqlConditionColumnNames(joinConditions[1])).toContain("effective_date");
		});

		it("rejects invalid age-group filters before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms?ageGroup=babies");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});
	});

	describe("POST /api/classrooms", () => {
		it("creates a classroom with valid input", async () => {
			const newClassroom = {
				id: "classroom-1",
				centerId: "center-1",
				name: "Butterfly Room",
				ageGroup: "preschool",
				maxCapacity: 20,
				minRatioStaff: 1,
				minRatioChildren: 10,
				createdAt: new Date(),
				archivedAt: null,
			};

			const db = createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newClassroom]),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms",
				jsonBody({
					name: "Butterfly Room",
					ageGroup: "preschool",
					maxCapacity: 20,
					minRatioStaff: 1,
					minRatioChildren: 10,
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { classroom: ClassroomData };
			expect(body.classroom.name).toBe("Butterfly Room");
		});

		it("rejects staff role (403)", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db, { role: "staff" });
			const res = await app.request(
				"/api/classrooms",
				jsonBody({
					name: "Butterfly Room",
					ageGroup: "preschool",
					maxCapacity: 20,
					minRatioStaff: 1,
					minRatioChildren: 10,
				}),
			);

			expect(res.status).toBe(403);
		});

		it("returns an internal error when creation returns no classroom", async () => {
			const db = createMockDb({
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms",
				jsonBody({
					name: "Butterfly Room",
					ageGroup: "preschool",
					maxCapacity: 20,
					minRatioStaff: 1,
					minRatioChildren: 10,
				}),
			);

			expect(res.status).toBe(500);
		});
	});

	describe("PATCH /api/classrooms/:id", () => {
		it("updates a classroom", async () => {
			const updated = {
				id: "classroom-1",
				centerId: "center-1",
				name: "Updated Room",
				ageGroup: "toddler",
				maxCapacity: 15,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: null,
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

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}`,
				patchBody({ name: "Updated Room" }),
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classroom: ClassroomData };
			expect(body.classroom.name).toBe("Updated Room");
		});

		it("updates all mutable classroom fields", async () => {
			const set = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([
						{
							id: CLASSROOM_ID,
							centerId: "center-1",
							name: "Older Toddlers",
							ageGroup: "toddler",
							maxCapacity: 18,
							minRatioStaff: 2,
							minRatioChildren: 9,
							createdAt: new Date(),
							archivedAt: null,
						},
					]),
				}),
			});
			const db = createMockDb({
				update: vi.fn().mockReturnValue({ set }),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}`,
				patchBody({
					name: "Older Toddlers",
					ageGroup: "toddler",
					maxCapacity: 18,
					minRatioStaff: 2,
					minRatioChildren: 9,
				}),
			);

			expect(res.status).toBe(200);
			expect(set).toHaveBeenCalledWith({
				name: "Older Toddlers",
				ageGroup: "toddler",
				maxCapacity: 18,
				minRatioStaff: 2,
				minRatioChildren: 9,
			});
		});
	});

	describe("POST /api/classrooms/:id/archive", () => {
		it("sets archivedAt", async () => {
			const archived = {
				id: "classroom-1",
				centerId: "center-1",
				name: "Old Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: new Date(),
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([archived]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const archiveRes = await app.request(`/api/classrooms/${CLASSROOM_ID}/archive`, {
				method: "POST",
			});

			expect(archiveRes.status).toBe(200);
			const body = (await archiveRes.json()) as { classroom: ClassroomData };
			expect(body.classroom.archivedAt).toBeTruthy();
		});

		it("clears live attendance and assignment state when archiving", async () => {
			const archived = {
				id: "classroom-1",
				centerId: "center-1",
				name: "Old Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: new Date(),
			};
			const archiveSet = vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([archived]),
				}),
			});
			const childCheckInSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const staffCheckInSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const childAssignmentSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const staffAssignmentSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
			const update = vi
				.fn()
				.mockReturnValueOnce({ set: archiveSet })
				.mockReturnValueOnce({ set: childCheckInSet })
				.mockReturnValueOnce({ set: staffCheckInSet })
				.mockReturnValueOnce({ set: childAssignmentSet })
				.mockReturnValueOnce({ set: staffAssignmentSet });
			// Pin the center timezone so the assignment endDate is deterministic:
			// the route derives endDate via toLocalDay(archivedAt, tz), which
			// otherwise diverges from a UTC-derived date during the evening in
			// western timezones and flakes this test.
			const CENTER_TZ = "America/Chicago";
			const db = createMockDb({
				update,
				select: vi.fn().mockReturnValue(tzSelectChain(CENTER_TZ)),
			});

			const app = createTestApp(mountClassrooms, db, { membershipId: "membership-1" });
			const archiveRes = await app.request(`/api/classrooms/${CLASSROOM_ID}/archive`, {
				method: "POST",
			});

			expect(archiveRes.status).toBe(200);
			expect(update).toHaveBeenCalledTimes(5);
			expect(archiveSet).toHaveBeenCalledWith({ archivedAt: expect.any(Date) });
			expect(childCheckInSet).toHaveBeenCalledWith({
				checkedOutAt: expect.any(Date),
				checkedOutBy: "membership-1",
			});
			const childCheckInUpdate = childCheckInSet.mock.calls[0]?.[0] as
				| { checkedOutAt: Date }
				| undefined;
			expect(childCheckInUpdate?.checkedOutAt).toBeInstanceOf(Date);
			const checkedOutAt = childCheckInUpdate?.checkedOutAt as Date;
			const expectedEndDate = toLocalDay(checkedOutAt, CENTER_TZ);
			expect(staffCheckInSet).toHaveBeenCalledWith({ clockedOutAt: expect.any(Date) });
			expect(childAssignmentSet).toHaveBeenCalledWith({ endDate: expectedEndDate });
			expect(staffAssignmentSet).toHaveBeenCalledWith({ endDate: expectedEndDate });
		});
	});

	describe("POST /api/classrooms/:id/unarchive", () => {
		it("clears archivedAt", async () => {
			const unarchived = {
				id: "classroom-1",
				centerId: "center-1",
				name: "Old Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: null,
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([unarchived]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/unarchive`, {
				method: "POST",
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classroom: ClassroomData };
			expect(body.classroom.archivedAt).toBeNull();
		});
	});

	describe("GET /api/classrooms/:id", () => {
		it("returns a single classroom with counts", async () => {
			const mockClassroom = {
				id: CLASSROOM_ID,
				centerId: "center-1",
				name: "Sunshine Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: null,
				childCount: 5,
				staffCount: 2,
			};

			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([mockClassroom]),
									}),
								}),
							}),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classroom: ClassroomData };
			expect(body.classroom.childCount).toBe(5);
			expect(body.classroom.staffCount).toBe(2);
		});

		it("center-scopes assignment count joins", async () => {
			const joinConditions: unknown[] = [];
			const limit = vi.fn().mockResolvedValue([
				{
					id: CLASSROOM_ID,
					centerId: "center-1",
					name: "Sunshine Room",
					ageGroup: "toddler",
					maxCapacity: 12,
					minRatioStaff: 1,
					minRatioChildren: 4,
					createdAt: new Date(),
					archivedAt: null,
					childCount: 5,
					staffCount: 2,
				},
			]);
			const groupBy = vi.fn().mockReturnValue({ limit });
			const where = vi.fn().mockReturnValue({ groupBy });
			const secondLeftJoin = vi.fn().mockImplementation((_table, condition) => {
				joinConditions.push(condition);
				return { where };
			});
			const firstLeftJoin = vi.fn().mockImplementation((_table, condition) => {
				joinConditions.push(condition);
				return { leftJoin: secondLeftJoin };
			});
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: firstLeftJoin,
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(joinConditions[0])).toContain("center_id");
			expect(sqlConditionColumnNames(joinConditions[1])).toContain("center_id");
			expect(sqlConditionColumnNames(joinConditions[0])).toContain("effective_date");
			expect(sqlConditionColumnNames(joinConditions[1])).toContain("effective_date");
		});

		it("returns 400 for malformed classroom identifiers", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms/classroom-1");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("returns 404 for non-existent classroom", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						leftJoin: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									groupBy: vi.fn().mockReturnValue({
										limit: vi.fn().mockResolvedValue([]),
									}),
								}),
							}),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms/00000000-0000-0000-0000-000000000099");

			expect(res.status).toBe(404);
		});

		it("allows staff to view a classroom they are assigned to", async () => {
			const mockClassroom = {
				id: CLASSROOM_ID,
				centerId: "center-1",
				name: "Sunshine Room",
				ageGroup: "toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 4,
				createdAt: new Date(),
				archivedAt: null,
				childCount: 3,
				staffCount: 1,
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					if (selectCallCount === 1) {
						// staff assignment check — returns a matching assignment
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "assign-1" }]),
								}),
							}),
						};
					}
					// main classroom query
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockReturnValue({
										groupBy: vi.fn().mockReturnValue({
											limit: vi.fn().mockResolvedValue([mockClassroom]),
										}),
									}),
								}),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountClassrooms, db, {
				role: "staff",
				membershipId: MEMBERSHIP_ID,
			});
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { classroom: ClassroomData };
			expect(body.classroom.name).toBe("Sunshine Room");
		});

		it("returns 404 for staff trying to view a classroom they are not assigned to", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db, {
				role: "staff",
				membershipId: MEMBERSHIP_ID,
			});
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`);

			expect(res.status).toBe(404);
		});

		it("rejects unknown roles with 403", async () => {
			const db = createMockDb();
			// biome-ignore lint/suspicious/noExplicitAny: test forces a non-standard role
			const app = createTestApp(mountClassrooms, db, { role: "guest" as any });
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`);

			expect(res.status).toBe(403);
		});
	});

	describe("GET /api/classrooms/:id/children", () => {
		it("returns assigned children", async () => {
			const assigned = [
				{
					assignmentId: "assign-1",
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-01-01",
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
				},
			];

			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(tzSelectChain())
					.mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								where: vi.fn().mockResolvedValue(assigned),
							}),
						}),
					}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/children`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { children: typeof assigned };
			expect(body.children).toHaveLength(1);
			expect(body.children[0].firstName).toBe("Alice");
		});

		it("center-scopes the assigned child join", async () => {
			let childJoinCondition: unknown;
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(tzSelectChain())
					.mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockImplementation((_table, condition) => {
								childJoinCondition = condition;
								return {
									where: vi.fn().mockResolvedValue([]),
								};
							}),
						}),
					}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/children`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(childJoinCondition)).toContain("center_id");
		});

		it("returns 400 for malformed classroom identifiers when listing children", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms/classroom-1/children");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});
	});

	describe("GET /api/classrooms/:id/staff", () => {
		it("returns assigned staff", async () => {
			const assigned = [
				{
					assignmentId: "assign-1",
					membershipId: "membership-1",
					effectiveDate: "2026-01-01",
					role: "staff",
					userName: "Jane Doe",
					userEmail: "jane@example.com",
				},
			];

			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(tzSelectChain())
					.mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({
								leftJoin: vi.fn().mockReturnValue({
									where: vi.fn().mockResolvedValue(assigned),
								}),
							}),
						}),
					}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/staff`);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { staff: typeof assigned };
			expect(body.staff).toHaveLength(1);
			expect(body.staff[0].userName).toBe("Jane Doe");
		});

		it("center-scopes the assigned membership join", async () => {
			let membershipJoinCondition: unknown;
			const db = createMockDb({
				select: vi
					.fn()
					.mockReturnValueOnce(tzSelectChain())
					.mockReturnValue({
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockImplementationOnce((_table, condition) => {
								membershipJoinCondition = condition;
								return {
									leftJoin: vi.fn().mockReturnValue({
										where: vi.fn().mockResolvedValue([]),
									}),
								};
							}),
						}),
					}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/staff`);

			expect(res.status).toBe(200);
			expect(sqlConditionColumnNames(membershipJoinCondition)).toContain("center_id");
		});

		it("returns 400 for malformed classroom identifiers when listing staff", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms/classroom-1/staff");

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});
	});

	describe("POST /api/classrooms/:id/children — assign child", () => {
		it("assigns a child and ends existing assignment", async () => {
			const newAssignment = {
				id: "assign-2",
				centerId: "center-1",
				childId: "00000000-0000-0000-0000-000000000001",
				classroomId: "classroom-1",
				effectiveDate: "2026-04-01",
				endDate: null,
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// classroom lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// child lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "child-1", enrollmentStatus: "active" }]),
								}),
							}),
						};
					}
					// future-assignment check — none found
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([]),
						}),
					};
				}),
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue([]),
					}),
				}),
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([newAssignment]),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { assignment: AssignmentData };
			expect(body.assignment.childId).toBe("00000000-0000-0000-0000-000000000001");
		});

		it("rejects invalid child assignment effective dates before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "tomorrow",
				}),
			);

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("rejects assigning a non-active child to a classroom", async () => {
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
										selectCallCount === 1
											? [{ id: "classroom-1", archivedAt: null }]
											: [{ id: "child-1", enrollmentStatus: "waitlist" }],
									),
							}),
						}),
					};
				}),
				update: vi.fn(),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Only active children can be assigned to classrooms",
			});
			expect(db.update).not.toHaveBeenCalled();
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects assigning a child to an archived classroom", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: "classroom-1", archivedAt: new Date().toISOString() }]),
						}),
					}),
				}),
				update: vi.fn(),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Cannot assign children to an archived classroom",
			});
			expect(db.update).not.toHaveBeenCalled();
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("returns 409 when child has a future-dated assignment", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// classroom lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						// child lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "child-1", enrollmentStatus: "active" }]),
								}),
							}),
						};
					}
					// future-assignment check — one future assignment found
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([{ id: "assign-future" }]),
						}),
					};
				}),
				update: vi.fn(),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({
					childId: "00000000-0000-0000-0000-000000000001",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(409);
			await expect(res.json()).resolves.toEqual({
				error: "Child has a future-dated classroom assignment; resolve it before reassigning",
			});
			expect(db.update).not.toHaveBeenCalled();
			expect(db.insert).not.toHaveBeenCalled();
		});
	});

	describe("DELETE /api/classrooms/:id/children/:childId", () => {
		it("ends child assignment", async () => {
			const ended = {
				id: "assign-1",
				centerId: "center-1",
				childId: "00000000-0000-0000-0000-000000000001",
				classroomId: "classroom-1",
				effectiveDate: "2026-01-01",
				endDate: "2026-04-07",
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([ended]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children/00000000-0000-0000-0000-000000000001`,
				{ method: "DELETE" },
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { assignment: AssignmentData };
			expect(body.assignment.endDate).toBeTruthy();
		});

		it("returns 400 for malformed classroom id", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms/not-a-uuid/children/00000000-0000-0000-0000-000000000001",
				{ method: "DELETE" },
			);

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("returns 400 for malformed childId", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/children/not-a-uuid`, {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});
	});

	describe("POST /api/classrooms/:id/staff — assign staff", () => {
		it("assigns a staff member", async () => {
			const newAssignment = {
				id: "sassign-1",
				centerId: "center-1",
				membershipId: "00000000-0000-0000-0000-000000000002",
				classroomId: "classroom-1",
				effectiveDate: "2026-04-01",
				endDate: null,
			};

			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi
										.fn()
										.mockResolvedValue([
											{ id: "membership-2", acceptedAt: new Date("2026-04-01T08:00:00.000Z") },
										]),
								}),
							}),
						};
					}
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
						returning: vi.fn().mockResolvedValue([newAssignment]),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(201);
			const body = (await res.json()) as { assignment: AssignmentData };
			expect(body.assignment.membershipId).toBe("00000000-0000-0000-0000-000000000002");
		});

		it("rejects invalid staff assignment effective dates before querying", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "tomorrow",
				}),
			);

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("rejects invited memberships that have not been accepted yet", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "membership-2", acceptedAt: null }]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([]),
							}),
						}),
					};
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: "Staff member must accept the center invitation before assignment",
			});
		});

		it("rejects deactivated memberships when assigning staff to a classroom", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue(
									selectCallCount === 1
										? [{ id: "classroom-1", archivedAt: null }]
										: [
												{
													id: "membership-2",
													acceptedAt: new Date("2026-04-01T00:00:00.000Z"),
													deactivatedAt: new Date("2026-04-10T00:00:00.000Z"),
												},
											],
								),
							}),
						}),
					};
				}),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: "Staff member is no longer active in this center",
			});
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects assigning staff to an archived classroom", async () => {
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ id: "classroom-1", archivedAt: new Date().toISOString() }]),
						}),
					}),
				}),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			await expect(res.json()).resolves.toEqual({
				error: "Cannot assign staff to an archived classroom",
			});
			expect(db.insert).not.toHaveBeenCalled();
		});

		it("rejects assigning staff already active in the classroom", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ id: "classroom-1" }]),
								}),
							}),
						};
					}
					if (selectCallCount === 2) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi
										.fn()
										.mockResolvedValue([
											{ id: "membership-2", acceptedAt: new Date("2026-04-01T08:00:00.000Z") },
										]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ id: "existing-assignment" }]),
							}),
						}),
					};
				}),
				insert: vi.fn(),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({
					membershipId: "00000000-0000-0000-0000-000000000002",
					effectiveDate: "2026-04-01",
				}),
			);

			expect(res.status).toBe(400);
			expect(await res.json()).toEqual({
				error: "Staff member is already assigned to this classroom",
			});
			expect(db.insert).not.toHaveBeenCalled();
		});
	});

	describe("DELETE /api/classrooms/:id/staff/:membershipId", () => {
		it("ends staff assignment", async () => {
			const ended = {
				id: "sassign-1",
				centerId: "center-1",
				membershipId: "00000000-0000-0000-0000-000000000002",
				classroomId: "classroom-1",
				effectiveDate: "2026-01-01",
				endDate: "2026-04-07",
			};

			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([ended]),
						}),
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff/00000000-0000-0000-0000-000000000002`,
				{ method: "DELETE" },
			);

			expect(res.status).toBe(200);
			const body = (await res.json()) as { assignment: AssignmentData };
			expect(body.assignment.endDate).toBeTruthy();
		});

		it("returns 400 for malformed classroom id", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms/not-a-uuid/staff/00000000-0000-0000-0000-000000000002",
				{ method: "DELETE" },
			);

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("returns 400 for malformed membershipId", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/staff/not-a-uuid`, {
				method: "DELETE",
			});

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});
	});

	describe("edge-path coverage for classroom lifecycle and assignments", () => {
		it("rejects classroom list requests for unsupported roles", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db, { role: "guardian" as never });
			const res = await app.request("/api/classrooms");

			expect(res.status).toBe(403);
		});

		it("rejects staff classroom list requests without a membership", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db, { role: "staff", membershipId: "" });
			const res = await app.request("/api/classrooms");

			expect(res.status).toBe(403);
		});

		it("returns 400 for malformed classroom ids on update", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request("/api/classrooms/not-a-uuid", patchBody({ name: "Room" }));

			expect(res.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("returns 404 when a classroom update is lost", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}`, patchBody({ name: "Room" }));

			expect(res.status).toBe(404);
		});

		it("returns 400 for malformed archive and unarchive ids", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);

			const archiveRes = await app.request("/api/classrooms/not-a-uuid/archive", {
				method: "POST",
			});
			const unarchiveRes = await app.request("/api/classrooms/not-a-uuid/unarchive", {
				method: "POST",
			});

			expect(archiveRes.status).toBe(400);
			expect(unarchiveRes.status).toBe(400);
			expect(db.update).not.toHaveBeenCalled();
		});

		it("returns 404 when archive and unarchive writes are lost", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);

			const archiveRes = await app.request(`/api/classrooms/${CLASSROOM_ID}/archive`, {
				method: "POST",
			});
			const unarchiveRes = await app.request(`/api/classrooms/${CLASSROOM_ID}/unarchive`, {
				method: "POST",
			});

			expect(archiveRes.status).toBe(404);
			expect(unarchiveRes.status).toBe(404);
		});

		it("returns 400 for malformed child assignment classroom ids", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms/not-a-uuid/children",
				jsonBody({ childId: CHILD_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("returns 404 when assigning a child to a missing classroom", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({ childId: CHILD_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when assigning a missing child to a classroom", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue(selectCallCount === 1 ? [{ id: CLASSROOM_ID }] : []),
							}),
						}),
					};
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({ childId: CHILD_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 500 when child assignment creation returns no row", async () => {
			let selectCallCount = 0;
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
											? [{ id: CLASSROOM_ID, archivedAt: null }]
											: [{ id: CHILD_ID, enrollmentStatus: "active" }],
									),
							}),
						}),
					};
				}),
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockResolvedValue(undefined),
					}),
				}),
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/children`,
				jsonBody({ childId: CHILD_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(500);
		});

		it("returns 404 when ending a missing child assignment", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/children/${CHILD_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});

		it("returns 400 for malformed staff assignment classroom ids", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				"/api/classrooms/not-a-uuid/staff",
				jsonBody({ membershipId: MEMBERSHIP_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(400);
			expect(db.select).not.toHaveBeenCalled();
		});

		it("returns 404 when assigning staff to a missing classroom", async () => {
			const db = createMockDb();
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({ membershipId: MEMBERSHIP_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 404 when assigning a missing staff member to a classroom", async () => {
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount += 1;
					return {
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue(selectCallCount === 1 ? [{ id: CLASSROOM_ID }] : []),
							}),
						}),
					};
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({ membershipId: MEMBERSHIP_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(404);
		});

		it("returns 500 when staff assignment creation returns no row", async () => {
			let selectCallCount = 0;
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
											? [{ id: CLASSROOM_ID }]
											: selectCallCount === 2
												? [{ id: MEMBERSHIP_ID, acceptedAt: new Date("2026-04-01T00:00:00Z") }]
												: [],
									),
							}),
						}),
					};
				}),
				insert: vi.fn().mockReturnValue({
					values: vi.fn().mockReturnValue({
						returning: vi.fn().mockResolvedValue([]),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(
				`/api/classrooms/${CLASSROOM_ID}/staff`,
				jsonBody({ membershipId: MEMBERSHIP_ID, effectiveDate: "2026-04-01" }),
			);

			expect(res.status).toBe(500);
		});

		it("returns 404 when ending a missing staff assignment", async () => {
			const db = createMockDb({
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				}),
			});
			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/staff/${MEMBERSHIP_ID}`, {
				method: "DELETE",
			});

			expect(res.status).toBe(404);
		});
	});

	describe("center-local timezone date handling", () => {
		// UTC 2026-06-11T04:30Z is still 2026-06-10 in America/Chicago (CDT = UTC-5)
		const UTC_INSTANT = "2026-06-11T04:30:00.000Z";
		const CHICAGO_LOCAL = "2026-06-10";
		const UTC_DAY = "2026-06-11";

		it("DELETE /:id/children/:childId writes center-local endDate, not UTC date", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date(UTC_INSTANT));

			const endDateValues: string[] = [];
			const db = createMockDb({
				select: vi.fn().mockReturnValue({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
						}),
					}),
				}),
				update: vi.fn().mockReturnValue({
					set: vi.fn().mockImplementation((data: Record<string, unknown>) => {
						if (typeof data.endDate === "string") {
							endDateValues.push(data.endDate);
						}
						return {
							where: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([
									{
										id: "assign-1",
										centerId: "center-1",
										classroomId: CLASSROOM_ID,
										childId: CHILD_ID,
										effectiveDate: "2026-01-01",
										endDate: CHICAGO_LOCAL,
									},
								]),
							}),
						};
					}),
				}),
			});

			const app = createTestApp(mountClassrooms, db);
			const res = await app.request(`/api/classrooms/${CLASSROOM_ID}/children/${CHILD_ID}`, {
				method: "DELETE",
			});

			vi.useRealTimers();

			expect(res.status).toBe(200);
			expect(endDateValues.length).toBeGreaterThan(0);
			for (const d of endDateValues) {
				expect(d).toBe(CHICAGO_LOCAL);
				expect(d).not.toBe(UTC_DAY);
			}
		});
	});
});
