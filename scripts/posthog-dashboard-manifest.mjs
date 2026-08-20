#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_PATH = "docs/analytics/posthog-dashboard-manifest.json";
const MANAGED_TAGS = ["pebbledesk", "analytics-manifest"];
const INSIGHT_DESCRIPTION = "Managed from docs/analytics/posthog-dashboard-manifest.json";
const VALID_INSIGHT_TYPES = new Set(["funnel", "trends"]);

function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

export function validateDashboardManifest(manifest) {
	const errors = [];
	if (!isRecord(manifest)) {
		return ["manifest must be an object"];
	}

	if (!Number.isInteger(manifest.projectId) || manifest.projectId <= 0) {
		errors.push("projectId must be a positive integer");
	}

	if (!Array.isArray(manifest.dashboards) || manifest.dashboards.length === 0) {
		errors.push("dashboards must include at least one dashboard");
		return errors;
	}

	for (const [dashboardIndex, dashboard] of manifest.dashboards.entries()) {
		const dashboardPath = `dashboards[${dashboardIndex}]`;
		if (!isRecord(dashboard)) {
			errors.push(`${dashboardPath} must be an object`);
			continue;
		}
		if (!isNonEmptyString(dashboard.name)) errors.push(`${dashboardPath}.name is required`);
		if (!isNonEmptyString(dashboard.description)) {
			errors.push(`${dashboardPath}.description is required`);
		}
		if (!Array.isArray(dashboard.insights) || dashboard.insights.length === 0) {
			errors.push(`${dashboardPath}.insights must include at least one insight`);
			continue;
		}

		for (const [insightIndex, insight] of dashboard.insights.entries()) {
			const insightPath = `${dashboardPath}.insights[${insightIndex}]`;
			if (!isRecord(insight)) {
				errors.push(`${insightPath} must be an object`);
				continue;
			}
			if (!isNonEmptyString(insight.name)) errors.push(`${insightPath}.name is required`);
			if (!VALID_INSIGHT_TYPES.has(insight.type)) {
				errors.push(
					`${insightPath}.type must be one of: ${[...VALID_INSIGHT_TYPES].sort().join(", ")}`,
				);
			}
			if (!Array.isArray(insight.events) || insight.events.length === 0) {
				errors.push(`${insightPath}.events must include at least one event`);
				continue;
			}
			for (const [eventIndex, event] of insight.events.entries()) {
				if (!isNonEmptyString(event)) {
					errors.push(`${insightPath}.events[${eventIndex}] must be a non-empty string`);
				}
			}
		}
	}

	return errors;
}

export function buildInsightQuery(insight) {
	const sourceKind = insight.type === "funnel" ? "FunnelsQuery" : "TrendsQuery";
	const series = insight.events.map((event) => ({
		kind: "EventsNode",
		event,
		name: event,
		...(sourceKind === "TrendsQuery" ? { math: "total" } : {}),
	}));
	const queryDefaults =
		sourceKind === "FunnelsQuery"
			? {
					filterTestAccounts: true,
					funnelsFilter: {
						funnelOrderType: "ordered",
						funnelVizType: "steps",
						funnelWindowInterval: 14,
						funnelWindowIntervalUnit: "day",
					},
				}
			: {
					filterTestAccounts: true,
					interval: "day",
				};

	return {
		kind: "InsightVizNode",
		source: {
			kind: sourceKind,
			series,
			dateRange: { date_from: "-30d" },
			...queryDefaults,
		},
	};
}

export function buildDashboardPlan(manifest) {
	return {
		projectId: manifest.projectId,
		dashboards: manifest.dashboards.map((dashboard) => ({
			name: dashboard.name,
			createDashboard: {
				name: dashboard.name,
				description: dashboard.description,
				pinned: true,
				tags: MANAGED_TAGS,
				delete_insights: false,
			},
			insights: dashboard.insights.map((insight) => ({
				name: insight.name,
				createInsight: {
					name: insight.name,
					description: INSIGHT_DESCRIPTION,
					tags: MANAGED_TAGS,
					query: buildInsightQuery(insight),
				},
			})),
		})),
	};
}

function readManifest(path) {
	let source;
	try {
		source = readFileSync(path, "utf8");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to read manifest at ${path}: ${message}`);
	}

	try {
		return JSON.parse(source);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to parse manifest JSON at ${path}: ${message}`);
	}
}

function printUsage() {
	console.error(
		"Usage: node scripts/posthog-dashboard-manifest.mjs [validate|plan] [manifest-path]",
	);
}

function runCli() {
	const command = process.argv[2] ?? "validate";
	const manifestPath = resolve(process.cwd(), process.argv[3] ?? MANIFEST_PATH);
	if (!["validate", "plan"].includes(command)) {
		printUsage();
		process.exitCode = 2;
		return;
	}

	let manifest;
	try {
		manifest = readManifest(manifestPath);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
		return;
	}
	const errors = validateDashboardManifest(manifest);
	if (errors.length > 0) {
		for (const error of errors) console.error(error);
		process.exitCode = 1;
		return;
	}

	if (command === "validate") {
		console.log(`Validated ${manifest.dashboards.length} PostHog dashboards from ${manifestPath}`);
		return;
	}

	console.log(JSON.stringify(buildDashboardPlan(manifest), null, 2));
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);
if (entryPath === currentPath) {
	runCli();
}
