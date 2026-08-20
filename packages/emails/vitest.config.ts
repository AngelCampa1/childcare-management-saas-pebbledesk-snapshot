import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		pool: "forks",
		fileParallelism: false,
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: ["src/**"],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95,
			},
		},
	},
});
