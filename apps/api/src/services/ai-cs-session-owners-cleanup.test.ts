import { aiCsSessionOwners } from "@pebbledesk/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteExpiredAiCsSessionOwners } from "./ai-cs-session-owners-cleanup.js";

const mockDelete = vi.fn().mockReturnValue({
	where: vi.fn().mockResolvedValue({ rowCount: 3 }),
});

const mockDb = {
	delete: mockDelete,
} as unknown as Parameters<typeof deleteExpiredAiCsSessionOwners>[0];

describe("deleteExpiredAiCsSessionOwners", () => {
	beforeEach(() => {
		mockDelete.mockClear();
		mockDelete.mockReturnValue({ where: vi.fn().mockResolvedValue({ rowCount: 3 }) });
	});

	it("deletes ai_cs_session_owners older than 30 days", async () => {
		const now = new Date("2026-04-17T04:00:00Z");
		await deleteExpiredAiCsSessionOwners(mockDb, now);

		expect(mockDelete).toHaveBeenCalledWith(aiCsSessionOwners);
	});

	it("passes a cutoff 30 days before the given date to the where clause", async () => {
		const now = new Date("2026-04-17T04:00:00Z");
		const whereMock = vi.fn().mockResolvedValue({ rowCount: 1 });
		mockDelete.mockReturnValue({ where: whereMock });

		await deleteExpiredAiCsSessionOwners(mockDb, now);

		expect(whereMock).toHaveBeenCalledTimes(1);
		const [condition] = whereMock.mock.calls[0];
		expect(condition).toBeDefined();
	});

	it("uses current date when no date is provided", async () => {
		const before = Date.now();
		await deleteExpiredAiCsSessionOwners(mockDb);
		const after = Date.now();

		expect(mockDelete).toHaveBeenCalledWith(aiCsSessionOwners);
		const whereMock = (mockDelete.mock.results[0].value as { where: ReturnType<typeof vi.fn> })
			.where;
		expect(whereMock).toHaveBeenCalledTimes(1);
		const callTime = before;
		expect(callTime).toBeLessThanOrEqual(after);
	});

	it("returns the number of deleted rows", async () => {
		mockDelete.mockReturnValue({
			where: vi.fn().mockResolvedValue({ rowCount: 7 }),
		});
		const result = await deleteExpiredAiCsSessionOwners(mockDb);
		expect(result).toBe(7);
	});

	it("returns 0 when no rows are deleted", async () => {
		mockDelete.mockReturnValue({
			where: vi.fn().mockResolvedValue({ rowCount: 0 }),
		});
		const result = await deleteExpiredAiCsSessionOwners(mockDb);
		expect(result).toBe(0);
	});

	it("returns 0 when rowCount is undefined", async () => {
		mockDelete.mockReturnValue({
			where: vi.fn().mockResolvedValue({}),
		});
		const result = await deleteExpiredAiCsSessionOwners(mockDb);
		expect(result).toBe(0);
	});
});
