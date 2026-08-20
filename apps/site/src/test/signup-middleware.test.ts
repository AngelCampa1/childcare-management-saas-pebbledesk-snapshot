import { describe, expect, it, vi } from "vitest";

import { onRequest } from "../middleware";

describe("signup middleware", () => {
	it("redirects bare /signup requests to the trailing-slash route and preserves the query", async () => {
		const next = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

		const response = await onRequest(
			createContext("https://pebbledesk.app/signup?plan=center&source=%2Fcompare"),
			next,
		);

		expect(next).not.toHaveBeenCalled();
		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe(
			"https://pebbledesk.app/signup/?plan=center&source=%2Fcompare",
		);
	});

	it("passes /signup/ requests through without redirecting", async () => {
		const expected = new Response(null, { status: 302 });
		const next = vi.fn().mockResolvedValue(expected);

		const response = await onRequest(
			createContext("https://pebbledesk.app/signup/?plan=center"),
			next,
		);

		expect(next).toHaveBeenCalledTimes(1);
		expect(response).toBe(expected);
	});

	it("redirects slashless marketing hubs to their trailing-slash routes", async () => {
		const next = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

		const response = await onRequest(
			createContext("https://pebbledesk.app/resources?utm_source=google"),
			next,
		);

		expect(next).not.toHaveBeenCalled();
		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe(
			"https://pebbledesk.app/resources/?utm_source=google",
		);
	});

	it("redirects slashless nested content routes to their trailing-slash routes", async () => {
		const next = vi.fn().mockResolvedValue(new Response("not found", { status: 404 }));

		const response = await onRequest(
			createContext("https://pebbledesk.app/compare/alternatives/brightwheel"),
			next,
		);

		expect(next).not.toHaveBeenCalled();
		expect(response.status).toBe(308);
		expect(response.headers.get("location")).toBe(
			"https://pebbledesk.app/compare/alternatives/brightwheel/",
		);
	});

	it("ignores file-like routes", async () => {
		const expected = new Response("ok", { status: 200 });
		const next = vi.fn().mockResolvedValue(expected);

		const response = await onRequest(createContext("https://pebbledesk.app/rss.xml"), next);

		expect(next).toHaveBeenCalledTimes(1);
		expect(response).toBe(expected);
	});
});

function createContext(url: string) {
	return {
		url: new URL(url),
		request: new Request(url),
		redirect: (location: string, status = 302) =>
			new Response(null, {
				status,
				headers: { Location: location },
			}),
	} as Parameters<typeof onRequest>[0];
}
