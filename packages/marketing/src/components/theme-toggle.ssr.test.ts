// @vitest-environment node

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle SSR", () => {
	it("renders the system theme when window is undefined", () => {
		expect(typeof window).toBe("undefined");

		const markup = renderToString(createElement(ThemeToggle));

		expect(markup).toContain('aria-label="System theme"');
		expect(markup).toContain('title="System theme"');
		expect(markup).toContain("<rect");
	});
});
