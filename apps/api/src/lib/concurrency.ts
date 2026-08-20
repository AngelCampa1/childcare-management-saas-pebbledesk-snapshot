// Bounded-concurrency helpers for fan-out over external APIs (e.g., Resend).
// Keeps per-request parallelism small so we never burst past upstream rate limits.

// Note: first rejection aborts the pool. Wrap `fn` in try/catch at the call
// site if you need Promise.allSettled-style fan-out where one failure does
// not cancel sibling work. See messages.ts send-batch for an example.
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await fn(items[index] as T, index);
		}
	};
	const workers = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, () =>
		worker(),
	);
	await Promise.all(workers);
	return results;
}

const DEFAULT_RETRY_MS = 2_000;
const MAX_RETRY_MS = 10_000;

export async function retryOn429(
	send: () => Promise<Response>,
	options?: { sleep?: (ms: number) => Promise<void>; maxRetries?: number },
): Promise<Response> {
	const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
	const maxRetries = options?.maxRetries ?? 3;
	let response = await send();
	for (let attempt = 0; response.status === 429 && attempt < maxRetries; attempt += 1) {
		const header = response.headers.get("retry-after");
		const parsed = header ? Number.parseInt(header, 10) : Number.NaN;
		const waitMs = Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : DEFAULT_RETRY_MS;
		await sleep(Math.min(waitMs, MAX_RETRY_MS));
		response = await send();
	}
	return response;
}
