import type { QueryClient } from "@tanstack/react-query";
import { resolveApiBaseUrl } from "./lib/api-origin";

const API_URL = resolveApiBaseUrl(import.meta.env);

let queryClient: QueryClient | null = null;

export function setQueryClientForApi(client: QueryClient | null) {
	queryClient = client;
}

export class ApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly body: Record<string, unknown>,
		public readonly requestId?: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export async function apiFetch(path: string, options?: RequestInit) {
	const isFormData = options?.body instanceof FormData;

	const baseHeaders: Record<string, string> = isFormData
		? {}
		: { "Content-Type": "application/json", "X-Requested-With": "fetch" };

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15_000);

	// React Query v5 auto-injects an AbortSignal into mutationFn. If a user
	// navigates away mid-request, that signal aborts in-flight POST/PUT/PATCH/
	// DELETE calls — but the server may have already persisted the change,
	// causing client/server desync. Only honor caller-supplied signals for
	// idempotent reads (GET/HEAD/OPTIONS); mutations rely solely on the 15s
	// timeout below.
	const method = (options?.method ?? "GET").toUpperCase();
	const isMutation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
	const callerSignal = isMutation ? undefined : options?.signal;
	if (callerSignal) {
		if (callerSignal.aborted) {
			controller.abort(callerSignal.reason);
		} else {
			callerSignal.addEventListener("abort", () => controller.abort(callerSignal.reason), {
				once: true,
			});
		}
	}

	let res: Response;
	try {
		res = await fetch(`${API_URL}${path}`, {
			credentials: "include",
			...options,
			signal: controller.signal,
			headers: {
				...baseHeaders,
				...options?.headers,
			},
		});
	} finally {
		clearTimeout(timeoutId);
	}

	if (res.status === 401) {
		// X-Requested-With: fetch signals a programmatic same-app request to the CSRF middleware
		if (queryClient) {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["authStatus"] }),
				queryClient.invalidateQueries({ queryKey: ["authSession"] }),
			]);
		}
		throw new ApiError("Unauthorized", 401, {}, res.headers.get("x-request-id") ?? undefined);
	}

	if (!res.ok) {
		const cloned = res.clone();
		let body: Record<string, unknown> = {};
		try {
			body = (await cloned.json()) as Record<string, unknown>;
		} catch {
			// Body not JSON — use empty body
		}
		const serverMessage = typeof body.error === "string" ? body.error : undefined;
		const requestId =
			typeof body.requestId === "string"
				? body.requestId
				: (res.headers.get("x-request-id") ?? undefined);
		throw new ApiError(
			serverMessage ?? `Request failed with status ${res.status}`,
			res.status,
			body,
			requestId,
		);
	}

	return res;
}
