import { describe, expect, it, vi } from "vitest";
import {
	REQUIRED_PRODUCTION_COLUMNS,
	REQUIRED_PRODUCTION_RELATIONS,
	REQUIRED_PRODUCTION_TYPE_LABELS,
	REQUIRED_PRODUCTION_TYPES,
} from "../src/production-schema-verifier.js";
import { runVerifyProductionSchemaCli } from "../src/verify-production-schema.js";

function createSuccessfulSchemaSql(end: ReturnType<typeof vi.fn>) {
	return Object.assign(
		vi.fn(async (query: TemplateStringsArray) => {
			const queryText = query.raw.join("");
			if (queryText.includes("pg_enum")) {
				return REQUIRED_PRODUCTION_TYPE_LABELS.flatMap((type) =>
					type.labels.map((label) => ({ schema: type.schema, name: type.name, label })),
				);
			}
			if (queryText.includes("pg_type")) {
				return REQUIRED_PRODUCTION_TYPES;
			}
			if (queryText.includes("information_schema.columns")) {
				return REQUIRED_PRODUCTION_COLUMNS;
			}
			return REQUIRED_PRODUCTION_RELATIONS;
		}),
		{ end },
	);
}

describe("verify production schema CLI", () => {
	it("reports success and closes the database client", async () => {
		const output = vi.fn();
		const error = vi.fn();
		const end = vi.fn().mockResolvedValue(undefined);
		const createClient = vi.fn(() => createSuccessfulSchemaSql(end) as never);

		const exitCode = await runVerifyProductionSchemaCli({
			createClient,
			databaseUrl: "REPLACE_WITH_DATABASE_URL",
			writeError: error,
			writeOutput: output,
		});

		expect(exitCode).toBe(0);
		expect(output).toHaveBeenCalledWith(
			`Production database schema verified (${REQUIRED_PRODUCTION_RELATIONS.length} required relations, ${REQUIRED_PRODUCTION_TYPES.length} required types, and ${REQUIRED_PRODUCTION_COLUMNS.length} required columns present).`,
		);
		expect(error).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledOnce();
	});

	it("requires a database URL without creating a client", async () => {
		const output = vi.fn();
		const error = vi.fn();
		const createClient = vi.fn();

		const exitCode = await runVerifyProductionSchemaCli({
			createClient,
			databaseUrl: "",
			writeError: error,
			writeOutput: output,
		});

		expect(exitCode).toBe(1);
		expect(error).toHaveBeenCalledWith(
			"DATABASE_URL is required to verify the production database schema.",
		);
		expect(output).not.toHaveBeenCalled();
		expect(createClient).not.toHaveBeenCalled();
	});

	it("redacts the database URL from error output and closes the client", async () => {
		const output = vi.fn();
		const error = vi.fn();
		const end = vi.fn().mockResolvedValue(undefined);
		const databaseUrl = "REPLACE_WITH_DATABASE_URL";
		const createClient = vi.fn(
			() =>
				Object.assign(
					vi.fn(async () => Promise.reject(new Error(`connect failed ${databaseUrl}`))),
					{
						end,
					},
				) as never,
		);

		const exitCode = await runVerifyProductionSchemaCli({
			createClient,
			databaseUrl,
			writeError: error,
			writeOutput: output,
		});

		expect(exitCode).toBe(1);
		expect(error).toHaveBeenCalledWith("connect failed [redacted database url]");
		expect(output).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledOnce();
	});

	it("redacts the database URL when client construction fails", async () => {
		const output = vi.fn();
		const error = vi.fn();
		const databaseUrl = "REPLACE_WITH_DATABASE_URL";
		const createClient = vi.fn(() => {
			throw new Error(`failed to create client for ${databaseUrl}`);
		});

		const exitCode = await runVerifyProductionSchemaCli({
			createClient,
			databaseUrl,
			writeError: error,
			writeOutput: output,
		});

		expect(exitCode).toBe(1);
		expect(error).toHaveBeenCalledWith("failed to create client for [redacted database url]");
		expect(output).not.toHaveBeenCalled();
	});

	it("redacts the database URL when client cleanup fails", async () => {
		const output = vi.fn();
		const error = vi.fn();
		const databaseUrl = "REPLACE_WITH_DATABASE_URL";
		const end = vi.fn().mockRejectedValue(new Error(`close failed ${databaseUrl}`));
		const createClient = vi.fn(() => createSuccessfulSchemaSql(end) as never);

		const exitCode = await runVerifyProductionSchemaCli({
			createClient,
			databaseUrl,
			writeError: error,
			writeOutput: output,
		});

		expect(exitCode).toBe(1);
		expect(error).toHaveBeenCalledWith("close failed [redacted database url]");
		expect(output).not.toHaveBeenCalled();
	});
});
