import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, setQueryClientForApi } from "./api";

describe("apiFetch", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		// Reset to no queryClient after each test
		setQueryClientForApi(null);
	});

	it("defaults credentials to include", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/api/example");

		const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(calledUrl).toBe("/api/example");
		expect(calledOpts.credentials).toBe("include");
		expect((calledOpts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
		expect(calledOpts.signal).toBeInstanceOf(AbortSignal);
	});

	it("preserves an explicit credentials override", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/api/public/example", {
			credentials: "omit",
			method: "POST",
		});

		const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(calledUrl).toBe("/api/public/example");
		expect(calledOpts.credentials).toBe("omit");
		expect(calledOpts.method).toBe("POST");
		expect(calledOpts.signal).toBeInstanceOf(AbortSignal);
	});

	it("does not set Content-Type when body is FormData", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		const formData = new FormData();
		formData.append("field", "value");

		await apiFetch("/api/upload", { method: "POST", body: formData });

		const calledHeaders = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
		expect(calledHeaders["Content-Type"]).toBeUndefined();
	});

	it("sets Content-Type application/json when body is a string", async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		await apiFetch("/api/data", { method: "POST", body: JSON.stringify({ x: 1 }) });

		const calledHeaders = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
		expect(calledHeaders["Content-Type"]).toBe("application/json");
	});

	it("aborts the request after 15 seconds via AbortController", async () => {
		vi.useFakeTimers();
		let capturedSignal: AbortSignal | null = null;
		const fetchSpy = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
			capturedSignal = opts.signal ?? null;
			return new Promise<Response>((_, reject) => {
				const signal = opts.signal;
				if (signal?.aborted) {
					reject(new DOMException("The operation was aborted", "AbortError"));
					return;
				}
				signal?.addEventListener(
					"abort",
					() => {
						reject(new DOMException("The operation was aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		});
		vi.stubGlobal("fetch", fetchSpy);

		const fetchPromise = apiFetch("/api/slow");
		vi.advanceTimersByTime(15_001);
		await Promise.resolve(); // flush microtasks
		await expect(fetchPromise).rejects.toThrow();
		expect(capturedSignal?.aborted).toBe(true);

		vi.useRealTimers();
	});

	it("forwards an already-aborted caller signal immediately", async () => {
		const controller = new AbortController();
		controller.abort();
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchSpy);

		// The fetch will be called with an already-aborted signal; depending on
		// implementation, it may resolve or reject. Either way, the signal passed
		// to fetch should be aborted.
		try {
			await apiFetch("/api/example", { signal: controller.signal });
		} catch {
			// acceptable — browser may reject immediately
		}
		const calledSignal = fetchSpy.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
		expect(calledSignal?.aborted).toBe(true);
	});

	it("propagates a caller-signal abort that fires after fetch starts (GET)", async () => {
		const controller = new AbortController();
		let capturedSignal: AbortSignal | null = null;
		const fetchSpy = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
			capturedSignal = opts.signal ?? null;
			return new Promise<Response>((_, reject) => {
				opts.signal?.addEventListener(
					"abort",
					() => {
						reject(new DOMException("The operation was aborted", "AbortError"));
					},
					{ once: true },
				);
			});
		});
		vi.stubGlobal("fetch", fetchSpy);

		const fetchPromise = apiFetch("/api/slow", { signal: controller.signal });
		controller.abort();
		await expect(fetchPromise).rejects.toThrow();
		expect(capturedSignal?.aborted).toBe(true);
	});

	describe("mutation methods ignore caller AbortSignal", () => {
		const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"] as const;

		for (const method of mutationMethods) {
			it(`${method}: aborted caller signal does NOT abort the in-flight request`, async () => {
				const controller = new AbortController();
				controller.abort();
				const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
				vi.stubGlobal("fetch", fetchSpy);

				await apiFetch("/api/resource", { method, signal: controller.signal });

				expect(fetchSpy).toHaveBeenCalledTimes(1);
				const calledSignal = fetchSpy.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
				expect(calledSignal).toBeInstanceOf(AbortSignal);
				expect(calledSignal?.aborted).toBe(false);
			});

			it(`${method}: caller-signal abort during in-flight request does NOT propagate`, async () => {
				const controller = new AbortController();
				let capturedSignal: AbortSignal | null = null;
				const fetchSpy = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
					capturedSignal = opts.signal ?? null;
					return new Promise<Response>((resolve) => {
						setTimeout(() => resolve(new Response(null, { status: 200 })), 0);
					});
				});
				vi.stubGlobal("fetch", fetchSpy);

				const promise = apiFetch("/api/resource", { method, signal: controller.signal });
				controller.abort();
				const res = await promise;
				expect(res.status).toBe(200);
				expect(capturedSignal?.aborted).toBe(false);
			});

			it(`${method}: 15s timeout still aborts hung requests`, async () => {
				vi.useFakeTimers();
				let capturedSignal: AbortSignal | null = null;
				const fetchSpy = vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
					capturedSignal = opts.signal ?? null;
					return new Promise<Response>((_, reject) => {
						opts.signal?.addEventListener(
							"abort",
							() => {
								reject(new DOMException("The operation was aborted", "AbortError"));
							},
							{ once: true },
						);
					});
				});
				vi.stubGlobal("fetch", fetchSpy);

				const fetchPromise = apiFetch("/api/slow", { method });
				vi.advanceTimersByTime(15_001);
				await Promise.resolve();
				await expect(fetchPromise).rejects.toThrow();
				expect(capturedSignal?.aborted).toBe(true);

				vi.useRealTimers();
			});
		}

		it("treats lowercase method strings as mutations too", async () => {
			const controller = new AbortController();
			controller.abort();
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
			vi.stubGlobal("fetch", fetchSpy);

			await apiFetch("/api/resource", { method: "post", signal: controller.signal });

			const calledSignal = fetchSpy.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
			expect(calledSignal?.aborted).toBe(false);
		});

		it("HEAD and OPTIONS still respect caller AbortSignal", async () => {
			const controller = new AbortController();
			controller.abort();
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
			vi.stubGlobal("fetch", fetchSpy);

			try {
				await apiFetch("/api/resource", { method: "HEAD", signal: controller.signal });
			} catch {
				// acceptable
			}
			const calledSignal = fetchSpy.mock.calls[0]?.[1]?.signal as AbortSignal | undefined;
			expect(calledSignal?.aborted).toBe(true);
		});
	});

	describe("401 handler", () => {
		it("throws when response is 401", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
			vi.stubGlobal("fetch", fetchSpy);

			await expect(apiFetch("/api/protected")).rejects.toThrow("Unauthorized");
		});

		it("invalidates authStatus query key when 401 and queryClient is set", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
			vi.stubGlobal("fetch", fetchSpy);

			const mockQueryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
			setQueryClientForApi(
				mockQueryClient as unknown as Parameters<typeof setQueryClientForApi>[0],
			);

			await expect(apiFetch("/api/protected")).rejects.toThrow("Unauthorized");

			expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ["authStatus"],
			});
		});

		it("invalidates authSession query key when 401 and queryClient is set", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
			vi.stubGlobal("fetch", fetchSpy);

			const mockQueryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
			setQueryClientForApi(
				mockQueryClient as unknown as Parameters<typeof setQueryClientForApi>[0],
			);

			await expect(apiFetch("/api/protected")).rejects.toThrow("Unauthorized");

			expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ["authSession"],
			});
		});

		it("invalidates both authStatus and authSession when 401", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
			vi.stubGlobal("fetch", fetchSpy);

			const mockQueryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
			setQueryClientForApi(
				mockQueryClient as unknown as Parameters<typeof setQueryClientForApi>[0],
			);

			await expect(apiFetch("/api/protected")).rejects.toThrow("Unauthorized");

			expect(mockQueryClient.invalidateQueries).toHaveBeenCalledTimes(2);
			expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ["authStatus"],
			});
			expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ["authSession"],
			});
		});

		it("throws for non-401 error responses with a generic message", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
			vi.stubGlobal("fetch", fetchSpy);

			await expect(apiFetch("/api/forbidden")).rejects.toThrow("Request failed with status 403");
		});

		it("throws with server error message when API returns JSON error body", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: "Center not found" }), {
					status: 404,
					headers: { "Content-Type": "application/json" },
				}),
			);
			vi.stubGlobal("fetch", fetchSpy);

			await expect(apiFetch("/api/centers/unknown")).rejects.toThrow("Center not found");
		});

		it("preserves request IDs from failed API responses", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: "Server unavailable", requestId: "req_123" }), {
					status: 503,
					headers: {
						"Content-Type": "application/json",
						"x-request-id": "req_header",
					},
				}),
			);
			vi.stubGlobal("fetch", fetchSpy);

			try {
				await apiFetch("/api/reports");
				throw new Error("Expected apiFetch to throw");
			} catch (error) {
				expect(error).toBeInstanceOf(ApiError);
				expect((error as ApiError).requestId).toBe("req_123");
			}
		});

		it("does not throw for successful responses", async () => {
			const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
			vi.stubGlobal("fetch", fetchSpy);

			const res = await apiFetch("/api/ok");
			expect(res.status).toBe(200);
		});
	});
});
