import { describe, expect, it, vi } from "vitest";
import {
	createSignedInvoiceAccessToken,
	createStripeWebhookSignature,
	deriveStripeAccountStatus,
	signPublicInvoiceToken,
	verifyPublicInvoiceToken,
	verifyStripeWebhookSignature,
} from "./public-billing.js";

describe("public invoice tokens", () => {
	it("creates and verifies signed invoice access tokens", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));

		const token = createSignedInvoiceAccessToken(
			{
				id: "invoice-1",
				publicLinkToken: "nonce-1",
				publicLinkVersion: 2,
				createdAt: new Date("2026-05-01T12:00:00.000Z"),
			},
			"secret",
		);

		expect(token).toBeTypeOf("string");
		expect(verifyPublicInvoiceToken(token ?? "", "secret")).toEqual({
			invoiceId: "invoice-1",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 2,
			expiresAt: "2026-05-31T12:00:00.000Z",
		});
		vi.useRealTimers();
	});

	it("does not create access tokens for missing or expired public links", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));

		expect(
			createSignedInvoiceAccessToken(
				{
					id: "invoice-1",
					publicLinkToken: null,
					publicLinkVersion: 1,
					createdAt: new Date("2026-05-01T12:00:00.000Z"),
				},
				"secret",
			),
		).toBeUndefined();
		expect(
			createSignedInvoiceAccessToken(
				{
					id: "invoice-2",
					publicLinkToken: "nonce-2",
					publicLinkVersion: 1,
					createdAt: new Date("2026-03-01T12:00:00.000Z"),
				},
				"secret",
			),
		).toBeUndefined();
		vi.useRealTimers();
	});

	it("rejects malformed, tampered, invalid-date, and expired tokens", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));

		expect(verifyPublicInvoiceToken("missing-signature", "secret")).toBeNull();
		expect(verifyPublicInvoiceToken("payload.signature", "secret")).toBeNull();

		const invalidDate = signPublicInvoiceToken({
			invoiceId: "invoice-1",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 1,
			expiresAt: "not-a-date",
			secret: "secret",
		});
		expect(verifyPublicInvoiceToken(invalidDate, "secret")).toBeNull();

		const expired = signPublicInvoiceToken({
			invoiceId: "invoice-1",
			publicLinkToken: "nonce-1",
			publicLinkVersion: 1,
			expiresAt: "2026-05-01T12:00:00.000Z",
			secret: "secret",
		});
		expect(verifyPublicInvoiceToken(expired, "secret")).toBeNull();
		vi.useRealTimers();
	});
});

describe("Stripe webhook signatures", () => {
	it("rejects missing, incomplete, invalid timestamp, expired, and mismatched signatures", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-02T12:00:00.000Z"));

		expect(verifyStripeWebhookSignature("{}", null, "secret")).toBe(false);
		expect(verifyStripeWebhookSignature("{}", "t=1777723200", "secret")).toBe(false);
		expect(verifyStripeWebhookSignature("{}", "t=nope,v1=abc", "secret")).toBe(false);
		expect(verifyStripeWebhookSignature("{}", "t=1777722000,v1=abc", "secret")).toBe(false);

		const signature = createStripeWebhookSignature("{}", "secret");
		expect(verifyStripeWebhookSignature("{}", signature, "other-secret")).toBe(false);
		expect(verifyStripeWebhookSignature("{}", signature, "secret")).toBe(true);
		vi.useRealTimers();
	});
});

describe("deriveStripeAccountStatus", () => {
	it.each([
		[{ requirements: { disabled_reason: "requirements.past_due" } }, "disabled"],
		[{ charges_enabled: true, details_submitted: true }, "connected"],
		[{ details_submitted: true }, "restricted"],
		[{}, "pending"],
	] as const)("maps %o to %s", (account, expected) => {
		expect(deriveStripeAccountStatus(account)).toBe(expected);
	});
});
