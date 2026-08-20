import { describe, expect, it, vi } from "vitest";
import { createMockDb } from "../test/setup.js";

const { createGuardian, DUPLICATE_GUARDIAN_EMAIL_MESSAGE, linkGuardianToChild } = await import(
	"./guardians.js"
);

describe("createGuardian", () => {
	it("rejects duplicate guardian emails case-insensitively before insert", async () => {
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

		await expect(
			createGuardian(db as never, "center-1", {
				firstName: "Jane",
				lastName: "Smith",
				email: "Jane@Example.COM",
			}),
		).rejects.toThrow(DUPLICATE_GUARDIAN_EMAIL_MESSAGE);
		expect(insert).not.toHaveBeenCalled();
	});

	it("inserts a guardian row and returns the created guardian", async () => {
		const newGuardian = {
			id: "guardian-1",
			centerId: "center-1",
			firstName: "John",
			lastName: "Doe",
			email: "john@example.com",
			phone: "555-1234",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([newGuardian]),
				}),
			}),
		});

		const result = await createGuardian(db as never, "center-1", {
			firstName: "John",
			lastName: "Doe",
			email: "john@example.com",
			phone: "555-1234",
		});

		expect(db.insert).toHaveBeenCalled();
		expect(result.firstName).toBe("John");
		expect(result.centerId).toBe("center-1");
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
			createGuardian(db as never, "center-1", {
				firstName: "John",
				lastName: "Doe",
			}),
		).rejects.toThrow("Failed to create guardian");
	});

	it("creates a guardian without optional fields", async () => {
		const newGuardian = {
			id: "guardian-2",
			centerId: "center-1",
			firstName: "Jane",
			lastName: "Smith",
			email: null,
			phone: null,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([newGuardian]),
				}),
			}),
		});

		const result = await createGuardian(db as never, "center-1", {
			firstName: "Jane",
			lastName: "Smith",
		});

		expect(result.firstName).toBe("Jane");
		expect(result.email).toBeNull();
	});
});

describe("linkGuardianToChild", () => {
	it("inserts a child_guardian link row and uses a transaction", async () => {
		const txInsertValues = vi.fn().mockResolvedValue(undefined);
		const txDb = createMockDb({
			insert: vi.fn().mockReturnValue({ values: txInsertValues }),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
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
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: typeof txDb) => Promise<unknown>) => fn(txDb)),
		});

		await linkGuardianToChild(db as never, "center-1", "child-1", {
			guardianId: "00000000-0000-0000-0000-000000000001",
			isPrimary: false,
			authorizedPickup: true,
			relationship: "mother",
		});

		expect(db.transaction).toHaveBeenCalled();
		expect(txInsertValues).toHaveBeenCalledWith(expect.objectContaining({ centerId: "center-1" }));
	});

	it("uses provided tx (no transaction method) for insert instead of wrapping again", async () => {
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const tx = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
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
			insert: vi.fn().mockReturnValue({ values: insertValues }),
			// No transaction property — simulates already-inside-a-tx context
			transaction: undefined as never,
		});

		await linkGuardianToChild(tx as never, "center-1", "child-1", {
			guardianId: "00000000-0000-0000-0000-000000000001",
			isPrimary: false,
			authorizedPickup: false,
		});

		expect(tx.insert).toHaveBeenCalled();
		expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: false }));
	});

	it("demotes existing primary links and promotes new one within a transaction", async () => {
		const insertValues = vi.fn().mockResolvedValue(undefined);
		const demoteSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const promoteSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
		const txDb = createMockDb({
			insert: vi.fn().mockReturnValue({ values: insertValues }),
			update: vi
				.fn()
				.mockReturnValueOnce({ set: demoteSet })
				.mockReturnValueOnce({ set: promoteSet }),
		});
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
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
			transaction: vi
				.fn()
				.mockImplementation(async (fn: (tx: typeof txDb) => Promise<unknown>) => fn(txDb)),
		});

		await linkGuardianToChild(db as never, "center-1", "child-1", {
			guardianId: "00000000-0000-0000-0000-000000000001",
			isPrimary: true,
			authorizedPickup: true,
		});

		expect(db.transaction).toHaveBeenCalled();
		expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ isPrimary: false }));
		expect(demoteSet).toHaveBeenCalledWith({ isPrimary: false });
		expect(promoteSet).toHaveBeenCalledWith({ isPrimary: true });
	});

	it("rejects an existing child guardian link before insert", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "guardian-1" }]),
						}),
					}),
				})
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi
								.fn()
								.mockResolvedValue([{ guardianId: "00000000-0000-0000-0000-000000000001" }]),
						}),
					}),
				}),
			insert: vi.fn(),
		});

		await expect(
			linkGuardianToChild(db as never, "center-1", "child-1", {
				guardianId: "00000000-0000-0000-0000-000000000001",
				isPrimary: false,
				authorizedPickup: true,
			}),
		).rejects.toThrow("Guardian is already linked to this child");

		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects links when the child does not belong to the center", async () => {
		const db = createMockDb({
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
			insert: vi.fn(),
		});

		await expect(
			linkGuardianToChild(db as never, "center-1", "child-1", {
				guardianId: "00000000-0000-0000-0000-000000000001",
				isPrimary: true,
				authorizedPickup: true,
			}),
		).rejects.toThrow("Child not found");

		expect(db.insert).not.toHaveBeenCalled();
	});

	it("rejects links when the guardian does not belong to the center", async () => {
		const db = createMockDb({
			select: vi
				.fn()
				.mockReturnValueOnce({
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ id: "child-1" }]),
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
			insert: vi.fn(),
		});

		await expect(
			linkGuardianToChild(db as never, "center-1", "child-1", {
				guardianId: "00000000-0000-0000-0000-000000000001",
				isPrimary: true,
				authorizedPickup: true,
			}),
		).rejects.toThrow("Guardian not found");

		expect(db.insert).not.toHaveBeenCalled();
	});
});
