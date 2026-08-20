import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("web stylesheet entrypoint", () => {
	it("includes local and UI source paths so shared component utilities compile", () => {
		const stylesheet = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");

		expect(stylesheet).toContain('@import "@pebbledesk/ui/globals.css";');
		expect(stylesheet).toContain('@source "../../../packages/ui/src/**/*.{ts,tsx}";');
		expect(stylesheet).toContain('@source "./**/*.{ts,tsx}";');
	});
});
