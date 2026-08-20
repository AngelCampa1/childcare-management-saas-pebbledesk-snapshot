import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("BaseLayout Sentry bootstrap", () => {
	it("initializes Sentry in production even when analytics is disabled", () => {
		const source = readFileSync(resolve("src/layouts/base-layout.astro"), "utf8");
		const sentryIndex = source.indexOf('import { initSentry } from "../lib/sentry-client"');
		const croIndex = source.indexOf('import { initCroTracking } from "../lib/cro-tracker"');

		expect(sentryIndex).toBeGreaterThan(-1);
		expect(sentryIndex).toBeLessThan(croIndex);
		expect(source).toContain("{import.meta.env.PROD && (");
		expect(source).not.toContain(
			"{analyticsEnabled && import.meta.env.PROD && (\n      <script>\n        import { initSentry }",
		);
	});
});
