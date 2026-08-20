import { describe, expect, it } from "vitest";
import {
	FREE_RESOURCE_POLICY_COPY,
	getEmailLifecyclePublicKnowledgeArtifact,
	SUBSCRIPTION_TRIAL_EMAIL_COPY,
	UNSUBSCRIBE_CONFIRMATION_COPY,
} from "./emails.js";
import {
	getLeadMagnetBySlug,
	getLeadMagnetSlugs,
	getLeadMagnetsPublicKnowledgeArtifact,
	getLeadMagnetTitle,
	getLeadMagnetTrack,
	leadMagnetCatalog,
} from "./lead-magnets.js";
import { buildPublicPricingMarkdown } from "./marketing-surfaces.js";

describe("canonical lead magnet and email lifecycle knowledge", () => {
	it("catalogs all launch lead magnets with public download metadata", () => {
		expect(leadMagnetCatalog).toHaveLength(16);
		expect(getLeadMagnetBySlug("licensing-compliance-checklist")).toMatchObject({
			title: "Licensing Compliance Checklist",
			publicPath: "/free/licensing-compliance-checklist/",
			downloadPath: "/lead-magnets/licensing-compliance-checklist.pdf",
			track: "compliance",
		});
		expect(getLeadMagnetTrack("ccdf-billing-error-prevention")).toBe("billing");
		expect(getLeadMagnetBySlug("missing-guide")).toBeNull();
		expect(getLeadMagnetTitle("licensing-compliance-checklist")).toBe(
			"Licensing Compliance Checklist",
		);
		expect(getLeadMagnetTitle("legacy-custom-guide")).toBe("Legacy Custom Guide");
		expect(getLeadMagnetSlugs()).toContain("head-start-self-assessment-checklist");
		expect(getLeadMagnetsPublicKnowledgeArtifact()).toMatchObject({
			schemaVersion: 1,
			surface: "lead-magnets",
			magnets: leadMagnetCatalog,
		});
	});

	it("derives trial reminder copy from shared billing constants", () => {
		expect(SUBSCRIPTION_TRIAL_EMAIL_COPY.reminderDaysBeforeEnd).toBe(3);
		expect(SUBSCRIPTION_TRIAL_EMAIL_COPY.endingSoonHeading).toBe("Your trial ends in 3 days");
	});

	it("centralizes free-resource and unsubscribe policy copy", () => {
		expect(FREE_RESOURCE_POLICY_COPY.noAccountRequired).toContain("No account required");
		expect(FREE_RESOURCE_POLICY_COPY.noCreditCardRequired).toContain("No credit card");
		expect(UNSUBSCRIBE_CONFIRMATION_COPY.heading).toBe("You've been unsubscribed.");
	});

	it("serializes the email lifecycle artifact for generated public knowledge", () => {
		expect(getEmailLifecyclePublicKnowledgeArtifact()).toMatchObject({
			schemaVersion: 1,
			surface: "email-lifecycle",
			freeResourcePolicy: FREE_RESOURCE_POLICY_COPY,
			subscriptionTrial: SUBSCRIPTION_TRIAL_EMAIL_COPY,
		});
	});

	it("builds public pricing markdown from shared billing and offer facts", () => {
		const markdown = buildPublicPricingMarkdown();

		expect(markdown).toContain("# PebbleDesk pricing");
		expect(markdown).toContain("### Center Starter");
		expect(markdown).toContain("- Price: $26/mo when paid yearly ($309.60/year)");
		expect(markdown).not.toContain("Standard:");
		expect(markdown).not.toContain("$129/mo billed annually");
		expect(markdown).toContain("30-day free trial for self-serve plans");
		expect(markdown).toContain("No credit card required for self-serve trial signup.");
	});
});
