import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		createFileRoute: () => () => ({
			component: () => null,
			useSearch: () => ({}),
		}),
		useNavigate: () => vi.fn(),
		Link: ({
			to,
			children,
			className,
		}: {
			to: string;
			children: ReactNode;
			className?: string;
		}) => (
			<a href={to} className={className}>
				{children}
			</a>
		),
	};
});

vi.mock("@pebbledesk/auth/client", () => ({
	createBetterAuthClient: () => ({
		signUp: { email: vi.fn() },
		signIn: { social: vi.fn() },
	}),
}));

vi.mock("../lib/api-origin", () => ({
	resolveApiBaseUrl: () => "",
}));

vi.mock("../lib/zxcvbn-init", () => ({
	zxcvbn: (pw: string) => ({
		score: /^\d+$/.test(pw) || pw.length < 8 ? 0 : 3,
		feedback: { suggestions: [], warning: "" },
	}),
}));

vi.mock("../lib/analytics", () => ({
	track: vi.fn(),
}));

vi.mock("../hooks/use-auth-status", () => ({
	useAuthStatus: () => ({ data: { status: "unauthenticated" }, isLoading: false, error: null }),
}));

vi.mock("../components/brand-mark", () => ({
	BrandMark: ({ className }: { className?: string }) => (
		<div data-testid="brand-mark" className={className} />
	),
}));

vi.mock("../components/email-confirmation-reminder", () => ({
	EmailConfirmationReminder: () => <div data-testid="email-reminder" />,
}));

vi.mock("../components/password-strength-meter", () => ({
	PasswordStrengthMeter: () => <div data-testid="password-strength-meter" />,
}));

// Import after all mocks are defined
const { SignupPage, authStatusHasEmail, authStatusHasEmailVerified } = await import("./signup");

function createWrapper() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
	};
}

function publicBrandUrl(path: string) {
	return new URL(path, PUBLIC_BRAND_KNOWLEDGE.publicOrigin).toString();
}

describe("authStatusHasEmail", () => {
	it("returns true when the value has a string email property", () => {
		expect(authStatusHasEmail({ email: "user@example.com" })).toBe(true);
	});

	it("returns false when email is a number", () => {
		expect(authStatusHasEmail({ email: 42 })).toBe(false);
	});

	it("returns false when email property is absent", () => {
		expect(authStatusHasEmail({ status: "onboarding_required" })).toBe(false);
	});

	it("returns false for null", () => {
		expect(authStatusHasEmail(null)).toBe(false);
	});

	it("returns false for undefined", () => {
		expect(authStatusHasEmail(undefined)).toBe(false);
	});

	it("returns false for a plain string", () => {
		expect(authStatusHasEmail("user@example.com")).toBe(false);
	});

	it("returns false when email is undefined on the object", () => {
		expect(authStatusHasEmail({ email: undefined })).toBe(false);
	});
});

describe("authStatusHasEmailVerified", () => {
	it("returns true when emailVerified is a boolean true", () => {
		expect(authStatusHasEmailVerified({ emailVerified: true })).toBe(true);
	});

	it("returns true when emailVerified is a boolean false", () => {
		expect(authStatusHasEmailVerified({ emailVerified: false })).toBe(true);
	});

	it("returns false when emailVerified is a string", () => {
		expect(authStatusHasEmailVerified({ emailVerified: "true" })).toBe(false);
	});

	it("returns false when emailVerified property is absent", () => {
		expect(authStatusHasEmailVerified({ status: "onboarding_required" })).toBe(false);
	});

	it("returns false for null", () => {
		expect(authStatusHasEmailVerified(null)).toBe(false);
	});
});

describe("SignupPage — marketing site links", () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("renders Terms and Privacy links pointing to the shared public brand origin", () => {
		render(<SignupPage />, { wrapper: createWrapper() });

		const termsLink = screen.getByRole("link", { name: /^Terms$/i });
		const privacyLink = screen.getByRole("link", { name: /privacy policy/i });

		expect(termsLink).toHaveAttribute("href", publicBrandUrl("/terms/"));
		expect(privacyLink).toHaveAttribute("href", publicBrandUrl("/privacy/"));
	});

	it("keeps Terms and Privacy links on the shared public brand origin when env changes", () => {
		vi.stubEnv("VITE_MARKETING_SITE_URL", "http://localhost:4321");

		render(<SignupPage />, { wrapper: createWrapper() });

		const termsLink = screen.getByRole("link", { name: /^Terms$/i });
		const privacyLink = screen.getByRole("link", { name: /privacy policy/i });

		expect(termsLink).toHaveAttribute("href", publicBrandUrl("/terms/"));
		expect(privacyLink).toHaveAttribute("href", publicBrandUrl("/privacy/"));
	});

	it("renders Terms and Privacy links with production domain when env var is the prod URL", () => {
		vi.stubEnv("VITE_MARKETING_SITE_URL", "https://pebbledesk.app");

		render(<SignupPage />, { wrapper: createWrapper() });

		const termsLink = screen.getByRole("link", { name: /^Terms$/i });
		const privacyLink = screen.getByRole("link", { name: /privacy policy/i });

		expect(termsLink).toHaveAttribute("href", publicBrandUrl("/terms/"));
		expect(privacyLink).toHaveAttribute("href", publicBrandUrl("/privacy/"));
	});
});
