import { getPublicApiUrl } from "@pebbledesk/shared";
import { describe, expect, it } from "vitest";
import { renderSignupEmailConfirmation } from "../src/render.js";

describe("signup app emails", () => {
	it("renders the Better Auth email confirmation message with the verification link", async () => {
		const rendered = await renderSignupEmailConfirmation({
			name: "Mia Alvarez",
			verificationUrl: getPublicApiUrl("/api/auth/verify-email?token=abc"),
		});

		expect(rendered.subject).toContain("Confirm your PebbleDesk email");
		expect(rendered.html).toContain("Mia");
		expect(rendered.html).toContain(getPublicApiUrl("/api/auth/verify-email?token=abc"));
		expect(rendered.text).toContain("Confirm your email");
	});
});
