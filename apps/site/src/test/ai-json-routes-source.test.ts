import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routeDir = join(process.cwd(), "src/pages/ai");
const routes = [
	"marketing.json.ts",
	"lead-magnets.json.ts",
	"content-index.json.ts",
	"manifest.json.ts",
	"full.json.ts",
];

describe("public AI JSON routes", () => {
	for (const route of routes) {
		it(`${route} serializes a safe public knowledge artifact as JSON`, () => {
			const path = join(routeDir, route);
			expect(existsSync(path)).toBe(true);
			const source = readFileSync(path, "utf8");

			expect(source).toContain("assertPublicKnowledgeArtifactSafe");
			expect(source).toContain("application/json; charset=utf-8");
			expect(source).toContain("JSON.stringify");
			expect(source).toContain("export async function GET");
		});
	}
});
