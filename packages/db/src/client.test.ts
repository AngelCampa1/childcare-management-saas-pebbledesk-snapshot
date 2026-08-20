import { beforeEach, describe, expect, it, vi } from "vitest";

const { neonMock, drizzleNeonMock, postgresMock, drizzlePostgresMock } = vi.hoisted(() => ({
	neonMock: vi.fn((url: string) => ({ kind: "neon-client", url })),
	drizzleNeonMock: vi.fn((client: unknown) => ({ kind: "neon-db", client })),
	postgresMock: vi.fn((url: string) => ({ kind: "postgres-client", url })),
	drizzlePostgresMock: vi.fn((client: unknown) => ({ kind: "postgres-db", client })),
}));

vi.mock("@neondatabase/serverless", () => ({
	neon: neonMock,
}));

vi.mock("drizzle-orm/neon-http", () => ({
	drizzle: drizzleNeonMock,
}));

vi.mock("postgres", () => ({
	default: postgresMock,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
	drizzle: drizzlePostgresMock,
}));

import {
	assertProductionDbDriver,
	createDb,
	resolveConnectionString,
	resolveDbDriver,
} from "./client.js";

describe("resolveDbDriver", () => {
	beforeEach(() => {
		neonMock.mockClear();
		drizzleNeonMock.mockClear();
		postgresMock.mockClear();
		drizzlePostgresMock.mockClear();
	});

	it("uses the direct postgres driver for localhost-style database URLs", () => {
		expect(resolveDbDriver("REPLACE_WITH_DATABASE_URL")).toBe(
			"postgres",
		);

		createDb("REPLACE_WITH_DATABASE_URL");

		expect(postgresMock).toHaveBeenCalledWith(
			"REPLACE_WITH_DATABASE_URL",
			expect.objectContaining({
				max: 1,
				prepare: false,
			}),
		);
		expect(drizzlePostgresMock).toHaveBeenCalled();
		expect(neonMock).not.toHaveBeenCalled();
	});

	it("keeps the neon http driver for hosted database URLs", () => {
		expect(resolveDbDriver("REPLACE_WITH_DATABASE_URL")).toBe(
			"neon-http",
		);

		createDb("REPLACE_WITH_DATABASE_URL");

		expect(neonMock).toHaveBeenCalledWith(
			"REPLACE_WITH_DATABASE_URL",
		);
		expect(drizzleNeonMock).toHaveBeenCalled();
		expect(postgresMock).not.toHaveBeenCalled();
	});

	it("uses the direct postgres driver when Hyperdrive is bound", () => {
		expect(
			resolveDbDriver("REPLACE_WITH_DATABASE_URL", {
				hyperdriveBound: true,
			}),
		).toBe("postgres");

		createDb("REPLACE_WITH_DATABASE_URL", {
			hyperdriveBound: true,
		});

		expect(postgresMock).toHaveBeenCalledWith(
			"REPLACE_WITH_DATABASE_URL",
			expect.objectContaining({
				max: 1,
				prepare: false,
			}),
		);
		expect(drizzlePostgresMock).toHaveBeenCalled();
		expect(neonMock).not.toHaveBeenCalled();
	});

	it("falls back to neon-http when the database URL is not parseable", () => {
		// An unparseable URL causes new URL() to throw; the catch branch returns "neon-http".
		expect(resolveDbDriver("not-a-url")).toBe("neon-http");
	});
});

describe("resolveConnectionString", () => {
	it("returns the Hyperdrive connectionString when binding is present", () => {
		const result = resolveConnectionString(
			{ connectionString: "REPLACE_WITH_DATABASE_URL" },
			"REPLACE_WITH_DATABASE_URL",
		);
		expect(result).toBe("REPLACE_WITH_DATABASE_URL");
	});

	it("falls back to DATABASE_URL and emits a console.warn when Hyperdrive is not bound", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		const result = resolveConnectionString(undefined, "REPLACE_WITH_DATABASE_URL");

		expect(result).toBe("REPLACE_WITH_DATABASE_URL");
		expect(warnSpy).toHaveBeenCalledWith("DB: Using DATABASE_URL directly — Hyperdrive not bound");

		warnSpy.mockRestore();
	});
});

describe("assertProductionDbDriver", () => {
	it("throws when Hyperdrive is not bound in production", () => {
		expect(() => assertProductionDbDriver(undefined, true)).toThrowError(
			expect.objectContaining({
				message: expect.stringContaining("Hyperdrive"),
			}),
		);
	});

	it("does not throw when Hyperdrive is bound in production", () => {
		expect(() =>
			assertProductionDbDriver({ connectionString: "REPLACE_WITH_DATABASE_URL" }, true),
		).not.toThrow();
	});

	it("does not throw when Hyperdrive is not bound in a non-production environment", () => {
		expect(() => assertProductionDbDriver(undefined, false)).not.toThrow();
	});
});
