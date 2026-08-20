import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetTurnstileWarningLatch, verifyTurnstile } from "./turnstile.js";

function siteverifyResponse(success: boolean, ok = true): Response {
	return new Response(JSON.stringify({ success }), {
		status: ok ? 200 : 500,
		headers: { "content-type": "application/json" },
	});
}

describe("verifyTurnstile", () => {
	beforeEach(() => {
		resetTurnstileWarningLatch();
		vi.restoreAllMocks();
	});

	it("bypasses verification outside production when the secret is unset", async () => {
		const fetchImpl = vi.fn();
		await expect(
			verifyTurnstile({ token: undefined, secret: undefined, isProduction: false, fetchImpl }),
		).resolves.toBe(true);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("fails closed and warns once when the secret is unset in production", async () => {
		const warn = vi.spyOn(console, "error").mockImplementation(() => {});
		const fetchImpl = vi.fn();

		await expect(
			verifyTurnstile({ token: "tok", secret: "", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
		await expect(
			verifyTurnstile({ token: "tok", secret: "  ", isProduction: true, fetchImpl }),
		).resolves.toBe(false);

		expect(fetchImpl).not.toHaveBeenCalled();
		expect(warn).toHaveBeenCalledTimes(1);
	});

	it("rejects a missing token even when the secret is set", async () => {
		const fetchImpl = vi.fn();
		await expect(
			verifyTurnstile({ token: undefined, secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
		await expect(
			verifyTurnstile({ token: "   ", secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("returns true when siteverify reports success and forwards the client IP", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(siteverifyResponse(true));
		await expect(
			verifyTurnstile({
				token: "tok",
				secret: "secret",
				isProduction: true,
				remoteIp: "203.0.113.7",
				fetchImpl,
			}),
		).resolves.toBe(true);

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
		const form = (init as RequestInit).body as FormData;
		expect(form.get("secret")).toBe("secret");
		expect(form.get("response")).toBe("tok");
		expect(form.get("remoteip")).toBe("203.0.113.7");
	});

	it("returns false when siteverify reports failure", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(siteverifyResponse(false));
		await expect(
			verifyTurnstile({ token: "tok", secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
	});

	it("fails closed on a non-OK siteverify response", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(siteverifyResponse(true, false));
		await expect(
			verifyTurnstile({ token: "tok", secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
	});

	it("fails closed when the network call throws", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
		await expect(
			verifyTurnstile({ token: "tok", secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
	});

	it("fails closed when siteverify returns unparseable JSON", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(new Response("not json", { status: 200 }));
		await expect(
			verifyTurnstile({ token: "tok", secret: "secret", isProduction: true, fetchImpl }),
		).resolves.toBe(false);
	});
});
