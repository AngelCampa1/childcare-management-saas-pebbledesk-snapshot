import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("exit popup turnstile source regressions", () => {
	it("passes turnstileSiteKey to ExitIntentPopup in all layout files", () => {
		const articleLayoutSource = readSource("./article-layout.astro");
		const comparisonLayoutSource = readSource("./comparison-layout.astro");
		const contentLayoutSource = readSource("./content-layout.astro");
		const landingLayoutSource = readSource("./landing-layout.astro");
		const listicleLayoutSource = readSource("./listicle-layout.astro");
		const pricingLayoutSource = readSource("./pricing-breakdown-layout.astro");

		for (const source of [
			articleLayoutSource,
			comparisonLayoutSource,
			contentLayoutSource,
			landingLayoutSource,
			listicleLayoutSource,
			pricingLayoutSource,
		]) {
			expect(source).toContain("import.meta.env.PUBLIC_TURNSTILE_SITE_KEY");
			expect(source).toContain("turnstileSiteKey={turnstileSiteKey}");
		}
	});
});
