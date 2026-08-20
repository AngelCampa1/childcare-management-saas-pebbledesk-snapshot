import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	filterItemsForHub,
	type HubPageItem,
	loadHubPageItems,
	resolveStartHereItems,
	staticHubLinks,
} from "./resource-hub-items";

const getCollection = vi.fn();

vi.mock("astro:content", () => ({
	getCollection: (collection: string) => getCollection(collection),
}));

function entry(
	title: string,
	description: string,
	updatedAt = "2026-01-01",
	extra: Record<string, unknown> = {},
) {
	return {
		id: `${title.toLowerCase().replaceAll(" ", "-")}.md`,
		data: {
			title,
			description,
			updatedAt,
			publishedAt: "2026-01-01",
			buyerStage: "tofu",
			...extra,
		},
	};
}

function item(overrides: Partial<HubPageItem>): HubPageItem {
	return {
		type: "guide",
		typeLabel: "Guides",
		slug: "audit-guide",
		title: "Audit guide",
		description: "Audit records",
		href: "/resources/guides/audit-guide/",
		updatedAt: "2026-01-01",
		...overrides,
	};
}

describe("resource hub items", () => {
	beforeEach(() => {
		getCollection.mockReset();
	});

	it("loads every public content-backed collection into hub page items", async () => {
		getCollection.mockImplementation((collection: string) => {
			const collections = {
				guides: [entry("Audit Guide", "Licensing audit")],
				listicles: [entry("Best Billing", "Billing software")],
				"lead-magnets": [entry("Free Checklist", "Checklist")],
				features: [entry("Ratio Tracking", "Ratio feature")],
				"state-pages": [entry("Texas", "Texas guide")],
				"city-pages": [entry("Dallas TX", "Dallas guide")],
				alternatives: [
					entry("Brightwheel Alternative", "Alternative", "2026-01-01", {
						competitor: { slug: "brightwheel" },
					}),
				],
				comparisons: [
					entry("Brightwheel vs Procare", "Comparison", "2026-01-01", {
						competitorA: { slug: "brightwheel" },
						competitorB: { slug: "procare" },
					}),
				],
				"pricing-breakdowns": [
					entry("Procare Pricing", "Pricing", "2026-01-01", {
						competitor: { slug: "procare" },
					}),
				],
			};
			return collections[collection as keyof typeof collections] ?? [];
		});

		const items = await loadHubPageItems();

		expect(items.map((loaded) => loaded.href)).toEqual([
			"/resources/guides/audit-guide/",
			"/resources/best/best-billing/",
			"/free/free-checklist/",
			"/features/ratio-tracking/",
			"/childcare-software/texas/",
			"/childcare-software/dallas-tx/",
			"/compare/alternatives/brightwheel/",
			"/compare/versus/brightwheel-vs-procare/",
			"/compare/pricing/procare/",
		]);
	});

	it("filters items into the requested hub and sorts newest first", () => {
		const items = [
			item({ title: "Old subsidy", slug: "subsidy", updatedAt: "2026-01-01" }),
			item({ title: "New subsidy", slug: "ccdf-billing", updatedAt: "2026-02-01" }),
			item({ title: "Software", slug: "software-selection", updatedAt: "2026-03-01" }),
		];

		const filtered = filterItemsForHub(items, "subsidy-billing");

		expect(filtered.map((filteredItem) => filteredItem.title)).toEqual([
			"New subsidy",
			"Old subsidy",
		]);
	});

	it("resolves start-here links from hub items, all items, and curated static links", () => {
		const hubItem = item({ href: "/resources/guides/audit-guide/", title: "Audit guide" });
		const otherItem = item({
			href: "/free/licensing-compliance-checklist/",
			title: "Checklist",
			type: "free-tool",
			typeLabel: "Free tools",
		});

		const resolved = resolveStartHereItems(
			["/resources/guides/audit-guide/", "/free/licensing-compliance-checklist/", "/compare/"],
			[hubItem],
			[hubItem, otherItem],
		);

		expect(resolved.map((resolvedItem) => resolvedItem.href)).toEqual([
			hubItem.href,
			otherItem.href,
			staticHubLinks[0]?.href,
		]);
	});
});
