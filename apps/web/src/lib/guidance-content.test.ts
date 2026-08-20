import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	APP_INLINE_HELP,
	APP_PAGE_HELP,
	getGuideById,
	getGuidesForRole,
	getRequiredAppInlineHelpById,
	getRequiredAppPageHelpByRoute,
	getTopicsForRole,
	guideVisibleToRole,
	searchHelp,
	stepVisibleToRole,
} from "./guidance-content";

const routesRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "routes");

describe("guidance content", () => {
	it("includes plain-language help guides for every major director workflow", () => {
		const guideIds = getGuidesForRole("director").map((guide) => guide.id);

		expect(guideIds).toEqual(
			expect.arrayContaining([
				"dashboard-basics",
				"attendance-basics",
				"classroom-setup",
				"enrollment-basics",
				"guardian-basics",
				"scheduling-basics",
				"ratio-colors",
				"download-pdf-report",
				"csv-import-basics",
				"billing-subsidy-flow",
				"messages-basics",
			]),
		);
	});

	it("returns friendly quick answers for common non-technical search words", () => {
		expect(searchHelp("director", "lost").map((topic) => topic.title)).toContain(
			"I feel lost. What should I do?",
		);
		expect(searchHelp("director", "red").map((topic) => topic.title)).toContain(
			"What does a red ratio mean?",
		);
		expect(searchHelp("director", "csv").map((topic) => topic.title)).toContain(
			"What is a CSV file?",
		);
	});

	it("filters guides, steps, and topics by role", () => {
		const ownerGuide = getGuideById("billing-subsidy-flow");
		const ownerStep = ownerGuide?.steps.find((step) => step.id === "billing-subsidy.invoice");
		const directorGuides = getGuidesForRole("director");
		const staffTopics = getTopicsForRole("staff");

		expect(ownerGuide).toBeDefined();
		expect(ownerStep).toBeDefined();
		if (!ownerGuide || !ownerStep) throw new Error("Expected billing guide and invoice step");
		expect(guideVisibleToRole(directorGuides[0], "director")).toBe(true);
		expect(stepVisibleToRole(ownerStep, "owner")).toBe(true);
		expect(stepVisibleToRole(ownerStep, "staff")).toBe(false);
		expect(staffTopics.map((topic) => topic.id)).not.toContain("billing-vs-subsidy");
	});

	it("returns role-appropriate topics when the search is blank", () => {
		const directorTopics = searchHelp("director", "  ");
		const staffTopics = searchHelp("staff", "");

		expect(directorTopics).toEqual(getTopicsForRole("director"));
		expect(staffTopics).toEqual(getTopicsForRole("staff"));
		expect(staffTopics.map((topic) => topic.id)).toContain("lost");
	});

	it("has public-knowledge page help for every route that renders PageHelpPanel by route", async () => {
		const routeHelpRoutes = await findRouteBackedPageHelpRoutes(routesRoot);

		expect(routeHelpRoutes.sort()).toEqual(APP_PAGE_HELP.map((help) => help.route).sort());
		for (const route of routeHelpRoutes) {
			expect(() => getRequiredAppPageHelpByRoute(route)).not.toThrow();
		}
	});

	it("has public-knowledge inline help for every module-scope inline help lookup", () => {
		const inlineHelpIds = [
			"billing.guardian",
			"billing.template",
			"classrooms.card-ratio",
			"classrooms.name",
			"dashboard.children-present",
			"dashboard.rooms-within-ratio",
			"messages.guardians",
			"messages.send-to",
		];

		expect(inlineHelpIds.sort()).toEqual(APP_INLINE_HELP.map((help) => help.id).sort());
		for (const id of inlineHelpIds) {
			expect(() => getRequiredAppInlineHelpById(id)).not.toThrow();
		}
	});
});

async function findRouteBackedPageHelpRoutes(root: string): Promise<string[]> {
	const files = await findTsxFiles(root);
	const routes = new Set<string>();
	for (const file of files) {
		const content = await readFile(file, "utf8");
		for (const match of content.matchAll(
			/<PageHelpPanel\b[^>]*\broute\s*=\s*(?:"([^"]+)"|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/gs,
		)) {
			const route = match[1] ?? match[2] ?? match[3];
			if (route) routes.add(route);
		}
	}
	return [...routes].sort();
}

async function findTsxFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(root, entry.name);
			if (entry.isDirectory()) return findTsxFiles(fullPath);
			if (entry.isFile() && entry.name.endsWith(".tsx")) return [fullPath];
			return [];
		}),
	);
	return files.flat();
}
