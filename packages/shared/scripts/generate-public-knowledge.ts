import { execSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";
import {
	getPromotionalPlanPrice,
	getPromotionalPriceLabel,
	type PayablePlan,
	PEBBLEDESK_OFFERING,
} from "../src/constants/index.ts";
import { PUBLIC_BRAND_KNOWLEDGE } from "../src/public-knowledge/brand.ts";
import {
	assertAllPublicKnowledgeSafe,
	assertPublicKnowledgeArtifactsSafe,
	getAppHelpPublicKnowledgeArtifact,
	getEmailLifecyclePublicKnowledgeArtifact,
	getFullPublicKnowledgeArtifact,
	getLeadMagnetsPublicKnowledgeArtifact,
	getMarketingPublicKnowledgeArtifact,
	getPublicKnowledgeManifest,
	PUBLIC_KNOWLEDGE_CONTENT_INDEX_GENERATED_FROM,
	PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
	publicKnowledgeCompetitorRegistry,
} from "../src/public-knowledge/index.ts";
import type {
	PublicKnowledgeContentIndexArtifact,
	PublicKnowledgeContentIndexEntry,
	PublicKnowledgeSourceRef,
} from "../src/public-knowledge/types.ts";
import {
	getSensitivePublicKnowledgeQueryKey,
	isPublicKnowledgeHost,
	isSafePublicKnowledgeRelativeUrl,
} from "../src/public-knowledge/url-safety.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "..", "..");
const siteContentRoot = join(repoRoot, "apps", "site", "src", "content");
const generatedDir = join(packageRoot, "src", "public-knowledge", "generated");
const offeringTokenPattern = /\{\{[^}]+\}\}/g;
const publicKnowledgeMetadataTokenMap = {
	"{{brand.publicOrigin}}": PUBLIC_BRAND_KNOWLEDGE.publicOrigin,
	"{{brand.appOrigin}}": PUBLIC_BRAND_KNOWLEDGE.appOrigin,
	"{{brand.domain}}": new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin).hostname,
} as const;
const payablePlanIds: readonly PayablePlan[] = ["home", "center_starter", "center_pro", "group"];

if (isMainModule()) {
	await run();
}

export async function run(): Promise<void> {
	const contentIndexArtifact = await getContentIndexArtifact();
	const artifacts = createPublicKnowledgeArtifacts(contentIndexArtifact);
	const mode = process.argv.includes("--check") ? "check" : "write";

	assertAllPublicKnowledgeSafe();
	assertPublicKnowledgeArtifactsSafe(artifacts);
	await mkdir(generatedDir, { recursive: true });

	for (const [fileName, artifact] of artifacts) {
		const filePath = join(generatedDir, fileName);
		const nextContent = formatJson(filePath, `${JSON.stringify(artifact, null, "\t")}\n`);

		if (mode === "check") {
			const currentContent = await readFile(filePath, "utf8").catch(() => null);
			if (currentContent !== nextContent) {
				throw new Error(`Generated public knowledge artifact is out of date: ${fileName}`);
			}
			continue;
		}

		await writeFile(filePath, nextContent, "utf8");
	}
}

export function createPublicKnowledgeArtifacts(
	contentIndexArtifact: PublicKnowledgeContentIndexArtifact,
) {
	return [
		["marketing.json", getMarketingPublicKnowledgeArtifact()],
		["app-help.json", getAppHelpPublicKnowledgeArtifact()],
		["lead-magnets.json", getLeadMagnetsPublicKnowledgeArtifact()],
		["email-lifecycle.json", getEmailLifecyclePublicKnowledgeArtifact()],
		["full.json", getFullPublicKnowledgeArtifact()],
		["content-index.json", contentIndexArtifact],
		["manifest.json", getPublicKnowledgeManifest(contentIndexArtifact)],
	] as const;
}

function formatJson(filePath: string, content: string): string {
	return execSync(`pnpm exec biome format --stdin-file-path "${filePath}"`, {
		input: content,
		encoding: "utf8",
	});
}

export async function getContentIndexArtifact(): Promise<PublicKnowledgeContentIndexArtifact> {
	const markdownFiles = await findMarkdownFiles(siteContentRoot);
	const entries = await Promise.all(
		markdownFiles.map((filePath) => buildContentIndexEntry(filePath)),
	);
	const registry = new Set<string>(publicKnowledgeCompetitorRegistry);
	const publicEntries = entries.filter((entry): entry is PublicKnowledgeContentIndexEntry =>
		Boolean(entry),
	);
	const missingCompetitorSlugs = publicEntries
		.flatMap((entry) => entry.competitorSlugs)
		.filter((slug) => !registry.has(slug));

	if (missingCompetitorSlugs.length > 0) {
		throw new Error(
			`Content competitor slugs are missing public knowledge registry entries: ${[...new Set(missingCompetitorSlugs)].sort().join(", ")}`,
		);
	}

	return {
		schemaVersion: PUBLIC_KNOWLEDGE_SCHEMA_VERSION,
		generatedFrom: PUBLIC_KNOWLEDGE_CONTENT_INDEX_GENERATED_FROM,
		entries: publicEntries.sort((a, b) => a.id.localeCompare(b.id)),
	};
}

async function findMarkdownFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(root, entry.name);
			if (entry.isDirectory()) return findMarkdownFiles(fullPath);
			if (entry.isFile() && entry.name.endsWith(".md")) return [fullPath];
			return [];
		}),
	);

	return files.flat();
}

export async function buildContentIndexEntry(
	filePath: string,
): Promise<PublicKnowledgeContentIndexEntry | null> {
	const sourceFile = toPosixPath(relative(repoRoot, filePath));
	const content = await readFile(filePath, "utf8");
	const frontmatter = parseFrontmatter(content, sourceFile);
	const collection = sourceFile.split("/").at(-2);
	const slug = sourceFile.split("/").at(-1)?.replace(/\.md$/, "");

	if (!collection || !slug) {
		throw new Error(`Unable to infer content collection and slug for ${sourceFile}`);
	}

	if (!shouldIncludeInPublicKnowledge(frontmatter, sourceFile)) return null;

	const publicPath = getPublicPath(collection, frontmatter, slug);
	const id = `${collection}.${slug}`;
	const title = resolvePublicKnowledgeTokens(getRequiredString(frontmatter, "title", sourceFile));
	const description = resolvePublicKnowledgeTokens(
		getRequiredString(frontmatter, "description", sourceFile),
	);
	const lastReviewed = getReviewDate(frontmatter, sourceFile);
	const sourceRefs = getSourceRefs(frontmatter, id, sourceFile, publicPath);

	return {
		id,
		title,
		description,
		collection,
		slug,
		tags: getStringArray(frontmatter.tags),
		publicPaths: [publicPath],
		lastReviewed,
		sourceRefs,
		competitorSlugs: getCompetitorSlugs(frontmatter),
	};
}

export function resolvePublicKnowledgeTokens(input: string): string {
	const tokenMap = buildPublicKnowledgeTokenMap();
	return input.replace(offeringTokenPattern, (token) => {
		const value = tokenMap[token];
		if (value) return value;
		throw new Error(`Unknown public knowledge token: ${token}`);
	});
}

function buildPublicKnowledgeTokenMap(): Record<string, string> {
	const tokenMap: Record<string, string> = {};

	for (const planId of payablePlanIds) {
		const plan = PEBBLEDESK_OFFERING.plans.find((candidate) => candidate.id === planId);
		if (!plan) continue;
		tokenMap[`{{plan.${planId}.label}}`] = plan.label;
		tokenMap[`{{plan.${planId}.tagline}}`] = plan.tagline;
		const promoPrice = getPromotionalPlanPrice(planId);
		tokenMap[`{{plan.${planId}.priceLabel}}`] =
			`${promoPrice.discountedPriceLabel}, ${promoPrice.renewalPriceLabel.toLowerCase()}`;
		tokenMap[`{{plan.${planId}.promoPriceLabel}}`] = getPromotionalPriceLabel(planId);
		tokenMap[`{{plan.${planId}.renewalPriceLabel}}`] = promoPrice.renewalPriceLabel;
	}

	const enterprise = PEBBLEDESK_OFFERING.plans.find((plan) => plan.id === "enterprise");
	if (enterprise) {
		tokenMap["{{plan.enterprise.label}}"] = enterprise.label;
		tokenMap["{{plan.enterprise.tagline}}"] = enterprise.tagline;
		tokenMap["{{plan.enterprise.priceLabel}}"] = "Custom";
	}

	const { promotion, trial, guarantee, positioning } = PEBBLEDESK_OFFERING;
	tokenMap["{{promo.code}}"] = promotion.code;
	tokenMap["{{promo.label}}"] = promotion.label;
	tokenMap["{{promo.urgencyLabel}}"] = promotion.urgencyLabel;
	tokenMap["{{promo.durationLabel}}"] = promotion.durationLabel;
	tokenMap["{{trial.label}}"] = trial.label;
	tokenMap["{{trial.days}}"] = String(trial.days);
	tokenMap["{{guarantee.label}}"] = guarantee.label;
	tokenMap["{{guarantee.days}}"] = String(guarantee.days);
	tokenMap["{{positioning.tagline}}"] = positioning.tagline;
	tokenMap["{{positioning.targetAudience}}"] = positioning.targetAudience;

	return tokenMap;
}

function parseFrontmatter(markdown: string, sourceFile: string): Record<string, unknown> {
	const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
	if (!match) throw new Error(`Missing frontmatter in ${sourceFile}`);
	const parsed = parse(match[1]);
	if (!isRecord(parsed)) throw new Error(`Invalid frontmatter in ${sourceFile}`);
	return parsed;
}

export function getPublicPath(
	collection: string,
	frontmatter: Record<string, unknown>,
	slug: string,
): string {
	const canonicalHref = frontmatter.canonicalHref;
	if (typeof canonicalHref === "string") {
		return withTrailingSlash(validatePublicKnowledgePath(canonicalHref));
	}

	if (collection === "alternatives" || collection === "pricing-breakdowns") {
		const competitor = frontmatter.competitor;
		if (!isRecord(competitor) || typeof competitor.slug !== "string" || !competitor.slug) {
			throw new Error(`Missing competitor.slug for ${collection}/${slug}`);
		}
		const competitorSlug = validatePublicKnowledgeSlug(
			competitor.slug,
			`competitor.slug for ${collection}/${slug}`,
		);
		const prefix = collection === "alternatives" ? "/compare/alternatives/" : "/compare/pricing/";
		return `${prefix}${competitorSlug}/`;
	}

	if (collection === "comparisons") {
		const competitorA = frontmatter.competitorA;
		const competitorB = frontmatter.competitorB;
		if (
			!isRecord(competitorA) ||
			typeof competitorA.slug !== "string" ||
			!competitorA.slug ||
			!isRecord(competitorB) ||
			typeof competitorB.slug !== "string" ||
			!competitorB.slug
		) {
			throw new Error(`Missing competitorA.slug or competitorB.slug for ${collection}/${slug}`);
		}
		const competitorASlug = validatePublicKnowledgeSlug(
			competitorA.slug,
			`competitorA.slug for ${collection}/${slug}`,
		);
		const competitorBSlug = validatePublicKnowledgeSlug(
			competitorB.slug,
			`competitorB.slug for ${collection}/${slug}`,
		);
		return `/compare/versus/${competitorASlug}-vs-${competitorBSlug}/`;
	}

	const prefixes: Record<string, string> = {
		listicles: "/resources/best/",
		guides: "/resources/guides/",
		"state-pages": "/childcare-software/",
		"lead-magnets": "/free/",
		features: "/features/",
		"city-pages": "/childcare-software/",
	};
	const prefix = prefixes[collection];
	if (!prefix) throw new Error(`Unknown content collection ${collection}`);
	return `${prefix}${slug}/`;
}

function validatePublicKnowledgeSlug(slug: string, label: string): string {
	if (!/^[a-z0-9-]+$/.test(slug)) {
		throw new Error(`${label} must be a lowercase public URL slug`);
	}
	return slug;
}

function getRequiredString(
	record: Record<string, unknown>,
	key: string,
	sourceFile: string,
): string {
	const value = record[key];
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`Missing ${key} in ${sourceFile}`);
	}
	return value;
}

function getReviewDate(record: Record<string, unknown>, sourceFile: string): string {
	const lastReviewed = record.lastReviewed;
	if (typeof lastReviewed === "string" && lastReviewed.trim() !== "") return lastReviewed;
	return getRequiredString(record, "updatedAt", sourceFile);
}

function getSourceRefs(
	frontmatter: Record<string, unknown>,
	entryId: string,
	sourceFile: string,
	publicPath: string,
): PublicKnowledgeSourceRef[] {
	const stats = [
		...getRecordArray(frontmatter.statistics),
		...getRecordArray(frontmatter.pricingStats),
	];
	return stats.map((stat, index) => {
		const label = getRequiredString(stat, "source", sourceFile);
		const urlValue = stat.sourceUrl;
		return {
			id: `${entryId}.source.${index + 1}`,
			label,
			url:
				typeof urlValue === "string" && urlValue.trim()
					? validatePublicKnowledgeSourceUrl(urlValue)
					: publicPath,
			kind: "site-page",
		};
	});
}

function shouldIncludeInPublicKnowledge(
	frontmatter: Record<string, unknown>,
	sourceFile: string,
): boolean {
	if (frontmatter.publicKnowledge === true && frontmatter.noPublicKnowledge === true) {
		throw new Error(
			`${sourceFile} must not set both publicKnowledge: true and noPublicKnowledge: true`,
		);
	}
	if (frontmatter.noPublicKnowledge === true || frontmatter.noindex === true) return false;
	if (frontmatter.publicKnowledge === true) return true;
	throw new Error(`${sourceFile} must set publicKnowledge: true or noPublicKnowledge: true`);
}

export function validatePublicKnowledgeSourceUrl(url: string): string {
	const trimmed = resolvePublicKnowledgeMetadataTokens(url).trim();
	if (!trimmed) throw new Error("Public knowledge source URL must not be empty");
	if (isSafePublicKnowledgeRelativeUrl(trimmed)) {
		rejectSensitivePublicKnowledgeQueryKeys(trimmed);
		return trimmed;
	}
	if (trimmed.startsWith("/") || trimmed.includes("\\")) {
		throw new Error(`Public knowledge source URL must use a safe public path: ${url}`);
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		throw new Error(`Public knowledge source URL must be a public https URL: ${url}`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`Public knowledge source URL must use https: ${url}`);
	}
	if (!isPublicKnowledgeHost(parsed.hostname)) {
		throw new Error(`Public knowledge source URL must use a public host: ${url}`);
	}
	rejectSensitivePublicKnowledgeQueryKeys(trimmed);

	return trimmed;
}

function resolvePublicKnowledgeMetadataTokens(value: string): string {
	return value.replace(offeringTokenPattern, (token) => {
		if (token in publicKnowledgeMetadataTokenMap) {
			return publicKnowledgeMetadataTokenMap[token as keyof typeof publicKnowledgeMetadataTokenMap];
		}
		throw new Error(
			`Unknown public knowledge metadata token "${token}". Supported tokens: ${Object.keys(publicKnowledgeMetadataTokenMap).join(", ")}`,
		);
	});
}

function validatePublicKnowledgePath(path: string): string {
	const trimmed = path.trim();
	if (trimmed.includes("?") || trimmed.includes("#")) {
		throw new Error(`Public knowledge path must not include query strings or fragments: ${path}`);
	}
	if (!isSafePublicKnowledgeRelativeUrl(trimmed, { allowQueryAndFragment: false })) {
		throw new Error(`Public knowledge path must be a same-site relative path: ${path}`);
	}
	return trimmed;
}

function getCompetitorSlugs(frontmatter: Record<string, unknown>): string[] {
	const slugs = new Set<string>();
	for (const key of ["competitor", "competitorA", "competitorB"]) {
		const competitor = frontmatter[key];
		if (isRecord(competitor) && typeof competitor.slug === "string") {
			slugs.add(competitor.slug);
		}
	}
	return [...slugs].sort();
}

function getRecordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter(isRecord);
}

function getStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withTrailingSlash(path: string): string {
	return path.endsWith("/") ? path : `${path}/`;
}

function rejectSensitivePublicKnowledgeQueryKeys(url: string): void {
	const key = getSensitivePublicKnowledgeQueryKey(url);
	if (key) {
		throw new Error(`Public knowledge source URL contains sensitive query parameter: ${key}`);
	}
}

function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}

function isMainModule(): boolean {
	const entryPoint = process.argv[1];
	return Boolean(entryPoint && import.meta.url === pathToFileURL(entryPoint).href);
}
