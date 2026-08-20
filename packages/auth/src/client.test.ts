import { getPublicApiOrigin, getPublicApiUrl } from "@pebbledesk/shared";
import { describe, expect, it, vi } from "vitest";

const mockedCreateAuthClient = vi.hoisted(() => vi.fn((options: unknown) => ({ options })));

vi.mock("better-auth/react", () => ({
	createAuthClient: mockedCreateAuthClient,
}));

const { createBetterAuthClient } = await import("./client.js");

describe("createBetterAuthClient", () => {
	it("targets the raw Better Auth API path and includes cookies on cross-subdomain calls", () => {
		const apiOrigin = getPublicApiOrigin();
		const authUrl = getPublicApiUrl("/api/auth");
		const client = createBetterAuthClient(apiOrigin);

		expect(mockedCreateAuthClient).toHaveBeenCalledWith({
			baseURL: authUrl,
			fetchOptions: {
				credentials: "include",
			},
		});
		expect(client).toEqual({
			options: {
				baseURL: authUrl,
				fetchOptions: {
					credentials: "include",
				},
			},
		});
	});

	it("resolves same-origin app API bases to an absolute Better Auth URL", () => {
		createBetterAuthClient("/api");

		expect(mockedCreateAuthClient).toHaveBeenLastCalledWith({
			baseURL: "http://localhost/api/auth",
			fetchOptions: {
				credentials: "include",
			},
		});
	});
});
