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
				branches: 90,
				statements: 95,
			},
			exclude: [
				"**/*.test.ts",
				// Schema files are Drizzle table declarations — they contain no
				// executable logic, only column/relation definitions.
				"src/schema/**",
				// Generated migration SQL — not application logic.
				"drizzle/**",
			],
		},
	},
});
