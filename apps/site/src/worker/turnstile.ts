const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedMissingProdSecret = false;

/**
 * Reset the one-time "missing production secret" warning latch. Intended for tests
 * so each fail-closed assertion exercises the warning path deterministically.
 */
export function resetTurnstileWarningLatch(): void {
	warnedMissingProdSecret = false;
}

export interface VerifyTurnstileInput {
	/** The `cf-turnstile-response` token submitted by the browser widget. */
	token: string | undefined;
	/** The Turnstile secret key (Worker secret). */
	secret: string | undefined;
	/** Whether the Worker is running in production. */
	isProduction: boolean;
	/** Optional client IP for the siteverify `remoteip` field. */
	remoteIp?: string | undefined;
	/** Injectable fetch for testing. Defaults to the global fetch. */
	fetchImpl?: typeof fetch;
}

interface SiteverifyResponse {
	success?: boolean;
}

/**
 * Verify a Cloudflare Turnstile token. Fails closed: network errors, parse
 * errors, non-OK responses, and missing tokens all return `false`.
 *
 * When the secret is unset:
 *  - outside production → returns `true` (local dev / tests bypass the challenge);
 *  - in production → returns `false` (fail closed) and logs a loud one-time warning
 *    so a misconfiguration cannot silently degrade the form back to the unprotected
 *    posture.
 */
export async function verifyTurnstile(input: VerifyTurnstileInput): Promise<boolean> {
	const secret = input.secret?.trim();
	if (!secret) {
		if (input.isProduction) {
			if (!warnedMissingProdSecret) {
				warnedMissingProdSecret = true;
				console.error(
					"TURNSTILE_SECRET_KEY is not set in production; rejecting all lead submissions (fail closed).",
				);
			}
			return false;
		}
		return true;
	}

	const token = input.token?.trim();
	if (!token) return false;

	const doFetch = input.fetchImpl ?? fetch;
	try {
		const body = new FormData();
		body.append("secret", secret);
		body.append("response", token);
		if (input.remoteIp) body.append("remoteip", input.remoteIp);

		const response = await doFetch(SITEVERIFY_URL, { method: "POST", body });
		if (!response.ok) return false;

		const data = (await response.json()) as SiteverifyResponse;
		return data.success === true;
	} catch {
		return false;
	}
}
