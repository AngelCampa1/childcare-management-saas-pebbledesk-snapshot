import type { Database } from "@pebbledesk/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@pebbledesk/emails", () => ({
	renderSubscriptionEmail: vi.fn(),
}));

vi.mock("../lib/email.js", () => ({
	sendEmail: vi.fn(),
}));

const { runSubscriptionNotificationDispatcher } = await import(
	"./subscription-notification-dispatcher.js"
);
const { renderSubscriptionEmail } = await import("@pebbledesk/emails");
const { sendEmail } = await import("../lib/email.js");

const mockRenderSubscriptionEmail = vi.mocked(renderSubscriptionEmail);
const mockSendEmail = vi.mocked(sendEmail);

const ENV = {
	APP_URL: "https://my.pebbledesk.app",
	RESEND_API_KEY: "re_test_key",
	RESEND_FROM_EMAIL: "angel.campa@pebbledesk.app",
} as Parameters<typeof runSubscriptionNotificationDispatcher>[0];

function makeRow(
	overrides: Partial<{
		id: string;
		kind: "trial_started" | "trial_ending_soon";
		recipientEmail: string;
		recipientName: string | null;
		subscriptionPlan: string;
		trialStartedAt: Date;
		trialEndsAt: Date;
		attempts: number;
	}> = {},
) {
	return {
		id: overrides.id ?? "notification-1",
		kind: overrides.kind ?? "trial_started",
		recipientEmail: overrides.recipientEmail ?? "owner@example.com",
		recipientName: overrides.recipientName === undefined ? "Jane Smith" : overrides.recipientName,
		subscriptionPlan: overrides.subscriptionPlan ?? "center_starter",
		trialStartedAt: overrides.trialStartedAt ?? new Date("2026-04-20T00:00:00.000Z"),
		trialEndsAt: overrides.trialEndsAt ?? new Date("2026-05-20T00:00:00.000Z"),
		attempts: overrides.attempts ?? 0,
	};
}

function makeDb(rows: ReturnType<typeof makeRow>[]) {
	const whereMock = vi.fn().mockResolvedValue(undefined);
	const setMock = vi.fn().mockReturnValue({ where: whereMock });
	const updateMock = vi.fn().mockReturnValue({ set: setMock });
	const executeMock = vi.fn().mockResolvedValue({ rows });

	const db = {
		execute: executeMock,
		update: updateMock,
	} as unknown as Database;

	return { db, executeMock, setMock, updateMock };
}

beforeEach(() => {
	vi.clearAllMocks();
	mockRenderSubscriptionEmail.mockResolvedValue({
		html: "<p>Trial email</p>",
		text: "Trial email",
		subject: "PebbleDesk trial update",
	});
	mockSendEmail.mockResolvedValue(undefined);
});

describe("runSubscriptionNotificationDispatcher", () => {
	it("sends due trial-started notifications and marks them sent", async () => {
		const row = makeRow();
		const { db, setMock } = makeDb([row]);

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(mockRenderSubscriptionEmail).toHaveBeenCalledWith(
			"subscription-trial-started",
			expect.objectContaining({
				firstName: "Jane",
				planLabel: "Center Starter",
				monthlyPriceLabel: "$159/month",
				billingUrl: "https://my.pebbledesk.app/billing",
			}),
		);
		expect(mockSendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: row.recipientEmail,
				from: ENV.RESEND_FROM_EMAIL,
				apiKey: ENV.RESEND_API_KEY,
			}),
		);
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "sent",
				sentAt: expect.any(Date),
				processingStartedAt: null,
			}),
		);
	});

	it("uses the ending-soon template for reminder rows", async () => {
		const row = makeRow({ kind: "trial_ending_soon" });
		const { db } = makeDb([row]);

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(mockRenderSubscriptionEmail).toHaveBeenCalledWith(
			"subscription-trial-ending-soon",
			expect.any(Object),
		);
	});

	it("skips rows with unknown subscription plans", async () => {
		const row = makeRow({ subscriptionPlan: "legacy" });
		const { db, executeMock, setMock } = makeDb([row]);
		executeMock.mockResolvedValueOnce([row]);

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(mockRenderSubscriptionEmail).not.toHaveBeenCalled();
		expect(mockSendEmail).not.toHaveBeenCalled();
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "skipped",
				lastError: "Unknown subscription plan",
				processingStartedAt: null,
			}),
		);
	});

	it("handles empty execute results without processing rows", async () => {
		const { db, executeMock } = makeDb([]);
		executeMock.mockResolvedValueOnce({ rows: undefined });

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(mockRenderSubscriptionEmail).not.toHaveBeenCalled();
		expect(mockSendEmail).not.toHaveBeenCalled();
		expect(executeMock).toHaveBeenCalledTimes(1);
	});

	it("retries failed sends up to the max attempt threshold", async () => {
		const row = makeRow({ attempts: 1 });
		const { db, setMock } = makeDb([row]);
		mockSendEmail.mockRejectedValueOnce(new Error("resend down"));

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				attempts: 2,
				lastError: "resend down",
				processingStartedAt: null,
				status: "pending",
			}),
		);
	});

	it("marks the row failed on the third unsuccessful attempt", async () => {
		const row = makeRow({ attempts: 2 });
		const { db, setMock } = makeDb([row]);
		mockSendEmail.mockRejectedValueOnce(new Error("still failing"));

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				attempts: 3,
				lastError: "still failing",
				processingStartedAt: null,
				status: "failed",
			}),
		);
	});

	it("records non-error send failures and tolerates missing recipient names", async () => {
		const row = makeRow({ recipientName: null });
		const { db, setMock } = makeDb([row]);
		mockSendEmail.mockRejectedValueOnce("resend down");

		await runSubscriptionNotificationDispatcher(ENV, db);

		expect(mockRenderSubscriptionEmail).toHaveBeenCalledWith(
			"subscription-trial-started",
			expect.objectContaining({
				firstName: undefined,
				planLabel: "Center Starter",
			}),
		);
		expect(setMock).toHaveBeenCalledWith(
			expect.objectContaining({
				attempts: 1,
				lastError: "resend down",
				processingStartedAt: null,
				status: "pending",
			}),
		);
	});

	it("reclaims stale processing rows when the worker restarts mid-send", async () => {
		const row = makeRow();
		const { db, executeMock } = makeDb([row]);

		await runSubscriptionNotificationDispatcher(ENV, db);

		const claimQuery = executeMock.mock.calls[0]?.[0];
		const queryText = JSON.stringify(claimQuery);

		expect(queryText).toContain("processing_started_at");
		expect(queryText).toContain("status = 'processing'");
		expect(queryText).toContain("status = 'pending'");
		expect(queryText).toContain("INTERVAL '15 minutes'");
		expect(queryText).not.toContain("INTERVAL '1 minute'");
	});
});
