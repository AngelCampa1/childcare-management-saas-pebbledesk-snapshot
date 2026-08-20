// Retry wrapper for transient Postgres connection errors during cron runs.
// Absorbs Neon cold-start "Timed out while creating a new server connection"
// hiccups (PEBBLEDESK-API-6). 3 attempts with exponential backoff (250ms,
// 750ms) give the connection pool enough time to warm before we page Sentry.

const TRANSIENT_SIGNATURES = [
	"Timed out while creating a new server connection",
	"ECONNRESET",
	"CONNECTION_CLOSED",
	"CONNECTION_ENDED",
];

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 250;
// Caps how far we walk the error.cause chain. Bounded both to avoid pathological
// deep chains and to act as a cycle guard (err.cause = err would otherwise loop).
const MAX_CAUSE_DEPTH = 5;

interface RetryOptions {
	attempts?: number;
	backoffMs?: number;
	maxBackoffMs?: number;
	sleep?: (ms: number) => Promise<void>;
}

export function isTransientDbError(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current instanceof Error; depth++) {
		const message = current.message;
		if (TRANSIENT_SIGNATURES.some((sig) => message.includes(sig))) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

export async function retryOnTransientDbError<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
	const backoffMs = Math.max(0, options.backoffMs ?? DEFAULT_BACKOFF_MS);
	const maxBackoffMs =
		options.maxBackoffMs === undefined ? undefined : Math.max(0, options.maxBackoffMs);
	const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= attempts || !isTransientDbError(err)) {
				throw err;
			}
			const delayMs = backoffMs * 3 ** (attempt - 1);
			await sleep(maxBackoffMs === undefined ? delayMs : Math.min(delayMs, maxBackoffMs));
		}
	}
	// Unreachable: the loop always either returns or throws.
	throw new Error("retryOnTransientDbError: unreachable");
}
