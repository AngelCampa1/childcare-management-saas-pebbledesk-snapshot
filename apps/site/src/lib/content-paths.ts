export function contentEntrySlug(entry: { id?: string; slug?: string }): string {
	if (entry.slug) return entry.slug;
	if (entry.id) return entry.id.replace(/\.mdx?$/, "");
	throw new Error("Content entry is missing both slug and id");
}

export function buildGuidePath(slug: string): string {
	return `/resources/guides/${slug}`;
}

export function buildListiclePath(slug: string): string {
	return `/resources/best/${slug}`;
}

export function buildAlternativePath(competitorSlug: string): string {
	return `/compare/alternatives/${competitorSlug}`;
}

export function buildComparisonPath(competitorASlug: string, competitorBSlug: string): string {
	return `/compare/versus/${competitorASlug}-vs-${competitorBSlug}`;
}

export function buildPricingPath(competitorSlug: string): string {
	return `/compare/pricing/${competitorSlug}`;
}

export function buildStatePagePath(slug: string): string {
	return `/childcare-software/${slug}`;
}

// City pages share the /childcare-software/ prefix with state pages. Slugs are
// distinct by convention: state = "texas", city = "dallas-tx". Two separate
// functions preserve type-level intent in buildContentMap.
export function buildCityPagePath(slug: string): string {
	return `/childcare-software/${slug}`;
}

export function buildLeadMagnetPath(slug: string): string {
	return `/free/${slug}`;
}

export function buildFeaturePath(slug: string): string {
	return `/features/${slug}`;
}

function extractNestedSlug(markdownContent: string, key: string): string | null {
	const frontmatterMatch = markdownContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!frontmatterMatch) return null;
	const pattern = new RegExp(
		`^${key}:\\s*\\r?\\n(?:\\s+[^\\r\\n]+\\r?\\n)*?\\s+slug:\\s*"?([^"\\r\\n]+)"?\\s*$`,
		"m",
	);
	return frontmatterMatch[1].match(pattern)?.[1] ?? null;
}

export function buildCanonicalPathFromContentSlug(
	contentSlug: string,
	markdownContent = "",
): string | null {
	const [collection, ...slugParts] = contentSlug.split("/");
	const slug = slugParts.join("/");
	if (!collection || !slug) return null;

	switch (collection) {
		case "alternatives": {
			const competitorSlug = extractNestedSlug(markdownContent, "competitor") ?? slug;
			return buildAlternativePath(competitorSlug);
		}
		case "comparisons": {
			const [competitorA, ...competitorBParts] = slug.split("-vs-");
			const competitorB = competitorBParts.join("-vs-");
			if (!competitorA || !competitorB) return null;
			return buildComparisonPath(competitorA, competitorB);
		}
		case "pricing-breakdowns": {
			const competitorSlug = extractNestedSlug(markdownContent, "competitor") ?? slug;
			return buildPricingPath(competitorSlug);
		}
		case "listicles":
			return buildListiclePath(slug);
		case "guides":
			return buildGuidePath(slug);
		case "state-pages":
			return buildStatePagePath(slug);
		case "city-pages":
			return buildCityPagePath(slug);
		case "lead-magnets":
			return buildLeadMagnetPath(slug);
		case "features":
			return buildFeaturePath(slug);
		default:
			return null;
	}
}
