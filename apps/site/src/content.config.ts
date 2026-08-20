import { defineCollection } from "astro:content";
import {
	alternativeSchema,
	cityPageSchema,
	comparisonSchema,
	featureSchema,
	guideSchema,
	leadMagnetSchema,
	listicleSchema,
	pricingBreakdownSchema,
	statePageSchema,
} from "@pebbledesk/marketing/content/schemas";
import { glob } from "astro/loaders";

const alternatives = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/alternatives" }),
	schema: alternativeSchema,
});

const comparisons = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/comparisons" }),
	schema: comparisonSchema,
});

const pricingBreakdowns = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/pricing-breakdowns" }),
	schema: pricingBreakdownSchema,
});

const listicles = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/listicles" }),
	schema: listicleSchema,
});

const guides = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
	schema: guideSchema,
});

const statePages = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/state-pages" }),
	schema: statePageSchema,
});

const leadMagnets = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/lead-magnets" }),
	schema: leadMagnetSchema,
});

const features = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/features" }),
	schema: featureSchema,
});

const cityPages = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/city-pages" }),
	schema: cityPageSchema,
});

export const collections = {
	alternatives,
	comparisons,
	"pricing-breakdowns": pricingBreakdowns,
	listicles,
	guides,
	"state-pages": statePages,
	"lead-magnets": leadMagnets,
	features,
	"city-pages": cityPages,
};
