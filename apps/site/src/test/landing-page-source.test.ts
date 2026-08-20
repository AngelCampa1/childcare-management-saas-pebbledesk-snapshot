import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CASES = [
	{
		file: "src/pages/index.astro",
		canonicalPath: 'canonicalPath="/"',
		schemaMode: 'schemaMode="product"',
	},
	{
		file: "src/pages/pricing.astro",
		canonicalPath: 'canonicalPath="/pricing"',
		schemaMode: 'schemaMode="product"',
	},
	{
		file: "src/pages/about.astro",
		canonicalPath: 'canonicalPath="/about"',
		schemaMode: 'schemaMode="brand"',
	},
] as const;

describe("landing pages pass explicit SEO layout props", () => {
	for (const entry of CASES) {
		it(`sets canonicalPath and schemaMode for ${entry.file}`, () => {
			const source = readFileSync(resolve(process.cwd(), entry.file), "utf8");

			expect(source).toContain(entry.canonicalPath);
			expect(source).toContain(entry.schemaMode);
		});
	}

	it("redirects placeholder customer stories until real proof exists", () => {
		const redirects = readFileSync(resolve(process.cwd(), "public/_redirects"), "utf8");

		expect(redirects).toContain("/customers /about/ 301");
		expect(redirects).toContain("/customers/ /about/ 301");
		expect(redirects).toContain("/customers/* /about/ 301");
	});

	it("keeps the about page aligned with live Center Starter and Center Pro framing", () => {
		const source = readFileSync(resolve(process.cwd(), "src/pages/about.astro"), "utf8");

		expect(source).toContain("formatPlanCapacityClaim");
		expect(source).toContain('const homeCapacityClaim = formatPlanCapacityClaim("home");');
		expect(source).toContain(
			'const starterCapacityClaim = formatPlanCapacityClaim("center_starter");',
		);
		expect(source).toContain('const proCapacityClaim = formatPlanCapacityClaim("center_pro");');
		expect(source).toContain("Home for {homeCapacityClaim}");
		expect(source).toContain("Center Starter for {starterCapacityClaim}");
		expect(source).toContain("Center Pro for {proCapacityClaim}");
	});

	it("keeps FAQ schema-backed sections on the homepage and pricing page", () => {
		const homepageSource = readFileSync(resolve(process.cwd(), "src/pages/index.astro"), "utf8");
		const pricingSource = readFileSync(resolve(process.cwd(), "src/pages/pricing.astro"), "utf8");

		expect(homepageSource).toContain(
			'import FaqSection from "@pebbledesk/marketing/components/faq-section.astro";',
		);
		expect(homepageSource).toContain("<FaqSection faqs={siteConfig.faqs} />");
		expect(pricingSource).toContain(
			'import FaqSection from "@pebbledesk/marketing/components/faq-section.astro";',
		);
		expect(pricingSource).toContain("<FaqSection");
		expect(pricingSource).toContain("faqs={pricingFaqs}");
	});
});
