import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { ANALYTICS_EVENTS } from "@pebbledesk/shared/constants";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { apiFetch } from "../api";
import { BrandMark } from "../components/brand-mark";
import { RecoveryState } from "../components/recovery-state";
import type { AuthStatus } from "../hooks/use-auth-status";
import { useAuthStatus } from "../hooks/use-auth-status";
import { track } from "../lib/analytics";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { extractErrorMessage } from "../lib/extract-error-message";
import { buildMarketingSearch, normalizeMarketingAttribution } from "../lib/marketing-attribution";
import { sanitizeRedirectPath } from "../lib/safe-redirect-path";

const loginSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
});

/**
 * Better Auth returns an error object with optional `status` and `message`
 * fields. Validate it permissively so the loose `as` casts are replaced with a
 * checked shape instead of trusting the SDK's runtime payload blindly.
 */
const authErrorSchema = z
	.object({
		// Tolerate absent/null/non-string fields from the SDK without discarding
		// the whole payload — fall back to undefined per field.
		status: z.number().optional().catch(undefined),
		message: z.string().optional().catch(undefined),
	})
	.passthrough();

function parseAuthError(error: unknown): { status?: number; message?: string } {
	const result = authErrorSchema.safeParse(error);
	return result.success ? result.data : {};
}

export function validateLoginSearch(search: Record<string, unknown>): { redirect?: string } {
	return {
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	};
}

export const Route = createFileRoute("/login")({
	validateSearch: validateLoginSearch,
	component: LoginRoutePage,
});

export function LoginRoutePage() {
	return <LoginPage redirect={Route.useSearch().redirect} />;
}

type LoginPageProps = {
	redirect?: string;
};

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));

type LoginField = "email" | "password";

type LoginRedirectTarget = "workspace" | "onboarding" | "centerSelection" | "inviteAcceptance";

function buildPathWithParams(pathname: string, params?: Record<string, string | undefined>) {
	const search = new URLSearchParams();

	for (const [key, value] of Object.entries(params ?? {})) {
		if (value) {
			search.set(key, value);
		}
	}

	const query = search.toString();
	return query ? `${pathname}?${query}` : pathname;
}

function buildLoginHref(redirect?: string) {
	const sanitizedRedirect = redirect ? sanitizeRedirectPath(redirect) : undefined;
	return buildPathWithParams("/login", { redirect: sanitizedRedirect });
}

function getRedirectAttribution(redirect?: string) {
	const sanitizedRedirect = redirect ? sanitizeRedirectPath(redirect) : undefined;
	if (!sanitizedRedirect) return {};
	const parsedRedirect = new URL(sanitizedRedirect, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
	return buildMarketingSearch(
		normalizeMarketingAttribution(Object.fromEntries(parsedRedirect.searchParams.entries())),
	);
}

function buildSignupHref(redirect?: string) {
	return buildPathWithParams("/signup", getRedirectAttribution(redirect));
}

function buildOnboardingHref(redirect?: string) {
	return buildPathWithParams("/onboarding", getRedirectAttribution(redirect));
}

function getOnboardingDestination(redirect?: string) {
	const sanitizedRedirect = sanitizeRedirectPath(redirect);
	return sanitizedRedirect.startsWith("/onboarding") ? sanitizedRedirect : "/onboarding";
}

function getPostLoginDestination(authStatus: AuthStatus, redirect?: string) {
	switch (authStatus.status) {
		case "authenticated":
			return sanitizeRedirectPath(redirect);
		case "invite_pending":
			return buildOnboardingHref(redirect);
		case "onboarding_required":
			return getOnboardingDestination(redirect);
		case "center_selection_required":
			return "/overview";
		case "unauthenticated":
			return null;
	}
}

function getRedirectTarget(authStatus: Exclude<AuthStatus, { status: "unauthenticated" }>) {
	switch (authStatus.status) {
		case "authenticated":
			return "workspace";
		case "invite_pending":
			return "inviteAcceptance";
		case "onboarding_required":
			return "onboarding";
		case "center_selection_required":
			return "centerSelection";
	}
}

export function LoginPage({ redirect }: LoginPageProps = {}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: authStatus,
		error: authStatusError,
		isLoading: authStatusLoading,
	} = useAuthStatus();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});
	const [loading, setLoading] = useState(false);
	const [googleLoading, setGoogleLoading] = useState(false);
	const [redirectFailure, setRedirectFailure] = useState<LoginRedirectTarget | null>(null);
	const navigatedRef = useRef(false);
	const submittingRef = useRef(false);
	const loginHref = buildLoginHref(redirect);
	const signupHref = buildSignupHref(redirect);
	const onboardingHref = buildOnboardingHref(redirect);
	const retryDestination = sanitizeRedirectPath(redirect);

	async function fetchFreshAuthStatus() {
		await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
		return queryClient.fetchQuery<AuthStatus>({
			queryKey: ["authStatus"],
			staleTime: 0,
			queryFn: async () => {
				const res = await apiFetch("/api/auth/status");
				if (!res.ok) {
					throw new Error("Failed to fetch auth status");
				}

				return (await res.json()) as AuthStatus;
			},
		});
	}

	useEffect(() => {
		if (!authStatus || redirectFailure) {
			return;
		}

		if (navigatedRef.current) return;

		if (
			authStatus.status === "authenticated" ||
			authStatus.status === "center_selection_required" ||
			authStatus.status === "onboarding_required" ||
			authStatus.status === "invite_pending"
		) {
			setRedirectFailure(null);
			navigatedRef.current = true;
			const to = getPostLoginDestination(authStatus, redirect) ?? "/dashboard";
			void Promise.resolve(navigate({ to })).catch(() => {
				navigatedRef.current = false;
				setRedirectFailure(getRedirectTarget(authStatus));
			});
		}
	}, [authStatus, navigate, redirect, redirectFailure]);

	if (authStatusError) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
				<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-sm">
					<h1 className="text-2xl font-bold text-foreground">We couldn't verify your session</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						Try loading sign-in again. If this keeps happening, return to the product and retry from
						there.
					</p>
					<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
						<Button asChild>
							<a href={loginHref}>Try again</a>
						</Button>
						<Button asChild variant="outline">
							<a href={retryDestination}>Back to PebbleDesk</a>
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (
		(authStatus?.status === "authenticated" ||
			authStatus?.status === "center_selection_required" ||
			authStatus?.status === "onboarding_required" ||
			authStatus?.status === "invite_pending") &&
		redirectFailure
	) {
		const recovery =
			redirectFailure === "centerSelection"
				? {
						title: "Choose your center",
						description: "Select the center you want to open before continuing.",
						primaryHref: "/overview",
						primaryLabel: "Choose a center",
					}
				: redirectFailure === "onboarding" || redirectFailure === "inviteAcceptance"
					? {
							title: "Continue onboarding",
							description: "Your account is ready. Reopen onboarding to finish the next step.",
							primaryHref: onboardingHref,
							primaryLabel: "Continue onboarding",
						}
					: {
							title: "We couldn't reopen your workspace",
							description:
								"Your account is signed in, but the workspace route did not finish loading.",
							primaryHref: retryDestination,
							primaryLabel: "Open workspace",
						};

		return (
			<RecoveryState
				fullPage
				title={recovery.title}
				description={recovery.description}
				primaryHref={recovery.primaryHref}
				primaryLabel={recovery.primaryLabel}
				secondaryHref={loginHref}
				secondaryLabel="Return to sign in"
			/>
		);
	}

	if (
		authStatus?.status === "authenticated" ||
		authStatus?.status === "center_selection_required" ||
		authStatus?.status === "onboarding_required" ||
		authStatus?.status === "invite_pending"
	) {
		return null;
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (submittingRef.current) return;
		const validation = loginSchema.safeParse({ email, password });
		if (!validation.success) {
			const nextErrors: Partial<Record<LoginField, string>> = {};
			for (const issue of validation.error.issues) {
				const field = issue.path[0];
				if (
					typeof field === "string" &&
					(field === "email" || field === "password") &&
					!nextErrors[field]
				) {
					nextErrors[field] = issue.message;
				}
			}
			setFieldErrors(nextErrors);
			setError(null);
			track(ANALYTICS_EVENTS.loginStarted, { method: "email", validation_status: "failed" });
			return;
		}
		submittingRef.current = true;
		setError(null);
		setFieldErrors({});
		setLoading(true);
		track(ANALYTICS_EVENTS.loginStarted, { method: "email" });
		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				const parsedError = parseAuthError(result.error);
				setError(
					parsedError.status === 429
						? "Too many sign-in attempts. Please wait a moment and try again."
						: extractErrorMessage(
								result.error instanceof Error ? result.error : new Error(parsedError.message ?? ""),
							),
				);
			} else {
				track(ANALYTICS_EVENTS.loginCompleted, { method: "email" });
				const refreshedAuthStatus = await fetchFreshAuthStatus();

				if (refreshedAuthStatus.status === "unauthenticated") {
					setError("We signed you in, but couldn't confirm the session. Please try again.");
					return;
				}

				const to = getPostLoginDestination(refreshedAuthStatus, redirect) ?? "/dashboard";
				setRedirectFailure(null);
				navigatedRef.current = true;
				await Promise.resolve(navigate({ to })).catch(() => {
					navigatedRef.current = false;
					setRedirectFailure(getRedirectTarget(refreshedAuthStatus));
					track(ANALYTICS_EVENTS.authRedirectFailed, {
						target: getRedirectTarget(refreshedAuthStatus),
					});
				});
			}
		} catch (err) {
			setError(extractErrorMessage(err, "An error occurred"));
		} finally {
			setLoading(false);
			submittingRef.current = false;
		}
	}

	async function handleGoogleSignIn() {
		if (submittingRef.current) return;
		submittingRef.current = true;
		setError(null);
		setGoogleLoading(true);
		track(ANALYTICS_EVENTS.googleLoginStarted);
		try {
			await authClient.signIn.social({ provider: "google" });
		} catch (err) {
			setError(extractErrorMessage(err, "Google sign-in failed"));
			track(ANALYTICS_EVENTS.authRedirectFailed, { target: "google_login" });
		} finally {
			setGoogleLoading(false);
			submittingRef.current = false;
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
				<div className="mb-8 text-center">
					<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
					<h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{authStatusLoading ? "Checking your session..." : "Sign in to PebbleDesk"}
					</p>
				</div>

				<form onSubmit={handleSubmit} noValidate className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							required
							autoComplete="email"
							value={email}
							aria-invalid={Boolean(fieldErrors.email)}
							aria-describedby={fieldErrors.email ? "email-error" : undefined}
							onChange={(e) => {
								setEmail(e.target.value);
								setFieldErrors((current) => ({ ...current, email: undefined }));
							}}
							placeholder="you@example.com"
							disabled={loading || googleLoading || authStatusLoading}
						/>
						{fieldErrors.email && (
							<p id="email-error" role="alert" className="text-sm text-destructive">
								{fieldErrors.email}
							</p>
						)}
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="password">Password</Label>
							<Link
								to="/forgot-password"
								className="text-xs font-medium text-primary hover:underline"
							>
								Forgot password?
							</Link>
						</div>
						<Input
							id="password"
							type="password"
							required
							autoComplete="current-password"
							value={password}
							aria-invalid={Boolean(fieldErrors.password)}
							aria-describedby={fieldErrors.password ? "password-error" : undefined}
							onChange={(e) => {
								setPassword(e.target.value);
								setFieldErrors((current) => ({ ...current, password: undefined }));
							}}
							placeholder="Enter your password"
							disabled={loading || googleLoading || authStatusLoading}
						/>
						{fieldErrors.password && (
							<p id="password-error" role="alert" className="text-sm text-destructive">
								{fieldErrors.password}
							</p>
						)}
					</div>

					{error && (
						<p
							role="alert"
							aria-live="polite"
							className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
						>
							{error}
						</p>
					)}

					<Button
						type="submit"
						className="w-full"
						disabled={loading || googleLoading || authStatusLoading}
					>
						{loading ? "Signing in..." : authStatusLoading ? "Checking session..." : "Sign in"}
					</Button>
				</form>

				<div className="relative my-6">
					<div className="absolute inset-0 flex items-center">
						<div className="w-full border-t border-border" />
					</div>
					<div className="relative flex justify-center text-xs">
						<span className="bg-background px-2 text-muted-foreground">or</span>
					</div>
				</div>

				<Button
					type="button"
					variant="outline"
					className="w-full"
					disabled={authStatusLoading || googleLoading || loading}
					onClick={handleGoogleSignIn}
				>
					{googleLoading ? "Starting Google sign-in..." : "Continue with Google"}
				</Button>

				<p className="mt-6 text-center text-sm text-muted-foreground">
					Don't have an account?{" "}
					<Link to={signupHref} className="font-medium text-primary hover:underline">
						Sign up
					</Link>
				</p>
			</div>
		</div>
	);
}
