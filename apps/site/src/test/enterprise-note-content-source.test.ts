import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function listSourceFiles(directory: string): string[] {
	return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap(
		(entry) => {
			const relativePath = join(directory, entry.name);
			if (entry.isDirectory()) {
				return listSourceFiles(relativePath);
			}
			const isCoveredSource =
				entry.name.endsWith(".md") ||
				entry.name.endsWith(".astro") ||
				entry.name.endsWith(".ts") ||
				entry.name.endsWith(".tsx");
			return entry.isFile() && isCoveredSource ? [relativePath] : [];
		},
	);
}

const publicSourceFiles = [
	...listSourceFiles("src/content"),
	...listSourceFiles("src/config"),
	...listSourceFiles("src/pages"),
	...listSourceFiles("../../packages/shared/src/public-knowledge"),
];

describe("enterprise note content source", () => {
	it("does not present PebbleDesk Enterprise as a selectable tier or pricing option", () => {
		for (const relativePath of publicSourceFiles) {
			const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

			expect(source).not.toMatch(/PebbleDesk(?:'s)? Enterprise tier/i);
			expect(source).not.toMatch(/Enterprise custom/i);
			expect(source).not.toMatch(/upgrades to Enterprise/i);
			expect(source).not.toMatch(/PebbleDesk Enterprise/i);
			expect(source).not.toMatch(/move to Enterprise pricing/i);
			expect(source).not.toMatch(/requires Enterprise pricing/i);
			expect(source).not.toMatch(/Enterprise pricing for larger programs/i);
			expect(source).not.toMatch(/\|\s*Multi-site support\s*\|[^\n]*\|\s*Enterprise tier\s*\|/i);
			expect(source).not.toMatch(/Group and Enterprise/i);
			expect(source).not.toMatch(/Enterprise setup/i);
			expect(source).not.toMatch(/Enterprise adds/i);
			expect(source).not.toMatch(/Enterprise is custom-priced/i);
			expect(source).not.toMatch(/Enterprise is custom/i);
			expect(source).not.toMatch(/Enterprise rollouts/i);
		}
	});
});
