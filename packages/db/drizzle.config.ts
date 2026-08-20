import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/schema/index.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		// biome-ignore lint/style/noNonNullAssertion: DATABASE_URL is required at runtime
		url: process.env.DATABASE_URL!,
	},
});
