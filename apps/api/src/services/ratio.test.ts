import type { AgeGroup } from "@pebbledesk/shared";
import { describe, expect, it, vi } from "vitest";
import { evaluateRoomRatio } from "./ratio.js";

// Mock drizzle-orm operators — the service imports these
vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
	count: vi.fn(() => ({ type: "count" })),
	eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
	isNull: vi.fn((col: unknown) => ({ type: "isNull", col })),
}));

// Mock the DB package table references — we only need them as identity values
vi.mock("@pebbledesk/db", () => ({
	checkIns: {
		classroomId: "checkIns.classroomId",
		centerId: "checkIns.centerId",
		checkedOutAt: "checkIns.checkedOutAt",
	},
	staffCheckIns: {
		classroomId: "staffCheckIns.classroomId",
		centerId: "staffCheckIns.centerId",
		clockedOutAt: "staffCheckIns.clockedOutAt",
	},
	centers: { id: "centers.id", state: "centers.state" },
	classrooms: { id: "classrooms.id", centerId: "classrooms.centerId" },
	ratioSnapshots: "ratioSnapshots",
	ratioViolations: {
		id: "ratioViolations.id",
		classroomId: "ratioViolations.classroomId",
		centerId: "ratioViolations.centerId",
		resolvedAt: "ratioViolations.resolvedAt",
	},
}));

type MockTx = {
	select: ReturnType<typeof vi.fn>;
	insert: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
};

function createSelectChain(results: unknown[]) {
	const chain = {
		from: vi.fn(),
		where: vi.fn(),
	};
	chain.from.mockReturnValue(chain);
	chain.where.mockResolvedValue(results);
	return chain;
}

function buildMockTx(overrides?: Partial<MockTx>): MockTx {
	return {
		select: vi.fn(),
		insert: vi.fn().mockReturnValue({
			values: vi.fn().mockResolvedValue(undefined),
		}),
		update: vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}),
		...overrides,
	};
}

// Helper to build a tx whose select() calls return different results in sequence
function buildSequencedSelectTx(
	childrenCount: number,
	staffCount: number,
	classroom: { ageGroup?: AgeGroup; minRatioStaff: number; minRatioChildren: number },
	openViolation: { id: string } | null,
	centerState = "",
	overrides?: Partial<MockTx>,
): MockTx & { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } {
	let callIndex = 0;
	const sequences = [
		// 1st select: count children
		[{ count: childrenCount }],
		// 2nd select: count staff
		[{ count: staffCount }],
		// 3rd select: classroom
		[classroom],
		// 4th select: center state
		[{ state: centerState }],
		// 5th select: open violation
		openViolation ? [openViolation] : [],
	];

	const tx = buildMockTx({
		select: vi.fn().mockImplementation(() => {
			const result = sequences[callIndex] ?? [];
			callIndex++;
			return createSelectChain(result);
		}),
		...overrides,
	});

	return tx as MockTx & { insert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
}

describe("evaluateRoomRatio", () => {
	const classroomId = "classroom-1";
	const centerId = "center-1";

	it("center-scopes the classroom configuration lookup", async () => {
		const whereConditions: unknown[] = [];
		let callIndex = 0;
		const sequences = [
			[{ count: 0 }],
			[{ count: 0 }],
			[{ minRatioStaff: 1, minRatioChildren: 4 }],
			[{ state: "" }],
			[],
		];
		const tx = buildMockTx({
			select: vi.fn().mockImplementation(() => {
				const result = sequences[callIndex] ?? [];
				callIndex++;
				const chain = {
					from: vi.fn(),
					where: vi.fn().mockImplementation((condition: unknown) => {
						whereConditions.push(condition);
						return Promise.resolve(result);
					}),
				};
				chain.from.mockReturnValue(chain);
				return chain;
			}),
		});

		await evaluateRoomRatio(
			classroomId,
			centerId,
			tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
		);

		expect(JSON.stringify(whereConditions[2])).toContain("classrooms.centerId");
		expect(JSON.stringify(whereConditions[2])).toContain(centerId);
	});

	describe("empty room (0 children, 0 staff)", () => {
		it("returns compliant with no snapshot or violation", async () => {
			const tx = buildSequencedSelectTx(0, 0, { minRatioStaff: 1, minRatioChildren: 4 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(0);
			expect(result.staffCount).toBe(0);
			expect(result.inCompliance).toBe(true);
			// No snapshot inserted for empty room
			expect(tx.insert).not.toHaveBeenCalled();
		});

		it("resolves an open violation without inserting a snapshot", async () => {
			const updateWhereConditions: unknown[] = [];
			const tx = buildSequencedSelectTx(
				0,
				0,
				{ minRatioStaff: 1, minRatioChildren: 4 },
				{ id: "violation-1" },
				"",
				{
					update: vi.fn().mockReturnValue({
						set: vi.fn().mockReturnValue({
							where: vi.fn().mockImplementation((condition: unknown) => {
								updateWhereConditions.push(condition);
								return Promise.resolve(undefined);
							}),
						}),
					}),
				},
			);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.inCompliance).toBe(true);
			expect(tx.insert).not.toHaveBeenCalled();
			expect(tx.update).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(updateWhereConditions[0])).toContain("ratioViolations.centerId");
			expect(JSON.stringify(updateWhereConditions[0])).toContain(centerId);
		});
	});

	describe("classroom ownership", () => {
		it("rejects when the classroom is not found in the center", async () => {
			let callIndex = 0;
			const sequences = [[{ count: 0 }], [{ count: 0 }], []];
			const tx = buildMockTx({
				select: vi.fn().mockImplementation(() => {
					const result = sequences[callIndex] ?? [];
					callIndex++;
					return createSelectChain(result);
				}),
			});

			await expect(
				evaluateRoomRatio(
					classroomId,
					centerId,
					tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
				),
			).rejects.toThrow("Classroom not found");

			expect(tx.insert).not.toHaveBeenCalled();
			expect(tx.update).not.toHaveBeenCalled();
		});
	});

	describe("0 children, staff present", () => {
		it("returns compliant and inserts snapshot", async () => {
			const tx = buildSequencedSelectTx(0, 2, { minRatioStaff: 1, minRatioChildren: 4 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(0);
			expect(result.staffCount).toBe(2);
			expect(result.inCompliance).toBe(true);
			// ratioActual stored as 999 for Infinity
			expect(result.ratioActual).toBe(Number.POSITIVE_INFINITY);
			// Snapshot should be inserted
			expect(tx.insert).toHaveBeenCalledTimes(1);
		});
	});

	describe("children present, 0 staff", () => {
		it("returns non-compliant, inserts snapshot and new violation", async () => {
			const tx = buildSequencedSelectTx(4, 0, { minRatioStaff: 1, minRatioChildren: 4 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(4);
			expect(result.staffCount).toBe(0);
			expect(result.inCompliance).toBe(false);
			expect(result.ratioActual).toBe(0);
			// snapshot + violation
			expect(tx.insert).toHaveBeenCalledTimes(2);
		});
	});

	describe("compliant ratio", () => {
		it("returns compliant when ratio meets requirement", async () => {
			// 1 staff : 4 children → required 0.25, actual 0.25 → compliant
			const tx = buildSequencedSelectTx(4, 1, { minRatioStaff: 1, minRatioChildren: 4 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(4);
			expect(result.staffCount).toBe(1);
			expect(result.ratioRequired).toBeCloseTo(0.25);
			expect(result.ratioActual).toBeCloseTo(0.25);
			expect(result.inCompliance).toBe(true);
			// Only snapshot, no violation
			expect(tx.insert).toHaveBeenCalledTimes(1);
			expect(tx.update).not.toHaveBeenCalled();
		});
	});

	describe("non-compliant ratio", () => {
		it("applies stricter state ratios when persisting snapshots and violations", async () => {
			const tx = buildSequencedSelectTx(
				4,
				1,
				{ ageGroup: "infant", minRatioStaff: 1, minRatioChildren: 5 },
				null,
				"CA",
			);

			const result = await evaluateRoomRatio(
				classroomId,
				"center-ca",
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(4);
			expect(result.staffCount).toBe(1);
			expect(result.ratioRequired).toBeCloseTo(1 / 3);
			expect(result.ratioActual).toBeCloseTo(1 / 4);
			expect(result.inCompliance).toBe(false);
			expect(tx.insert).toHaveBeenCalledTimes(2);
		});

		it("returns non-compliant when ratio is below requirement", async () => {
			// 1 staff : 6 children but requirement is 1:4 → actual 0.166 < required 0.25
			const tx = buildSequencedSelectTx(6, 1, { minRatioStaff: 1, minRatioChildren: 4 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.childrenCount).toBe(6);
			expect(result.staffCount).toBe(1);
			expect(result.ratioRequired).toBeCloseTo(0.25);
			expect(result.ratioActual).toBeCloseTo(1 / 6);
			expect(result.inCompliance).toBe(false);
			// snapshot + new violation
			expect(tx.insert).toHaveBeenCalledTimes(2);
		});

		it("captures the detected breach counts and ratios on new violations", async () => {
			const insertedValues: unknown[] = [];
			const insert = vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((value: unknown) => {
					insertedValues.push(value);
					return Promise.resolve(undefined);
				}),
			});
			const tx = buildSequencedSelectTx(6, 1, { minRatioStaff: 1, minRatioChildren: 4 }, null, "", {
				insert,
			});

			await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(insertedValues[1]).toEqual(
				expect.objectContaining({
					centerId,
					classroomId,
					staffCount: 1,
					childrenCount: 6,
					ratioRequired: 0.25,
					ratioActual: 1 / 6,
				}),
			);
		});
	});

	describe("duplicate violation protection", () => {
		it("does not insert a new violation when one is already open", async () => {
			const tx = buildSequencedSelectTx(
				6,
				1,
				{ minRatioStaff: 1, minRatioChildren: 4 },
				{ id: "violation-1" },
			);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.inCompliance).toBe(false);
			// Only snapshot, no new violation
			expect(tx.insert).toHaveBeenCalledTimes(1);
			expect(tx.update).not.toHaveBeenCalled();
		});
	});

	describe("violation resolution", () => {
		it("resolves open violation when room becomes compliant", async () => {
			// 2 staff : 4 children — better than 1:4 requirement
			const tx = buildSequencedSelectTx(
				4,
				2,
				{ minRatioStaff: 1, minRatioChildren: 4 },
				{ id: "violation-1" },
			);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(result.inCompliance).toBe(true);
			// snapshot inserted
			expect(tx.insert).toHaveBeenCalledTimes(1);
			// violation resolved
			expect(tx.update).toHaveBeenCalledTimes(1);
		});
	});

	describe("ratio calculations", () => {
		it("computes ratioRequired as minRatioStaff / minRatioChildren", async () => {
			const tx = buildSequencedSelectTx(10, 3, { minRatioStaff: 1, minRatioChildren: 5 }, null);

			const result = await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			// required = 1/5 = 0.2, actual = 3/10 = 0.3 → compliant
			expect(result.ratioRequired).toBeCloseTo(0.2);
			expect(result.ratioActual).toBeCloseTo(0.3);
			expect(result.inCompliance).toBe(true);
		});

		it("stores Infinity as 999 in the snapshot", async () => {
			let insertValues: Record<string, unknown> | null = null;
			const tx = buildSequencedSelectTx(0, 1, { minRatioStaff: 1, minRatioChildren: 4 }, null);
			tx.insert = vi.fn().mockReturnValue({
				values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
					insertValues = vals;
					return Promise.resolve(undefined);
				}),
			});

			await evaluateRoomRatio(
				classroomId,
				centerId,
				tx as unknown as Parameters<typeof evaluateRoomRatio>[2],
			);

			expect(insertValues).not.toBeNull();
			expect((insertValues as unknown as Record<string, unknown>).ratioActual).toBe(999);
		});
	});
});
