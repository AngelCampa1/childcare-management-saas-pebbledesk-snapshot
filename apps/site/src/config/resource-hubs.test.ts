import { describe, expect, it } from "vitest";
import {
	getHubIdsForResource,
	type HubResourceType,
	type ResourceHubId,
	resourceHubs,
} from "./resource-hubs";
import { siteConfig } from "./site";

const resourceTypes: HubResourceType[] = [
	"guide",
	"best",
	"free-tool",
	"feature",
	"state",
	"city",
	"alternative",
	"comparison",
	"pricing",
];

describe("resource hub registry", () => {
	it("defines the expected public resource pillar hubs", () => {
		expect(resourceHubs.map((hub) => hub.href)).toEqual([
			"/resources/audit-licensing/",
			"/resources/subsidy-billing/",
			"/resources/attendance-ratios/",
			"/resources/staff-operations/",
			"/resources/software-buying/",
			"/resources/compare-pricing/",
			"/resources/state-local/",
			"/resources/free-tools/",
		]);
	});

	it("assigns every supported public content resource type to at least one hub", () => {
		for (const type of resourceTypes) {
			const hubs = getHubIdsForResource({
				type,
				slug: `example-${type}`,
				title: `Example ${type}`,
				href: `/example/${type}/`,
			});

			expect(hubs.length, `${type} should map to at least one hub`).toBeGreaterThan(0);
		}
	});

	it("keeps every Resources mega menu link hub-first", () => {
		const hubHrefs = new Set<string>(resourceHubs.map((hub) => hub.href));
		const allowedResourceUtilityLinks = new Set(["/compare/"]);
		const resourcesItem = siteConfig.nav.items.find((item) => item.label === "Resources");
		if (!resourcesItem || !("megaMenu" in resourcesItem) || !resourcesItem.megaMenu) {
			throw new Error("Resources mega menu is missing");
		}

		for (const group of resourcesItem.megaMenu) {
			const links = group.links.map((link) => link.href);
			for (const href of links) {
				expect(
					hubHrefs.has(href) || allowedResourceUtilityLinks.has(href),
					`${group.heading} links ${href}, which is not a hub or approved utility link`,
				).toBe(true);
			}
		}
	});

	it("uses all defined hub ids in assignment rules", () => {
		const assigned = new Set<ResourceHubId>();
		const representativeResources = [
			{ type: "guide" as const, slug: "audit-licensing", title: "Audit licensing" },
			{ type: "guide" as const, slug: "ccdf-subsidy-billing", title: "CCDF billing" },
			{ type: "feature" as const, slug: "attendance-ratio-tracking", title: "Attendance ratios" },
			{ type: "feature" as const, slug: "staff-scheduling", title: "Staff operations" },
			{ type: "best" as const, slug: "software-buying", title: "Software buying" },
			{ type: "pricing" as const, slug: "compare-pricing", title: "Compare pricing" },
			{ type: "state" as const, slug: "texas", title: "Texas childcare software" },
			{ type: "free-tool" as const, slug: "free-tools", title: "Free tools" },
		];

		for (const resource of representativeResources) {
			for (const id of getHubIdsForResource({
				...resource,
				href: `/${resource.slug}/`,
			})) {
				assigned.add(id);
			}
		}

		for (const hub of resourceHubs) expect(assigned.has(hub.id)).toBe(true);
	});
});
