import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PublicSignupCta from "./public-signup-cta";

describe("PublicSignupCta", () => {
	it("renders the default CTA target for the current source page", () => {
		render(<PublicSignupCta sourcePage="/resources" />);

		const link = screen.getByRole("link", { name: "Create account" });

		expect(link.getAttribute("href")).toBe("https://my.pebbledesk.app/signup?source=%2Fresources");
	});

	it("prefers explicit CTA text and target overrides", () => {
		render(
			<PublicSignupCta
				sourcePage="/compare"
				ctaText="Read the guide"
				ctaTarget="/resources/guides/privacy"
			/>,
		);

		const link = screen.getByRole("link", { name: "Read the guide" });

		expect(link.getAttribute("href")).toBe("https://my.pebbledesk.app/signup?source=%2Fcompare");
	});

	it("keeps the resolved target stable instead of merging runtime attribution", () => {
		window.history.replaceState(
			{},
			"",
			"/compare?utm_source=google&utm_medium=cpc&utm_content=hero",
		);

		render(<PublicSignupCta sourcePage="/compare" />);

		const link = screen.getByRole("link", { name: "Create account" });

		expect(link.getAttribute("href")).toBe("https://my.pebbledesk.app/signup?source=%2Fcompare");
	});
});
