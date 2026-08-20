import { describe, expect, it, vi } from "vitest";
import { isTransientDbError, retryOnTransientDbError } from "./db-retry.js";

const transientMessage = "Timed out while creating a new server connection.";

describe("isTransientDbError", () => {
	it("matches a transient signature on the top-level error message", () => {
		expect(isTransientDbError(new Error(transientMessage))).toBe(true);
		expect(isTransientDbError(new Error("ECONNRESET"))).toBe(true);
	});

	it("matches a transient signature nested in the error cause chain", () => {
		const cause = new Error(transientMessage);
		const wrapped = new Error('Failed query: delete from "ai_cs_session_owners"', { cause });
		expect(isTransientDbError(wrapped)).toBe(true);
	});

	it("returns false for non-transient errors and non-error values", () => {
		expect(isTransientDbError(new Error("column does not exist"))).toBe(false);
		expect(isTransientDbError("Timed out while creating a new server connection")).toBe(false);
		expect(isTransientDbError(undefined)).toBe(false);
	});

	it("stops walking the cause chain past the depth cap", () => {
		let head = new Error(transientMessage);
		for (let i = 0; i < 6; i += 1) {
			head = new Error("wrapper", { cause: head });
		}
		expect(isTransientDbError(head)).toBe(false);
	});
});

describe("retryOnTransientDbError", () => {
	it("returns the result when fn succeeds on the first attempt", async () => {
		const fn = vi.fn().mockResolvedValue(42);
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, { sleep });

		expect(result).toBe(42);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("retries once on a transient connection error and then succeeds", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockResolvedValueOnce("ok");
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, { sleep });

		expect(result).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(sleep).toHaveBeenCalledWith(expect.any(Number));
	});

	it("uses exponential backoff: second wait is 3× the first", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockResolvedValueOnce("ok");
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, { sleep, backoffMs: 100 });

		expect(result).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenNthCalledWith(1, 100);
		expect(sleep).toHaveBeenNthCalledWith(2, 300);
	});

	it("caps exponential backoff when maxBackoffMs is provided", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockResolvedValueOnce("ok");
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, {
			sleep,
			backoffMs: 100,
			maxBackoffMs: 250,
			attempts: 4,
		});

		expect(result).toBe("ok");
		expect(sleep).toHaveBeenNthCalledWith(1, 100);
		expect(sleep).toHaveBeenNthCalledWith(2, 250);
		expect(sleep).toHaveBeenNthCalledWith(3, 250);
	});

	it("exhausts 3 default attempts on persistent transient errors", async () => {
		const fn = vi.fn().mockRejectedValue(new Error(transientMessage));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep })).rejects.toThrow(transientMessage);
		expect(fn).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("rethrows immediately on a non-transient error without retrying", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("boom"));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep })).rejects.toThrow("boom");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("exhausts attempts and rethrows the last transient error", async () => {
		const fn = vi.fn().mockRejectedValue(new Error(transientMessage));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep, attempts: 3 })).rejects.toThrow(
			transientMessage,
		);
		expect(fn).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("detects a transient error on the cause chain (PEBBLEDESK-API-6 shape)", async () => {
		const cause = new Error(transientMessage);
		const wrapped = new Error('Failed query: delete from "webhook_events"', { cause });
		const fn = vi.fn().mockRejectedValueOnce(wrapped).mockResolvedValueOnce("ok");
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, { sleep });

		expect(result).toBe("ok");
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("detects ECONNRESET as transient", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("socket hang up: ECONNRESET"))
			.mockResolvedValueOnce(undefined);
		const sleep = vi.fn().mockResolvedValue(undefined);

		await retryOnTransientDbError(fn, { sleep });

		expect(fn).toHaveBeenCalledTimes(2);
	});

	it("treats non-Error throws as non-transient", async () => {
		const fn = vi.fn().mockRejectedValue("string error");
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep })).rejects.toBe("string error");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("does not match a transient signature beyond the 5-hop cause chain depth", async () => {
		// Build a 6-hop chain: the transient signature is on the deepest node
		// (hop 6). The scanner must stop after 5 hops and treat this as non-transient.
		const deep = new Error(transientMessage);
		let wrapped: Error = deep;
		for (let i = 0; i < 5; i++) {
			wrapped = new Error(`wrap ${i}`, { cause: wrapped });
		}

		const fn = vi.fn().mockRejectedValue(wrapped);
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep })).rejects.toBe(wrapped);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("terminates safely when the cause chain is self-referential", async () => {
		const err = new Error("wrapper") as Error & { cause?: unknown };
		err.cause = err;
		const fn = vi.fn().mockRejectedValue(err);
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep })).rejects.toBe(err);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("clamps attempts < 1 to a single invocation and rethrows transient errors", async () => {
		const transient = new Error(transientMessage);
		const fn = vi.fn().mockRejectedValue(transient);
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(retryOnTransientDbError(fn, { sleep, attempts: 0 })).rejects.toBe(transient);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	it("clamps negative backoff to 0 without throwing", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockResolvedValueOnce("ok");
		const sleep = vi.fn().mockResolvedValue(undefined);

		const result = await retryOnTransientDbError(fn, { sleep, backoffMs: -100 });

		expect(result).toBe("ok");
		expect(sleep).toHaveBeenCalledWith(0);
	});

	it("uses the default sleep implementation when none is provided", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error(transientMessage))
			.mockResolvedValueOnce("ok");

		vi.useFakeTimers();
		try {
			const promise = retryOnTransientDbError(fn);
			await vi.runAllTimersAsync();
			await expect(promise).resolves.toBe("ok");
		} finally {
			vi.useRealTimers();
		}

		expect(fn).toHaveBeenCalledTimes(2);
	});
});
