import { describe, expect, it } from "vitest";
import { hubFaqs } from "./hub-faqs";

describe("hubFaqs", () => {
	it("keeps compare pricing FAQ aligned with the current center starter plan limit", () => {
		const comparePricingFaq = hubFaqs["/compare/pricing"]?.find((item) =>
			item.q.includes("40-child center"),
		);

		expect(comparePricingFaq?.a).toContain("/mo");
		expect(comparePricingFaq?.a).toContain("up to 50 active children");
		expect(comparePricingFaq?.a).not.toContain("up to 75 children");
	});
});
