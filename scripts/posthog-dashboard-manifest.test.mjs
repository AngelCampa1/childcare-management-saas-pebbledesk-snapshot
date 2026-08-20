import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
	buildDashboardPlan,
	buildInsightQuery,
	validateDashboardManifest,
} from "./posthog-dashboard-manifest.mjs";

const scriptPath = resolve("scripts/posthog-dashboard-manifest.mjs");

const manifest = {
	projectId: 414219,
	dashboards: [
		{
			name: "Acquisition",
			description: "Marketing movement.",
			insights: [
				{ name: "CTA movement", type: "trends", events: ["cta_clicked", "signup_started"] },
				{ name: "Signup funnel", type: "funnel", events: ["$pageview", "signup_started"] },
			],
		},
	],
};

describe("posthog dashboard manifest utility", () => {
	it("validates dashboard and insight shape", () => {
		assert.deepEqual(validateDashboardManifest(manifest), []);
	});

	it("rejects unknown insight types and empty event lists", () => {
		const invalid = structuredClone(manifest);
		invalid.dashboards[0].insights = [
			{ name: "Unknown", type: "pie", events: ["cta_clicked"] },
			{ name: "Empty", type: "trends", events: [] },
		];

		assert.deepEqual(validateDashboardManifest(invalid), [
			"dashboards[0].insights[0].type must be one of: funnel, trends",
			"dashboards[0].insights[1].events must include at least one event",
		]);
	});

	it("builds PostHog query payloads for trend and funnel insights", () => {
		assert.deepEqual(buildInsightQuery(manifest.dashboards[0].insights[0]), {
			kind: "InsightVizNode",
			source: {
				kind: "TrendsQuery",
				series: [
					{ kind: "EventsNode", event: "cta_clicked", name: "cta_clicked", math: "total" },
					{ kind: "EventsNode", event: "signup_started", name: "signup_started", math: "total" },
				],
				dateRange: { date_from: "-30d" },
				filterTestAccounts: true,
				interval: "day",
			},
		});

		assert.deepEqual(buildInsightQuery(manifest.dashboards[0].insights[1]), {
			kind: "InsightVizNode",
			source: {
				kind: "FunnelsQuery",
				series: [
					{ kind: "EventsNode", event: "$pageview", name: "$pageview" },
					{ kind: "EventsNode", event: "signup_started", name: "signup_started" },
				],
				dateRange: { date_from: "-30d" },
				filterTestAccounts: true,
				funnelsFilter: {
					funnelOrderType: "ordered",
					funnelVizType: "steps",
					funnelWindowInterval: 14,
					funnelWindowIntervalUnit: "day",
				},
			},
		});
	});

	it("builds deterministic dashboard and insight creation payloads", () => {
		assert.deepEqual(buildDashboardPlan(manifest), {
			projectId: 414219,
			dashboards: [
				{
					name: "Acquisition",
					createDashboard: {
						name: "Acquisition",
						description: "Marketing movement.",
						pinned: true,
						tags: ["pebbledesk", "analytics-manifest"],
						delete_insights: false,
					},
					insights: [
						{
							name: "CTA movement",
							createInsight: {
								name: "CTA movement",
								description: "Managed from docs/analytics/posthog-dashboard-manifest.json",
								tags: ["pebbledesk", "analytics-manifest"],
								query: buildInsightQuery(manifest.dashboards[0].insights[0]),
							},
						},
						{
							name: "Signup funnel",
							createInsight: {
								name: "Signup funnel",
								description: "Managed from docs/analytics/posthog-dashboard-manifest.json",
								tags: ["pebbledesk", "analytics-manifest"],
								query: buildInsightQuery(manifest.dashboards[0].insights[1]),
							},
						},
					],
				},
			],
		});
	});

	it("prints a concise CLI error for missing manifest files", () => {
		const result = spawnSync(
			process.execPath,
			[scriptPath, "validate", "missing-posthog-dashboard-manifest.json"],
			{ encoding: "utf8" },
		);

		assert.equal(result.status, 1);
		assert.match(result.stderr, /Unable to read manifest/);
		assert.doesNotMatch(result.stderr, /Error \[|SyntaxError|\n\s+at /);
	});

	it("prints a concise CLI error for invalid JSON manifests", () => {
		const tempDir = mkdtempSync(resolve(tmpdir(), "pebbledesk-posthog-"));
		try {
			const invalidPath = resolve(tempDir, "invalid.json");
			writeFileSync(invalidPath, "{ invalid json", "utf8");

			const result = spawnSync(process.execPath, [scriptPath, "validate", invalidPath], {
				encoding: "utf8",
			});

			assert.equal(result.status, 1);
			assert.match(result.stderr, /Unable to parse manifest JSON/);
			assert.doesNotMatch(result.stderr, /SyntaxError|\n\s+at /);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
