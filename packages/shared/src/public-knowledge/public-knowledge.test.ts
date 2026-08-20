/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	getProductAppOrigin,
	getProductAppUrl,
	getPublicApiOrigin,
	getPublicApiUrl,
	getPublicBrandCookieDomain,
	getPublicBrandUrl,
} from "./brand.js";
import generatedAppHelp from "./generated/app-help.json";
import generatedContentIndex from "./generated/content-index.json";
import generatedEmailLifecycle from "./generated/email-lifecycle.json";
import generatedFull from "./generated/full.json";
import generatedLeadMagnets from "./generated/lead-magnets.json";
import generatedManifest from "./generated/manifest.json";
import generatedMarketing from "./generated/marketing.json";
import {
	assertAllPublicKnowledgeSafe,
	assertPublicKnowledgeArtifactSafe,
	assertPublicKnowledgeSafe,
	contentIndexPublicKnowledgeDocuments,
	getAppHelpPublicKnowledgeArtifact,
	getContentIndexPublicKnowledgeArtifact,
	getEmailLifecyclePublicKnowledgeArtifact,
	getFullPublicKnowledgeArtifact,
	getLeadMagnetsPublicKnowledgeArtifact,
	getMarketingPublicKnowledgeArtifact,
	getPublicKnowledgeByAudience,
	getPublicKnowledgeById,
	getPublicKnowledgeManifest,
	marketingPublicKnowledgeDocuments,
	publicKnowledgeDocuments,
	serializePublicKnowledgeDocument,
} from "./index.js";

const currentDir = dirname(fileURLToPath(import.meta.url));

const generatedSurfaces = {
	marketing: generatedMarketing,
	"app-help": generatedAppHelp,
	"email-lifecycle": generatedEmailLifecycle,
	full: generatedFull,
	"lead-magnets": generatedLeadMagnets,
	manifest: generatedManifest,
	"content-index": generatedContentIndex,
};

describe("public knowledge", () => {
	it("builds first-party brand URLs from the public brand source of truth", () => {
		expect(getPublicBrandUrl()).toBe("https://pebbledesk.app/");
		expect(getPublicBrandUrl("/contact/")).toBe("https://pebbledesk.app/contact/");
		expect(getPublicBrandUrl("api/unsubscribe?email=test%40example.com")).toBe(
			"https://pebbledesk.app/api/unsubscribe?email=test%40example.com",
		);
		expect(getProductAppOrigin()).toBe("https://my.pebbledesk.app");
		expect(getProductAppUrl()).toBe("https://my.pebbledesk.app/");
		expect(getProductAppUrl("/signup")).toBe("https://my.pebbledesk.app/signup");
		expect(getProductAppUrl("login")).toBe("https://my.pebbledesk.app/login");
		expect(getPublicApiOrigin()).toBe("https://api.pebbledesk.app");
		expect(getPublicApiUrl()).toBe("https://api.pebbledesk.app/");
		expect(getPublicApiUrl("/api/auth/session")).toBe(
			"https://api.pebbledesk.app/api/auth/session",
		);
		expect(getPublicBrandCookieDomain()).toBe(".pebbledesk.app");
	});

	it("serializes every public document with required AI-safe fields", () => {
		for (const document of publicKnowledgeDocuments) {
			const serialized = serializePublicKnowledgeDocument(document);

			expect(serialized.schemaVersion).toBe(1);
			expect(serialized.id).toMatch(/^[a-z0-9-]+$/);
			expect(serialized.tags.length).toBeGreaterThan(0);
			expect(serialized.sections.length).toBeGreaterThan(0);
			expect(serialized.sourceRefs.length).toBeGreaterThan(0);
			expect(serialized.publicPaths.length).toBeGreaterThan(0);
			expect(serialized.roleVisibility.length).toBeGreaterThan(0);
			expect(serialized.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(serialized.botSafeAnswer).toContain("PebbleDesk");
		}
	});

	it("keeps generated JSON artifacts byte-equivalent to TypeScript serialization", () => {
		const serializedDocuments = publicKnowledgeDocuments.map(serializePublicKnowledgeDocument);

		expect(generatedFull).toEqual({
			schemaVersion: 1,
			generatedFrom: "canonical PebbleDesk public knowledge modules",
			documents: serializedDocuments,
			leadMagnets: generatedLeadMagnets,
			emailLifecycle: generatedEmailLifecycle,
		});
		expect(generatedMarketing).toEqual({
			schemaVersion: 1,
			surface: "marketing",
			documents: marketingPublicKnowledgeDocuments.map(serializePublicKnowledgeDocument),
		});
		expect(generatedAppHelp).toEqual({
			schemaVersion: 1,
			surface: "app-help",
			documents: getPublicKnowledgeByAudience("director").map(serializePublicKnowledgeDocument),
		});
		expect(generatedManifest).toEqual(getPublicKnowledgeManifest());
	});

	it("publishes the required generated artifact contract", () => {
		expect(getMarketingPublicKnowledgeArtifact()).toEqual(generatedMarketing);
		expect(getAppHelpPublicKnowledgeArtifact()).toEqual(generatedAppHelp);
		expect(getLeadMagnetsPublicKnowledgeArtifact()).toEqual(generatedLeadMagnets);
		expect(getEmailLifecyclePublicKnowledgeArtifact()).toEqual(generatedEmailLifecycle);
		expect(getFullPublicKnowledgeArtifact()).toEqual(generatedFull);
		expect(getContentIndexPublicKnowledgeArtifact()).toEqual(generatedContentIndex);
		expect(Object.keys(generatedSurfaces).sort()).toEqual([
			"app-help",
			"content-index",
			"email-lifecycle",
			"full",
			"lead-magnets",
			"manifest",
			"marketing",
		]);
		expect(generatedManifest).toEqual({
			schemaVersion: 1,
			generatedFrom: "canonical PebbleDesk public knowledge modules",
			artifacts: [
				{ file: "marketing.json", surface: "marketing", documentCount: 2 },
				{ file: "app-help.json", surface: "app-help", documentCount: 3 },
				{ file: "lead-magnets.json", surface: "lead-magnets", documentCount: 16 },
				{ file: "email-lifecycle.json", surface: "email-lifecycle", documentCount: 1 },
				{ file: "full.json", surface: "full", documentCount: 3 },
				{
					file: "content-index.json",
					surface: "content-index",
					documentCount: generatedContentIndex.entries.length,
				},
			],
			documents: publicKnowledgeDocuments.map((document) => ({
				id: document.id,
				lastReviewed: document.lastReviewed,
				publicPaths: [...document.publicPaths],
				sourceRefs: document.sourceRefs.map((sourceRef) => sourceRef.url),
			})),
		});
	});

	it("splits public knowledge into typed export surfaces", () => {
		expect(marketingPublicKnowledgeDocuments.map((document) => document.id)).toEqual([
			"pebbledesk-public-pricing",
			"pebbledesk-records-audit-readiness",
		]);
		expect(contentIndexPublicKnowledgeDocuments).toEqual(generatedContentIndex.entries);
	});

	it("indexes every public marketing content markdown file", () => {
		expect(generatedContentIndex.generatedFrom).toBe("public marketing site markdown");
		expect(generatedContentIndex.entries.length).toBeGreaterThan(200);
		expect(generatedContentIndex.entries.map((entry) => entry.id)).toContain(
			"guides.how-to-choose-childcare-management-software",
		);
		expect(generatedContentIndex.entries.map((entry) => entry.publicPaths)).toContainEqual([
			"/resources/guides/how-to-choose-childcare-management-software/",
		]);
	});

	it("keeps content index source-linked claims and competitor slugs registry-safe", () => {
		for (const entry of generatedContentIndex.entries) {
			expect(entry.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(entry.sourceRefs.every((sourceRef) => sourceRef.id && sourceRef.label)).toBe(true);
			expect(entry.competitorSlugs).not.toContain("missing-registry-entry");
		}
	});

	it("keeps source references, public paths, and review dates safe for reuse", () => {
		for (const document of publicKnowledgeDocuments) {
			const serialized = serializePublicKnowledgeDocument(document);
			const reviewedAt = new Date(`${serialized.lastReviewed}T00:00:00.000Z`);

			expect(reviewedAt.getTime()).toBeGreaterThanOrEqual(
				new Date("2026-04-01T00:00:00.000Z").getTime(),
			);
			expect(serialized.sourceRefs.map((ref) => ref.kind)).not.toContain("private");
			expect(serialized.sourceRefs.every((ref) => ref.url.startsWith("/"))).toBe(true);
			expect(serialized.publicPaths.every((path) => path.startsWith("/"))).toBe(true);
			expect(() => assertPublicKnowledgeSafe(document)).not.toThrow();
		}
	});

	it("filters documents by role visibility for app surfaces", () => {
		expect(getPublicKnowledgeByAudience("guardian").map((document) => document.id)).toEqual([
			"pebbledesk-public-pricing",
		]);
		expect(getPublicKnowledgeByAudience("director").map((document) => document.id)).toEqual([
			"pebbledesk-public-pricing",
			"pebbledesk-records-audit-readiness",
			"pebbledesk-authenticated-app-help",
		]);
	});

	it("finds documents by id and rejects unknown ids", () => {
		expect(getPublicKnowledgeById("pebbledesk-public-pricing")?.title).toBe("Public pricing");
		expect(getPublicKnowledgeById("missing-document")).toBeNull();
	});

	it("lists both limited subscription offer codes in public pricing knowledge", () => {
		const pricingDocument = getPublicKnowledgeById("pebbledesk-public-pricing");
		if (!pricingDocument) throw new Error("Expected a pricing public knowledge document");

		const promotionSection = pricingDocument.sections.find(
			(section) => section.id === "pricing.promotion",
		);

		expect(promotionSection?.body).toContain("M80OFF");
		expect(promotionSection?.body).toContain("Y80OFF");
		expect(promotionSection?.body).toContain("80% off the first year");
		expect(promotionSection?.body).toContain("then $129/mo when paid yearly ($1548/year)");
		expect(pricingDocument.botSafeAnswer).toContain("M80OFF");
		expect(pricingDocument.botSafeAnswer).toContain("Y80OFF");
		expect(pricingDocument.botSafeAnswer).toContain("then $129/mo when paid yearly ($1548/year)");
		expect(pricingDocument.botSafeAnswer).not.toContain("80% off once");
		expect(pricingDocument.botSafeAnswer).not.toContain("80% off for 12 months");
		expect(pricingDocument.botSafeAnswer).not.toContain("launch");
	});

	it("derives public pricing promotion and trial prose from shared offering helpers", () => {
		const source = readFileSync(resolve(currentDir, "data.ts"), "utf8");

		expect(source).toContain("PEBBLEDESK_OFFERING.promotion.label");
		expect(source).toContain("PEBBLEDESK_OFFERING.claims.trialLabel");
		expect(source).not.toContain("Get 80% off the first year");
		expect(source).not.toContain("TRIAL_DAYS}-day free trial");
	});

	it("rejects banned private and security-sensitive terms across every document", () => {
		const [pricingDocument] = publicKnowledgeDocuments;
		if (!pricingDocument) throw new Error("Expected a pricing public knowledge document");

		expect(() => assertAllPublicKnowledgeSafe()).not.toThrow();
		expect(() => assertAllPublicKnowledgeSafe([pricingDocument])).not.toThrow();
		for (const document of publicKnowledgeDocuments) {
			expect(() => assertPublicKnowledgeSafe(document)).not.toThrow();
		}
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				botSafeAnswer: "PebbleDesk stores BETTER_AUTH_SECRET in deployment settings.",
			}),
		).toThrow(/BETTER_AUTH_SECRET/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("email-lifecycle.json", {
				schemaVersion: 1,
				surface: "email-lifecycle",
				copy: "Send through RESEND_API_KEY.",
			}),
		).toThrow(/RESEND_API_KEY/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ title: "Internal", url: "http://localhost:8787/private" }],
			}),
		).toThrow(/LOCALHOST/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ sourceRef: "apps/site/src/content/guides/private.md" }],
			}),
		).toThrow(/internal repo path/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ sourceRef: "https://10.0.0.1/source" }],
			}),
		).toThrow(/non-public host/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ sourceRef: "http://example.com/source" }],
			}),
		).toThrow(/non-HTTPS URL/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ sourceRef: "/resources/guides/safe/?sig=private" }],
			}),
		).toThrow(/sensitive query parameter/);
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				schemaVersion: 1,
				entries: [{ sourceRef: "C:\\Users\\dev\\Documents\\pebbledesk\\private.md" }],
			}),
		).toThrow(/filesystem path/);
	});

	it("keeps every generated public knowledge artifact free of sensitive terms", () => {
		for (const [fileName, artifact] of Object.entries(generatedSurfaces)) {
			expect(() => assertPublicKnowledgeArtifactSafe(`${fileName}.json`, artifact)).not.toThrow();
			expect(JSON.stringify(artifact)).not.toContain("apps/site/src/content");
		}
	});

	it("structurally validates URL and path values inside generated artifacts", () => {
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				sourceRef: "https://www.acf.hhs.gov/occ/data",
			}),
		).not.toThrow();
		expect(() =>
			assertPublicKnowledgeArtifactSafe("content-index.json", {
				sourceRef: "/resources/guides/safe/?utm_source=public",
			}),
		).not.toThrow();

		for (const value of [
			"//example.com/source",
			"/../private",
			"/private\\source",
			"/Users/dev/Documents/pebbledesk/private.md",
			"/home/runner/work/pebbledesk/private.md",
			"/c:/Users/dev/Documents/pebbledesk/private.md",
			"file:///C:/private.md",
			"://not-a-url",
		]) {
			expect(() =>
				assertPublicKnowledgeArtifactSafe("content-index.json", { sourceRef: value }),
			).toThrow();
		}

		for (const value of [
			"https://[::1]/source",
			"https://[fd00::1]/source",
			"https://[fe80::1]/source",
			"https://169.254.1.1/source",
			"https://172.16.0.1/source",
			"https://192.168.0.1/source",
			"https://0.0.0.0/source",
			"https://[::]/source",
			"https://[::ffff:127.0.0.1]/source",
			"https://[::ffff:7f00:1]/source",
			"https://[::ffff:a9fe:1]/source",
			"https://[::ffff:0:0]/source",
			"https://example.local/source",
			"https://internal.example.com/source",
			"https://staging.example.com/source",
		]) {
			expect(() =>
				assertPublicKnowledgeArtifactSafe("content-index.json", { sourceRef: value }),
			).toThrow(/non-public host|banned term/);
		}
	});

	it("uses public source references in generated lead magnet artifacts", () => {
		for (const magnet of generatedLeadMagnets.magnets) {
			expect(magnet.sourceRefs.every((sourceRef: string) => sourceRef.startsWith("/"))).toBe(true);
			expect(magnet.sourceRefs).not.toContain("apps/site/src/content");
		}
	});

	it("rejects external and protocol-relative public knowledge paths", () => {
		const [pricingDocument] = publicKnowledgeDocuments;
		if (!pricingDocument) throw new Error("Expected a pricing public knowledge document");

		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				sourceRefs: [
					{
						id: "private.source",
						label: "Private source",
						url: "https://internal.example.com/source",
						kind: "site-page",
					},
				],
			}),
		).toThrow(/public relative path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				sourceRefs: [
					{
						id: "protocol.relative",
						label: "Protocol relative",
						url: "//example.com/source",
						kind: "site-page",
					},
				],
			}),
		).toThrow(/public relative path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["//example.com/pricing"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["/https://example.com/pricing"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["/../private"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["/pricing\\private"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["/Users/dev/Documents/pebbledesk/private.md"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				publicPaths: ["/pricing?sig=abc"],
			}),
		).toThrow(/public path/);
		expect(() =>
			assertPublicKnowledgeSafe({
				...pricingDocument,
				sourceRefs: [
					{
						id: "fragment.source",
						label: "Fragment source",
						url: "/pricing#private",
						kind: "site-page",
					},
				],
			}),
		).toThrow(/public relative path/);
	});
});
