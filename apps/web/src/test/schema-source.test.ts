import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(__dirname, "..");

describe("web schema source usage", () => {
	it("uses shared role and billing arrays for auth and member schemas", () => {
		const authSource = readFileSync(resolve(appRoot, "hooks/use-auth-session.ts"), "utf8");
		const membersSource = readFileSync(resolve(appRoot, "hooks/use-members.ts"), "utf8");

		expect(authSource).toContain("ROLES");
		expect(authSource).toContain("SUBSCRIPTION_STATUSES");
		expect(authSource).toContain("SUBSCRIPTION_PLANS_LIST");
		expect(membersSource).toContain("ROLES");
		expect(authSource).not.toContain('z.enum(["owner", "director", "staff"])');
		expect(membersSource).not.toContain('z.enum(["owner", "director", "staff"])');
		expect(authSource).not.toContain('"incomplete_expired",');
	});
});
