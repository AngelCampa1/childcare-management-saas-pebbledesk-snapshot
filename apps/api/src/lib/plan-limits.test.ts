import { HTTPException } from "hono/http-exception";
import { describe, expect, it, vi } from "vitest";
import {
	assertCanAddActiveChildren,
	assertCenterHasFeature,
	centerHasFeature,
} from "./plan-limits.js";

type CenterRow = {
	subscriptionPlan: "home" | "center_starter" | "center_pro" | "group" | "enterprise" | null;
	subscriptionStatus:
		| "none"
		| "trialing"
		| "active"
		| "past_due"
		| "canceled"
		| "unpaid"
		| "incomplete"
		| "incomplete_expired";
};

function buildSelectDb(centerRows: CenterRow[], activeChildren = 0) {
	const limitCenter = vi.fn().mockResolvedValue(centerRows);
	const activeWhere = vi.fn().mockResolvedValue([{ value: activeChildren }]);
	const select = vi
		.fn()
		.mockReturnValueOnce({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({ limit: limitCenter }),
			}),
		})
		.mockReturnValue({
			from: vi.fn().mockReturnValue({ where: activeWhere }),
		});

	return { db: { select }, select, limitCenter, activeWhere };
}

function expectForbidden(error: unknown, message: string) {
	expect(error).toBeInstanceOf(HTTPException);
	expect((error as HTTPException).status).toBe(403);
	expect((error as HTTPException).message).toBe(message);
}

describe("assertCanAddActiveChildren", () => {
	it("skips non-positive increments and transaction-like clients without select", async () => {
		await expect(assertCanAddActiveChildren({} as never, "center-1", 1)).resolves.toBeUndefined();

		const { db, select } = buildSelectDb([], 0);
		await expect(assertCanAddActiveChildren(db as never, "center-1", 0)).resolves.toBeUndefined();
		expect(select).not.toHaveBeenCalled();
	});

	it("allows adding children when the active count stays under the plan limit", async () => {
		const { db, activeWhere } = buildSelectDb(
			[{ subscriptionPlan: "home", subscriptionStatus: "active" }],
			14,
		);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 1)).resolves.toBeUndefined();
		expect(activeWhere).toHaveBeenCalledOnce();
	});

	it("allows unlimited group plans without counting active children", async () => {
		const { db, activeWhere } = buildSelectDb(
			[{ subscriptionPlan: "group", subscriptionStatus: "active" }],
			999,
		);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 10)).resolves.toBeUndefined();
		expect(activeWhere).not.toHaveBeenCalled();
	});

	it("skips limits when the center row cannot be loaded", async () => {
		const { db, activeWhere } = buildSelectDb([], 0);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 1)).resolves.toBeUndefined();
		expect(activeWhere).not.toHaveBeenCalled();
	});

	it("rejects centers without an allowed subscription plan", async () => {
		const { db } = buildSelectDb([{ subscriptionPlan: null, subscriptionStatus: "active" }], 0);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 1)).rejects.toSatisfy(
			(error: unknown) => {
				expectForbidden(error, "Subscription plan required");
				return true;
			},
		);
	});

	it("rejects centers whose subscription status does not allow service", async () => {
		const { db } = buildSelectDb(
			[{ subscriptionPlan: "center_starter", subscriptionStatus: "canceled" }],
			0,
		);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 1)).rejects.toSatisfy(
			(error: unknown) => {
				expectForbidden(error, "Subscription plan required");
				return true;
			},
		);
	});

	it("rejects additions that exceed the active child limit", async () => {
		const { db } = buildSelectDb([{ subscriptionPlan: "home", subscriptionStatus: "active" }], 15);

		await expect(assertCanAddActiveChildren(db as never, "center-1", 1)).rejects.toSatisfy(
			(error: unknown) => {
				expectForbidden(error, "Plan allows up to 15 active children");
				return true;
			},
		);
	});
});

describe("centerHasFeature", () => {
	it("allows transaction-like clients without select", async () => {
		await expect(centerHasFeature({} as never, "center-1", "quickbooks")).resolves.toBe(true);
	});

	it("returns true for active plans with the requested feature", async () => {
		const { db } = buildSelectDb(
			[{ subscriptionPlan: "center_pro", subscriptionStatus: "active" }],
			0,
		);

		await expect(centerHasFeature(db as never, "center-1", "quickbooks")).resolves.toBe(true);
	});

	it("returns false when the plan lacks the requested feature", async () => {
		const { db } = buildSelectDb([{ subscriptionPlan: "home", subscriptionStatus: "active" }], 0);

		await expect(centerHasFeature(db as never, "center-1", "quickbooks")).resolves.toBe(false);
	});

	it("returns false when the subscription status does not allow service", async () => {
		const { db } = buildSelectDb(
			[{ subscriptionPlan: "center_pro", subscriptionStatus: "unpaid" }],
			0,
		);

		await expect(centerHasFeature(db as never, "center-1", "quickbooks")).resolves.toBe(false);
	});
});

describe("assertCenterHasFeature", () => {
	it("allows centers with the requested feature", async () => {
		const { db } = buildSelectDb(
			[{ subscriptionPlan: "center_pro", subscriptionStatus: "active" }],
			0,
		);

		await expect(
			assertCenterHasFeature(db as never, "center-1", "quickbooks"),
		).resolves.toBeUndefined();
	});

	it("rejects centers without the requested feature", async () => {
		const { db } = buildSelectDb([{ subscriptionPlan: "home", subscriptionStatus: "active" }], 0);

		await expect(assertCenterHasFeature(db as never, "center-1", "quickbooks")).rejects.toSatisfy(
			(error: unknown) => {
				expectForbidden(error, "Subscription plan required");
				return true;
			},
		);
	});
});
