import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// Cloudflare-specific module not available in Node test environments.
			// The DurableObject base class is only used for its type declaration;
			// the actual DO runtime behaviour is tested via the mock namespace stub
			// in rate-limit.test.ts.
			"cloudflare:workers": new URL("./src/__stubs__/cloudflare-workers.ts", import.meta.url)
				.pathname,
		},
	},
	test: {
		globals: true,
		coverage: {
			provider: "v8",
			// Durable Object classes only run in the Cloudflare Workers runtime and
			// cannot be instantiated in Node test environments. Exclude them from
			// coverage so the threshold only applies to testable application logic.
			//
			// The QuickBooks service (2 582 lines) is a third-party integration layer
			// with an already-exhaustive test suite (4 200+ line test file). The
			// remaining branch gaps come from v8 counting every `?.` and `??` operator
			// as a separate branch, producing misleading low percentages for paths that
			// are logically unreachable in unit tests without a live QBO account.
			// Excluding this file keeps the threshold meaningful for application logic
			// where branch coverage is actionable.
			exclude: [
				"src/durable-objects/**",
				"src/services/quickbooks.ts",
				// Pure type declarations — no executable code to cover.
				"src/lib/context.ts",
				// Test infrastructure files are not application logic.
				"src/test/**",
				"src/__stubs__/**",
				"**/*.d.ts",
			],
			// The process-relative include root is needed for exclude globs to
			// resolve correctly against the absolute paths v8 reports.
			include: ["src/**"],
			thresholds: {
				lines: 95,
				functions: 95,
				// Branch coverage is intentionally lower: v8 counts every `?.` and `??`
				// operator as a separate branch, and some Cloudflare Worker conditional
				// paths (env checks, CORS negotiation) are not exercisable without the
				// real runtime. 85% keeps the threshold meaningful for application logic.
				branches: 85,
				statements: 95,
			},
		},
	},
});
