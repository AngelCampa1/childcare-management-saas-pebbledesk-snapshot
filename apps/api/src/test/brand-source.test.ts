import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");

function readRepoFile(path: string): string {
	return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("API brand source usage", () => {
	it("routes first-party marketing URLs through shared public brand knowledge", () => {
		const indexSource = readRepoFile("src/index.ts");
		const unsubscribeSource = readRepoFile("src/routes/unsubscribe.ts");
		const feedbackSource = readRepoFile("src/routes/feedback.ts");

		expect(indexSource).toContain("PUBLIC_BRAND_KNOWLEDGE");
		expect(indexSource).not.toContain('url.hostname = "pebbledesk.app"');
		expect(unsubscribeSource).toContain("getPublicBrandUrl");
		expect(unsubscribeSource).not.toContain('"https://pebbledesk.app"');
		expect(feedbackSource).toContain("PUBLIC_BRAND_KNOWLEDGE.supportEmail");
		expect(feedbackSource).not.toContain('"angel.campa@pebbledesk.app"');
	});
});
