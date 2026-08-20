import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

const { subscriptionWebhookRoutes } = await import("./subscriptions-webhook.js");
const { createStripeWebhookSignature } = await import("../lib/public-billing.js");
const { BILLING_CADENCES, getStripePriceEnvKey, PAYABLE_PLANS, TRIAL_END_REMINDER_DAYS } =
	await import("@pebbledesk/shared");

function mount(app: Hono<AppEnv>) {
	app.route("/api/subscriptions/webhook", subscriptionWebhookRoutes);
}

const BASE_ENV = {
	APP_URL: "https://app.example.com",
	STRIPE_SECRET_KEY: "sk_test_123",
	STRIPE_PRICE_HOME_MONTHLY: "price_home_monthly",
	STRIPE_PRICE_HOME_ANNUAL: "price_home_annual",
	STRIPE_PRICE_CENTER_STARTER_MONTHLY: "price_center_starter_monthly",
	STRIPE_PRICE_CENTER_STARTER_ANNUAL: "price_center_starter_annual",
	STRIPE_PRICE_CENTER_PRO_MONTHLY: "price_center_pro_monthly",
	STRIPE_PRICE_CENTER_PRO_ANNUAL: "price_center_pro_annual",
	STRIPE_PRICE_GROUP_MONTHLY: "price_group_monthly",
	STRIPE_PRICE_GROUP_ANNUAL: "price_group_annual",
	STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: "whsec_sub",
};

type WebhookMockOpts = {
	idempotencyResults?: Array<Array<{ id: string }>>;
	centerLookup?: {
		stripeCustomerId?: string | null;
		email?: string | null;
		name?: string | null;
		userId?: string | null;
		stripeSubscriptionEventCreatedAt?: Date | null;
	} | null;
};

function makeWebhookDb(opts: WebhookMockOpts = {}) {
	const where = vi.fn().mockResolvedValue(undefined);
	const set = vi.fn().mockReturnValue({ where });
	const update = vi.fn().mockReturnValue({ set });

	const idempotencyResults = opts.idempotencyResults ?? [[{ id: "evt_recorded" }]];
	let insertCall = 0;
	const insertReturning = vi.fn().mockImplementation(() => {
		const result = idempotencyResults[insertCall] ?? [{ id: "evt_recorded" }];
		insertCall += 1;
		return Promise.resolve(result);
	});
	const onConflictDoNothing = vi.fn().mockReturnValue({ returning: insertReturning });
	const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
	const insert = vi.fn().mockReturnValue({ values: insertValues });

	const centerLookup =
		opts.centerLookup === undefined
			? { stripeCustomerId: null, email: null, name: null, userId: null }
			: opts.centerLookup;
	const centerRow = centerLookup ? [centerLookup] : [];
	const selectLimit = vi.fn().mockResolvedValue(centerRow);
	const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
	const selectInnerJoin = vi.fn().mockReturnValue({ where: selectWhere });
	const selectFrom = vi.fn().mockReturnValue({ where: selectWhere, innerJoin: selectInnerJoin });
	const select = vi.fn().mockReturnValue({ from: selectFrom });

	// transaction mock: run the callback with the same insert/update mocks so
	// assertions on `set` and `insert` still capture calls made inside a tx.
	const transaction = vi
		.fn()
		.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({ insert, update, select }),
		);

	const db = createMockDb({ update, insert, select, transaction });
	return {
		db,
		update,
		set,
		where,
		insert,
		insertValues,
		onConflictDoNothing,
		insertReturning,
		selectWhere,
		selectInnerJoin,
	};
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

async function post(
	app: Hono<AppEnv>,
	payload: string,
	signature: string | null,
	envOverrides: Record<string, unknown> = {},
	executionCtx?: ExecutionContext,
) {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (signature) headers["stripe-signature"] = signature;
	return app.request(
		"/api/subscriptions/webhook",
		{ method: "POST", headers, body: payload },
		{ ...BASE_ENV, ...envOverrides },
		executionCtx,
	);
}

function sign(payload: string) {
	return createStripeWebhookSignature(payload, BASE_ENV.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET);
}

describe("subscriptions webhook", () => {
	it("derives Stripe price id plan resolution from shared billing price env keys", () => {
		const source = readFileSync(resolve(__dirname, "subscriptions-webhook.ts"), "utf8");
		const resolverSource = source.match(
			/function resolvePlanFromPriceId[\s\S]*?async function enqueueTrialNotifications/,
		)?.[0];

		expect(resolverSource).toContain("getStripePriceEnvKey");
		expect(resolverSource).not.toContain("STRIPE_PRICE_HOME_MONTHLY");
		expect(resolverSource).not.toContain("STRIPE_PRICE_CENTER_STARTER_ANNUAL");
		expect(resolverSource).not.toContain("STRIPE_PRICE_CENTER_PRO_MONTHLY");
		expect(resolverSource).not.toContain("STRIPE_PRICE_GROUP_ANNUAL");
	});

	it("falls back to shared price-id plan resolution for every payable plan and cadence", async () => {
		const cases = PAYABLE_PLANS.flatMap((plan) =>
			BILLING_CADENCES.map((cadence) => {
				const envKey = getStripePriceEnvKey(plan, cadence);
				if (!envKey) throw new Error(`Missing price env key for ${plan}:${cadence}`);
				return {
					plan,
					cadence,
					priceId: BASE_ENV[envKey as keyof typeof BASE_ENV],
				};
			}),
		);
		const { db, set } = makeWebhookDb({
			idempotencyResults: cases.map((item) => [{ id: `evt_${item.plan}_${item.cadence}` }]),
		});
		const app = createTestApp(mount, db);

		for (const item of cases) {
			const payload = JSON.stringify({
				id: `evt_${item.plan}_${item.cadence}`,
				type: "customer.subscription.updated",
				data: {
					object: {
						id: `sub_${item.plan}_${item.cadence}`,
						status: "active",
						metadata: { centerId: "center-1" },
						items: { data: [{ price: { id: item.priceId } }] },
					},
				},
			});
			const res = await post(app, payload, sign(payload));
			expect(res.status).toBe(200);
		}

		expect(set.mock.calls.map((call) => call[0].subscriptionPlan)).toEqual(
			cases.map((item) => item.plan),
		);
	});

	it("400s when signature is invalid", async () => {
		const { db } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const res = await post(app, JSON.stringify({ type: "anything" }), "garbage");
		expect(res.status).toBe(400);
	});

	it("short-circuits duplicate webhook events via webhook_events insert", async () => {
		const { db, update } = makeWebhookDb({ idempotencyResults: [[]] });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_dup",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_x",
					status: "active",
					metadata: { centerId: "center-1" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("mirrors active subscription status to D1 app signup suppression for the owner", async () => {
		const run = vi.fn().mockResolvedValue({ success: true });
		const bind = vi.fn().mockReturnValue({ run });
		const prepare = vi.fn().mockReturnValue({ bind });
		const marketingDb = { prepare } as unknown as D1Database;
		const { db } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, userId: "owner-user" },
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_active_subscription",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_active",
					status: "active",
					metadata: { centerId: "center-1" },
				},
			},
		});

		const res = await post(app, payload, sign(payload), { MARKETING_DB: marketingDb });

		expect(res.status).toBe(200);
		expect(prepare).toHaveBeenCalledWith(
			expect.stringContaining("marketing_app_signup_subscribers"),
		);
		expect(bind).toHaveBeenCalledWith(
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
			"owner-user",
		);
	});

	it("looks up only active owners before mirroring active subscription suppression", async () => {
		const run = vi.fn().mockResolvedValue({ success: true });
		const bind = vi.fn().mockReturnValue({ run });
		const prepare = vi.fn().mockReturnValue({ bind });
		const marketingDb = { prepare } as unknown as D1Database;
		const { db, selectWhere } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, userId: "owner-user" },
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_active_owner_not_deactivated",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_active",
					status: "active",
					metadata: { centerId: "center-1" },
				},
			},
		});

		const res = await post(app, payload, sign(payload), { MARKETING_DB: marketingDb });

		expect(res.status).toBe(200);
		expect(
			selectWhere.mock.calls.some(([predicate]) =>
				sqlConditionColumnNames(predicate).includes("deactivated_at"),
			),
		).toBe(true);
	});

	it("logs D1 suppression mirror failures without failing the Stripe webhook", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const run = vi.fn().mockRejectedValue(new Error("d1 unavailable"));
		const bind = vi.fn().mockReturnValue({ run });
		const prepare = vi.fn().mockReturnValue({ bind });
		const marketingDb = { prepare } as unknown as D1Database;
		const { db, set } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, userId: "owner-user" },
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_active_d1_down",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_active",
					status: "active",
					metadata: { centerId: "center-1" },
				},
			},
		});

		const res = await post(app, payload, sign(payload), { MARKETING_DB: marketingDb });

		expect(res.status).toBe(200);
		expect(set).toHaveBeenCalledWith(expect.objectContaining({ subscriptionStatus: "active" }));
		expect(warn).toHaveBeenCalledWith("App signup D1 suppression mirror failed", "d1 unavailable");
		warn.mockRestore();
	});

	it("does not enqueue trial emails when no owner email can be resolved", async () => {
		const { db, insertValues } = makeWebhookDb({ centerLookup: { stripeCustomerId: null } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_no_owner_email",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_owner_missing",
					subscription: "sub_owner_missing",
					customer: "cus_owner_missing",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(insertValues).toHaveBeenCalledTimes(1);
	});

	it("does not burn the webhook idempotency record when trial notification enqueue fails", async () => {
		let ownerLookupShouldFail = true;
		const committedEventIds = new Set<string>();

		const where = vi.fn().mockResolvedValue(undefined);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		const selectLimit = vi.fn().mockImplementation(async () => {
			if (ownerLookupShouldFail) {
				throw new Error("owner lookup failed");
			}

			return [{ email: "owner@example.com", name: "Jane Owner" }];
		});
		const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
		const selectInnerJoin = vi.fn().mockReturnValue({ where: selectWhere });
		const selectFrom = vi.fn().mockReturnValue({ where: selectWhere, innerJoin: selectInnerJoin });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const transaction = vi
			.fn()
			.mockImplementation(
				async (
					fn: (tx: {
						insert: (...args: unknown[]) => unknown;
						update: typeof update;
						select: typeof select;
					}) => Promise<unknown>,
				) => {
					const stagedEventIds = new Set<string>();
					const txInsertReturning = vi.fn().mockImplementation(async () => {
						if (committedEventIds.has("evt_atomic") || stagedEventIds.has("evt_atomic")) {
							return [];
						}
						stagedEventIds.add("evt_atomic");
						return [{ id: "evt_atomic" }];
					});
					const txOnConflictDoNothing = vi.fn().mockReturnValue({ returning: txInsertReturning });
					const txInsertValues = vi.fn().mockReturnValue({
						onConflictDoNothing: txOnConflictDoNothing,
					});
					const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
					const tx = { insert: txInsert, update, select };

					try {
						const result = await fn(tx);
						for (const eventId of stagedEventIds) {
							committedEventIds.add(eventId);
						}
						return result;
					} catch (error) {
						return Promise.reject(error);
					}
				},
			);

		const db = createMockDb({ select, update, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_atomic",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_atomic",
					subscription: "sub_atomic",
					customer: "cus_atomic",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});

		const firstResponse = await post(app, payload, sign(payload));
		expect(firstResponse.status).toBe(500);
		expect(committedEventIds.size).toBe(0);

		ownerLookupShouldFail = false;

		const secondResponse = await post(app, payload, sign(payload));
		expect(secondResponse.status).toBe(200);
		await expect(secondResponse.json()).resolves.toEqual({ received: true });
		expect(committedEventIds.has("evt_atomic")).toBe(true);
	});

	it("handles checkout.session.completed and stores ids/plan/trialing status", async () => {
		const { db, set, insertValues } = makeWebhookDb({
			centerLookup: {
				stripeCustomerId: null,
				email: "owner@example.com",
				name: "Jane Owner",
			},
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_1",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_1",
					subscription: "sub_1",
					customer: "cus_1",
					trial_end: 1_790_000_000,
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		const arg = set.mock.calls[0][0];
		expect(arg.stripeSubscriptionId).toBe("sub_1");
		expect(arg.stripeCustomerId).toBe("cus_1");
		expect(arg.subscriptionPlan).toBe("home");
		expect(arg.subscriptionStatus).toBe("trialing");
		expect(arg.trialEndsAt).toBeInstanceOf(Date);
		const notificationValues = insertValues.mock.calls[1]?.[0];
		expect(notificationValues).toHaveLength(2);
		expect(notificationValues[0]).toMatchObject({
			kind: "trial_started",
			recipientEmail: "owner@example.com",
			subscriptionPlan: "home",
		});
		expect(notificationValues[1]).toMatchObject({
			kind: "trial_ending_soon",
			recipientEmail: "owner@example.com",
			subscriptionPlan: "home",
		});
		expect(notificationValues[1].dueAt).toEqual(
			new Date((1_790_000_000 - TRIAL_END_REMINDER_DAYS * 24 * 60 * 60) * 1000),
		);
	});

	it("captures billing lifecycle analytics without raw center identifiers", async () => {
		const { db } = makeWebhookDb({ centerLookup: { stripeCustomerId: null } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_analytics",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_analytics",
					subscription: "sub_analytics",
					customer: "cus_analytics",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const waitUntilPromises: Array<Promise<unknown>> = [];
		const executionCtx = {
			waitUntil: vi.fn((promise: Promise<unknown>) => {
				waitUntilPromises.push(promise);
			}),
		} as unknown as ExecutionContext;
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("{}", { status: 200 }));
		try {
			const res = await post(
				app,
				payload,
				sign(payload),
				{
					POSTHOG_PROJECT_API_KEY: "phc_test",
					POSTHOG_HOST: "https://posthog.test",
				},
				executionCtx,
			);

			expect(res.status).toBe(200);
			await Promise.all(waitUntilPromises);
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			const bodies = fetchSpy.mock.calls.map(([, init]) =>
				JSON.parse(String((init as RequestInit).body)),
			);
			expect(bodies).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						event: "subscription_checkout_completed",
						distinct_id: expect.stringMatching(/^center:[a-f0-9]{64}$/),
						properties: {
							plan: "home",
							subscription_status: "trialing",
						},
					}),
					expect.objectContaining({
						event: "checkout_completed",
						distinct_id: expect.stringMatching(/^center:[a-f0-9]{64}$/),
						properties: {
							plan: "home",
							subscription_status: "trialing",
						},
					}),
				]),
			);
			expect(JSON.stringify(bodies)).not.toContain("center-1");
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it("looks up only active owners before enqueueing trial notifications", async () => {
		const { db, insertValues, selectWhere } = makeWebhookDb({
			centerLookup: {
				stripeCustomerId: null,
				email: "owner@example.com",
				name: "Jane Owner",
			},
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_trial_owner_not_deactivated",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_trial_owner_not_deactivated",
					subscription: "sub_trial_owner_not_deactivated",
					customer: "cus_trial_owner_not_deactivated",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});

		const res = await post(app, payload, sign(payload));

		expect(res.status).toBe(200);
		expect(insertValues.mock.calls[1]?.[0]).toHaveLength(2);
		expect(
			selectWhere.mock.calls.some(([predicate]) =>
				sqlConditionColumnNames(predicate).includes("deactivated_at"),
			),
		).toBe(true);
	});

	it("falls back to ~30 day trialEndsAt when checkout has no trial_end", async () => {
		const { db, set } = makeWebhookDb({ centerLookup: { stripeCustomerId: null } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_1b",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_1b",
					subscription: "sub_1b",
					customer: "cus_1b",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const before = Date.now();
		await post(app, payload, sign(payload));
		const arg = set.mock.calls[0][0];
		const ms = (arg.trialEndsAt as Date).getTime() - before;
		expect(ms).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
		expect(ms).toBeLessThan(31 * 24 * 60 * 60 * 1000);
	});

	it("rejects checkout.session.completed when customer mismatches the center on file", async () => {
		const { db, update } = makeWebhookDb({
			centerLookup: { stripeCustomerId: "cus_existing" },
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_mm1",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_mm",
					subscription: "sub_mm",
					customer: "cus_attacker",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, mismatch: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("ignores checkout.session.completed with no centerId", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_no_center",
			type: "checkout.session.completed",
			data: { object: { id: "cs_1" } },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});

	it("acknowledges checkout.session.completed with malformed center metadata", async () => {
		const invalidUuidError = Object.assign(new Error("invalid input syntax for type uuid"), {
			code: "22P02",
		});
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockRejectedValue(invalidUuidError),
				}),
			}),
		});
		const update = vi.fn();
		const db = createMockDb({ select, update });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_bad_checkout_center",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_bad_center",
					customer: "cus_123",
					subscription: "sub_bad_center",
					metadata: { centerId: "not-a-uuid", plan: "center_starter" },
				},
			},
		});

		const res = await post(app, payload, sign(payload));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("handles customer.subscription.created with trial + period end", async () => {
		const { db, set, insertValues } = makeWebhookDb({
			centerLookup: {
				stripeCustomerId: "cus_match",
				email: "owner@example.com",
				name: "Jane Owner",
			},
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_2",
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_2",
					status: "trialing",
					customer: "cus_match",
					current_period_end: 1_800_000_000,
					trial_end: 1_790_000_000,
					metadata: { centerId: "center-1", plan: "center_starter" },
					items: { data: [{ price: { id: "price_center_starter_annual" } }] },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		const arg = set.mock.calls[0][0];
		expect(arg.subscriptionStatus).toBe("trialing");
		expect(arg.subscriptionPlan).toBe("center_starter");
		expect(arg.trialEndsAt).toBeInstanceOf(Date);
		expect(arg.currentPeriodEnd).toBeInstanceOf(Date);
		expect(insertValues.mock.calls[1]?.[0]).toHaveLength(2);
	});

	it("does not fail after a committed trialing subscription when a redundant post-commit enqueue would error", async () => {
		const where = vi.fn().mockResolvedValue(undefined);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		let dbSelectCalls = 0;
		const selectLimit = vi.fn().mockImplementation(async () => {
			dbSelectCalls += 1;
			if (dbSelectCalls === 1) {
				return [{ stripeCustomerId: "cus_match" }];
			}

			throw new Error("owner lookup should not run twice");
		});
		const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
		const selectInnerJoin = vi.fn().mockReturnValue({ where: selectWhere });
		const selectFrom = vi.fn().mockReturnValue({ where: selectWhere, innerJoin: selectInnerJoin });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const txInsertReturning = vi.fn().mockResolvedValue([{ id: "evt_trial_once" }]);
		const txOnConflictDoNothing = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflictDoNothing });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

		const txSelectLimit = vi
			.fn()
			.mockResolvedValue([{ email: "owner@example.com", name: "Jane Owner" }]);
		const txSelectWhere = vi.fn().mockReturnValue({ limit: txSelectLimit });
		const txSelectInnerJoin = vi.fn().mockReturnValue({ where: txSelectWhere });
		const txSelectFrom = vi.fn().mockReturnValue({
			where: txSelectWhere,
			innerJoin: txSelectInnerJoin,
		});
		const txSelect = vi.fn().mockReturnValue({ from: txSelectFrom });
		const transaction = vi
			.fn()
			.mockImplementation(
				async (
					fn: (tx: {
						insert: typeof txInsert;
						update: typeof update;
						select: typeof txSelect;
					}) => Promise<unknown>,
				) => fn({ insert: txInsert, update, select: txSelect }),
			);

		const db = createMockDb({ select, update, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_trial_once",
			type: "customer.subscription.created",
			data: {
				object: {
					id: "sub_trial_once",
					status: "trialing",
					customer: "cus_match",
					current_period_end: 1_800_000_000,
					trial_end: 1_790_000_000,
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});

		const res = await post(app, payload, sign(payload));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(txInsertValues).toHaveBeenCalledTimes(2);
		expect(selectInnerJoin).not.toHaveBeenCalled();
	});

	it("rejects customer.subscription.updated when sub.customer mismatches center", async () => {
		const { db, update } = makeWebhookDb({
			centerLookup: { stripeCustomerId: "cus_owner" },
		});
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_mm2",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_mm2",
					status: "active",
					customer: "cus_other",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, mismatch: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("acknowledges customer.subscription.updated with malformed center metadata", async () => {
		const invalidUuidError = Object.assign(new Error("invalid input syntax for type uuid"), {
			code: "22P02",
		});
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockRejectedValue(invalidUuidError),
				}),
			}),
		});
		const update = vi.fn();
		const db = createMockDb({ select, update });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_bad_subscription_center",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_bad_center",
					status: "active",
					customer: "cus_123",
					metadata: { centerId: "not-a-uuid", plan: "center_starter" },
					items: { data: [{ price: { id: "price_center_starter_monthly" } }] },
				},
			},
		});

		const res = await post(app, payload, sign(payload));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("falls back to price-id plan resolution when metadata plan is missing", async () => {
		const { db, set } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_3",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_3",
					status: "active",
					metadata: { centerId: "center-1" },
					items: { data: [{ price: { id: "price_home_monthly" } }] },
				},
			},
		});
		await post(app, payload, sign(payload));
		expect(set.mock.calls[0][0].subscriptionPlan).toBe("home");
	});

	it("resolves center price and handles unknown price id as null plan", async () => {
		const { db, set } = makeWebhookDb({
			idempotencyResults: [[{ id: "a" }], [{ id: "b" }], [{ id: "c" }], [{ id: "d" }]],
		});
		const app = createTestApp(mount, db);
		const payloadCenter = JSON.stringify({
			id: "evt_c1",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_c1",
					status: "active",
					metadata: { centerId: "center-1" },
					items: { data: [{ price: { id: "price_center_starter_annual" } }] },
				},
			},
		});
		await post(app, payloadCenter, sign(payloadCenter));
		expect(set.mock.calls[0][0].subscriptionPlan).toBe("center_starter");

		const payloadCenterPro = JSON.stringify({
			id: "evt_c1_pro",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_c1_pro",
					status: "active",
					metadata: { centerId: "center-1" },
					items: { data: [{ price: { id: "price_center_pro_monthly" } }] },
				},
			},
		});
		await post(app, payloadCenterPro, sign(payloadCenterPro));
		expect(set.mock.calls[1][0].subscriptionPlan).toBe("center_pro");

		const payloadGroup = JSON.stringify({
			id: "evt_c1_group",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_c1_group",
					status: "active",
					metadata: { centerId: "center-1" },
					items: { data: [{ price: { id: "price_group_annual" } }] },
				},
			},
		});
		await post(app, payloadGroup, sign(payloadGroup));
		expect(set.mock.calls[2][0].subscriptionPlan).toBe("group");

		const payloadUnknown = JSON.stringify({
			id: "evt_c2",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_c2",
					status: "active",
					metadata: { centerId: "center-1" },
					items: { data: [{ price: { id: "price_mystery" } }] },
				},
			},
		});
		await post(app, payloadUnknown, sign(payloadUnknown));
		// Bug D: subscriptionPlan is omitted (not set to null) when plan cannot be resolved
		expect("subscriptionPlan" in set.mock.calls[3][0]).toBe(false);
	});

	it("marks status canceled for customer.subscription.deleted", async () => {
		const { db, set } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_4",
			type: "customer.subscription.deleted",
			data: {
				object: {
					id: "sub_4",
					status: "canceled",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		await post(app, payload, sign(payload));
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("canceled");
	});

	it("skips subscription events with no centerId metadata", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_5",
			type: "customer.subscription.updated",
			data: { object: { id: "sub_5", status: "active" } },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});

	it("skips subscription events when metadata centerId does not resolve to a center", async () => {
		const { db, update, insert } = makeWebhookDb({ centerLookup: null });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_missing_subscription_center",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_missing_center",
					status: "active",
					customer: "cus_missing_center",
					metadata: { centerId: "50000000-0000-0000-0000-000000000404", plan: "home" },
					items: { data: [{ price: { id: "price_home_monthly" } }] },
				},
			},
		});

		const res = await post(app, payload, sign(payload));

		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
		expect(update).not.toHaveBeenCalled();
		expect(insert).not.toHaveBeenCalled();
	});

	it("handles invoice.payment_failed via subscription lookup", async () => {
		const txWhere = vi.fn().mockResolvedValue(undefined);
		const txSet = vi.fn().mockReturnValue({ where: txWhere });
		const txUpdate = vi.fn().mockReturnValue({ set: txSet });

		const txInsertReturning = vi.fn().mockResolvedValue([{ id: "evt_inv1" }]);
		const txOnConflictDoNothing = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflictDoNothing });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

		const tx = { insert: txInsert, update: txUpdate };
		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));

		const subLookupLimit = vi.fn().mockResolvedValue([{ id: "center-7" }]);
		const subLookupWhere = vi.fn().mockReturnValue({ limit: subLookupLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: subLookupWhere });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const db = createMockDb({ select, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_inv1",
			type: "invoice.payment_failed",
			data: {
				object: {
					id: "in_1",
					subscription: "sub_known",
					customer: "cus_known",
				},
			},
		});
		await post(app, payload, sign(payload));
		expect(txSet.mock.calls[0][0].subscriptionStatus).toBe("past_due");
		expect(txWhere).toHaveBeenCalled();
	});

	it("skips invoice.payment_failed when subscription lookup returns no center (no customer fallback)", async () => {
		const update = vi.fn();
		const subLookupLimit = vi.fn().mockResolvedValue([]);
		const subLookupWhere = vi.fn().mockReturnValue({ limit: subLookupLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: subLookupWhere });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const db = createMockDb({ update, select });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_inv2",
			type: "invoice.payment_failed",
			data: {
				object: {
					id: "in_2",
					subscription: "sub_unknown",
					customer: "cus_known",
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		// Bug C: no fallback to customer lookup — no update should happen
		expect(update).not.toHaveBeenCalled();
		// only one select call (subscription lookup), no second one for customer
		expect(select.mock.calls.length).toBe(1);
	});

	it("skips invoice.payment_failed when no center can be resolved", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_inv3",
			type: "invoice.payment_failed",
			data: { object: { id: "in_3" } },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});

	it("returns received for unknown event types without mutating", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_unk",
			type: "customer.created",
			data: { object: {} },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(update).not.toHaveBeenCalled();
	});

	it("processes events with no id without short-circuiting", async () => {
		const { db, set } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_no_evt_id",
					status: "active",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("active");
	});

	// Bug A — idempotency + state mutation must be inside a single transaction
	it("rolls back idempotency row when center update fails (transaction isolation)", async () => {
		const txUpdate = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockRejectedValue(new Error("DB write failure")),
			}),
		});
		const txInsertReturning = vi.fn().mockResolvedValue([{ id: "evt_tx1" }]);
		const txOnConflict = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflict });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
		const tx = { insert: txInsert, update: txUpdate };

		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ stripeCustomerId: null }]),
				}),
			}),
		});
		const db = createMockDb({ select, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_tx1",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_tx1",
					status: "active",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		// The transaction threw — the error should propagate as a 500 (not silently eaten),
		// confirming the idempotency insert is inside the same tx that can be rolled back.
		expect(res.status).toBe(500);
	});

	it("returns duplicate:true for a duplicate idempotency row even when inside a transaction", async () => {
		const uniqueError = Object.assign(new Error("duplicate key"), { code: "23505" });
		const txInsertReturning = vi.fn().mockResolvedValue([]);
		const txOnConflict = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflict });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
		const tx = { insert: txInsert };

		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ stripeCustomerId: null }]),
				}),
			}),
		});
		const db = createMockDb({ select, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_dup2",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_dup2",
					status: "active",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });

		// suppress unused variable lint
		void uniqueError;
	});

	// Bug B — checkout.session.completed must fail closed when customer is absent and no client_reference_id
	it("rejects checkout.session.completed when customer absent and no client_reference_id", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_b1",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_b1",
					subscription: "sub_b1",
					// no customer, no client_reference_id — only metadata centerId
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		// must NOT mutate state — fail closed
		expect(update).not.toHaveBeenCalled();
	});

	it("accepts checkout.session.completed when customer is absent but client_reference_id is present", async () => {
		const { db, set } = makeWebhookDb({ centerLookup: { stripeCustomerId: null } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_b2",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_b2",
					subscription: "sub_b2",
					client_reference_id: "center-1",
					// no customer field — Stripe sets client_reference_id server-side
					metadata: { centerId: "center-1", plan: "center_starter" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("trialing");
	});

	// Bug C — invoice.payment_failed must NOT fall back to stripeCustomerId
	it("does not fall back to customer lookup when subscription lookup misses for payment_failed", async () => {
		const where = vi.fn().mockResolvedValue(undefined);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		const txInsertReturning = vi.fn().mockResolvedValue([{ id: "evt_c1" }]);
		const txOnConflict = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflict });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
		const txUpdate = vi.fn().mockReturnValue({
			set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
		});
		const tx = { insert: txInsert, update: txUpdate };
		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));

		// subscription lookup returns empty — no center found
		const selectLimit = vi.fn().mockResolvedValue([]);
		const selectWhere = vi.fn().mockReturnValue({ limit: selectLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: selectWhere });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const db = createMockDb({ update, select, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_c1",
			type: "invoice.payment_failed",
			data: {
				object: {
					id: "in_c1",
					subscription: "sub_unknown",
					customer: "cus_c1",
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		// must not fall back to customer — no update
		expect(update).not.toHaveBeenCalled();
		// select was called at most once (subscription lookup only)
		expect(select.mock.calls.length).toBeLessThanOrEqual(1);
	});

	it("skips invoice.payment_failed entirely when invoice.subscription is absent", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_c2",
			type: "invoice.payment_failed",
			data: {
				object: {
					id: "in_c2",
					customer: "cus_c2",
					// no subscription field
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});

	// Bug D — subscriptionPlan must not be set when plan is null
	it("omits subscriptionPlan from update when checkout metadata plan is absent", async () => {
		const { db, set } = makeWebhookDb({ centerLookup: { stripeCustomerId: "cus_match" } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_d1",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_d1",
					subscription: "sub_d1",
					customer: "cus_match",
					metadata: { centerId: "center-1" }, // no plan
				},
			},
		});
		await post(app, payload, sign(payload));
		const arg = set.mock.calls[0][0];
		expect("subscriptionPlan" in arg).toBe(false);
	});

	it("omits subscriptionPlan from update when subscription metadata plan is absent and price resolves to null", async () => {
		const { db, set } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_d2",
			type: "customer.subscription.updated",
			data: {
				object: {
					id: "sub_d2",
					status: "active",
					metadata: { centerId: "center-1" }, // no plan
					items: { data: [{ price: { id: "price_unknown_xyz" } }] },
				},
			},
		});
		await post(app, payload, sign(payload));
		const arg = set.mock.calls[0][0];
		expect("subscriptionPlan" in arg).toBe(false);
	});

	// Additional coverage for invoice.payment_failed transaction paths
	it("returns duplicate:true when invoice.payment_failed idempotency detects a duplicate inside the transaction", async () => {
		const txInsertReturning = vi.fn().mockResolvedValue([]); // empty = duplicate
		const txOnConflict = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflict });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
		const tx = { insert: txInsert };
		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));

		const subLookupLimit = vi.fn().mockResolvedValue([{ id: "center-dup" }]);
		const subLookupWhere = vi.fn().mockReturnValue({ limit: subLookupLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: subLookupWhere });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const db = createMockDb({ select, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_inv_dup",
			type: "invoice.payment_failed",
			data: { object: { id: "in_dup", subscription: "sub_dup" } },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
	});

	it("processes invoice.payment_failed without id (no transaction wrapping)", async () => {
		const where = vi.fn().mockResolvedValue(undefined);
		const set = vi.fn().mockReturnValue({ where });
		const update = vi.fn().mockReturnValue({ set });

		const subLookupLimit = vi.fn().mockResolvedValue([{ id: "center-noid" }]);
		const subLookupWhere = vi.fn().mockReturnValue({ limit: subLookupLimit });
		const selectFrom = vi.fn().mockReturnValue({ where: subLookupWhere });
		const select = vi.fn().mockReturnValue({ from: selectFrom });

		const db = createMockDb({ update, select });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			// no id field — triggers the else branch
			type: "invoice.payment_failed",
			data: { object: { id: "in_noid", subscription: "sub_noid" } },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("past_due");
	});

	// Coverage for checkout.session.completed with no event id (else branch — no transaction)
	it("processes checkout.session.completed without event id (no transaction wrapping)", async () => {
		const { db, set } = makeWebhookDb({ centerLookup: { stripeCustomerId: "cus_noid" } });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			// no id field
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_noid",
					subscription: "sub_noid",
					customer: "cus_noid",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("trialing");
	});

	// Coverage for checkout.session.completed when customer is absent but client_reference_id present
	// and duplicate detected inside transaction
	it("returns duplicate:true for checkout.session.completed idempotency duplicate", async () => {
		const txInsertReturning = vi.fn().mockResolvedValue([]);
		const txOnConflict = vi.fn().mockReturnValue({ returning: txInsertReturning });
		const txInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: txOnConflict });
		const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });
		const tx = { insert: txInsert };
		const transaction = vi
			.fn()
			.mockImplementation(async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx));

		// Center must exist so the handler proceeds to the idempotency check.
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([{ id: "center-1", stripeCustomerId: "cus_dup" }]),
				}),
			}),
		});

		const db = createMockDb({ transaction, select });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_co_dup",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_dup",
					subscription: "sub_dup",
					customer: "cus_dup",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true, duplicate: true });
	});

	// Fix 5: centerId from metadata must resolve to a real center before processing
	it("rejects checkout.session.completed silently when centerId from metadata does not match any center", async () => {
		// center lookup returns empty — centerId is invalid
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
		const update = vi.fn();
		const transaction = vi.fn();
		const db = createMockDb({ select, update, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_fix5_bad_center",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_fix5",
					subscription: "sub_fix5",
					customer: "cus_fix5",
					metadata: { centerId: "center-nonexistent", plan: "home" },
				},
			},
		});
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		// Must not mutate anything — center doesn't exist
		expect(update).not.toHaveBeenCalled();
		expect(transaction).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	it("rejects checkout.session.completed silently when centerId from client_reference_id does not match any center", async () => {
		// center lookup returns empty for client_reference_id path
		const select = vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue([]),
				}),
			}),
		});
		const update = vi.fn();
		const transaction = vi.fn();
		const db = createMockDb({ select, update, transaction });
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_fix5_bad_refid",
			type: "checkout.session.completed",
			data: {
				object: {
					id: "cs_fix5b",
					subscription: "sub_fix5b",
					// client_reference_id set but points to nonexistent center
					client_reference_id: "center-fake-999",
					metadata: { plan: "home" },
				},
			},
		});
		const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ received: true });
		expect(update).not.toHaveBeenCalled();
		expect(transaction).not.toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	// Coverage for sub.status absent (triggers `?? "incomplete"` branch) and sub.id absent
	it("maps absent sub.status to incomplete and handles absent sub.id", async () => {
		const { db, set } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_no_status",
			type: "customer.subscription.updated",
			data: {
				object: {
					// no status field — exercises sub.status ?? "incomplete"
					// no id field — exercises sub.id ?? undefined
					customer: "cus_1",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		await post(app, payload, sign(payload));
		expect(set.mock.calls[0][0].subscriptionStatus).toBe("incomplete");
		expect(set.mock.calls[0][0].stripeSubscriptionId).toBeUndefined();
	});

	// Coverage for event.data?.object absent in invoice.payment_failed (exercises ?? {})
	it("skips invoice.payment_failed gracefully when event data object is null", async () => {
		const { db, update } = makeWebhookDb();
		const app = createTestApp(mount, db);
		const payload = JSON.stringify({
			id: "evt_null_obj",
			type: "invoice.payment_failed",
			data: { object: null },
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		expect(update).not.toHaveBeenCalled();
	});

	// Ordering guard: stale event protection
	it("applies a newer subscription event and advances stripeSubscriptionEventCreatedAt", async () => {
		const storedTs = new Date(1_700_000_000 * 1000);
		const { db, set } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, stripeSubscriptionEventCreatedAt: storedTs },
		});
		const app = createTestApp(mount, db);
		const newerCreated = 1_700_001_000; // 1000s after stored marker
		const payload = JSON.stringify({
			id: "evt_order_newer",
			type: "customer.subscription.updated",
			created: newerCreated,
			data: {
				object: {
					id: "sub_order_newer",
					status: "active",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		const arg = set.mock.calls[0][0];
		expect(arg.subscriptionStatus).toBe("active");
		expect(arg.stripeSubscriptionEventCreatedAt).toEqual(new Date(newerCreated * 1000));
	});

	it("treats a stale subscription event as a no-op: center not updated, 200 returned, event recorded", async () => {
		const storedTs = new Date(1_700_002_000 * 1000);
		const { db, where, insert } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, stripeSubscriptionEventCreatedAt: storedTs },
		});
		const app = createTestApp(mount, db);
		const olderCreated = 1_700_001_000; // 1000s before stored marker
		const payload = JSON.stringify({
			id: "evt_order_stale",
			type: "customer.subscription.updated",
			created: olderCreated,
			data: {
				object: {
					id: "sub_order_stale",
					status: "canceled",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toMatchObject({ received: true });
		// The event is still recorded for idempotency even when stale.
		expect(insert).toHaveBeenCalled();
		// The mock db cannot evaluate the SQL WHERE clause (row-level rejection is enforced
		// by Postgres at runtime), so we assert the ordering guard is actually constructed and
		// attached to the centers update: its predicate must reference the marker column. If the
		// guard regresses (clause dropped), the stale write would silently win — this catches it.
		const guardedUpdate = where.mock.calls.find((call) =>
			sqlConditionColumnNames(call[0]).includes("stripe_subscription_event_created_at"),
		);
		expect(guardedUpdate).toBeDefined();
	});

	it("applies the first subscription event when stripeSubscriptionEventCreatedAt is NULL", async () => {
		const { db, set } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, stripeSubscriptionEventCreatedAt: null },
		});
		const app = createTestApp(mount, db);
		const created = 1_700_000_500;
		const payload = JSON.stringify({
			id: "evt_order_first",
			type: "customer.subscription.updated",
			created,
			data: {
				object: {
					id: "sub_order_first",
					status: "trialing",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		const arg = set.mock.calls[0][0];
		expect(arg.subscriptionStatus).toBe("trialing");
		expect(arg.stripeSubscriptionEventCreatedAt).toEqual(new Date(created * 1000));
	});

	it("applies a same-second subscription event (equal timestamp still applies via lte guard)", async () => {
		const storedTs = new Date(1_700_000_000 * 1000);
		const { db, set } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, stripeSubscriptionEventCreatedAt: storedTs },
		});
		const app = createTestApp(mount, db);
		const sameCreated = 1_700_000_000; // same second as stored marker
		const payload = JSON.stringify({
			id: "evt_order_same_second",
			type: "customer.subscription.updated",
			created: sameCreated,
			data: {
				object: {
					id: "sub_order_same",
					status: "active",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		const arg = set.mock.calls[0][0];
		expect(arg.subscriptionStatus).toBe("active");
		expect(arg.stripeSubscriptionEventCreatedAt).toEqual(new Date(sameCreated * 1000));
	});

	it("applies the ordering guard on customer.subscription.deleted events", async () => {
		const storedTs = new Date(1_700_000_000 * 1000);
		const { db, set } = makeWebhookDb({
			centerLookup: { stripeCustomerId: null, stripeSubscriptionEventCreatedAt: storedTs },
		});
		const app = createTestApp(mount, db);
		const newerCreated = 1_700_005_000;
		const payload = JSON.stringify({
			id: "evt_order_deleted",
			type: "customer.subscription.deleted",
			created: newerCreated,
			data: {
				object: {
					id: "sub_order_del",
					status: "canceled",
					metadata: { centerId: "center-1", plan: "home" },
				},
			},
		});
		const res = await post(app, payload, sign(payload));
		expect(res.status).toBe(200);
		const arg = set.mock.calls[0][0];
		expect(arg.subscriptionStatus).toBe("canceled");
		expect(arg.stripeSubscriptionEventCreatedAt).toEqual(new Date(newerCreated * 1000));
	});
});
