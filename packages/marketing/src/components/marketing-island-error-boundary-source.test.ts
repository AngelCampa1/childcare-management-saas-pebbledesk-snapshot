import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("marketing island error boundary source", () => {
	it("exposes a reusable silent and CTA fallback boundary helper", () => {
		const source = readFileSync(
			resolve(process.cwd(), "src/components/marketing-island-error-boundary.tsx"),
			"utf8",
		);

		expect(source).toContain("withMarketingIslandErrorBoundary");
		expect(source).toContain("MarketingIslandErrorBoundary");
		expect(source).toContain('mode: "silent"');
		expect(source).toContain('mode: "cta"');
		expect(source).toContain("MarketingIslandFallbackCta");
	});
});
