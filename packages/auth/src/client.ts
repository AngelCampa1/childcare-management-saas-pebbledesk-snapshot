import { createAuthClient } from "better-auth/react";

// Export a pre-configured factory; consumers can call createAuthClient directly
// to avoid un-nameable inferred types from deeply nested generics.
export { createAuthClient };

function resolveAuthBaseUrl(baseURL: string): string {
	const trimmed = baseURL.replace(/\/$/, "");
	const withAuthPath = trimmed.endsWith("/api/auth")
		? trimmed
		: trimmed.endsWith("/api")
			? `${trimmed}/auth`
			: `${trimmed}/api/auth`;
	if (/^https?:\/\//.test(withAuthPath)) {
		return withAuthPath;
	}

	const origin =
		typeof globalThis.location?.origin === "string"
			? globalThis.location.origin
			: "http://localhost";
	return new URL(withAuthPath, origin).toString().replace(/\/$/, "");
}

export function createBetterAuthClient(baseURL: string): AuthClient {
	return createAuthClient({
		baseURL: resolveAuthBaseUrl(baseURL),
		fetchOptions: {
			credentials: "include",
		},
	});
}

export type AuthClient = ReturnType<typeof createAuthClient>;
