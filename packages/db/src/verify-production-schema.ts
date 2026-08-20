import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
	lookupProductionColumns,
	lookupProductionRelations,
	lookupProductionTypeLabels,
	lookupProductionTypes,
	verifyProductionSchema,
} from "./production-schema-verifier.js";

type PostgresClient = ReturnType<typeof postgres>;

export type VerifyProductionSchemaCliOptions = {
	createClient: (databaseUrl: string) => PostgresClient;
	databaseUrl: string | undefined;
	writeError: (message: string) => void;
	writeOutput: (message: string) => void;
};

export async function runVerifyProductionSchemaCli({
	createClient,
	databaseUrl,
	writeError,
	writeOutput,
}: VerifyProductionSchemaCliOptions): Promise<number> {
	if (!databaseUrl) {
		writeError("DATABASE_URL is required to verify the production database schema.");
		return 1;
	}

	let sql: PostgresClient | undefined;
	try {
		const client = createClient(databaseUrl);
		sql = client;
		const result = await verifyProductionSchema(
			(relations) => lookupProductionRelations(client, relations),
			(types) => lookupProductionTypes(client, types),
			(types) => lookupProductionTypeLabels(client, types),
			(columns) => lookupProductionColumns(client, columns),
		);
		const cleanupSucceeded = await closeClient(sql, databaseUrl, writeError);
		if (!cleanupSucceeded) {
			return 1;
		}
		writeOutput(
			`Production database schema verified (${result.checkedRelations} required relations, ${result.checkedTypes} required types, and ${result.checkedColumns} required columns present).`,
		);
		return 0;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		writeError(redactDatabaseUrl(message, databaseUrl));
		if (sql) {
			await closeClient(sql, databaseUrl, writeError);
		}
		return 1;
	}
}

function redactDatabaseUrl(message: string, databaseUrl: string): string {
	return message.split(databaseUrl).join("[redacted database url]");
}

async function closeClient(
	sql: PostgresClient,
	databaseUrl: string,
	writeError: (message: string) => void,
): Promise<boolean> {
	try {
		await sql.end();
		return true;
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		writeError(redactDatabaseUrl(message, databaseUrl));
		return false;
	}
}

/* v8 ignore next 9 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	process.exitCode = await runVerifyProductionSchemaCli({
		createClient: (databaseUrl) => postgres(databaseUrl, { max: 1, prepare: false }),
		databaseUrl: process.env.DATABASE_URL,
		writeError: console.error,
		writeOutput: console.log,
	});
}
