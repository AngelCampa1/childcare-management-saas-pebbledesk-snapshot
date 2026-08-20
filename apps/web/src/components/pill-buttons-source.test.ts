import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
	return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("ad-hoc app button radius source regressions", () => {
	it("keeps standalone app icon and trigger buttons pill-shaped", () => {
		const headerSource = readSource("./header.tsx");
		const switcherSource = readSource("./center-switcher.tsx");
		const calendarSource = readSource("./attendance-calendar.tsx");
		const searchSource = readSource("./attendance-search.tsx");
		const errorBoundarySource = readSource("../error-boundary.tsx");

		expect(headerSource).toContain("justify-center rounded-full border border-border");
		expect(switcherSource).toContain("gap-1.5 rounded-full border border-border");
		expect(calendarSource).toContain('className="rounded-full p-1.5');
		expect(calendarSource).not.toContain('className="rounded-md p-1.5');
		expect(searchSource).toContain("justify-center rounded-full");
		expect(errorBoundarySource).toContain('borderRadius: "9999px"');
	});

	it("keeps the shared sheet close control pill-shaped", () => {
		const sheetSource = readSource("../../../../packages/ui/src/components/sheet.tsx");

		expect(sheetSource).toContain("items-center rounded-full border border-sidebar-border");
		expect(sheetSource).not.toContain("items-center rounded-md border border-sidebar-border");
	});
});
