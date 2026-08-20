import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web vite config", () => {
	it("locks the dev server to the PebbleDesk web port (3040) per the project port table", () => {
		const source = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

		expect(source).toContain("port: 3040");
		expect(source).toContain("strictPort: true");
	});
});
