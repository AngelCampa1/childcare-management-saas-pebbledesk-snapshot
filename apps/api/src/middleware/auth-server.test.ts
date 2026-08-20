import { AUTH_ADVANCED_CONFIG, AUTH_SCHEMA } from "@pebbledesk/auth/server";
import { accounts, sessions, users, verifications } from "@pebbledesk/db";
import { describe, expect, it } from "vitest";

describe("auth server config", () => {
	it("uses singular Better Auth schema keys (user, session, account, verification)", () => {
		expect(Object.keys(AUTH_SCHEMA)).toEqual(["user", "session", "account", "verification"]);
		expect(AUTH_SCHEMA.user).toBe(users);
		expect(AUTH_SCHEMA.session).toBe(sessions);
		expect(AUTH_SCHEMA.account).toBe(accounts);
		expect(AUTH_SCHEMA.verification).toBe(verifications);
	});

	it("generates UUID primary keys", () => {
		expect(AUTH_ADVANCED_CONFIG.database.generateId).toBe("uuid");
	});
});
