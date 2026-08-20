import {
	publicKnowledgeCompetitorRegistry,
	publicKnowledgeDocuments,
	publicMarketingKnowledgeConfig,
} from "./data.js";
import { getEmailLifecyclePublicKnowledgeArtifact } from "./emails.js";
import generatedContentIndex from "./generated/content-index.json";
import { getLeadMagnetsPublicKnowledgeArtifact } from "./lead-magnets.js";
import {
	PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
	type PublicKnowledgeArtifact,
	type PublicKnowledgeContentIndexArtifact,
	type PublicKnowledgeContentIndexEntry,
	type PublicKnowledgeDocument,
	type PublicKnowledgeFullArtifact,
	type PublicKnowledgeManifestArtifact,
	type PublicKnowledgeRole,
	type SerializedPublicKnowledgeDocument,
} from "./types.js";
import {
	getSensitivePublicKnowledgeQueryKey,
	isPublicKnowledgeHost,
	isSafePublicKnowledgeRelativeUrl,
} from "./url-safety.js";

export {
	getProductAppUrl,
	getPublicBrandCookieDomain,
	getPublicBrandUrl,
	PUBLIC_BRAND_KNOWLEDGE,
} from "./brand.js";
export {
	FREE_RESOURCE_POLICY_COPY,
	getEmailLifecyclePublicKnowledgeArtifact,
	SUBSCRIPTION_TRIAL_EMAIL_COPY,
	UNSUBSCRIBE_CONFIRMATION_COPY,
} from "./emails.js";
export type { LeadMagnetKnowledge, LeadMagnetTrack } from "./lead-magnets.js";
export {
	getDefaultMagnetForTrack,
	getLeadMagnetBySlug,
	getLeadMagnetSlugs,
	getLeadMagnetsPublicKnowledgeArtifact,
	getLeadMagnetTitle,
	getLeadMagnetTrack,
	getNurtureSequenceForMagnet,
	LEAD_MAGNET_NURTURE_SEQUENCES,
	LEAD_MAGNET_TRACKS,
	leadMagnetCatalog,
} from "./lead-magnets.js";
export { buildPublicPricingMarkdown } from "./marketing-surfaces.js";
export { PUBLIC_OFFER_CLAIMS } from "./offers.js";
export {
	PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
	type PublicKnowledgeArtifact,
	type PublicKnowledgeContentIndexArtifact,
	type PublicKnowledgeContentIndexEntry,
	type PublicKnowledgeDocument,
	type PublicKnowledgeFullArtifact,
	type PublicKnowledgeManifestArtifact,
	type PublicKnowledgeManifestArtifactEntry,
	type PublicKnowledgeManifestDocumentEntry,
	type PublicKnowledgeRole,
	type PublicKnowledgeSchemaVersion,
	type PublicKnowledgeSection,
	type PublicKnowledgeSourceKind,
	type PublicKnowledgeSourceRef,
	type PublicMarketingCompetitorSummary,
	type PublicMarketingFaq,
	type PublicMarketingKnowledgeConfig,
	type PublicMarketingTrustSignal,
	type SerializedPublicKnowledgeDocument,
} from "./types.js";
export {
	publicKnowledgeCompetitorRegistry,
	publicKnowledgeDocuments,
	publicMarketingKnowledgeConfig,
};

export const PUBLIC_KNOWLEDGE_GENERATED_FROM =
	"canonical PebbleDesk public knowledge modules" as const;
export const PUBLIC_KNOWLEDGE_CONTENT_INDEX_GENERATED_FROM =
	"public marketing site markdown" as const;

const BANNED_PUBLIC_KNOWLEDGE_TERMS = [
	"BETTER_AUTH_SECRET",
	"DATABASE_URL",
	"GOOGLE_CLIENT_SECRET",
	"UNSUBSCRIBE_SECRET",
	"RESEND_API_KEY",
	"MARKETING_FROM_EMAIL",
	"R2_PUBLIC_URL",
	"APP_URL",
	"SENTRY_DSN",
	"STRIPE_SECRET",
	"STRIPE_WEBHOOK_SECRET",
	"SESSION TOKEN",
	"AUTH TOKEN",
	"PRIVATE KEY",
	"CENTER_ID",
	"SECRET",
	"TOKEN",
	"API_KEY",
	"PASSWORD",
	"WEBHOOK",
	"HMAC",
	"COOKIE",
	"LOCALHOST",
	"127.0.0.1",
	"INTERNAL",
	"STAGING",
] as const;

const INTERNAL_REPO_PATH_PATTERNS = [
	/\bapps\/[a-z0-9-]+\/src\//i,
	/\bpackages\/[a-z0-9-]+\/src\//i,
	/\bsrc\/public-knowledge\//i,
] as const;

export function serializePublicKnowledgeDocument(
	document: PublicKnowledgeDocument,
): SerializedPublicKnowledgeDocument {
	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		id: document.id,
		title: document.title,
		tags: [...document.tags],
		sections: document.sections.map((section) => ({ ...section })),
		sourceRefs: document.sourceRefs.map((sourceRef) => ({ ...sourceRef })),
		publicPaths: [...document.publicPaths],
		roleVisibility: [...document.roleVisibility],
		lastReviewed: document.lastReviewed,
		botSafeAnswer: document.botSafeAnswer,
	};
}

export function getPublicKnowledgeByAudience(
	role: PublicKnowledgeRole,
): readonly PublicKnowledgeDocument[] {
	return publicKnowledgeDocuments.filter((document) => document.roleVisibility.includes(role));
}

export function getPublicKnowledgeById(id: string): PublicKnowledgeDocument | null {
	return publicKnowledgeDocuments.find((document) => document.id === id) ?? null;
}

export const marketingPublicKnowledgeDocuments: readonly PublicKnowledgeDocument[] =
	publicKnowledgeDocuments.filter((document) => document.roleVisibility.includes("public"));

export const appPublicKnowledgeDocuments: readonly PublicKnowledgeDocument[] =
	getPublicKnowledgeByAudience("director");

export const aiPublicKnowledgeDocuments: readonly PublicKnowledgeDocument[] =
	publicKnowledgeDocuments;

export const contentIndexPublicKnowledgeDocuments: readonly PublicKnowledgeContentIndexEntry[] =
	generatedContentIndex.entries as readonly PublicKnowledgeContentIndexEntry[];

export function getMarketingPublicKnowledgeArtifact(): PublicKnowledgeArtifact {
	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		surface: "marketing",
		documents: marketingPublicKnowledgeDocuments.map(serializePublicKnowledgeDocument),
	};
}

export function getAppHelpPublicKnowledgeArtifact(): PublicKnowledgeArtifact {
	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		surface: "app-help",
		documents: appPublicKnowledgeDocuments.map(serializePublicKnowledgeDocument),
	};
}

export function getFullPublicKnowledgeArtifact(): PublicKnowledgeFullArtifact {
	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		generatedFrom: PUBLIC_KNOWLEDGE_GENERATED_FROM,
		documents: aiPublicKnowledgeDocuments.map(serializePublicKnowledgeDocument),
		leadMagnets: getLeadMagnetsPublicKnowledgeArtifact(),
		emailLifecycle: getEmailLifecyclePublicKnowledgeArtifact(),
	};
}

export function getContentIndexPublicKnowledgeArtifact(): PublicKnowledgeContentIndexArtifact {
	return generatedContentIndex as PublicKnowledgeContentIndexArtifact;
}

export function getPublicKnowledgeManifest(
	contentIndexArtifact: PublicKnowledgeContentIndexArtifact = getContentIndexPublicKnowledgeArtifact(),
): PublicKnowledgeManifestArtifact {
	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		generatedFrom: PUBLIC_KNOWLEDGE_GENERATED_FROM,
		artifacts: [
			{
				file: "marketing.json",
				surface: "marketing",
				documentCount: marketingPublicKnowledgeDocuments.length,
			},
			{
				file: "app-help.json",
				surface: "app-help",
				documentCount: appPublicKnowledgeDocuments.length,
			},
			{
				file: "lead-magnets.json",
				surface: "lead-magnets",
				documentCount: getLeadMagnetsPublicKnowledgeArtifact().magnets.length,
			},
			{
				file: "email-lifecycle.json",
				surface: "email-lifecycle",
				documentCount: 1,
			},
			{
				file: "full.json",
				surface: "full",
				documentCount: aiPublicKnowledgeDocuments.length,
			},
			{
				file: "content-index.json",
				surface: "content-index",
				documentCount: contentIndexArtifact.entries.length,
			},
		],
		documents: publicKnowledgeDocuments.map((document) => ({
			id: document.id,
			lastReviewed: document.lastReviewed,
			publicPaths: [...document.publicPaths],
			sourceRefs: document.sourceRefs.map((sourceRef) => sourceRef.url),
		})),
	};
}

export function assertPublicKnowledgeSafe(document: PublicKnowledgeDocument): void {
	for (const sourceRef of document.sourceRefs) {
		if (!isSameSiteRelativePublicKnowledgePath(sourceRef.url)) {
			throw new Error(`Public knowledge source ${sourceRef.id} must use a public relative path`);
		}
	}

	for (const publicPath of document.publicPaths) {
		if (!isSameSiteRelativePublicKnowledgePath(publicPath)) {
			throw new Error(`Public knowledge public path ${publicPath} must use a public relative path`);
		}
	}

	const haystack = JSON.stringify(serializePublicKnowledgeDocument(document)).toUpperCase();
	const bannedTerm = BANNED_PUBLIC_KNOWLEDGE_TERMS.find((term) =>
		haystack.includes(term.toUpperCase()),
	);

	if (bannedTerm) {
		throw new Error(`Public knowledge document ${document.id} contains banned term ${bannedTerm}`);
	}
}

export function assertAllPublicKnowledgeSafe(
	documents: readonly PublicKnowledgeDocument[] = publicKnowledgeDocuments,
): void {
	for (const document of documents) {
		assertPublicKnowledgeSafe(document);
	}
}

function isSameSiteRelativePublicKnowledgePath(path: string): boolean {
	return isSafePublicKnowledgeRelativeUrl(path, { allowQueryAndFragment: false });
}

export function assertPublicKnowledgeArtifactSafe(fileName: string, artifact: unknown): void {
	const haystack = JSON.stringify(artifact).toUpperCase();
	const bannedTerm = BANNED_PUBLIC_KNOWLEDGE_TERMS.find((term) =>
		haystack.includes(term.toUpperCase()),
	);

	if (bannedTerm) {
		throw new Error(`Public knowledge artifact ${fileName} contains banned term ${bannedTerm}`);
	}

	const raw = JSON.stringify(artifact);
	const internalPathPattern = INTERNAL_REPO_PATH_PATTERNS.find((pattern) => pattern.test(raw));
	if (internalPathPattern) {
		throw new Error(`Public knowledge artifact ${fileName} contains internal repo path`);
	}

	assertPublicKnowledgeArtifactValuesSafe(fileName, artifact);
}

export function assertPublicKnowledgeArtifactsSafe(
	artifacts: readonly (readonly [string, unknown])[],
): void {
	for (const [fileName, artifact] of artifacts) {
		assertPublicKnowledgeArtifactSafe(fileName, artifact);
	}
}

function assertPublicKnowledgeArtifactValuesSafe(
	fileName: string,
	value: unknown,
	path = "$",
): void {
	if (typeof value === "string") {
		assertPublicKnowledgeArtifactStringSafe(fileName, path, value);
		return;
	}

	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertPublicKnowledgeArtifactValuesSafe(fileName, item, `${path}[${index}]`);
		}
		return;
	}

	if (typeof value === "object" && value !== null) {
		for (const [key, item] of Object.entries(value)) {
			assertPublicKnowledgeArtifactValuesSafe(fileName, item, `${path}.${key}`);
		}
	}
}

function assertPublicKnowledgeArtifactStringSafe(
	fileName: string,
	path: string,
	value: string,
): void {
	const trimmed = value.trim();
	if (!trimmed) return;

	if (/^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith("\\\\")) {
		throw new Error(`Public knowledge artifact ${fileName} contains filesystem path at ${path}`);
	}

	if (trimmed.startsWith("/") || trimmed.includes("://") || trimmed.startsWith("file:")) {
		validatePublicKnowledgeArtifactUrl(fileName, path, trimmed);
	}
}

function validatePublicKnowledgeArtifactUrl(fileName: string, path: string, value: string): void {
	if (isSafePublicKnowledgeRelativeUrl(value)) {
		rejectSensitivePublicKnowledgeQueryKeys(fileName, path, value);
		return;
	}

	if (value.startsWith("/") || value.includes("\\") || value.startsWith("file:")) {
		throw new Error(`Public knowledge artifact ${fileName} contains unsafe public path at ${path}`);
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`Public knowledge artifact ${fileName} contains unsafe URL at ${path}`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`Public knowledge artifact ${fileName} contains non-HTTPS URL at ${path}`);
	}
	if (!isPublicKnowledgeHost(parsed.hostname)) {
		throw new Error(`Public knowledge artifact ${fileName} contains non-public host at ${path}`);
	}
	rejectSensitivePublicKnowledgeQueryKeys(fileName, path, value);
}

function rejectSensitivePublicKnowledgeQueryKeys(
	fileName: string,
	path: string,
	value: string,
): void {
	const key = getSensitivePublicKnowledgeQueryKey(value);
	if (key) {
		throw new Error(
			`Public knowledge artifact ${fileName} contains sensitive query parameter at ${path}: ${key}`,
		);
	}
}
