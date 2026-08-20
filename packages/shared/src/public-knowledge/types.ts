export const PUBLIC_KNOWLEDGE_SCHEMA_VERSION = 1;

export type PublicKnowledgeSchemaVersion = typeof PUBLIC_KNOWLEDGE_SCHEMA_VERSION;

export type PublicKnowledgeRole = "public" | "guardian" | "staff" | "director" | "owner";

export type PublicKnowledgeSourceKind = "site-page" | "app-copy" | "public-policy";

export interface PublicKnowledgeSection {
	id: string;
	heading: string;
	body: string;
}

export interface PublicKnowledgeSourceRef {
	id: string;
	label: string;
	url: string;
	kind: PublicKnowledgeSourceKind;
}

export interface PublicKnowledgeDocument {
	schemaVersion: PublicKnowledgeSchemaVersion;
	id: string;
	title: string;
	tags: readonly string[];
	sections: readonly PublicKnowledgeSection[];
	sourceRefs: readonly PublicKnowledgeSourceRef[];
	publicPaths: readonly string[];
	roleVisibility: readonly PublicKnowledgeRole[];
	lastReviewed: string;
	botSafeAnswer: string;
}

export interface SerializedPublicKnowledgeDocument {
	schemaVersion: PublicKnowledgeSchemaVersion;
	id: string;
	title: string;
	tags: string[];
	sections: PublicKnowledgeSection[];
	sourceRefs: PublicKnowledgeSourceRef[];
	publicPaths: string[];
	roleVisibility: PublicKnowledgeRole[];
	lastReviewed: string;
	botSafeAnswer: string;
}

export type PublicKnowledgeSurface =
	| "marketing"
	| "app-help"
	| "lead-magnets"
	| "email-lifecycle"
	| "content-index"
	| "ai";

export interface PublicKnowledgeArtifact {
	schemaVersion: PublicKnowledgeSchemaVersion;
	surface: Exclude<PublicKnowledgeSurface, "content-index" | "ai">;
	documents: SerializedPublicKnowledgeDocument[];
}

export interface PublicKnowledgeFullArtifact {
	schemaVersion: PublicKnowledgeSchemaVersion;
	generatedFrom: string;
	documents: SerializedPublicKnowledgeDocument[];
	leadMagnets?: unknown;
	emailLifecycle?: unknown;
}

export interface PublicKnowledgeManifestArtifact {
	schemaVersion: PublicKnowledgeSchemaVersion;
	generatedFrom: string;
	artifacts: PublicKnowledgeManifestArtifactEntry[];
	documents: PublicKnowledgeManifestDocumentEntry[];
}

export interface PublicKnowledgeManifestArtifactEntry {
	file: string;
	surface: "marketing" | "app-help" | "lead-magnets" | "email-lifecycle" | "full" | "content-index";
	documentCount: number;
}

export interface PublicKnowledgeManifestDocumentEntry {
	id: string;
	lastReviewed: string;
	publicPaths: string[];
	sourceRefs: string[];
}

export interface PublicKnowledgeContentIndexEntry {
	id: string;
	title: string;
	description: string;
	collection: string;
	slug: string;
	/**
	 * Kept as an optional compatibility field for pre-canonicalization consumers.
	 * Generated public knowledge artifacts intentionally omit repository source paths.
	 */
	sourceFile?: string;
	tags: string[];
	publicPaths: string[];
	lastReviewed: string;
	sourceRefs: PublicKnowledgeSourceRef[];
	competitorSlugs: string[];
}

export interface PublicKnowledgeContentIndexArtifact {
	schemaVersion: PublicKnowledgeSchemaVersion;
	generatedFrom: string;
	entries: PublicKnowledgeContentIndexEntry[];
}

export interface PublicMarketingCompetitorSummary {
	slug: string;
	name: string;
	pricing: string;
	weakness: string;
}

export interface PublicMarketingFaq {
	q: string;
	a: string;
}

export interface PublicMarketingTrustSignal {
	text: string;
	category: "roi" | "feature" | "compliance" | "integration";
}

export interface PublicMarketingKnowledgeConfig {
	product: {
		category: string;
		targetAudience: string;
		trustSignals: readonly PublicMarketingTrustSignal[];
	};
	competitors: PublicMarketingCompetitorSummary[];
	faqs: PublicMarketingFaq[];
	cta: {
		tofu: { ctaMode: "educate"; ctaText: string; ctaTarget: string };
		mofu: { ctaMode: "evaluate"; ctaText: string; ctaTarget: string };
	};
	comparison: {
		defaultHref: string;
	};
}
