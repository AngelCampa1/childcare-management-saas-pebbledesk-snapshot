import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiCsWidget } from "./ai-cs-widget";

const resolveApiBaseUrl = vi.hoisted(() => vi.fn(() => ""));

vi.mock("../lib/api-origin", () => ({
	resolveApiBaseUrl,
}));

vi.mock("@ventora/ai-cs/react", () => ({
	AiCsWidget: vi.fn(
		({
			session,
			api,
			brand,
		}: {
			session: Record<string, unknown>;
			api: Record<string, unknown>;
			brand: Record<string, unknown>;
		}) => (
			<div
				data-testid="shared-ai-cs-widget"
				data-app-id={String(session.appId)}
				data-user-id={String(session.userId)}
				data-current-path={String(session.currentPath)}
				data-base-url={String(api.baseUrl)}
				data-credentials={String(api.credentials)}
				data-accent={String(brand.accentColor)}
				data-surface={String(brand.surfaceColor)}
				data-text={String(brand.textColor)}
			/>
		),
	),
}));

describe("AiCsWidget", () => {
	afterEach(() => {
		resolveApiBaseUrl.mockReturnValue("");
	});

	it("renders nothing when userId is undefined (unauthenticated state)", () => {
		const { container } = render(<AiCsWidget userId={undefined} currentPath="/dashboard" />);
		expect(container.firstChild).toBeNull();
	});

	it("renders nothing when userId is empty string", () => {
		const { container } = render(<AiCsWidget userId="" currentPath="/dashboard" />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the shared widget with pebbledesk appId when userId is set", () => {
		render(<AiCsWidget userId="user-1" currentPath="/ratios" />);
		const widget = screen.getByTestId("shared-ai-cs-widget");
		expect(widget).toBeDefined();
		expect(widget.getAttribute("data-app-id")).toBe("pebbledesk");
		expect(widget.getAttribute("data-user-id")).toBe("user-1");
		expect(widget.getAttribute("data-current-path")).toBe("/ratios");
	});

	it("wires the BFF at /api/ai-cs (same-origin) with credentials: include when no absolute API origin is configured", () => {
		resolveApiBaseUrl.mockReturnValue("");
		render(<AiCsWidget userId="user-1" currentPath="/dashboard" />);
		const widget = screen.getByTestId("shared-ai-cs-widget");
		expect(widget.getAttribute("data-base-url")).toBe("/api/ai-cs");
		expect(widget.getAttribute("data-credentials")).toBe("include");
	});

	it("targets the resolved API origin so the BFF is reached cross-origin in production", () => {
		resolveApiBaseUrl.mockReturnValue("https://api.pebbledesk.app");
		render(<AiCsWidget userId="user-1" currentPath="/dashboard" />);
		const widget = screen.getByTestId("shared-ai-cs-widget");
		expect(widget.getAttribute("data-base-url")).toBe("https://api.pebbledesk.app/api/ai-cs");
	});

	it("applies the pebbledesk brand palette to the widget", () => {
		render(<AiCsWidget userId="user-1" currentPath="/dashboard" />);
		const widget = screen.getByTestId("shared-ai-cs-widget");
		expect(widget.getAttribute("data-accent")).toBe("#c2410c");
		expect(widget.getAttribute("data-surface")).toBe("#ffffff");
		expect(widget.getAttribute("data-text")).toBe("#1c1917");
	});

	it("passes the current path to the session config", () => {
		render(<AiCsWidget userId="user-1" currentPath="/children" />);
		const widget = screen.getByTestId("shared-ai-cs-widget");
		expect(widget.getAttribute("data-current-path")).toBe("/children");
	});
});
