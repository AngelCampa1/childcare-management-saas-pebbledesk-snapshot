import { defineConfig } from "vitest/config";

const isTargetedCoverageRun = process.argv.some(
	(arg) => arg.endsWith(".test.ts") || arg.endsWith(".test.tsx"),
);

export default defineConfig({
	test: {
		environment: "node",
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			include: isTargetedCoverageRun
				? undefined
				: ["src/lib/**/*.ts", "src/worker.ts", "src/worker/**/*.ts", "scripts/**/*.ts"],
			exclude: [
				"src/lib/**/*.test.ts",
				"src/worker.test.ts",
				"src/worker/**/*.test.ts",
				"scripts/**/*.test.ts",
				"scripts/check-links.ts",
			],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
			reporter: ["text", "html", "lcov"],
		},
	},
});
