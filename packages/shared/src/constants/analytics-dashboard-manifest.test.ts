/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "./analytics";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const manifestPath = resolve(repoRoot, "docs/analytics/posthog-dashboard-manifest.json");
const trackingPlanPath = resolve(repoRoot, "docs/analytics/posthog-tracking-plan.md");

type DashboardManifest = {
	dashboards: Array<{
		name: string;
		insights: Array<{
			name: string;
			events: string[];
		}>;
	}>;
};

function readManifest(): DashboardManifest {
	return JSON.parse(readFileSync(manifestPath, "utf8")) as DashboardManifest;
}

function readTrackingPlan(): string {
	return readFileSync(trackingPlanPath, "utf8");
}

function runtimeAnalyticsFiles(): string[] {
	const roots = ["apps/api/src", "apps/site/src", "apps/web/src", "packages/marketing/src"].map(
		(path) => resolve(repoRoot, path),
	);
	const files: string[] = [];

	function visit(path: string) {
		const stat = statSync(path);
		if (stat.isDirectory()) {
			for (const entry of readdirSync(path)) {
				visit(resolve(path, entry));
			}
			return;
		}

		if (!/\.(ts|tsx)$/.test(path)) return;
		if (/\.test\.(ts|tsx)$/.test(path)) return;
		files.push(path);
	}

	for (const root of roots) {
		try {
			visit(root);
		} catch {
			// root may not exist in all environments
		}
	}
	return files;
}

function trackingPlanEvents(source: string): Set<string> {
	return new Set(
		source
			.split(/\r?\n/)
			.map((line) => line.match(/^\| `([^`]+)` \|/)?.[1])
			.filter((event): event is string => Boolean(event)),
	);
}

function runtimeEmittedEvents(): Set<string> {
	const eventValues = ANALYTICS_EVENTS as Record<string, string>;
	const emittedEvents = new Set<string>();
	const emitCallPattern =
		/\b(?:track|trackEvent|track[A-Za-z0-9]*Event|schedulePostHogEvent|captureBillingLifecycle)\s*\([\s\S]{0,1200}?\);/g;

	for (const file of runtimeAnalyticsFiles()) {
		const source = readFileSync(file, "utf8");
		for (const call of source.matchAll(emitCallPattern)) {
			for (const match of call[0].matchAll(/ANALYTICS_EVENTS\.([A-Za-z0-9_]+)/g)) {
				const event = eventValues[match[1]];
				if (event) emittedEvents.add(event);
			}
		}
	}

	return emittedEvents;
}

describe("PostHog dashboard manifest", () => {
	it("references only shared analytics event constants", () => {
		const manifest = readManifest();
		const knownEvents = new Set<string>(Object.values(ANALYTICS_EVENTS));
		const unknownEvents = manifest.dashboards.flatMap((dashboard) =>
			dashboard.insights.flatMap((insight) =>
				insight.events
					.filter((event) => !knownEvents.has(event))
					.map((event) => `${dashboard.name} / ${insight.name}: ${event}`),
			),
		);

		expect(unknownEvents).toEqual([]);
	});

	it("includes activation coverage for child, guardian, and enrollment journeys", () => {
		const manifest = readManifest();
		const activation = manifest.dashboards.find((dashboard) => dashboard.name === "Activation");
		const activationEvents = new Set(activation?.insights.flatMap((insight) => insight.events));

		expect([...activationEvents]).toEqual(
			expect.arrayContaining([
				ANALYTICS_EVENTS.centerCreated,
				ANALYTICS_EVENTS.classroomCreated,
				ANALYTICS_EVENTS.childCreated,
				ANALYTICS_EVENTS.guardianCreated,
				ANALYTICS_EVENTS.enrollmentCompleted,
				ANALYTICS_EVENTS.attendanceCheckinCompleted,
				ANALYTICS_EVENTS.reportGenerated,
			]),
		);
	});

	it("includes acquisition and friction coverage for signup and marketing journeys", () => {
		const manifest = readManifest();
		const acquisition = manifest.dashboards.find((dashboard) => dashboard.name === "Acquisition");
		const friction = manifest.dashboards.find(
			(dashboard) => dashboard.name === "Friction And Quality",
		);
		const acquisitionEvents = new Set(acquisition?.insights.flatMap((insight) => insight.events));
		const frictionEvents = new Set(friction?.insights.flatMap((insight) => insight.events));

		expect([...acquisitionEvents]).toEqual(
			expect.arrayContaining([
				ANALYTICS_EVENTS.publicSignupSubmission,
				ANALYTICS_EVENTS.leadMagnetSubmission,
			]),
		);
		expect([...frictionEvents]).toEqual(
			expect.arrayContaining([
				ANALYTICS_EVENTS.signupValidationFailed,
				ANALYTICS_EVENTS.signupDuplicate,
			]),
		);
	});

	it("defines every dashboard event in the tracking plan", () => {
		const manifest = readManifest();
		const documentedEvents = trackingPlanEvents(readTrackingPlan());
		const missingEvents = manifest.dashboards.flatMap((dashboard) =>
			dashboard.insights.flatMap((insight) =>
				insight.events
					.filter((event) => !documentedEvents.has(event))
					.map((event) => `${dashboard.name} / ${insight.name}: ${event}`),
			),
		);

		expect(missingEvents).toEqual([]);
	});

	it("surfaces every runtime-emitted shared event in the dashboard manifest", () => {
		const manifest = readManifest();
		const manifestEvents = new Set(
			manifest.dashboards.flatMap((dashboard) =>
				dashboard.insights.flatMap((insight) => insight.events),
			),
		);
		const missingEvents = [...runtimeEmittedEvents()].filter((event) => !manifestEvents.has(event));

		expect(missingEvents).toEqual([]);
	});

	it("defines every runtime-emitted shared event in the tracking plan", () => {
		const documentedEvents = trackingPlanEvents(readTrackingPlan());
		const missingEvents = [...runtimeEmittedEvents()].filter(
			(event) => !documentedEvents.has(event),
		);

		expect(missingEvents).toEqual([]);
	});
});
