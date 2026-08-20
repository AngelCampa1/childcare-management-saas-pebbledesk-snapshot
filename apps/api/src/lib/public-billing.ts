import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type PublicInvoiceTokenInput = {
	invoiceId: string;
	publicLinkToken: string;
	publicLinkVersion: number;
	expiresAt: string;
	secret: string;
};

type VerifiedPublicInvoiceToken = Omit<PublicInvoiceTokenInput, "secret">;

type PublicInvoiceLinkRecord = {
	id: string;
	publicLinkToken: string | null;
	publicLinkVersion: number;
	publicLinkRotatedAt?: Date | null;
	createdAt: Date;
};

function encodeBase64Url(value: string) {
	return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string) {
	return Buffer.from(value, "base64url").toString("utf8");
}

function signValue(value: string, secret: string) {
	return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createPublicLinkNonce() {
	return randomBytes(24).toString("base64url");
}

export function isPublicInvoicePayable(status: string) {
	return status === "sent" || status === "overdue";
}

export function signPublicInvoiceToken(input: PublicInvoiceTokenInput) {
	const payload = JSON.stringify({
		invoiceId: input.invoiceId,
		publicLinkToken: input.publicLinkToken,
		publicLinkVersion: input.publicLinkVersion,
		expiresAt: input.expiresAt,
	});

	const encodedPayload = encodeBase64Url(payload);
	const signature = signValue(encodedPayload, input.secret);
	return `${encodedPayload}.${signature}`;
}

export function createSignedInvoiceAccessToken(invoice: PublicInvoiceLinkRecord, secret: string) {
	if (!invoice.publicLinkToken) {
		return undefined;
	}

	const rotatedAt = invoice.publicLinkRotatedAt ?? invoice.createdAt;
	const expiresAt = new Date(rotatedAt.getTime() + 1000 * 60 * 60 * 24 * 30).toISOString();
	if (Date.parse(expiresAt) <= Date.now()) {
		return undefined;
	}

	return signPublicInvoiceToken({
		invoiceId: invoice.id,
		publicLinkToken: invoice.publicLinkToken,
		publicLinkVersion: invoice.publicLinkVersion,
		expiresAt,
		secret,
	});
}

export function verifyPublicInvoiceToken(token: string, secret: string) {
	const [encodedPayload, signature] = token.split(".");
	if (!encodedPayload || !signature) {
		return null;
	}

	const expectedSignature = signValue(encodedPayload, secret);
	const signatureBuffer = Buffer.from(signature, "utf8");
	const expectedBuffer = Buffer.from(expectedSignature, "utf8");

	if (
		signatureBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(signatureBuffer, expectedBuffer)
	) {
		return null;
	}

	try {
		const parsed = JSON.parse(decodeBase64Url(encodedPayload)) as VerifiedPublicInvoiceToken;
		if (Number.isNaN(Date.parse(parsed.expiresAt))) {
			return null;
		}
		if (Date.parse(parsed.expiresAt) < Date.now()) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export function createStripeWebhookSignature(payload: string, secret: string) {
	const timestamp = Math.floor(Date.now() / 1000);
	const signedPayload = `${timestamp}.${payload}`;
	const signature = createHmac("sha256", secret).update(signedPayload).digest("hex");

	return `t=${timestamp},v1=${signature}`;
}

export function verifyStripeWebhookSignature(
	payload: string,
	signatureHeader: string | null,
	secret: string,
) {
	if (!signatureHeader) {
		return false;
	}

	const parts = signatureHeader.split(",").map((part) => part.trim());
	const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
	const signature = parts.find((part) => part.startsWith("v1="))?.slice(3);

	if (!timestamp || !signature) {
		return false;
	}

	const timestampNumber = Number(timestamp);
	if (!Number.isFinite(timestampNumber)) {
		return false;
	}

	const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
	if (ageSeconds > 300) {
		return false;
	}

	const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");

	const signatureBuffer = Buffer.from(signature, "utf8");
	const expectedBuffer = Buffer.from(expected, "utf8");

	return (
		signatureBuffer.length === expectedBuffer.length &&
		timingSafeEqual(signatureBuffer, expectedBuffer)
	);
}

export function deriveStripeAccountStatus(account: {
	charges_enabled?: boolean;
	details_submitted?: boolean;
	requirements?: { disabled_reason?: string | null };
}) {
	if (account.requirements?.disabled_reason) {
		return "disabled" as const;
	}
	if (account.charges_enabled && account.details_submitted) {
		return "connected" as const;
	}
	if (account.details_submitted) {
		return "restricted" as const;
	}
	return "pending" as const;
}
