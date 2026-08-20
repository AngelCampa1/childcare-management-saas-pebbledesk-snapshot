/**
 * Utilities for building Schema.org @graph structures.
 * A single @graph wrapper lets search engines and AI crawlers understand
 * how multiple entities on a page relate to each other.
 */

import { buildOrganizationSchema, buildWebSiteSchema } from "./schema-builders";

/**
 * Strips @context from each schema, returns a single @graph wrapper.
 * Does not mutate the input array or any of its items.
 */
export function buildGraph(schemas: Record<string, unknown>[]): Record<string, unknown> {
	if (schemas.length === 0) {
		throw new Error("buildGraph: schemas array must not be empty");
	}
	const graph = schemas.map((schema) => {
		const { "@context": _context, ...rest } = schema;
		return rest;
	});
	return {
		"@context": "https://schema.org",
		"@graph": graph,
	};
}

/**
 * Returns a new object = spread of schema + "@id" property set.
 * Does NOT mutate the input.
 */
export function withId(schema: Record<string, unknown>, id: string): Record<string, unknown> {
	return { ...schema, "@id": id };
}

/**
 * Returns a minimal @id reference object { "@id": id }.
 * Used to cross-reference entities within a @graph.
 */
export function refId(id: string): { "@id": string } {
	return { "@id": id };
}

export function buildPublisherGraphNodes({
	siteUrl,
	name,
	description,
}: {
	siteUrl: string;
	name: string;
	description?: string;
}): Record<string, unknown>[] {
	const normalizedSiteUrl = siteUrl.endsWith("/") ? siteUrl.slice(0, -1) : siteUrl;
	const organizationId = `${normalizedSiteUrl}/#organization`;
	const websiteId = `${normalizedSiteUrl}/#website`;

	return [
		withId(
			buildOrganizationSchema({
				name,
				url: normalizedSiteUrl,
			}),
			organizationId,
		),
		withId(
			buildWebSiteSchema({
				name,
				url: normalizedSiteUrl,
				description,
				publisherId: organizationId,
			}),
			websiteId,
		),
	];
}
