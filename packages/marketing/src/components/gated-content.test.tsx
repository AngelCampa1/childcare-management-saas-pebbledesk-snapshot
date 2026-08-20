import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

vi.mock("../lib/exit-popup-utils", () => ({
	isSignedUp: vi.fn(() => false),
	setSignedUp: vi.fn(),
}));

vi.mock("./lead-capture-form", () => ({
	LeadCaptureForm: ({
		magnetSlug,
		turnstileSiteKey,
	}: {
		magnetSlug: string;
		turnstileSiteKey?: string;
	}) => (
		<div
			data-testid="lead-capture-form"
			data-magnet-slug={magnetSlug}
			data-turnstile-site-key={turnstileSiteKey ?? ""}
		>
			Lead capture form mock
		</div>
	),
}));

import { isSignedUp } from "../lib/exit-popup-utils";
import { GatedContent } from "./gated-content";

const mockIsSignedUp = isSignedUp as unknown as MockInstance;

const defaultProps = {
	apiUrl: "https://api.test",
	leadMagnetTitle: "Free Guide to Testing",
	description: "Get this free guide by entering your email.",
	ctaText: "Get my free guide",
	teaserHtml: "<h2>Section 1</h2><p>This is free content.</p>",
	magnetSlug: "testing-guide",
};

beforeEach(() => {
	vi.clearAllMocks();
	mockIsSignedUp.mockReturnValue(false);
});

describe("GatedContent", () => {
	it("renders LeadCaptureForm (not a product signup link) when not signed up", () => {
		render(<GatedContent {...defaultProps} />);

		expect(screen.getByTestId("lead-capture-form")).toBeDefined();
		expect(screen.queryByRole("link", { name: /create account/i })).toBeNull();
	});

	it("passes magnetSlug to LeadCaptureForm", () => {
		render(<GatedContent {...defaultProps} magnetSlug="licensing-compliance-checklist" />);

		const form = screen.getByTestId("lead-capture-form");
		expect(form.getAttribute("data-magnet-slug")).toBe("licensing-compliance-checklist");
	});

	it("renders teaser content above the gate", () => {
		render(<GatedContent {...defaultProps} />);

		expect(screen.getByText("This is free content.")).toBeDefined();
	});

	it("does NOT render gatedHtml content on-page", () => {
		render(<GatedContent {...defaultProps} />);

		// There should be no gated content section rendered at all
		// The gate form replaces it
		expect(screen.queryByText("This is gated content.")).toBeNull();
	});

	it("renders 'already have access' message when isSignedUp() is true", () => {
		mockIsSignedUp.mockReturnValue(true);

		render(<GatedContent {...defaultProps} />);

		expect(screen.getByText(/already have access/i)).toBeDefined();
		expect(screen.queryByTestId("lead-capture-form")).toBeNull();
	});

	it("renders a deterministic PDF download link when already signed up", () => {
		mockIsSignedUp.mockReturnValue(true);

		render(<GatedContent {...defaultProps} magnetSlug="licensing-compliance-checklist" />);

		const downloadLink = screen.getByRole("link", { name: /download/i });
		expect(downloadLink.getAttribute("href")).toBe(
			"/lead-magnets/licensing-compliance-checklist.pdf",
		);
	});

	it("does not render the form when already signed up", () => {
		mockIsSignedUp.mockReturnValue(true);

		render(<GatedContent {...defaultProps} />);

		expect(screen.queryByTestId("lead-capture-form")).toBeNull();
	});

	it("renders teaserHtml in the already-signed-up state", () => {
		mockIsSignedUp.mockReturnValue(true);

		render(<GatedContent {...defaultProps} />);

		expect(screen.getByText("This is free content.")).toBeDefined();
	});

	it("renders the privacyNote below the gate form when provided", () => {
		render(<GatedContent {...defaultProps} privacyNote="We will never share your email." />);

		expect(screen.getByText("We will never share your email.")).toBeDefined();
	});

	it("renders the leadMagnetTitle in the gate box", () => {
		render(<GatedContent {...defaultProps} leadMagnetTitle="My Awesome Guide" />);

		expect(screen.getByText("My Awesome Guide")).toBeDefined();
	});

	it("forwards turnstileSiteKey to LeadCaptureForm when provided", () => {
		render(<GatedContent {...defaultProps} turnstileSiteKey="0x4AAAA" />);

		const form = screen.getByTestId("lead-capture-form");
		expect(form.getAttribute("data-turnstile-site-key")).toBe("0x4AAAA");
	});

	it("does not forward turnstileSiteKey when not provided", () => {
		render(<GatedContent {...defaultProps} />);

		const form = screen.getByTestId("lead-capture-form");
		expect(form.getAttribute("data-turnstile-site-key")).toBe("");
	});
});
