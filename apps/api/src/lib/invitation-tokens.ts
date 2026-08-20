const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TOKEN_TTL_DAYS = 14;

function base64Url(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function generateInvitationToken(): string {
	const bytes = new Uint8Array(INVITATION_TOKEN_BYTES);
	crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

export async function hashInvitationToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return base64Url(new Uint8Array(digest));
}

export function invitationExpiresAt(now = new Date()): Date {
	return new Date(now.getTime() + INVITATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
