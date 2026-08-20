import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/api-origin", () => ({
	resolveApiBaseUrl: () => "",
}));

vi.mock("../lib/zxcvbn-init", () => ({
	zxcvbn: (pw: string) => ({
		score: /^\d+$/.test(pw) || pw.length < 8 ? 0 : 3,
		feedback: { suggestions: [], warning: "" },
	}),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		useNavigate: () => vi.fn(),
		Link: ({
			to,
			children,
			...props
		}: {
			to: string;
			children: React.ReactNode;
			[key: string]: unknown;
		}) => React.createElement("a", { href: to, ...props }, children),
		createFileRoute: () => () => ({
			useSearch: () => ({ token: undefined }),
		}),
	};
});

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		resetPassword: vi.fn(),
	}),
}));

const { ResetPasswordPage } = await import("./reset-password");

function createWrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

describe("ResetPasswordPage (no token)", () => {
	it("shows an invalid-link state when no token is present in the URL", () => {
		render(<ResetPasswordPage />, { wrapper: createWrapper() });

		expect(screen.getByRole("heading", { name: "Invalid reset link" })).toBeInTheDocument();
		expect(
			screen.getByText("This password reset link is invalid or has expired."),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Request a new reset link" })).toHaveAttribute(
			"href",
			"/forgot-password",
		);
		expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
	});
});
