// Production driver: neon-http (HTTP, stateless). db.transaction() calls are NOT atomic in production —
// neon-http does not support real multi-statement transactions or FOR UPDATE row locks.
// To get real atomicity, wire a Hyperdrive binding (wrangler.jsonc) pointing to neon-serverless WebSocket.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1"]);

export interface CreateDbOptions {
	hyperdriveBound?: boolean;
}

export function resolveDbDriver(
	databaseUrl: string,
	options: CreateDbOptions = {},
): "postgres" | "neon-http" {
	if (options.hyperdriveBound) {
		return "postgres";
	}

	try {
		const hostname = new URL(databaseUrl).hostname;
		return LOCAL_DB_HOSTS.has(hostname) ? "postgres" : "neon-http";
	} catch {
		return "neon-http";
	}
}

export function createDb(databaseUrl: string, options: CreateDbOptions = {}) {
	if (resolveDbDriver(databaseUrl, options) === "postgres") {
		const sql = postgres(databaseUrl, {
			max: 1,
			prepare: false,
		});

		return drizzlePostgres(sql, { schema });
	}

	const sql = neon(databaseUrl);
	return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;

/**
 * Resolve the database connection string from the Worker environment.
 * Prefers Hyperdrive when bound; falls back to DATABASE_URL with a visible warning.
 */
export function resolveConnectionString(
	hyperdrive: { connectionString: string } | undefined,
	databaseUrl: string,
): string {
	if (hyperdrive) {
		return hyperdrive.connectionString;
	}
	console.warn("DB: Using DATABASE_URL directly — Hyperdrive not bound");
	return databaseUrl;
}

/**
 * Asserts that Hyperdrive is bound when running in production.
 * Throws at cold-start if the assertion fails so the problem surfaces immediately
 * rather than silently degrading to non-atomic neon-http transactions.
 */
export function assertProductionDbDriver(
	hyperdrive: { connectionString: string } | undefined,
	isProduction: boolean,
): void {
	if (isProduction && !hyperdrive) {
		throw new Error(
			"Hyperdrive binding is required in production — db.transaction() is NOT atomic over neon-http. " +
				"Add a hyperdrive binding in wrangler.jsonc env.production and configure it in the Cloudflare dashboard.",
		);
	}
}
