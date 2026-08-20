import { FREE_RESOURCE_POLICY_COPY } from "@pebbledesk/shared/public-knowledge/emails";
import { describe, expect, it } from "vitest";
import { getLeadMagnetFaqItems } from "./lead-magnet-faq";

describe("getLeadMagnetFaqItems", () => {
	it("keeps lead magnet FAQ copy focused only on resource delivery", () => {
		const faqItems = getLeadMagnetFaqItems();
		const faqText = JSON.stringify(faqItems).toLowerCase();

		expect(faqItems[0]?.a).toBe(FREE_RESOURCE_POLICY_COPY.freeResourceAnswer);
		expect(faqItems[3]?.a).toBe(FREE_RESOURCE_POLICY_COPY.noAccountRequired);
		expect(faqText).not.toContain("follow-up");
		expect(faqText).not.toContain("sequence");
		expect(faqText).not.toContain("unsubscribe");
		expect(faqText).not.toContain("no spam");
		expect(faqText).not.toContain("spam me");
	});
});
