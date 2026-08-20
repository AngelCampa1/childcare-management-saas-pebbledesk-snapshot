/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

const guardedFiles = [
	"apps/api/src/index.ts",
	"apps/api/src/routes/centers.ts",
	"apps/api/src/routes/subscriptions.ts",
	"apps/api/src/routes/subscriptions-webhook.ts",
	"apps/web/src/hooks/use-attendance.ts",
	"apps/web/src/hooks/use-center.ts",
	"apps/web/src/hooks/use-children.ts",
	"apps/web/src/hooks/use-classrooms.ts",
	"apps/web/src/hooks/use-finance.ts",
	"apps/web/src/hooks/use-guardians.ts",
	"apps/web/src/hooks/use-imports.ts",
	"apps/web/src/hooks/use-members.ts",
	"apps/web/src/hooks/use-memberships.ts",
	"apps/web/src/hooks/use-phase5.ts",
	"apps/web/src/hooks/use-quickbooks.ts",
	"apps/web/src/hooks/use-ratios.ts",
	"apps/web/src/hooks/use-reports.ts",
	"apps/web/src/hooks/use-stripe-connect.ts",
	"apps/web/src/hooks/use-subscription.ts",
	"apps/web/src/lib/analytics.ts",
	"apps/web/src/routes/_auth.tsx",
	"apps/web/src/routes/_auth/children/enroll.tsx",
	"apps/web/src/routes/_auth/messages/$id.tsx",
	"apps/web/src/routes/_auth/reports/audit-log.tsx",
	"apps/web/src/routes/login.tsx",
	"apps/web/src/routes/onboarding.tsx",
	"apps/web/src/routes/signup.tsx",
	"apps/site/src/worker.ts",
	"packages/marketing/src/components/post-signup-survey.tsx",
] as const;

const rawAnalyticsEventPatterns = [
	/schedulePostHogEvent\([\s\S]*?event:\s*"[^"]+"/,
	/captureBillingLifecycle\([\s\S]*?event:\s*"[^"]+"/,
	/track\(\s*"[^"]+"/,
	/trackEvent\(\s*"[^"]+"/,
] as const;

describe("analytics event source of truth", () => {
	it("keeps priority runtime analytics call sites on shared event constants", () => {
		const violations = guardedFiles.flatMap((file) => {
			const source = readFileSync(resolve(repoRoot, file), "utf8");
			const fileViolations: string[] = [];

			if (!source.includes("ANALYTICS_EVENTS")) {
				fileViolations.push(`${file} must import ANALYTICS_EVENTS`);
			}

			for (const pattern of rawAnalyticsEventPatterns) {
				if (pattern.test(source)) {
					fileViolations.push(`${file} contains raw analytics event strings`);
				}
			}

			return fileViolations;
		});

		expect(violations).toEqual([]);
	});
});
