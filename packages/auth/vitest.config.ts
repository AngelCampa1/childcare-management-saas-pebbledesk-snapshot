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
				// Client-side auth is browser-only — not testable in Node.
				"src/client.ts",
				// Re-exports only.
				"src/index.ts",
			],
		},
	},
});
