import { z } from "astro/zod";
import { resolveOfferingTokens } from "../lib/offering-tokens.js";

// Keep in sync with LeadMagnetTrack in @pebbledesk/shared/public-knowledge
const leadMagnetTrackSchema = z
	.enum(["compliance", "billing", "buying", "hr"])
	.optional()
	.describe(
		"Author override for the lead magnet track on this page. Inferred automatically when absent.",
	);

const rz = z.string().transform(resolveOfferingTokens);

const answerSchema = z
	.array(
		z.union([
			z.object({ q: rz, a: rz }),
			z
				.object({ question: rz, answer: rz })
				.transform(({ question, answer }) => ({ q: question, a: answer })),
		]),
	)
	.optional();
const prosConsSchema = z
	.array(
		z.object({
			subject: rz,
			pros: z.array(rz),
			cons: z.array(rz),
		}),
	)
	.optional();
const pricingStatSchema = z
	.array(
		z.object({
			stat: rz,
			source: rz,
			sourceUrl: rz.optional(),
		}),
	)
	.optional();
const tableDataSchema = z
	.object({
		name: z.string(),
		description: z.string().optional(),
		columns: z.array(z.string()),
		rows: z.array(z.array(rz)),
	})
	.optional();

export const baseContentSchema = z.object({
	title: rz,
	description: rz,
	publishedAt: z.string(),
	updatedAt: z.string(),
	lastReviewed: z.string().optional(),
	buyerStage: z.enum(["tofu", "mofu", "bofu"]),
	ctaMode: z.enum(["educate", "evaluate", "convert"]).optional(),
	schema: z.enum(["Article", "FAQPage", "HowTo", "Product", "ItemList"]).default("Article"),
	bluf: rz,
	faqs: z.array(z.object({ q: rz, a: rz })).default([]),
	relatedPages: z.array(z.string()).min(1),
	canonicalHref: z.string().startsWith("/").optional(),
	redirectFrom: z.array(z.string().startsWith("/")).default([]),
	summaryFacts: z.array(rz).default([]),
	statistics: z
		.array(
			z.object({
				stat: rz,
				source: rz,
				sourceUrl: rz.optional(),
			}),
		)
		.default([]),
	publicKnowledge: z.boolean().optional(),
	noPublicKnowledge: z.boolean().default(false),
	noindex: z.boolean().default(false),
	ogImage: z.string().optional(),
	tags: z.array(z.string()).default([]),
	targetPersona: z.array(z.string()).optional(),
	track: leadMagnetTrackSchema,
});

export const alternativeSchema = baseContentSchema.extend({
	competitor: z.object({
		name: z.string(),
		slug: z.string(),
		url: z.string().optional(),
		pricing: rz,
		weakness: rz,
		setupFee: rz.optional(),
		pros: z.array(rz).default([]),
		cons: z.array(rz).default([]),
	}),
	pros: z.array(rz).default([]),
	cons: z.array(rz).default([]),
	proscons: prosConsSchema,
	answers: answerSchema,
	pricingStats: pricingStatSchema,
	tableData: tableDataSchema,
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export const comparisonSchema = baseContentSchema.extend({
	competitorA: z.object({
		name: z.string(),
		slug: z.string(),
		pricing: rz,
		pros: z.array(rz).default([]),
		cons: z.array(rz).default([]),
	}),
	competitorB: z.object({
		name: z.string(),
		slug: z.string(),
		pricing: rz,
		pros: z.array(rz).default([]),
		cons: z.array(rz).default([]),
	}),
	verdict: rz,
	disableProsConsSchema: z.boolean().default(false),
	tableData: tableDataSchema,
	pricingStats: pricingStatSchema,
	proscons: prosConsSchema,
	answers: answerSchema,
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export const pricingBreakdownSchema = baseContentSchema.extend({
	competitor: z.object({
		name: z.string(),
		slug: z.string(),
		pricing: rz,
	}),
	tiers: z.array(
		z.object({
			name: z.string(),
			price: rz,
			features: z.array(rz),
		}),
	),
	hiddenCosts: z.array(rz),
	tableData: tableDataSchema,
	pricingStats: pricingStatSchema,
	answers: answerSchema,
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export const listicleSchema = baseContentSchema.extend({
	category: z.string(),
	qualifier: z.string(),
	tools: z.array(
		z.object({
			name: z.string(),
			summary: rz,
			pros: z.array(rz),
			cons: z.array(rz),
			pricing: rz,
			verdict: rz,
		}),
	),
	tableData: tableDataSchema,
	answers: answerSchema,
	pricingStats: pricingStatSchema,
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).optional(),
	proscons: prosConsSchema,
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export const guideSchema = baseContentSchema.extend({
	steps: z.array(z.object({ title: z.string(), content: z.string() })).optional(),
	timeEstimate: z.string().optional(),
	difficulty: z.string().optional(),
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	answers: answerSchema,
	proscons: prosConsSchema,
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
	tableData: tableDataSchema,
	pricingStats: pricingStatSchema,
});

export const statePageSchema = baseContentSchema.extend({
	state: z.string(),
	stateCode: z.string(),
	// Generic fields (both verticals)
	marketSize: z.number().optional(),
	topMarkets: z
		.array(
			z.object({
				name: z.string(),
				count: z.number(),
				label: z.string().optional(),
			}),
		)
		.default([]),
	regulations: z
		.array(
			z.object({
				heading: rz,
				content: rz,
				variant: z.enum(["info", "warning", "success"]).default("info"),
			}),
		)
		.default([]),
	// Legacy fields (optional for backward compat)
	establishmentCount: z.number().optional(),
	topMetros: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
	licensingNotes: rz.optional(),
	seasonalNotes: rz.optional(),
	// SEO blocks
	pricingStats: pricingStatSchema,
	tableData: tableDataSchema,
	answers: answerSchema,
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export const cityPageSchema = statePageSchema.extend({
	city: z.string(),
	statePage: z.string().startsWith("/"), // e.g. "/childcare-software/texas"
	metroPopulation: z.number().optional(),
});

export type CityPageEntry = z.infer<typeof cityPageSchema>;

export const verticalPageSchema = baseContentSchema.extend({
	verticalType: z.string(),
	keyPainPoints: z.array(z.string()),
	commonGrantTypes: z.array(z.string()),
	complianceNotes: z.string(),
	estimatedOrgCount: z.number().optional(),
	pricingStats: pricingStatSchema,
	tableData: tableDataSchema,
	answers: answerSchema,
});

export const orgTypePageSchema = baseContentSchema.extend({
	orgType: z.string(),
	orgTypeSlug: z.string(),
	estimatedCount: z.number().optional(),
	uniqueNeeds: z.array(z.string()),
	complianceNotes: z.string().optional(),
	answers: answerSchema,
});

export const featureSchema = baseContentSchema.extend({
	tableData: tableDataSchema,
	proscons: prosConsSchema,
	answers: answerSchema,
	pricingStats: pricingStatSchema,
});

export const reviewSchema = baseContentSchema.extend({
	competitor: z.object({
		name: z.string(),
		slug: z.string(),
		url: z.string().optional(),
		pricing: rz,
	}),
	verdict: rz,
	tableData: tableDataSchema,
	proscons: prosConsSchema,
	answers: answerSchema,
	pricingStats: pricingStatSchema,
});

export const phasePageSchema = baseContentSchema.extend({
	phase: z.enum(["follicular", "ovulatory", "luteal", "menstrual", "hormone", "cycle"]),
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	answers: answerSchema,
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
});

export type PhasePageEntry = z.infer<typeof phasePageSchema>;

export const goalPageSchema = baseContentSchema.extend({
	audience: z.enum([
		"perimenopause",
		"menopause",
		"over-40",
		"active-recovery",
		"beginners",
		"lifters",
		"general",
	]),
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	answers: answerSchema,
	expertQuotes: z
		.array(
			z.object({
				quote: z.string(),
				personName: z.string(),
				jobTitle: z.string().optional(),
				organization: z.string().optional(),
			}),
		)
		.optional(),
	statisticCitations: pricingStatSchema,
	tableData: tableDataSchema,
});

export type GoalPageEntry = z.infer<typeof goalPageSchema>;

export const symptomsSchema = guideSchema;

export const leadMagnetSchema = z.object({
	title: rz,
	description: rz,
	publishedAt: z.string(),
	updatedAt: z.string(),
	lastReviewed: z.string().optional(),
	bluf: rz,
	freePreviewSections: z.number().default(2),
	ogImage: z.string().optional(),
	tags: z.array(z.string()).default([]),
	relatedPages: z.array(z.string()).min(1),
	canonicalHref: z.string().startsWith("/").optional(),
	redirectFrom: z.array(z.string().startsWith("/")).default([]),
	summaryFacts: z.array(z.string()).default([]),
	publicKnowledge: z.boolean().optional(),
	noPublicKnowledge: z.boolean().default(false),
	noindex: z.boolean().default(false),
	answers: answerSchema,
	definitions: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
	buyerStage: z.enum(["tofu", "mofu", "bofu"]).default("tofu"),
	faqs: z.array(z.object({ q: rz, a: rz })).default([]),
	schema: z.enum(["Article", "FAQPage", "HowTo", "Product", "ItemList"]).default("Article"),
	bullets: z.array(rz).optional(),
	pdfCoverUrl: z.string().optional(),
	track: leadMagnetTrackSchema,
});
