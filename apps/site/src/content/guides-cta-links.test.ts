import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const guidesDir = join(import.meta.dirname, "guides");
const productAppToken = "{{brand.appOrigin}}";
const expectedTargets = new Map([
	[
		"daycare-business-plan-template.md",
		`${productAppToken}/signup?plan=center_starter&source=%2Fresources%2Fguides%2Fdaycare-business-plan-template%2F`,
	],
	[
		"home-daycare-licensing-requirements.md",
		`${productAppToken}/signup?plan=home&source=%2Fresources%2Fguides%2Fhome-daycare-licensing-requirements%2F`,
	],
	[
		"how-to-start-a-daycare-business.md",
		`${productAppToken}/signup?plan=center_starter&source=%2Fresources%2Fguides%2Fhow-to-start-a-daycare-business%2F`,
	],
	[
		"staff-to-child-ratio-by-state.md",
		`${productAppToken}/signup?plan=center_starter&source=%2Fresources%2Fguides%2Fstaff-to-child-ratio-by-state%2F`,
	],
]);

describe("guide CTA links", () => {
	it("sends high-intent guide trial CTAs directly to the app signup flow", () => {
		for (const [filename, target] of expectedTargets) {
			const source = readFileSync(join(guidesDir, filename), "utf8");

			expect(source).not.toMatch(
				/\[Start your (?:30-day free trial|\{\{trial\.label\}\}) .\]\(\/(?!\/)/,
			);
			expect(source).not.toContain("https://my.pebbledesk.app/signup");
			expect(source).toContain("[Start your {{trial.label}}");
			expect(source).toContain(`](${target})`);
		}
	});
});
