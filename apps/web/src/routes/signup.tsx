import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { ANALYTICS_EVENTS, PEBBLEDESK_OFFERING } from "@pebbledesk/shared/constants";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { BrandMark } from "../components/brand-mark";
import { EmailConfirmationReminder } from "../components/email-confirmation-reminder";
import { PasswordStrengthMeter } from "../components/password-strength-meter";
import { RecoveryState } from "../components/recovery-state";
import { useAuthStatus } from "../hooks/use-auth-status";
import { track } from "../lib/analytics";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { extractErrorMessage } from "../lib/extract-error-message";
import {
	buildMarketingSearch,
	type MarketingAttribution,
	normalizeMarketingAttribution,
} from "../lib/marketing-attribution";
import { zxcvbn } from "../lib/zxcvbn-init";

const MARKETING_SITE_ORIGIN =
	import.meta.env.VITE_MARKETING_SITE_URL || PUBLIC_BRAND_KNOWLEDGE.publicOrigin;

// Reuse the inferred fields from the canonical auth-status schema instead of
// hand-rolled `as` casts, so these guards stay aligned with the backend shape.
const emailFieldSchema = z.object({ email: z.string() }).passthrough();
const emailVerifiedFieldSchema = z.object({ emailVerified: z.boolean() }).passthrough();

export function authStatusHasEmail(s: unknown): s is { email: string } {
	return emailFieldSchema.safeParse(s).success;
}

export function authStatusHasEmailVerified(s: unknown): s is { emailVerified: boolean } {
	return emailVerifiedFieldSchema.safeParse(s).success;
}

const signupSchema = z.object({
	name: z.string().min(1, "Full name is required").max(200),
	email: z.string().email("Please enter a valid email address"),
	password: z
		.string()
		.min(8, "Password must be at least 8 characters")
		.refine((pw) => zxcvbn(pw).score >= 2, { message: "Pick a stronger password" }),
});

export const Route = createFileRoute("/signup")({
	validateSearch: normalizeMarketingAttribution,
	component: SignupRoutePage,
});

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));
const trialLabel = PEBBLEDESK_OFFERING.trial.label;

type SignupField = "name" | "email" | "password";

export function SignupRoutePage() {
	return <SignupPage attribution={Route.useSearch()} />;
}

type SignupPageProps = {
	attribution?: MarketingAttribution;
};

type SignupRedirectTarget = "dashboard" | "onboarding" | "centerSelection";

function buildPathWithParams(pathname: string, params: Record<string, string>) {
	const search = new URLSearchParams(params);
	const query = search.toString();
	return query ? `${pathname}?${query}` : pathname;
}

const workflowCards = [
	{
		eyebrow: "1. Capture the day",
		title: "Attendance, room changes, and staff coverage — in one record.",
		body: "Directors see who is present, where children are assigned, and whether every room is staffed while the day is still happening.",
	},
	{
		eyebrow: "2. Keep context attached",
		title: "Child, guardian, subsidy, and billing details stay with the record.",
		body: "When a question comes up, you are not hunting through separate systems to confirm what matters.",
	},
	{
		eyebrow: "3. Turn records into proof",
		title: "Invoices, subsidy claims, and audit exports trace back to the daily record.",
		body: "The same information that runs the day supports the claim, invoice, and licensing question later.",
	},
];

const replacesPills = ["Sign-in clipboard", "Ratio spreadsheet", "Subsidy binder", "Email folder"];

export function SignupPage({ attribution = {} }: SignupPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: authStatus,
		error: authStatusError,
		isLoading: authStatusLoading,
	} = useAuthStatus();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupField, string>>>({});
	const [loading, setLoading] = useState(false);
	const [redirectFailure, setRedirectFailure] = useState<SignupRedirectTarget | null>(null);
	const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState<string | null>(null);
	const onboardingSearch = buildMarketingSearch(attribution);
	const signupHref = buildPathWithParams("/signup", onboardingSearch);
	const loginHref = `/login?redirect=${encodeURIComponent(signupHref)}`;
	const onboardingRedirectHandledRef = useRef(false);
	const navigatedRef = useRef(false);
	const submittingRef = useRef(false);

	const navigateToOnboarding = useCallback(async () => {
		await navigate({
			to: "/onboarding",
			replace: true,
			search: (previousSearch) => ({
				...previousSearch,
				...onboardingSearch,
			}),
		});
	}, [navigate, onboardingSearch]);

	useEffect(() => {
		if (redirectFailure) {
			return;
		}

		if (authStatus?.status === "authenticated") {
			if (navigatedRef.current) return;
			setRedirectFailure(null);
			navigatedRef.current = true;
			void navigate({ to: "/dashboard" }).catch(() => {
				navigatedRef.current = false;
				setRedirectFailure("dashboard");
			});
			return;
		}

		if (authStatus?.status === "onboarding_required" || authStatus?.status === "invite_pending") {
			if (onboardingRedirectHandledRef.current) {
				return;
			}
			onboardingRedirectHandledRef.current = true;
			void navigateToOnboarding().catch(() => {
				onboardingRedirectHandledRef.current = false;
				setRedirectFailure("onboarding");
			});
			return;
		}

		if (authStatus?.status === "center_selection_required") {
			if (navigatedRef.current) return;
			setRedirectFailure(null);
			navigatedRef.current = true;
			void navigate({ to: "/overview", replace: true }).catch(() => {
				navigatedRef.current = false;
				setRedirectFailure("centerSelection");
			});
		}
	}, [authStatus, navigate, navigateToOnboarding, redirectFailure]);

	if (redirectFailure) {
		const recovery =
			redirectFailure === "centerSelection"
				? {
						title: "Choose your center",
						description: "Select the center you want to open before continuing.",
						primaryHref: "/overview",
						primaryLabel: "Choose a center",
					}
				: redirectFailure === "onboarding"
					? {
							title: "Continue onboarding",
							description:
								"Your account is ready. Reopen onboarding to finish setting up your center.",
							primaryHref: buildPathWithParams("/onboarding", onboardingSearch),
							primaryLabel: "Continue onboarding",
						}
					: {
							title: "We couldn't reopen your workspace",
							description:
								"Your account is signed in, but the workspace route did not finish loading.",
							primaryHref: "/dashboard",
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
			>
				<EmailConfirmationReminder
					className="mt-6 text-left"
					email={
						(authStatusHasEmail(authStatus) ? authStatus.email : undefined) ??
						pendingConfirmationEmail ??
						undefined
					}
					emailVerified={
						authStatusHasEmailVerified(authStatus)
							? authStatus.emailVerified
							: pendingConfirmationEmail
								? false
								: undefined
					}
				/>
			</RecoveryState>
		);
	}

	if (
		authStatus?.status === "authenticated" ||
		authStatus?.status === "onboarding_required" ||
		authStatus?.status === "invite_pending" ||
		authStatus?.status === "center_selection_required"
	) {
		return null;
	}

	if (authStatusError) {
		return (
			<RecoveryState
				fullPage
				title="We couldn't verify your session"
				description="Try loading signup again. If this keeps happening, return to sign in before creating a new account."
				primaryHref={signupHref}
				primaryLabel="Try again"
				secondaryHref={loginHref}
				secondaryLabel="Return to sign in"
			/>
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (submittingRef.current) return;
		const validation = signupSchema.safeParse({ name, email, password });
		if (!validation.success) {
			const nextErrors: Partial<Record<SignupField, string>> = {};
			for (const issue of validation.error.issues) {
				const field = issue.path[0];
				if (
					typeof field === "string" &&
					(field === "name" || field === "email" || field === "password") &&
					!nextErrors[field]
				) {
					nextErrors[field] = issue.message;
				}
			}
			setFieldErrors(nextErrors);
			setError(null);
			track(ANALYTICS_EVENTS.signupValidationFailed, {
				reason: validation.error.issues[0]?.code ?? "invalid_input",
				plan: attribution.plan,
			});
			return;
		}
		submittingRef.current = true;
		setError(null);
		setFieldErrors({});
		setLoading(true);
		track(ANALYTICS_EVENTS.signupStarted, { plan: attribution.plan, billing: attribution.billing });
		try {
			const result = await authClient.signUp.email({ name, email, password });
			if (result.error) {
				const status = (result.error as { status?: number }).status;
				setError(
					status === 429
						? "Too many sign-up attempts. Please wait a moment and try again."
						: (result.error.message ?? "Something went wrong. Please try again."),
				);
				track(ANALYTICS_EVENTS.signupValidationFailed, {
					reason: status === 429 ? "rate_limited" : "auth_error",
					plan: attribution.plan,
				});
			} else {
				track(ANALYTICS_EVENTS.signupCompleted, { method: "email", plan: attribution.plan });
				setPendingConfirmationEmail(email);
				onboardingRedirectHandledRef.current = true;
				navigatedRef.current = true;
				await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
				await navigateToOnboarding().catch(() => {
					navigatedRef.current = false;
					onboardingRedirectHandledRef.current = false;
					setRedirectFailure("onboarding");
					track(ANALYTICS_EVENTS.authRedirectFailed, { target: "onboarding", source: "signup" });
				});
			}
		} catch (err) {
			setError(extractErrorMessage(err, "An error occurred"));
			track(ANALYTICS_EVENTS.signupValidationFailed, {
				reason: "exception",
				plan: attribution.plan,
			});
		} finally {
			setLoading(false);
			submittingRef.current = false;
		}
	}

	return (
		<div className="flex min-h-screen">
			{/* Left pane — value prop, hidden on mobile */}
			<div className="hidden lg:flex lg:w-[55%] flex-col bg-foreground px-12 py-10 text-background">
				<BrandMark className="mb-10" wordmarkClassName="text-background" />

				<p className="text-xs font-semibold uppercase tracking-widest text-background/50 mb-4">
					Audit-ready childcare platform
				</p>

				<h2 className="text-3xl font-bold leading-tight text-background mb-3">
					Audit-ready records without the end-of-week scramble.
				</h2>
				<p className="text-base text-background/70 mb-10">
					Attendance, ratios, billing, family records, and audit exports in one childcare workflow.
				</p>

				<div className="grid grid-cols-1 gap-4 mb-10">
					{workflowCards.map((card) => (
						<div
							key={card.eyebrow}
							className="rounded-lg border border-background/10 bg-background/5 p-5"
						>
							<p className="text-xs font-semibold uppercase tracking-widest text-background/40 mb-1">
								{card.eyebrow}
							</p>
							<p className="font-semibold text-background mb-1">{card.title}</p>
							<p className="text-sm text-background/60">{card.body}</p>
						</div>
					))}
				</div>

				<div>
					<p className="text-xs font-semibold uppercase tracking-widest text-background/40 mb-3">
						Replaces
					</p>
					<div className="flex flex-wrap gap-2">
						{replacesPills.map((label) => (
							<span
								key={label}
								className="rounded-full border border-background/20 bg-background/10 px-3 py-1 text-xs text-background/70"
							>
								{label}
							</span>
						))}
					</div>
				</div>
			</div>

			{/* Right pane — sticky form */}
			<div className="flex flex-1 items-center justify-center bg-muted/40 p-6">
				<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
					{/* Mobile brand mark */}
					<div className="mb-6 lg:hidden">
						<BrandMark className="justify-center" wordmarkClassName="text-foreground" />
					</div>

					<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">
						Start your {trialLabel}.
					</p>
					<h1 className="text-2xl font-bold text-foreground mb-1">
						Create your PebbleDesk account.
					</h1>
					<p className="text-sm text-muted-foreground mb-6">
						{PEBBLEDESK_OFFERING.trial.days} days free. No credit card required. Cancel anytime.
					</p>

					<form onSubmit={handleSubmit} noValidate className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Full name</Label>
							<Input
								id="name"
								type="text"
								required
								autoComplete="name"
								value={name}
								aria-invalid={Boolean(fieldErrors.name)}
								aria-describedby={fieldErrors.name ? "name-error" : undefined}
								onChange={(e) => {
									setName(e.target.value);
									setFieldErrors((current) => ({ ...current, name: undefined }));
								}}
								placeholder="Jane Smith"
								disabled={loading || authStatusLoading}
							/>
							{fieldErrors.name && (
								<p id="name-error" role="alert" className="text-sm text-destructive">
									{fieldErrors.name}
								</p>
							)}
						</div>

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
								disabled={loading || authStatusLoading}
							/>
							{fieldErrors.email && (
								<p id="email-error" role="alert" className="text-sm text-destructive">
									{fieldErrors.email}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								required
								minLength={8}
								autoComplete="new-password"
								value={password}
								aria-invalid={Boolean(fieldErrors.password)}
								aria-describedby={fieldErrors.password ? "password-error" : undefined}
								onChange={(e) => {
									setPassword(e.target.value);
									setFieldErrors((current) => ({ ...current, password: undefined }));
								}}
								placeholder="Min. 8 characters"
								disabled={loading || authStatusLoading}
							/>
							<PasswordStrengthMeter password={password} />
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

						<Button type="submit" className="w-full" disabled={loading || authStatusLoading}>
							{loading
								? "Creating account..."
								: authStatusLoading
									? "Checking session..."
									: "Create account"}
						</Button>
					</form>

					<p className="mt-3 text-center text-xs text-muted-foreground">
						Your data is encrypted. By creating an account, you agree to the{" "}
						<a
							href={`${MARKETING_SITE_ORIGIN}/terms/`}
							className="font-medium text-primary hover:underline"
						>
							Terms
						</a>{" "}
						and acknowledge the{" "}
						<a
							href={`${MARKETING_SITE_ORIGIN}/privacy/`}
							className="font-medium text-primary hover:underline"
						>
							Privacy Policy
						</a>
						.
					</p>

					<p className="mt-5 text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link to={loginHref} className="font-medium text-primary hover:underline">
							Sign in
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
