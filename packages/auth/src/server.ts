import { accounts, memberships, sessions, users, verifications } from "@pebbledesk/db";
import type { Database } from "@pebbledesk/db/client";
import { getPublicBrandCookieDomain } from "@pebbledesk/shared/public-knowledge/brand";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { and, eq, isNull } from "drizzle-orm";

export const AUTH_SCHEMA = {
	user: users,
	session: sessions,
	account: accounts,
	verification: verifications,
} as const;

export const AUTH_ADVANCED_CONFIG = {
	database: { generateId: "uuid" as const },
};

export interface AuthConfig {
	db: Database;
	secret: string;
	baseURL: string;
	trustedOrigins?: string[];
	googleClientId?: string;
	googleClientSecret?: string;
	isProduction?: boolean;
	sendVerificationEmail?: (
		data: {
			user: { id: string; email: string; name?: string | null };
			url: string;
			token: string;
		},
		request?: Request,
	) => Promise<void>;
}

async function assertUserCanSelfDelete(db: Database, userId: string) {
	const activeMemberships = await db
		.select({ id: memberships.id })
		.from(memberships)
		.where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt)))
		.limit(1);

	if (activeMemberships.length > 0) {
		throw new APIError("BAD_REQUEST", {
			message: "Leave all centers before deleting your account.",
		});
	}

	await db.update(memberships).set({ userId: null }).where(eq(memberships.userId, userId));
}

function normalizeOrigin(url: string): string {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host.toLowerCase()}`;
	} catch {
		return url.toLowerCase();
	}
}

export function createAuth(config: AuthConfig) {
	const {
		db,
		secret,
		baseURL,
		trustedOrigins = [],
		googleClientId,
		googleClientSecret,
		isProduction = false,
		sendVerificationEmail,
	} = config;

	const socialProviders =
		googleClientId && googleClientSecret
			? {
					google: {
						clientId: googleClientId,
						clientSecret: googleClientSecret,
					},
				}
			: {};

	const advancedConfig = isProduction
		? {
				...AUTH_ADVANCED_CONFIG,
				useSecureCookies: true,
				crossSubDomainCookies: {
					enabled: true,
					domain: getPublicBrandCookieDomain(),
				},
			}
		: AUTH_ADVANCED_CONFIG;

	return betterAuth({
		secret,
		baseURL,
		trustedOrigins: Array.from(new Set([baseURL, ...trustedOrigins].map(normalizeOrigin))),
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: AUTH_SCHEMA,
		}),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		user: {
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					await assertUserCanSelfDelete(db, user.id);
				},
			},
		},
		...(sendVerificationEmail
			? {
					emailVerification: {
						sendVerificationEmail,
						sendOnSignUp: true,
					},
				}
			: {}),
		advanced: advancedConfig,
		socialProviders,
		session: {
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60, // 5 minutes in seconds
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
