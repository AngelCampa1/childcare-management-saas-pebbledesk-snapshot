import { describe, expect, it } from "vitest";
import {
	APP_PAGE_HELP,
	getAppInlineHelpById,
	getAppPageHelpByRoute,
	getAppPageHelpForRole,
	getGuideById,
	getGuidesForRole,
	getRequiredAppInlineHelpById,
	getRequiredAppPageHelpByRoute,
	getTopicsForRole,
	pageHelpVisibleToRole,
	searchHelp,
	stepVisibleToRole,
} from "./app.js";

const majorHelpRoutes = [
	"/dashboard",
	"/attendance",
	"/classrooms",
	"/children",
	"/children/enroll",
	"/guardians",
	"/scheduling",
	"/ratios",
	"/reports",
	"/billing",
	"/subsidies",
	"/import",
	"/messages",
	"/settings",
] as const;

describe("app public knowledge", () => {
	it("publishes the existing app guide and topic ids from the shared app surface", () => {
		expect(getGuidesForRole("director").map((guide) => guide.id)).toEqual(
			expect.arrayContaining([
				"dashboard-basics",
				"owner-start-here",
				"attendance-basics",
				"classroom-setup",
				"enrollment-basics",
				"guardian-basics",
				"scheduling-basics",
				"staff-daily-basics",
				"ratio-colors",
				"download-pdf-report",
				"csv-import-basics",
				"billing-subsidy-flow",
				"messages-basics",
			]),
		);
		expect(getTopicsForRole("director").map((topic) => topic.id)).toEqual(
			expect.arrayContaining([
				"what-first",
				"lost",
				"dashboard-meaning",
				"capacity-meaning",
				"guardian-primary",
				"find-pdf",
				"attendance-check-in",
				"attendance-clock-in",
				"ratio-red",
				"csv-meaning",
				"billing-vs-subsidy",
				"schedule-vs-attendance",
				"send-message",
				"still-stuck",
			]),
		);
	});

	it("preserves role visibility for guides, steps, topics, and search", () => {
		const billingGuide = getGuideById("billing-subsidy-flow");
		const invoiceStep = billingGuide?.steps.find((step) => step.id === "billing-subsidy.invoice");
		if (!billingGuide || !invoiceStep) throw new Error("Expected billing guide and invoice step");

		expect(getGuidesForRole("staff").map((guide) => guide.id)).not.toContain(
			"billing-subsidy-flow",
		);
		expect(stepVisibleToRole(invoiceStep, "owner")).toBe(true);
		expect(stepVisibleToRole(invoiceStep, "director")).toBe(false);
		expect(getTopicsForRole("staff").map((topic) => topic.id)).not.toContain("billing-vs-subsidy");
		expect(searchHelp("staff", "billing").map((topic) => topic.id)).not.toContain(
			"billing-vs-subsidy",
		);
		expect(searchHelp("staff", "  ")).toEqual(getTopicsForRole("staff"));
	});

	it("covers every major authenticated route help panel with KB copy and exact routes", () => {
		expect(APP_PAGE_HELP.map((entry) => entry.route)).toEqual(
			expect.arrayContaining([...majorHelpRoutes]),
		);

		for (const route of majorHelpRoutes) {
			const help = getAppPageHelpByRoute(route);
			expect(help).toBeDefined();
			if (!help) throw new Error(`Missing app help for ${route}`);
			expect(help.title.length).toBeGreaterThan(0);
			expect(help.what.length).toBeGreaterThan(0);
			expect(help.first.length).toBeGreaterThan(0);
			expect(help.watch.length).toBeGreaterThan(0);
		}
	});

	it("filters and requires app page help by role and route", () => {
		const billingHelp = getRequiredAppPageHelpByRoute("/billing");

		expect(pageHelpVisibleToRole(billingHelp, "owner")).toBe(true);
		expect(pageHelpVisibleToRole(billingHelp, "director")).toBe(false);
		expect(getAppPageHelpForRole("staff").map((entry) => entry.route)).toContain("/attendance");
		expect(getAppPageHelpForRole("staff").map((entry) => entry.route)).not.toContain("/billing");
		expect(() => getRequiredAppPageHelpByRoute("/missing")).toThrow(/Missing app page help/);
	});

	it("covers representative field and tip copy for major app surfaces", () => {
		const expectedInlineHelp = [
			[
				"dashboard.children-present",
				"/dashboard",
				"tip",
				"Children currently checked into rooms today.",
			],
			[
				"billing.template",
				"/billing",
				"field",
				"Templates fill in common charges so you do not retype them.",
			],
			[
				"classrooms.name",
				"/classrooms",
				"field",
				"Use the room name your staff and families already recognize.",
			],
			[
				"messages.send-to",
				"/messages",
				"field",
				"Choose a classroom for a group update or selected guardians for a smaller message.",
			],
		] as const;

		for (const [id, route, kind, text] of expectedInlineHelp) {
			const help = getAppInlineHelpById(id);
			expect(help).toBeDefined();
			expect(help?.route).toBe(route);
			expect(help?.kind).toBe(kind);
			expect(help?.text).toBe(text);
		}

		expect(getRequiredAppInlineHelpById("dashboard.children-present").text).toBe(
			"Children currently checked into rooms today.",
		);
		expect(() => getRequiredAppInlineHelpById("missing.inline-help")).toThrow(
			/Missing app inline help/,
		);
	});
});
