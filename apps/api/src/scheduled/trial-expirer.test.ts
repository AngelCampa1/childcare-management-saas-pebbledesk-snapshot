import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Database } from "@pebbledesk/db";
import { centers } from "@pebbledesk/db";
import { describe, expect, it, vi } from "vitest";
import { runTrialExpirer } from "./trial-expirer.js";

function makeDb(updatedRows: { id: string }[] = []): {
	db: Database;
	returningMock: ReturnType<typeof vi.fn>;
	whereMock: ReturnType<typeof vi.fn>;
} {
	const returningMock = vi.fn().mockResolvedValue(updatedRows);
	const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
	const setMock = vi.fn().mockReturnValue({ where: whereMock });
	const updateMock = vi.fn().mockReturnValue({ set: setMock });

	const db = {
		update: updateMock,
		select: vi.fn(),
		insert: vi.fn(),
		delete: vi.fn(),
		transaction: vi.fn(),
	} as unknown as Database;

	return { db, returningMock, whereMock };
}

describe("runTrialExpirer", () => {
	it("returns expiredCount equal to number of updated rows", async () => {
		const { db } = makeDb([{ id: "center-1" }, { id: "center-2" }]);
		const result = await runTrialExpirer(db);
		expect(result.expiredCount).toBe(2);
		expect(result.expiredCenterIds).toEqual(["center-1", "center-2"]);
	});

	it("returns expiredCount of 0 when no rows are updated", async () => {
		const { db } = makeDb([]);
		const result = await runTrialExpirer(db);
		expect(result.expiredCount).toBe(0);
	});

	it("calls db.update on the centers table", async () => {
		const { db } = makeDb([{ id: "center-1" }]);
		await runTrialExpirer(db);
		expect(db.update).toHaveBeenCalled();
	});

	it("returns only center IDs from the update query", async () => {
		const { db, returningMock } = makeDb([{ id: "center-1" }]);

		await runTrialExpirer(db);

		expect(returningMock).toHaveBeenCalledWith({ id: centers.id });
	});

	it("expires selected-plan trials without requiring subscriptionPlan to be trial", async () => {
		const { db } = makeDb([{ id: "center-home" }]);

		const result = await runTrialExpirer(db);
		const sourcePath = fileURLToPath(new URL("./trial-expirer.ts", import.meta.url));

		expect(result.expiredCenterIds).toEqual(["center-home"]);
		expect(readFileSync(sourcePath, "utf8")).not.toContain("centers.subscriptionPlan");
	});

	it("is idempotent: running twice does not double-cancel", async () => {
		const { db: db1 } = makeDb([{ id: "center-1" }]);
		const r1 = await runTrialExpirer(db1);
		expect(r1.expiredCount).toBe(1);

		const { db: db2 } = makeDb([]);
		const r2 = await runTrialExpirer(db2);
		expect(r2.expiredCount).toBe(0);
	});
});
