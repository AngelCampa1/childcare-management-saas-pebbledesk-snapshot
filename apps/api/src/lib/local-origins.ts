const DEFAULT_LOCAL_APP_ORIGIN = "http://localhost:3040";
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeOrigin(candidate: string): string | null {
	if (!candidate) {
		return null;
	}

	try {
		return new URL(candidate).origin;
	} catch {
		return null;
	}
}

function normalizeHostname(candidate: string): string {
	return candidate.startsWith("[") && candidate.endsWith("]") ? candidate.slice(1, -1) : candidate;
}

function isLoopbackOrigin(candidate: string): boolean {
	const origin = normalizeOrigin(candidate);
	if (!origin) {
		return false;
	}

	return LOOPBACK_HOSTNAMES.has(normalizeHostname(new URL(origin).hostname));
}

function appendLoopbackVariants(allowedOrigins: string[], candidate: string) {
	const origin = normalizeOrigin(candidate);
	if (!origin) {
		return;
	}

	allowedOrigins.push(origin);

	const parsedOrigin = new URL(origin);
	const normalizedHostname = normalizeHostname(parsedOrigin.hostname);
	if (LOOPBACK_HOSTNAMES.has(normalizedHostname)) {
		const siblingHostnames = ["localhost", "127.0.0.1", "::1"].filter(
			(hostname) => hostname !== normalizedHostname,
		);

		for (const siblingHostname of siblingHostnames) {
			const hostname = siblingHostname === "::1" ? "[::1]" : siblingHostname;
			allowedOrigins.push(
				`${parsedOrigin.protocol}//${hostname}${parsedOrigin.port ? `:${parsedOrigin.port}` : ""}`,
			);
		}
	}
}

export function getAllowedWebOrigins(appUrl: string): string[] {
	const configuredOrigin = normalizeOrigin(appUrl) ?? DEFAULT_LOCAL_APP_ORIGIN;

	// In production (HTTPS), only allow the configured origin — no loopback variants
	if (configuredOrigin.startsWith("https://")) {
		return [configuredOrigin];
	}

	const allowedOrigins: string[] = [];
	appendLoopbackVariants(allowedOrigins, configuredOrigin);
	return Array.from(new Set(allowedOrigins));
}

export function resolveAuthBaseUrl(configuredBaseUrl: string, requestUrl: string): string {
	if (!isLoopbackOrigin(configuredBaseUrl)) {
		return configuredBaseUrl;
	}

	const requestOrigin = normalizeOrigin(requestUrl);
	if (requestOrigin && isLoopbackOrigin(requestOrigin)) {
		return requestOrigin;
	}

	return configuredBaseUrl;
}
