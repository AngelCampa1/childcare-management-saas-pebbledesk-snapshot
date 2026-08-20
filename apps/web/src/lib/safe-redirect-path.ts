const FALLBACK = "/dashboard";

/**
 * Sanitizes an inbound redirect path for post-login navigation.
 *
 * Returns the safe fallback "/dashboard" for any path that could be used as
 * an open-redirect vector: absolute URLs, protocol-relative paths, backslash
 * tricks, javascript: injection, header-injection characters, or paths that
 * don't start with "/".
 *
 * Safe internal paths (e.g. "/billing", "/ratios?tab=history") are returned
 * as-is.
 */
export function sanitizeRedirectPath(raw: string | undefined): string {
	if (!raw) {
		return FALLBACK;
	}

	// Must start with "/" to be an internal path
	if (!raw.startsWith("/")) {
		return FALLBACK;
	}

	// Protocol-relative URLs like //evil.com
	if (raw.startsWith("//")) {
		return FALLBACK;
	}

	// Backslash open-redirect vector: /\evil
	if (raw.startsWith("/\\")) {
		return FALLBACK;
	}

	// Absolute URL smuggled into the path (e.g. /https://evil.com via double encoding is caught
	// by the startsWith check above, but also guard against :// appearing anywhere)
	if (raw.includes("://")) {
		return FALLBACK;
	}

	// Dangerous scheme injection anywhere in the string (case-insensitive)
	const lower = raw.toLowerCase();
	if (lower.includes("javascript:") || lower.includes("vbscript:") || lower.includes("data:")) {
		return FALLBACK;
	}

	// Header-injection characters
	if (raw.includes("\n") || raw.includes("\r")) {
		return FALLBACK;
	}

	return raw;
}
