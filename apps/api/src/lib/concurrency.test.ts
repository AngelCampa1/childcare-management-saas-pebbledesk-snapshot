import { describe, expect, it, vi } from "vitest";
import { mapWithConcurrency, retryOn429 } from "./concurrency.js";

describe("mapWithConcurrency", () => {
	it("runs at most N tasks in parallel", async () => {
		let running = 0;
		let maxRunning = 0;
		const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
		await mapWithConcurrency(items, 3, async (value) => {
			running += 1;
			if (running > maxRunning) maxRunning = running;
			await new Promise((resolve) => setTimeout(resolve, 5));
			running -= 1;
			return value;
		});
		expect(maxRunning).toBeLessThanOrEqual(3);
		expect(maxRunning).toBeGreaterThan(0);
	});

	it("preserves input order in results", async () => {
		const items = [10, 20, 30, 40, 50];
		const result = await mapWithConcurrency(items, 2, async (value) => {
			// Invert the delay so later items finish first — forces real ordering
			await new Promise((resolve) => setTimeout(resolve, 20 - value / 10));
			return value * 2;
		});
		expect(result).toEqual([20, 40, 60, 80, 100]);
	});

	it("passes each element to the mapper function", async () => {
		const items = ["a", "b", "c"];
		const seen: string[] = [];
		await mapWithConcurrency(items, 2, async (value) => {
			seen.push(value);
			return value;
		});
		expect(seen.sort()).toEqual(["a", "b", "c"]);
	});

	it("resolves to an empty array when given empty input", async () => {
		const fn = vi.fn();
		const result = await mapWithConcurrency<number, number>([], 5, fn);
		expect(result).toEqual([]);
		expect(fn).not.toHaveBeenCalled();
	});

	it("handles limit greater than input length", async () => {
		const result = await mapWithConcurrency([1, 2], 10, async (value) => value + 1);
		expect(result).toEqual([2, 3]);
	});

	it("propagates the first rejection", async () => {
		await expect(
			mapWithConcurrency([1, 2, 3], 2, async (value) => {
				if (value === 2) throw new Error("boom");
				return value;
			}),
		).rejects.toThrow("boom");
	});
});

describe("retryOn429", () => {
	it("returns the first response when not 429", async () => {
		const ok = new Response("ok", { status: 200 });
		const send = vi.fn().mockResolvedValue(ok);
		const result = await retryOn429(send, { sleep: vi.fn() });
		expect(result).toBe(ok);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("retries once on 429 with retry-after header", async () => {
		const first = new Response("rate", {
			status: 429,
			headers: { "retry-after": "3" },
		});
		const second = new Response("ok", { status: 200 });
		const send = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const sleep = vi.fn().mockResolvedValue(undefined);
		const result = await retryOn429(send, { sleep });
		expect(send).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(3000);
		expect(result).toBe(second);
	});

	it("defaults sleep to 2s when retry-after is missing", async () => {
		const first = new Response("rate", { status: 429 });
		const second = new Response("ok", { status: 200 });
		const send = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const sleep = vi.fn().mockResolvedValue(undefined);
		await retryOn429(send, { sleep });
		expect(sleep).toHaveBeenCalledWith(2000);
	});

	it("uses the built-in sleep when no test sleep function is provided", async () => {
		vi.useFakeTimers();
		try {
			const send = vi
				.fn()
				.mockResolvedValueOnce(new Response("rate", { status: 429 }))
				.mockResolvedValueOnce(new Response("ok", { status: 200 }));

			const resultPromise = retryOn429(send);
			await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
			await vi.advanceTimersByTimeAsync(2000);

			const result = await resultPromise;
			expect(result.status).toBe(200);
			expect(send).toHaveBeenCalledTimes(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("caps sleep at 10s when retry-after is very large", async () => {
		const first = new Response("rate", {
			status: 429,
			headers: { "retry-after": "120" },
		});
		const second = new Response("ok", { status: 200 });
		const send = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const sleep = vi.fn().mockResolvedValue(undefined);
		await retryOn429(send, { sleep });
		expect(sleep).toHaveBeenCalledWith(10_000);
	});

	it("returns the retry response even if it is also a failure", async () => {
		const first = new Response("rate", { status: 429 });
		const second = new Response("still rate", { status: 429 });
		const send = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const sleep = vi.fn().mockResolvedValue(undefined);
		const result = await retryOn429(send, { sleep, maxRetries: 1 });
		expect(send).toHaveBeenCalledTimes(2);
		expect(result).toBe(second);
	});

	it("keeps retrying consecutive 429 responses within the bounded retry budget", async () => {
		const send = vi
			.fn()
			.mockResolvedValueOnce(new Response("rate 1", { status: 429 }))
			.mockResolvedValueOnce(new Response("rate 2", { status: 429 }))
			.mockResolvedValueOnce(new Response("rate 3", { status: 429 }))
			.mockResolvedValueOnce(new Response("ok", { status: 200 }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		const result = await retryOn429(send, { sleep });
		expect(send).toHaveBeenCalledTimes(4);
		expect(sleep).toHaveBeenCalledTimes(3);
		expect(result.status).toBe(200);
	});

	it("falls back to 2s when retry-after is not a number", async () => {
		const first = new Response("rate", {
			status: 429,
			headers: { "retry-after": "soon" },
		});
		const second = new Response("ok", { status: 200 });
		const send = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
		const sleep = vi.fn().mockResolvedValue(undefined);
		await retryOn429(send, { sleep });
		expect(sleep).toHaveBeenCalledWith(2000);
	});
});
