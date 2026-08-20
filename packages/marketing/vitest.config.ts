import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// /pagefind/pagefind.js is generated at build time and does not exist during testing.
			// Map to a no-op stub so Vite's import-analysis resolves the specifier without error,
			// and loadPagefindModule() returns null via its catch branch.
			"/pagefind/pagefind.js": path.resolve(__dirname, "src/__stubs__/pagefind.ts"),
		},
	},
	test: {
		environment: "jsdom",
		exclude: ["dist/**", "node_modules/**"],
		setupFiles: ["./vitest.setup.ts"],
		pool: "forks",
		fileParallelism: false,
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: [
				"src/**/*.test.{ts,tsx}",
				"src/**/*.astro",
				"src/index.ts",
				"src/types.ts",
				"src/lib/schema-types.ts",
			],
			thresholds: { statements: 95, branches: 95, functions: 95, lines: 95 },
			reporter: ["text", "html", "lcov"],
		},
	},
});
