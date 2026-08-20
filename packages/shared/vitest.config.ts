import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		pool: "forks",
		fileParallelism: false,
		coverage: {
			provider: "v8",
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95,
			},
			exclude: [
				"**/*.test.ts",
				"**/*.d.ts",
				// Pure barrel re-export files — no executable logic to cover.
				"src/validators/index.ts",
				"src/constants/index.ts",
			],
		},
	},
});
