import { describe, expect, it, vi } from "vitest";
import { createMockDb } from "../test/setup.js";

// Import services after they are defined
const { createChild, enrollChild } = await import("./children.js");

describe("createChild", () => {
	it("inserts a child row and returns the created child", async () => {
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

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([newChild]),
				}),
			}),
		});

		const result = await createChild(db as never, "center-1", {
			firstName: "Alice",
			lastName: "Smith",
			dateOfBirth: "2023-05-15",
			ageGroup: "toddler",
			enrollmentStatus: "active",
			subsidyEligible: false,
		});

		expect(db.insert).toHaveBeenCalled();
		expect(result.firstName).toBe("Alice");
		expect(result.centerId).toBe("center-1");
	});

	it("persists allergies, immunizations, and notes on the inserted row", async () => {
		const values = vi.fn().mockReturnValue({
			returning: vi.fn().mockResolvedValue([
				{
					id: "child-2",
					centerId: "center-1",
					firstName: "Alice",
					lastName: "Smith",
					dateOfBirth: "2023-05-15",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
					allergies: "Peanuts",
					immunizations: "MMR, DTaP",
					notes: "Needs an EpiPen on site.",
					enrolledAt: new Date().toISOString(),
					withdrawnAt: null,
					createdAt: new Date().toISOString(),
				},
			]),
		});
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({ values }),
		});

		await createChild(db as never, "center-1", {
			firstName: "Alice",
			lastName: "Smith",
			dateOfBirth: "2023-05-15",
			ageGroup: "toddler",
			enrollmentStatus: "active",
			subsidyEligible: false,
			allergies: "Peanuts",
			immunizations: "MMR, DTaP",
			notes: "Needs an EpiPen on site.",
		});

		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				allergies: "Peanuts",
				immunizations: "MMR, DTaP",
				notes: "Needs an EpiPen on site.",
			}),
		);
	});

	it("throws if the insert returns no row", async () => {
		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([]),
				}),
			}),
		});

		await expect(
			createChild(db as never, "center-1", {
				firstName: "Alice",
				lastName: "Smith",
				dateOfBirth: "2023-05-15",
				ageGroup: "toddler",
				enrollmentStatus: "active",
				subsidyEligible: false,
			}),
		).rejects.toThrow("Failed to create child");
	});
});

describe("enrollChild", () => {
	it("wraps in a transaction automatically when no tx is provided", async () => {
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
					insert: vi.fn().mockImplementation(() => {
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
						if (insertCount === 3) {
							return { values: vi.fn().mockResolvedValue(undefined) };
						}
						return {
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([newAssignment]),
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
							6: [{ id: "classroom-1", archivedAt: null }],
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

		const result = await enrollChild(db as never, "center-1", {
			child: {
				firstName: "Bob",
				lastName: "Jones",
				dateOfBirth: "2024-01-10",
				ageGroup: "infant",
				enrollmentStatus: "active",
				subsidyEligible: false,
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
		});

		expect(db.transaction).toHaveBeenCalled();
		expect(result.child.firstName).toBe("Bob");
		expect(result.guardians).toHaveLength(1);
		expect(result.classroomAssignment).toBeTruthy();
	});

	it("uses the provided tx instead of opening a new transaction", async () => {
		const newChild = {
			id: "child-tx",
			centerId: "center-1",
			firstName: "Carol",
			lastName: "White",
			dateOfBirth: "2024-02-01",
			ageGroup: "toddler",
			enrollmentStatus: "active",
			subsidyEligible: false,
			enrolledAt: new Date().toISOString(),
			withdrawnAt: null,
			createdAt: new Date().toISOString(),
		};

		let insertCount = 0;
		const txDb = createMockDb({
			insert: vi.fn().mockImplementation(() => {
				insertCount += 1;
				if (insertCount === 1) {
					return {
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([newChild]),
						}),
					};
				}
				// child_guardian link insert
				return { values: vi.fn().mockResolvedValue(undefined) };
			}),
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "guardian-existing-1" }]),
					}),
				}),
			}),
		});

		const db = createMockDb({
			transaction: vi.fn(),
		});

		const result = await enrollChild(
			db as never,
			"center-1",
			{
				child: {
					firstName: "Carol",
					lastName: "White",
					dateOfBirth: "2024-02-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "existing",
						guardianId: "00000000-0000-0000-0000-000000000099",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
			},
			txDb as never,
		);

		expect(db.transaction).not.toHaveBeenCalled();
		expect(result.child.firstName).toBe("Carol");
		expect(result.guardians).toHaveLength(1);
		expect(result.classroomAssignment).toBeNull();
	});

	it("throws when the existing guardian is not found in the center", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([
								{
									id: "child-new",
									centerId: "center-1",
									firstName: "Dave",
									lastName: "Brown",
									dateOfBirth: "2024-01-01",
									ageGroup: "infant",
									enrollmentStatus: "active",
									subsidyEligible: false,
									enrolledAt: null,
									withdrawnAt: null,
									createdAt: new Date().toISOString(),
								},
							]),
						}),
					}),
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

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Dave",
					lastName: "Brown",
					dateOfBirth: "2024-01-01",
					ageGroup: "infant",
					enrollmentStatus: "active",
					subsidyEligible: false,
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
		).rejects.toThrow();
	});

	it("throws when the child insert inside the transaction returns no row", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const txDb = {
					insert: vi.fn().mockReturnValue({
						values: vi.fn().mockReturnValue({
							returning: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
				return fn(txDb);
			}),
		});

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Eve",
					lastName: "Green",
					dateOfBirth: "2024-03-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "new",
						firstName: "Frank",
						lastName: "Green",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
			}),
		).rejects.toThrow("Failed to create child");
	});

	it("throws when the new guardian insert inside the transaction returns no row", async () => {
		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCount = 0;
				const txDb = {
					insert: vi.fn().mockImplementation(() => {
						insertCount += 1;
						if (insertCount === 1) {
							return {
								values: vi.fn().mockReturnValue({
									returning: vi.fn().mockResolvedValue([
										{
											id: "child-ok",
											centerId: "center-1",
											firstName: "Grace",
											lastName: "Hill",
											dateOfBirth: "2024-04-01",
											ageGroup: "infant",
											enrollmentStatus: "active",
											subsidyEligible: false,
											enrolledAt: null,
											withdrawnAt: null,
											createdAt: new Date().toISOString(),
										},
									]),
								}),
							};
						}
						// guardian insert fails
						return {
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						};
					}),
				};
				return fn(txDb);
			}),
		});

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Grace",
					lastName: "Hill",
					dateOfBirth: "2024-04-01",
					ageGroup: "infant",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "new",
						firstName: "Henry",
						lastName: "Hill",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
			}),
		).rejects.toThrow("Failed to create guardian");
	});

	it("throws when the classroom is not found in the center", async () => {
		const newChild = {
			id: "child-no-room",
			centerId: "center-1",
			firstName: "Leo",
			lastName: "Fox",
			dateOfBirth: "2024-06-01",
			ageGroup: "toddler",
			enrollmentStatus: "active",
			subsidyEligible: false,
			enrolledAt: null,
			withdrawnAt: null,
			createdAt: new Date().toISOString(),
		};

		const newGuardian = {
			id: "guardian-no-room",
			centerId: "center-1",
			firstName: "Mia",
			lastName: "Fox",
			email: null,
			phone: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCount = 0;
				const txDb = {
					insert: vi.fn().mockImplementation(() => {
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
					}),
					// classroom query returns empty — not found in this center
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

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Leo",
					lastName: "Fox",
					dateOfBirth: "2024-06-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "new",
						firstName: "Mia",
						lastName: "Fox",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
				classroom: {
					classroomId: "00000000-0000-0000-0000-000000000010",
					effectiveDate: "2026-04-07",
				},
			}),
		).rejects.toThrow();
	});

	it("throws when the classroom is archived", async () => {
		const newChild = {
			id: "child-archived-room",
			centerId: "center-1",
			firstName: "Nora",
			lastName: "Park",
			dateOfBirth: "2024-07-01",
			ageGroup: "infant",
			enrollmentStatus: "active",
			subsidyEligible: false,
			enrolledAt: null,
			withdrawnAt: null,
			createdAt: new Date().toISOString(),
		};

		const newGuardian = {
			id: "guardian-archived-room",
			centerId: "center-1",
			firstName: "Owen",
			lastName: "Park",
			email: null,
			phone: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCount = 0;
				const txDb = {
					insert: vi.fn().mockImplementation(() => {
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
					}),
					// classroom query returns a room with archivedAt set
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi
									.fn()
									.mockResolvedValue([
										{ id: "classroom-archived", archivedAt: new Date().toISOString() },
									]),
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

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Nora",
					lastName: "Park",
					dateOfBirth: "2024-07-01",
					ageGroup: "infant",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "new",
						firstName: "Owen",
						lastName: "Park",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
				classroom: {
					classroomId: "00000000-0000-0000-0000-000000000010",
					effectiveDate: "2026-04-07",
				},
			}),
		).rejects.toThrow("Classroom is no longer available for enrollment");
	});

	it("throws when the classroom assignment insert returns no row", async () => {
		const newChild = {
			id: "child-assign-fail",
			centerId: "center-1",
			firstName: "Iris",
			lastName: "King",
			dateOfBirth: "2024-05-01",
			ageGroup: "toddler",
			enrollmentStatus: "active",
			subsidyEligible: false,
			enrolledAt: null,
			withdrawnAt: null,
			createdAt: new Date().toISOString(),
		};

		const newGuardian = {
			id: "guardian-assign-fail",
			centerId: "center-1",
			firstName: "Jake",
			lastName: "King",
			email: null,
			phone: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				let insertCount = 0;
				const txDb = {
					insert: vi.fn().mockImplementation(() => {
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
						if (insertCount === 3) {
							// childGuardian link insert
							return { values: vi.fn().mockResolvedValue(undefined) };
						}
						// classroom assignment insert fails
						return {
							values: vi.fn().mockReturnValue({
								returning: vi.fn().mockResolvedValue([]),
							}),
						};
					}),
					select: vi.fn().mockReturnValue({
						from: vi.fn().mockReturnValue({
							where: vi.fn().mockReturnValue({
								limit: vi.fn().mockResolvedValue([{ id: "classroom-1", archivedAt: null }]),
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

		await expect(
			enrollChild(db as never, "center-1", {
				child: {
					firstName: "Iris",
					lastName: "King",
					dateOfBirth: "2024-05-01",
					ageGroup: "toddler",
					enrollmentStatus: "active",
					subsidyEligible: false,
				},
				guardians: [
					{
						type: "new",
						firstName: "Jake",
						lastName: "King",
						isPrimary: true,
						authorizedPickup: true,
					},
				],
				classroom: {
					classroomId: "00000000-0000-0000-0000-000000000010",
					effectiveDate: "2026-04-07",
				},
			}),
		).rejects.toThrow("Failed to create classroom assignment");
	});
});
