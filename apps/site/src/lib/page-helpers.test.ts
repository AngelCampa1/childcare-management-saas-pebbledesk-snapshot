import type { CollectionEntry } from "astro:content";
import { describe, expect, it } from "vitest";
import {
	buildContentMap,
	buildOptionalHowToSchema,
	entrySlug,
	padToolIndex,
	resolveRelatedLinksWithFallback,
	resolveStatePageDefaults,
} from "./page-helpers";

describe("entrySlug", () => {
	it("normalizes Astro content entry ids to URL-safe leaf slugs", () => {
		expect(entrySlug({ id: "how-to-choose-childcare-management-software.md" })).toBe(
			"how-to-choose-childcare-management-software",
		);
		expect(entrySlug({ id: "guides/how-to-start-a-daycare-business.md" })).toBe(
			"how-to-start-a-daycare-business",
		);
		expect(entrySlug({ id: "features/ratio-tracking.mdx" })).toBe("ratio-tracking");
	});
});

describe("padToolIndex", () => {
	it("pads single digit index to 2 digits", () => {
		expect(padToolIndex(0)).toBe("01");
	});

	it("pads index 9 (becomes 10) correctly", () => {
		expect(padToolIndex(9)).toBe("10");
	});

	it("does not pad 3-digit results", () => {
		expect(padToolIndex(99)).toBe("100");
	});

	it("pads index 4 to '05'", () => {
		expect(padToolIndex(4)).toBe("05");
	});
});

describe("buildOptionalHowToSchema", () => {
	it("returns null when steps is undefined", () => {
		expect(buildOptionalHowToSchema(undefined, "Guide", "A description")).toBeNull();
	});

	it("returns null when steps is empty array", () => {
		expect(buildOptionalHowToSchema([], "Guide", "A description")).toBeNull();
	});

	it("returns a valid HowTo schema when steps are provided", () => {
		const steps = [
			{ title: "Step One", content: "Do the first thing" },
			{ title: "Step Two", content: "Do the second thing" },
		];
		const result = buildOptionalHowToSchema(steps, "My Guide", "A helpful guide");

		expect(result).not.toBeNull();
		const schema = result as Record<string, unknown>;
		expect(schema["@context"]).toBe("https://schema.org");
		expect(schema["@type"]).toBe("HowTo");
		expect(schema.name).toBe("My Guide");
		expect(schema.description).toBe("A helpful guide");

		const schemaSteps = schema.step as Array<Record<string, unknown>>;
		expect(schemaSteps).toHaveLength(2);
		expect(schemaSteps[0]).toEqual({
			"@type": "HowToStep",
			position: 1,
			name: "Step One",
			text: "Do the first thing",
		});
		expect(schemaSteps[1]).toEqual({
			"@type": "HowToStep",
			position: 2,
			name: "Step Two",
			text: "Do the second thing",
		});
	});

	it("returns schema with single step", () => {
		const steps = [{ title: "Only Step", content: "Do it" }];
		const result = buildOptionalHowToSchema(steps, "Quick Guide", "desc");
		expect(result).not.toBeNull();
		const schemaSteps = (result as Record<string, unknown>).step as Array<Record<string, unknown>>;
		expect(schemaSteps).toHaveLength(1);
	});
});

// Minimal stub helpers — only the fields buildContentMap accesses
function makeAlternative(
	competitorSlug: string,
	title: string,
	description: string,
	canonicalHref?: string,
): CollectionEntry<"alternatives"> {
	return {
		id: `${competitorSlug}.md`,
		body: "",
		collection: "alternatives",
		data: {
			title,
			description,
			...(canonicalHref !== undefined && { canonicalHref }),
			competitor: {
				slug: competitorSlug,
				name: "Competitor",
				pricing: "$99",
				weakness: "",
			},
		},
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"alternatives">;
}

function makeComparison(
	slugA: string,
	slugB: string,
	title: string,
	description: string,
): CollectionEntry<"comparisons"> {
	return {
		id: `${slugA}-vs-${slugB}.md`,
		body: "",
		collection: "comparisons",
		data: {
			title,
			description,
			competitorA: { slug: slugA, name: "A" },
			competitorB: { slug: slugB, name: "B" },
		},
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"comparisons">;
}

function makePricingBreakdown(
	competitorSlug: string,
	title: string,
	description: string,
): CollectionEntry<"pricing-breakdowns"> {
	return {
		id: `${competitorSlug}.md`,
		body: "",
		collection: "pricing-breakdowns",
		data: {
			title,
			description,
			competitor: { slug: competitorSlug, name: "Competitor", pricing: "$99" },
		},
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"pricing-breakdowns">;
}

function makeListicle(
	id: string,
	title: string,
	description: string,
): CollectionEntry<"listicles"> {
	return {
		id,
		body: "",
		collection: "listicles",
		data: { title, description },
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"listicles">;
}

function makeGuide(id: string, title: string, description: string): CollectionEntry<"guides"> {
	return {
		id,
		body: "",
		collection: "guides",
		data: { title, description },
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"guides">;
}

function makeStatePage(
	slug: string,
	title: string,
	description: string,
): CollectionEntry<"state-pages"> {
	return {
		id: `${slug}.md`,
		body: "",
		collection: "state-pages",
		data: { title, description, state: "Texas", stateCode: "TX" },
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"state-pages">;
}

function makeLeadMagnet(
	id: string,
	title: string,
	description: string,
): CollectionEntry<"lead-magnets"> {
	return {
		id,
		body: "",
		collection: "lead-magnets",
		data: { title, description },
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"lead-magnets">;
}

function makeCityPage(
	slug: string,
	title: string,
	description: string,
): CollectionEntry<"city-pages"> {
	return {
		id: `${slug}.md`,
		body: "",
		collection: "city-pages",
		data: {
			title,
			description,
			city: "Dallas",
			state: "Texas",
			stateCode: "TX",
			statePage: "/childcare-software/texas",
		},
		render: async () => ({
			Content: () => null,
			headings: [],
			remarkPluginFrontmatter: {},
		}),
	} as unknown as CollectionEntry<"city-pages">;
}

function emptyCollections() {
	return {
		alternatives: [],
		comparisons: [],
		pricingBreakdowns: [],
		listicles: [],
		guides: [],
		statePages: [],
		leadMagnets: [],
	};
}

describe("buildContentMap", () => {
	it("returns an empty map when all collections are empty", () => {
		const map = buildContentMap(emptyCollections());
		expect(map.size).toBe(0);
	});

	it("maps alternatives using /compare/alternatives/{competitor.slug}", () => {
		const entry = makeAlternative("brightwheel", "Brightwheel Alternative", "A great alt page");
		const map = buildContentMap({
			...emptyCollections(),
			alternatives: [entry],
		});

		expect(map.has("/compare/alternatives/brightwheel")).toBe(true);
		const result = map.get("/compare/alternatives/brightwheel");
		expect(result?.title).toBe("Brightwheel Alternative");
		expect(result?.description).toBe("A great alt page");
	});

	it("maps comparisons using /compare/versus/{competitorA.slug}-vs-{competitorB.slug}", () => {
		const entry = makeComparison(
			"brightwheel",
			"procare",
			"Brightwheel vs Procare",
			"Compare the two",
		);
		const map = buildContentMap({
			...emptyCollections(),
			comparisons: [entry],
		});

		expect(map.has("/compare/versus/brightwheel-vs-procare")).toBe(true);
		const result = map.get("/compare/versus/brightwheel-vs-procare");
		expect(result?.title).toBe("Brightwheel vs Procare");
		expect(result?.description).toBe("Compare the two");
	});

	it("maps pricing-breakdowns using /compare/pricing/{competitor.slug}", () => {
		const entry = makePricingBreakdown("brightwheel", "Brightwheel Pricing", "Pricing breakdown");
		const map = buildContentMap({
			...emptyCollections(),
			pricingBreakdowns: [entry],
		});

		expect(map.has("/compare/pricing/brightwheel")).toBe(true);
		const result = map.get("/compare/pricing/brightwheel");
		expect(result?.title).toBe("Brightwheel Pricing");
		expect(result?.description).toBe("Pricing breakdown");
	});

	it("maps listicles using /resources/best/{entry.id}", () => {
		const entry = makeListicle(
			"best-childcare-billing-software.md",
			"Best Childcare Billing Software",
			"Top picks",
		);
		const map = buildContentMap({ ...emptyCollections(), listicles: [entry] });

		expect(map.has("/resources/best/best-childcare-billing-software")).toBe(true);
		const result = map.get("/resources/best/best-childcare-billing-software");
		expect(result?.title).toBe("Best Childcare Billing Software");
		expect(result?.description).toBe("Top picks");
	});

	it("maps guides using /resources/guides/{entry.id}", () => {
		const entry = makeGuide(
			"how-to-start-a-daycare-business.md",
			"How to Start a Daycare Business",
			"Step-by-step guide",
		);
		const map = buildContentMap({ ...emptyCollections(), guides: [entry] });

		expect(map.has("/resources/guides/how-to-start-a-daycare-business")).toBe(true);
		const result = map.get("/resources/guides/how-to-start-a-daycare-business");
		expect(result?.title).toBe("How to Start a Daycare Business");
		expect(result?.description).toBe("Step-by-step guide");
	});

	it("maps lead-magnets using /free/{entry.id}", () => {
		const entry = makeLeadMagnet(
			"ccdf-billing-error-prevention.md",
			"CCDF Billing Error Prevention Checklist",
			"Avoid common billing errors",
		);
		const map = buildContentMap({
			...emptyCollections(),
			leadMagnets: [entry],
		});

		expect(map.has("/free/ccdf-billing-error-prevention")).toBe(true);
		const result = map.get("/free/ccdf-billing-error-prevention");
		expect(result?.title).toBe("CCDF Billing Error Prevention Checklist");
		expect(result?.description).toBe("Avoid common billing errors");
	});

	it("maps state-pages using /childcare-software/{entry.id}", () => {
		const entry = makeStatePage("texas", "Childcare Software Texas", "Childcare centers in Texas");
		const map = buildContentMap({
			...emptyCollections(),
			statePages: [entry],
		});

		expect(map.has("/childcare-software/texas")).toBe(true);
		const result = map.get("/childcare-software/texas");
		expect(result?.title).toBe("Childcare Software Texas");
		expect(result?.description).toBe("Childcare centers in Texas");
	});

	it("maps city-pages using /childcare-software/{city-state-slug}", () => {
		const entry = makeCityPage(
			"dallas-tx",
			"Childcare Software Dallas TX",
			"Software for Dallas centers",
		);
		const map = buildContentMap({
			...emptyCollections(),
			cityPages: [entry],
		});

		expect(map.has("/childcare-software/dallas-tx")).toBe(true);
		const result = map.get("/childcare-software/dallas-tx");
		expect(result?.title).toBe("Childcare Software Dallas TX");
		expect(result?.description).toBe("Software for Dallas centers");
	});

	it("skips city-pages when not provided", () => {
		const map = buildContentMap(emptyCollections());
		expect(map.size).toBe(0);
	});

	it("merges all collections into one map", () => {
		const alt = makeAlternative("brightwheel", "Brightwheel Alternative", "desc1");
		const comp = makeComparison("brightwheel", "procare", "Brightwheel vs Procare", "desc2");
		const pricing = makePricingBreakdown("brightwheel", "Brightwheel Pricing", "desc3");
		const listicle = makeListicle(
			"best-childcare-billing-software.md",
			"Best Childcare Billing Software",
			"desc4",
		);
		const guide = makeGuide(
			"how-to-start-a-daycare-business.md",
			"How to Start a Daycare Business",
			"desc5",
		);
		const statePage = makeStatePage("california", "Childcare Software California", "desc6");
		const leadMagnet = makeLeadMagnet(
			"ratio-tracking-cheatsheet.md",
			"Ratio Tracking Cheatsheet",
			"desc7",
		);

		const map = buildContentMap({
			alternatives: [alt],
			comparisons: [comp],
			pricingBreakdowns: [pricing],
			listicles: [listicle],
			guides: [guide],
			statePages: [statePage],
			leadMagnets: [leadMagnet],
		});

		expect(map.size).toBe(7);
		expect(map.has("/compare/alternatives/brightwheel")).toBe(true);
		expect(map.has("/compare/versus/brightwheel-vs-procare")).toBe(true);
		expect(map.has("/compare/pricing/brightwheel")).toBe(true);
		expect(map.has("/resources/best/best-childcare-billing-software")).toBe(true);
		expect(map.has("/resources/guides/how-to-start-a-daycare-business")).toBe(true);
		expect(map.has("/childcare-software/california")).toBe(true);
		expect(map.has("/free/ratio-tracking-cheatsheet")).toBe(true);
	});

	it("copies title and description accurately from entry.data", () => {
		const entry = makeAlternative("test-slug", "Exact Title Here", "Exact description here");
		const map = buildContentMap({
			...emptyCollections(),
			alternatives: [entry],
		});
		const result = map.get("/compare/alternatives/test-slug");
		expect(result?.title).toBe("Exact Title Here");
		expect(result?.description).toBe("Exact description here");
	});

	it("maps features using /features/{entry.id} when features collection is provided", () => {
		const featureEntry = {
			id: "ratio-compliance.md",
			body: "",
			collection: "features",
			data: {
				title: "Ratio Compliance",
				description: "Track ratios with confidence",
			},
			render: async () => ({ Content: () => null, headings: [], remarkPluginFrontmatter: {} }),
		} as unknown as import("astro:content").CollectionEntry<"features">;

		const map = buildContentMap({
			...emptyCollections(),
			features: [featureEntry],
		});

		expect(map.has("/features/ratio-compliance")).toBe(true);
		const result = map.get("/features/ratio-compliance");
		expect(result?.title).toBe("Ratio Compliance");
		expect(result?.description).toBe("Track ratios with confidence");
	});

	it("stores canonicalHref when an entry defines one", () => {
		const entry = makeAlternative(
			"test-slug",
			"Exact Title Here",
			"Exact description here",
			"/compare/alternatives/pebbledesk-vs-test-slug",
		);
		const map = buildContentMap({
			...emptyCollections(),
			alternatives: [entry],
		});
		const result = map.get("/compare/alternatives/test-slug");
		expect(result?.canonicalHref).toBe("/compare/alternatives/pebbledesk-vs-test-slug");
	});
});

describe("resolveRelatedLinksWithFallback", () => {
	const contentMap = new Map([
		[
			"/resources/guides/how-to-choose-childcare-management-software",
			{
				title: "How to Choose Childcare Management Software",
				description: "A practical buyer guide.",
			},
		],
		[
			"/resources/best/best-childcare-software-small-centers",
			{
				title: "Best Childcare Software for Small Centers",
				description: "A software shortlist.",
			},
		],
		[
			"/compare/",
			{
				title: "Compare Childcare Software",
				description: "Compare options.",
			},
		],
		[
			"/pricing/",
			{
				title: "PebbleDesk Pricing",
				description: "Pricing plans.",
			},
		],
	]);

	it("throws when authored frontmatter links point to missing pages", () => {
		expect(() =>
			resolveRelatedLinksWithFallback({
				currentPath: "/resources/guides/current-page",
				relatedPages: ["/resources/guides/missing-page"],
				contentMap,
				minLinks: 2,
			}),
		).toThrow(
			"Missing related page link(s) for /resources/guides/current-page: /resources/guides/missing-page",
		);
	});

	it("keeps valid editorial links first, removes self links, and tops up to the minimum", () => {
		const links = resolveRelatedLinksWithFallback({
			currentPath: "/resources/guides/current-page",
			relatedPages: [
				"/resources/guides/current-page",
				"/resources/best/best-childcare-software-small-centers/",
			],
			contentMap,
			minLinks: 3,
		});

		expect(links.map((link) => link.href)).toEqual([
			"/resources/best/best-childcare-software-small-centers",
			"/resources/guides/how-to-choose-childcare-management-software",
			"/compare/",
		]);
	});
});

describe("resolveStatePageDefaults", () => {
	it("returns defaults when all fields are undefined", () => {
		const result = resolveStatePageDefaults({});
		expect(result.topMetros).toEqual([]);
		expect(result.establishmentCount).toBeUndefined();
		expect(result.licensingNotes).toBe("");
		expect(result.seasonalNotes).toBe("");
	});

	it("passes through provided values", () => {
		const metros = [{ name: "Houston", count: 1200 }];
		const result = resolveStatePageDefaults({
			topMetros: metros,
			establishmentCount: 5000,
			licensingNotes: "License required",
			seasonalNotes: "Summer peak",
		});
		expect(result.topMetros).toEqual(metros);
		expect(result.establishmentCount).toBe(5000);
		expect(result.licensingNotes).toBe("License required");
		expect(result.seasonalNotes).toBe("Summer peak");
	});

	it("preserves undefined establishmentCount rather than defaulting to 0", () => {
		const result = resolveStatePageDefaults({
			topMetros: [{ name: "Dallas", count: 800 }],
		});
		expect(result.establishmentCount).toBeUndefined();
	});
});
