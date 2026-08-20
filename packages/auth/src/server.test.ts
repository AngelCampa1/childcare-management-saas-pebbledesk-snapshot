import {
	getProductAppOrigin,
	getProductAppUrl,
	getPublicApiOrigin,
	getPublicBrandCookieDomain,
} from "@pebbledesk/shared";
import { describe, expect, it, vi } from "vitest";
import { createAuth } from "./server.js";

function createMockDb(selectRows: unknown[] = []) {
	const limit = async () => selectRows;
	const where = () => ({ limit });
	const from = () => ({ where });
	const select = () => ({ from });
	const updateWhere = async () => undefined;
	const set = () => ({ where: updateWhere });
	const update = () => ({ set });

	return { select, update } as unknown as Parameters<typeof createAuth>[0]["db"];
}

// Minimal mock DB that satisfies the Drizzle adapter type
const mockDb = createMockDb();

const baseConfig = {
	db: mockDb,
	secret: "test-secret-that-is-long-enough-for-better-auth",
	baseURL: "http://localhost:8790",
};

describe("createAuth — isProduction: false (default)", () => {
	it("initializes without error when isProduction is omitted", () => {
		expect(() => createAuth(baseConfig)).not.toThrow();
	});

	it("initializes without error when isProduction is explicitly false", () => {
		expect(() => createAuth({ ...baseConfig, isProduction: false })).not.toThrow();
	});

	it("does not enable crossSubDomainCookies in development", () => {
		const auth = createAuth({ ...baseConfig, isProduction: false });
		// BetterAuth exposes its resolved options on auth.options
		const advanced = (
			auth as unknown as { options: { advanced?: { crossSubDomainCookies?: unknown } } }
		).options?.advanced;
		expect(advanced?.crossSubDomainCookies).toBeUndefined();
	});

	it("does not set useSecureCookies in development", () => {
		const auth = createAuth({ ...baseConfig, isProduction: false });
		const advanced = (auth as unknown as { options: { advanced?: { useSecureCookies?: unknown } } })
			.options?.advanced;
		expect(advanced?.useSecureCookies).toBeUndefined();
	});
});

describe("createAuth — isProduction: true", () => {
	const prodConfig = {
		...baseConfig,
		baseURL: getPublicApiOrigin(),
		isProduction: true,
	};

	it("initializes without error in production mode", () => {
		expect(() => createAuth(prodConfig)).not.toThrow();
	});

	it("enables crossSubDomainCookies with domain .pebbledesk.app", () => {
		const auth = createAuth(prodConfig);
		const advanced = (
			auth as unknown as {
				options: {
					advanced?: {
						crossSubDomainCookies?: { enabled: boolean; domain: string };
					};
				};
			}
		).options?.advanced;
		expect(advanced?.crossSubDomainCookies?.enabled).toBe(true);
		expect(advanced?.crossSubDomainCookies?.domain).toBe(getPublicBrandCookieDomain());
	});

	it("sets useSecureCookies to true in production", () => {
		const auth = createAuth(prodConfig);
		const advanced = (
			auth as unknown as {
				options: { advanced?: { useSecureCookies?: boolean } };
			}
		).options?.advanced;
		expect(advanced?.useSecureCookies).toBe(true);
	});
});

describe("createAuth — Google OAuth", () => {
	it("includes google provider when credentials are provided", () => {
		const auth = createAuth({
			...baseConfig,
			googleClientId: "google-client-id",
			googleClientSecret: "google-client-secret",
		});
		const providers = (auth as unknown as { options: { socialProviders?: { google?: unknown } } })
			.options?.socialProviders;
		expect(providers?.google).toBeDefined();
	});

	it("omits google provider when credentials are not provided", () => {
		const auth = createAuth(baseConfig);
		const providers = (auth as unknown as { options: { socialProviders?: { google?: unknown } } })
			.options?.socialProviders;
		expect(providers?.google).toBeUndefined();
	});
});

describe("createAuth - trusted origins", () => {
	it("normalizes URL origins and lowercases fallback origin strings", () => {
		const auth = createAuth({
			...baseConfig,
			baseURL: "https://API.PebbleDesk.app/v1",
			trustedOrigins: [getProductAppUrl("/dashboard"), "NOT A URL"],
		});
		const trustedOrigins = (auth as unknown as { options: { trustedOrigins?: string[] } }).options
			?.trustedOrigins;

		expect(trustedOrigins).toEqual([getPublicApiOrigin(), getProductAppOrigin(), "not a url"]);
	});
});

describe("createAuth - email verification", () => {
	it("wires an injected Better Auth sendVerificationEmail handler", () => {
		const sendVerificationEmail = async () => undefined;
		const auth = createAuth({ ...baseConfig, sendVerificationEmail });
		const emailVerification = (
			auth as unknown as {
				options: {
					emailAndPassword?: { requireEmailVerification?: boolean };
					emailVerification?: { sendVerificationEmail?: unknown; sendOnSignUp?: boolean };
				};
			}
		).options;

		expect(emailVerification?.emailVerification?.sendVerificationEmail).toBe(sendVerificationEmail);
		expect(emailVerification?.emailVerification?.sendOnSignUp).toBe(true);
		expect(emailVerification?.emailAndPassword?.requireEmailVerification).toBe(false);
	});
});

describe("createAuth - account self-service safety", () => {
	it("enables Better Auth user deletion", () => {
		const auth = createAuth(baseConfig);
		const deleteUserConfig = (
			auth as unknown as {
				options: {
					user?: {
						deleteUser?: {
							enabled?: boolean;
							beforeDelete?: (user: { id: string }) => Promise<void>;
						};
					};
				};
			}
		).options?.user?.deleteUser;

		expect(deleteUserConfig?.enabled).toBe(true);
		expect(deleteUserConfig?.beforeDelete).toEqual(expect.any(Function));
	});

	it("allows non-owner users to delete their account", async () => {
		const auth = createAuth({ ...baseConfig, db: createMockDb([]) });
		const deleteUserConfig = (
			auth as unknown as {
				options: {
					user?: {
						deleteUser?: {
							beforeDelete?: (user: { id: string }) => Promise<void>;
						};
					};
				};
			}
		).options?.user?.deleteUser;

		await expect(deleteUserConfig?.beforeDelete?.({ id: "user-1" })).resolves.toBeUndefined();
	});

	it("severs historical membership user links before account deletion", async () => {
		const updateWhere = vi.fn(async () => undefined);
		const where = () => ({ limit: async () => [] });
		const from = () => ({ where });
		const select = () => ({ from });
		const set = vi.fn(() => ({ where: updateWhere }));
		const update = () => ({ set });
		const db = { select, update } as unknown as Parameters<typeof createAuth>[0]["db"];
		const auth = createAuth({ ...baseConfig, db });
		const deleteUserConfig = (
			auth as unknown as {
				options: {
					user?: {
						deleteUser?: {
							beforeDelete?: (user: { id: string }) => Promise<void>;
						};
					};
				};
			}
		).options?.user?.deleteUser;

		await expect(deleteUserConfig?.beforeDelete?.({ id: "user-1" })).resolves.toBeUndefined();
		expect(set).toHaveBeenCalledWith({ userId: null });
		expect(updateWhere).toHaveBeenCalled();
	});

	it("blocks account deletion while the user has an active center membership", async () => {
		const auth = createAuth({ ...baseConfig, db: createMockDb([{ id: "membership-1" }]) });
		const deleteUserConfig = (
			auth as unknown as {
				options: {
					user?: {
						deleteUser?: {
							beforeDelete?: (user: { id: string }) => Promise<void>;
						};
					};
				};
			}
		).options?.user?.deleteUser;

		await expect(deleteUserConfig?.beforeDelete?.({ id: "owner-1" })).rejects.toThrow(
			"Leave all centers before deleting your account.",
		);
	});
});
