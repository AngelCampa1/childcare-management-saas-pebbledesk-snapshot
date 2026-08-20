import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape-html.js";

describe("escapeHtml", () => {
	it("escapes ampersands", () => {
		expect(escapeHtml("a & b")).toBe("a &amp; b");
	});

	it("escapes less-than signs", () => {
		expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
	});

	it("escapes greater-than signs", () => {
		expect(escapeHtml("a > b")).toBe("a &gt; b");
	});

	it("escapes double quotes", () => {
		expect(escapeHtml('say "hello"')).toBe("say &quot;hello&quot;");
	});

	it("escapes single quotes", () => {
		expect(escapeHtml("it's")).toBe("it&#x27;s");
	});

	it("escapes all special characters together", () => {
		expect(escapeHtml(`<a href="/" class='x'>a & b</a>`)).toBe(
			"&lt;a href=&quot;/&quot; class=&#x27;x&#x27;&gt;a &amp; b&lt;/a&gt;",
		);
	});

	it("returns plain strings unchanged", () => {
		expect(escapeHtml("hello world")).toBe("hello world");
	});

	it("handles an empty string", () => {
		expect(escapeHtml("")).toBe("");
	});

	it("handles multiple consecutive special characters", () => {
		expect(escapeHtml("&&<<>>\"\"''")).toBe("&amp;&amp;&lt;&lt;&gt;&gt;&quot;&quot;&#x27;&#x27;");
	});
});
