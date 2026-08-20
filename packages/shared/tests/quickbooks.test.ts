import { describe, expect, it } from "vitest";
import {
	QB_CONNECTION_STATUSES,
	QB_ENTITY_TYPES,
	QB_RECONCILIATION_ITEM_TYPES,
	QB_RECONCILIATION_STATUSES,
	QB_SYNC_DIRECTIONS,
	QB_SYNC_STATUSES,
} from "../src/constants/enums.js";
import { quickbooksReviewReconciliationSchema } from "../src/validators/quickbooks.js";

const LOCAL_TARGET_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("QuickBooks constants", () => {
	it("includes connection, reconciliation, and sync catalogs", () => {
		expect(QB_CONNECTION_STATUSES).toEqual(["connected", "disconnected"]);
		expect(QB_RECONCILIATION_STATUSES).toEqual(["open", "approved", "dismissed"]);
		expect(QB_RECONCILIATION_ITEM_TYPES).toContain("missing_link");
		expect(QB_ENTITY_TYPES).toEqual(["customer", "invoice", "payment"]);
		expect(QB_SYNC_DIRECTIONS).toEqual(["push", "pull"]);
		expect(QB_SYNC_STATUSES).toContain("pending");
		expect(QB_SYNC_STATUSES).toContain("success");
	});
});

describe("quickbooksReviewReconciliationSchema", () => {
	it("accepts an approval payload with a QB entity id", () => {
		expect(
			quickbooksReviewReconciliationSchema.safeParse({
				qbEntityId: "qb-invoice-1",
				qbEntityType: "invoice",
			}).success,
		).toBe(true);
	});

	it("accepts an approval payload with a local target id", () => {
		expect(
			quickbooksReviewReconciliationSchema.safeParse({
				localTargetId: LOCAL_TARGET_ID,
			}).success,
		).toBe(true);
	});

	it("rejects empty approval payloads", () => {
		expect(quickbooksReviewReconciliationSchema.safeParse({}).success).toBe(false);
	});
});
