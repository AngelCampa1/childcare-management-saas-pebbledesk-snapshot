import { buildOrganizationSchema } from "@pebbledesk/marketing/lib/schema-builders";
import { describe, expect, it } from "vitest";
import { siteConfig } from "../config/site.js";

describe("no public phone number", () => {
	it("Organization JSON-LD schema has no telephone field", () => {
		const schema = buildOrganizationSchema({
			name: siteConfig.name,
			url: `https://${siteConfig.domain}`,
			...(siteConfig.contactEmail && {
				contactPoint: { email: siteConfig.contactEmail, type: "customer support" },
			}),
			...(siteConfig.areaServed && { areaServed: siteConfig.areaServed }),
		}) as Record<string, unknown>;

		expect(schema).not.toHaveProperty("telephone");

		const contactPoint = schema.contactPoint as Record<string, unknown> | undefined;
		if (contactPoint) {
			expect(contactPoint).not.toHaveProperty("telephone");
		}
	});

	it("siteConfig has no phone or telephone field at the top level", () => {
		const config = siteConfig as Record<string, unknown>;
		expect(config).not.toHaveProperty("phone");
		expect(config).not.toHaveProperty("telephone");
	});

	it("siteConfig footer has no phone or telephone field", () => {
		const footer = siteConfig.footer as Record<string, unknown>;
		expect(footer).not.toHaveProperty("phone");
		expect(footer).not.toHaveProperty("telephone");
	});

	it("siteConfig author has no phone field", () => {
		const author = siteConfig.author as Record<string, unknown>;
		expect(author).not.toHaveProperty("phone");
		expect(author).not.toHaveProperty("telephone");
	});
});
