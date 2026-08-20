import type { Database } from "@pebbledesk/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock billing-subsidy module
vi.mock("../lib/billing-subsidy.js", () => ({
	filterAttendanceEntriesForPeriod: vi.fn(),
	summarizeAttendance: vi.fn(),
	computeClaimAmount: vi.fn(),
}));

const { runSubsidyAutoDraft, getPriorISOWeekRange } = await import("./subsidy-auto-draft.js");
const { filterAttendanceEntriesForPeriod, summarizeAttendance, computeClaimAmount } = await import(
	"../lib/billing-subsidy.js"
);

const mockFilterAttendance = vi.mocked(filterAttendanceEntriesForPeriod);
const mockSummarizeAttendance = vi.mocked(summarizeAttendance);
const mockComputeClaimAmount = vi.mocked(computeClaimAmount);

type SelectMock = ReturnType<typeof vi.fn>;

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

function buildInsertMock() {
	const returningMock = vi.fn().mockResolvedValue([{ id: "claim-new" }]);
	const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
	const insertMock = vi.fn().mockReturnValue({ values: valuesMock });
	return { insertMock, valuesMock, returningMock };
}

function makeDb(selectMock: SelectMock, insertMock = vi.fn()): Database {
	return {
		select: selectMock,
		insert: insertMock,
		update: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	} as unknown as Database;
}

const BASE_CASE = {
	id: "case-1",
	centerId: "center-1",
	childId: "child-1",
	status: "active" as const,
	rateDaily: 25,
	rateWeekly: null,
	authorizedHoursWeekly: null,
	program: "ccdf" as const,
	caseNumber: "CN-001",
	agencyName: "Agency A",
	effectiveDate: "2026-01-01",
	expirationDate: null,
	createdAt: new Date(),
	updatedAt: new Date(),
};

beforeEach(() => {
	vi.clearAllMocks();
	mockFilterAttendance.mockReturnValue([
		{
			checkedInAt: new Date("2026-04-06T09:00:00Z"),
			checkedOutAt: new Date("2026-04-06T17:00:00Z"),
		},
	]);
	mockSummarizeAttendance.mockReturnValue({ daysAttended: 1, hoursAttended: 8 });
	mockComputeClaimAmount.mockReturnValue({
		amountClaimed: 25,
		requiresManualAmount: false,
		rateType: "daily" as const,
	});
});

describe("getPriorISOWeekRange", () => {
	it("returns the prior ISO week bounds when called on a Monday", () => {
		// Monday 2026-04-14 → prior week: 2026-04-06 (Mon) to 2026-04-12 (Sun)
		const now = new Date("2026-04-14T09:00:00Z");
		const { periodStart, periodEnd } = getPriorISOWeekRange(now);
		expect(periodStart).toBe("2026-04-06");
		expect(periodEnd).toBe("2026-04-12");
	});

	it("returns the prior ISO week bounds when called mid-week", () => {
		// Wednesday 2026-04-15 → prior week: 2026-04-06 (Mon) to 2026-04-12 (Sun)
		const now = new Date("2026-04-15T09:00:00Z");
		const { periodStart, periodEnd } = getPriorISOWeekRange(now);
		expect(periodStart).toBe("2026-04-06");
		expect(periodEnd).toBe("2026-04-12");
	});

	it("handles the week crossing a month boundary", () => {
		// Monday 2026-03-30 → prior week: 2026-03-23 (Mon) to 2026-03-29 (Sun)
		const now = new Date("2026-03-30T09:00:00Z");
		const { periodStart, periodEnd } = getPriorISOWeekRange(now);
		expect(periodStart).toBe("2026-03-23");
		expect(periodEnd).toBe("2026-03-29");
	});

	it("handles a year boundary correctly", () => {
		// Monday 2026-01-05 → prior week: 2025-12-29 (Mon) to 2026-01-04 (Sun)
		const now = new Date("2026-01-05T09:00:00Z");
		const { periodStart, periodEnd } = getPriorISOWeekRange(now);
		expect(periodStart).toBe("2025-12-29");
		expect(periodEnd).toBe("2026-01-04");
	});

	it("treats Sunday as the last day of the current ISO week", () => {
		// Sunday 2026-04-12 → prior week: 2026-03-30 (Mon) to 2026-04-05 (Sun)
		const now = new Date("2026-04-12T09:00:00Z");
		const { periodStart, periodEnd } = getPriorISOWeekRange(now);
		expect(periodStart).toBe("2026-03-30");
		expect(periodEnd).toBe("2026-04-05");
	});
});

describe("runSubsidyAutoDraft", () => {
	it("drafts a claim for a center-plan center with an active subsidy case", async () => {
		// select call 1: active cases joined to centers → returns 1 case+center
		// select call 2: existing claim check → empty (no existing)
		// select call 3: attendance entries
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				// Join: active cases + centers where plan in center/enterprise
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "America/Chicago",
								},
							]),
						}),
					}),
				};
			}
			if (i === 1) {
				// Existing claim check: empty
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			// Attendance entries
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							checkedInAt: new Date("2026-04-06T09:00:00Z"),
							checkedOutAt: new Date("2026-04-06T17:00:00Z"),
						},
					]),
				}),
			};
		});

		const { insertMock, valuesMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).toHaveBeenCalledOnce();
		expect(valuesMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "draft",
				subsidyCaseId: "case-1",
				centerId: "center-1",
				daysAttended: 1,
				hoursAttended: 8,
				amountClaimed: 25,
			}),
		);
	});

	it("drafts a claim for a trial center with an active subsidy case", async () => {
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "trial",
									subscriptionStatus: "trialing",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			if (i === 1) {
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							checkedInAt: new Date("2026-04-06T09:00:00Z"),
							checkedOutAt: new Date("2026-04-06T17:00:00Z"),
						},
					]),
				}),
			};
		});

		const { insertMock, valuesMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).toHaveBeenCalledOnce();
		expect(valuesMock).toHaveBeenCalledWith(
			expect.objectContaining({ status: "draft", subsidyCaseId: "case-1" }),
		);
	});

	it("does not draft claims for canceled trial centers", async () => {
		const selectMock = vi.fn().mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							...BASE_CASE,
							subscriptionPlan: "trial",
							subscriptionStatus: "canceled",
							timezone: "UTC",
						},
					]),
				}),
			}),
		}));

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).not.toHaveBeenCalled();
	});

	it("drafts a claim for an enterprise-plan center", async () => {
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "enterprise",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			if (i === 1) {
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							checkedInAt: new Date("2026-04-06T09:00:00Z"),
							checkedOutAt: new Date("2026-04-06T17:00:00Z"),
						},
					]),
				}),
			};
		});

		const { insertMock, valuesMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).toHaveBeenCalledOnce();
		expect(valuesMock).toHaveBeenCalledWith(
			expect.objectContaining({ status: "draft", subsidyCaseId: "case-1" }),
		);
	});

	it("does not process home-tier centers", async () => {
		// The query filters out home plan at the DB level, so no cases returned
		const selectMock = vi.fn().mockImplementation(() => ({
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		}));

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).not.toHaveBeenCalled();
	});

	it("is idempotent — does not insert when a claim already exists for the period", async () => {
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			// Existing claim found
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ id: "existing-claim" }]),
					}),
				}),
			};
		});

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).not.toHaveBeenCalled();
	});

	it("checks existing claims by subsidy case and the full claim period", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-14T09:00:00.000Z"));
		const existingClaimWhere = vi.fn().mockReturnValue({
			limit: vi.fn().mockResolvedValue([{ id: "existing-claim" }]),
		});
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			return {
				from: vi.fn().mockReturnValue({
					where: existingClaimWhere,
				}),
			};
		});

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		try {
			await runSubsidyAutoDraft(db);
		} finally {
			vi.useRealTimers();
		}

		const whereValues = collectStringValues(existingClaimWhere.mock.calls[0]?.[0]);
		expect(whereValues).toContain("case-1");
		expect(whereValues).toContain("2026-04-06");
		expect(whereValues).toContain("2026-04-12");
		expect(insertMock).not.toHaveBeenCalled();
	});

	it("skips active cases that are not effective during the claim period", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-04-14T09:00:00.000Z"));
		const futureCase = {
			...BASE_CASE,
			effectiveDate: "2026-04-13",
			expirationDate: null,
		};
		const expiredCase = {
			...BASE_CASE,
			id: "case-expired",
			effectiveDate: "2026-01-01",
			expirationDate: "2026-04-05",
		};
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...futureCase,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
								{
									...expiredCase,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
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
		});

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		try {
			await runSubsidyAutoDraft(db);
		} finally {
			vi.useRealTimers();
		}

		expect(insertMock).not.toHaveBeenCalled();
	});

	it("skips a case when zero attendance is recorded for the week", async () => {
		mockSummarizeAttendance.mockReturnValue({ daysAttended: 0, hoursAttended: 0 });

		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			if (i === 1) {
				// No existing claim
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			// Zero attendance entries
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			};
		});

		const { insertMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		await runSubsidyAutoDraft(db);

		expect(insertMock).not.toHaveBeenCalled();
	});

	it("continues processing subsequent cases when one case throws", async () => {
		const case2 = { ...BASE_CASE, id: "case-2", centerId: "center-2", childId: "child-2" };
		const selectMock = vi.fn();
		let callIndex = 0;
		selectMock.mockImplementation(() => {
			const i = callIndex++;
			if (i === 0) {
				// Two cases
				return {
					from: vi.fn().mockReturnValue({
						innerJoin: vi.fn().mockReturnValue({
							where: vi.fn().mockResolvedValue([
								{
									...BASE_CASE,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
								{
									...case2,
									subscriptionPlan: "center_starter",
									subscriptionStatus: "active",
									timezone: "UTC",
								},
							]),
						}),
					}),
				};
			}
			if (i === 1) {
				// First case: no existing claim
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			if (i === 2) {
				// First case: attendance query throws
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockRejectedValue(new Error("DB read failure")),
					}),
				};
			}
			if (i === 3) {
				// Second case: no existing claim
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([]),
						}),
					}),
				};
			}
			// Second case: attendance entries
			return {
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							checkedInAt: new Date("2026-04-06T09:00:00Z"),
							checkedOutAt: new Date("2026-04-06T17:00:00Z"),
						},
					]),
				}),
			};
		});

		const { insertMock, valuesMock } = buildInsertMock();
		const db = makeDb(selectMock, insertMock);

		// Should not throw even though case 1 errors
		await expect(runSubsidyAutoDraft(db)).resolves.toBeUndefined();

		// Case 2 should still be inserted
		expect(insertMock).toHaveBeenCalledOnce();
		expect(valuesMock).toHaveBeenCalledWith(
			expect.objectContaining({ subsidyCaseId: "case-2", centerId: "center-2" }),
		);
	});
});
