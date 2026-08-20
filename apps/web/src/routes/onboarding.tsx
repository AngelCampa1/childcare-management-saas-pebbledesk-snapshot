import {
	ANALYTICS_EVENTS,
	CENTER_TIMEZONE_OPTIONS,
	DEFAULT_CENTER_TIMEZONE,
	isSupportedCenterTimezone,
} from "@pebbledesk/shared/constants";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../api";
import { BrandMark } from "../components/brand-mark";
import { EmailConfirmationReminder } from "../components/email-confirmation-reminder";
import { PendingInvitationCard } from "../components/pending-invitation-card";
import type { PendingInvitation } from "../hooks/use-auth-session";
import { useAuthStatus } from "../hooks/use-auth-status";
import { track } from "../lib/analytics";
import { extractErrorMessage } from "../lib/extract-error-message";
import {
	getSelectedPlanLabel,
	type MarketingAttribution,
	normalizeMarketingAttribution,
} from "../lib/marketing-attribution";

export const Route = createFileRoute("/onboarding")({
	validateSearch: normalizeMarketingAttribution,
	component: OnboardingRoutePage,
});

function OnboardingRoutePage() {
	return <OnboardingPage attribution={Route.useSearch()} />;
}

type OnboardingPageProps = {
	attribution?: MarketingAttribution;
};

type OnboardingErrorState = {
	message: string;
	requiresAuth: boolean;
};

const ONBOARDING_ERROR_IDS = {
	name: "name-error",
	address: "address-error",
	city: "city-error",
	state: "state-error",
	zip: "zip-error",
	phone: "phone-error",
} as const;

type OnboardingRequiredField = keyof typeof ONBOARDING_ERROR_IDS;
type OnboardingFieldErrors = Partial<Record<OnboardingRequiredField, string>>;

const ONBOARDING_REQUIRED_FIELDS = [
	{ key: "name", message: "Center name is required" },
	{ key: "address", message: "Street address is required" },
	{ key: "city", message: "City is required" },
	{ key: "state", message: "State is required" },
	{ key: "zip", message: "ZIP code is required" },
	{ key: "phone", message: "Phone is required" },
] as const satisfies ReadonlyArray<{ key: OnboardingRequiredField; message: string }>;

type OnboardingRecoveryStateProps = {
	title: string;
	description: string;
	primaryHref?: string;
	primaryLabel?: string;
	secondaryHref?: string;
	secondaryLabel?: string;
};

function OnboardingRecoveryState({
	title,
	description,
	primaryHref,
	primaryLabel,
	secondaryHref,
	secondaryLabel,
}: OnboardingRecoveryStateProps) {
	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-lg rounded-xl border border-border bg-background p-8 text-center shadow-sm">
				<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
				<h1 className="text-2xl font-bold text-foreground">{title}</h1>
				<p className="mt-2 text-sm text-muted-foreground">{description}</p>
				{primaryHref && primaryLabel ? (
					<div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
						<Button asChild>
							<a href={primaryHref}>{primaryLabel}</a>
						</Button>
						{secondaryHref && secondaryLabel ? (
							<Button asChild variant="outline">
								<a href={secondaryHref}>{secondaryLabel}</a>
							</Button>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}

function getInitialTimezone() {
	try {
		const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (browserTimezone && isSupportedCenterTimezone(browserTimezone)) {
			return browserTimezone;
		}
	} catch {
		// Fallback is intentionally visible in the form.
	}

	return DEFAULT_CENTER_TIMEZONE;
}

export function OnboardingPage({ attribution = {} }: OnboardingPageProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const {
		data: authStatus,
		error: authStatusError,
		isLoading: authStatusLoading,
	} = useAuthStatus();
	const selectedPlan = getSelectedPlanLabel(attribution.plan);
	const [form, setForm] = useState({
		name: "",
		address: "",
		city: "",
		state: "",
		zip: "",
		phone: "",
		timezone: getInitialTimezone(),
	});
	const [error, setError] = useState<OnboardingErrorState | null>(null);
	const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({});
	const [pendingInvitation, setPendingInvitation] = useState<PendingInvitation | null>(null);
	const [loading, setLoading] = useState(false);
	const submittingRef = useRef(false);
	const [showSalesInterstitial, setShowSalesInterstitial] = useState(false);
	const activePendingInvitation =
		pendingInvitation ?? (authStatus?.status === "invite_pending" ? authStatus.invitation : null);
	const isSelfServePlan =
		attribution.plan === "home" ||
		attribution.plan === "center_starter" ||
		attribution.plan === "center_pro" ||
		attribution.plan === "group";

	useEffect(() => {
		track(ANALYTICS_EVENTS.onboardingStarted, {
			plan: attribution.plan,
			billing: attribution.billing,
			self_serve: isSelfServePlan,
		});
	}, [attribution.billing, attribution.plan, isSelfServePlan]);

	useEffect(() => {
		if (authStatus?.status === "authenticated" && !showSalesInterstitial) {
			void navigate({ to: "/dashboard", replace: true });
		}
	}, [authStatus, navigate, showSalesInterstitial]);

	if (authStatus?.status === "authenticated") {
		return null;
	}

	if (authStatusLoading) {
		return (
			<OnboardingRecoveryState
				title="Checking your session..."
				description="We are checking that you are signed in before opening center setup."
			/>
		);
	}

	if (authStatusError) {
		return (
			<OnboardingRecoveryState
				title="We couldn't verify your session"
				description="Refresh this page. If that does not work, sign in again and we will bring you back here."
				primaryHref="/onboarding"
				primaryLabel="Try again"
				secondaryHref="/login"
				secondaryLabel="Return to sign in"
			/>
		);
	}

	if (authStatus?.status === "unauthenticated") {
		return (
			<OnboardingRecoveryState
				title="Sign in required"
				description="Sign in first so we can save this center to your PebbleDesk account."
				primaryHref="/login"
				primaryLabel="Return to sign in"
				secondaryHref="/signup"
				secondaryLabel="Create account"
			/>
		);
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const { name, value } = e.target;
		setForm((prev) => ({
			...prev,
			[name]: name === "state" ? value.toUpperCase().slice(0, 2) : value,
		}));
		if (name in ONBOARDING_ERROR_IDS) {
			const field = name as OnboardingRequiredField;
			setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
		}
	}

	function handleTimezoneChange(timezone: string) {
		setForm((prev) => ({
			...prev,
			timezone: isSupportedCenterTimezone(timezone) ? timezone : DEFAULT_CENTER_TIMEZONE,
		}));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (submittingRef.current) return;
		const nextFieldErrors: OnboardingFieldErrors = {};
		for (const field of ONBOARDING_REQUIRED_FIELDS) {
			if (!form[field.key].trim()) {
				nextFieldErrors[field.key] = field.message;
			}
		}
		if (Object.keys(nextFieldErrors).length > 0) {
			setFieldErrors(nextFieldErrors);
			setError(null);
			track(ANALYTICS_EVENTS.signupValidationFailed, {
				stage: "onboarding",
				field_count: Object.keys(nextFieldErrors).length,
				plan: attribution.plan,
			});
			return;
		}
		submittingRef.current = true;
		setFieldErrors({});
		setError(null);
		setLoading(true);
		try {
			const centerPayload = isSelfServePlan
				? { ...form, subscriptionPlan: attribution.plan }
				: form;

			await apiFetch("/api/centers", {
				method: "POST",
				body: JSON.stringify(centerPayload),
			});

			if (isSelfServePlan) {
				track(ANALYTICS_EVENTS.onboardingCompleted, {
					plan: attribution.plan,
					self_serve: true,
				});
				queryClient.setQueryData(["authStatus"], { status: "authenticated" });
				await queryClient.invalidateQueries({ queryKey: ["authSession"] });
				await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
				await navigate({ to: "/dashboard", replace: true });
				return;
			}

			setShowSalesInterstitial(true);
			track(ANALYTICS_EVENTS.enterpriseDiscoveryClicked, { source: "onboarding" });
			track(ANALYTICS_EVENTS.onboardingCompleted, {
				plan: attribution.plan,
				self_serve: false,
			});
			queryClient.setQueryData(["authStatus"], { status: "authenticated" });
			await queryClient.invalidateQueries({ queryKey: ["authSession"] });
			await queryClient.invalidateQueries({ queryKey: ["authStatus"] });
		} catch (err) {
			if (err instanceof ApiError) {
				if (err.status === 401) {
					setError({
						message: "Your session has ended. Sign in again to finish setting up your center.",
						requiresAuth: true,
					});
					return;
				}
				if (err.status === 403) {
					const data = err.body as {
						code?: string;
						invitation?: PendingInvitation;
					};
					if (data.code === "invite_pending" && data.invitation) {
						setPendingInvitation(data.invitation);
						return;
					}
				}
				setError({
					message: err.message,
					requiresAuth: false,
				});
				return;
			}
			setError({
				message: extractErrorMessage(err, "An error occurred"),
				requiresAuth: false,
			});
		} finally {
			setLoading(false);
			submittingRef.current = false;
		}
	}

	if (activePendingInvitation) {
		return <PendingInvitationCard invitation={activePendingInvitation} />;
	}

	if (showSalesInterstitial) {
		return (
			<OnboardingRecoveryState
				title="Let's talk about your rollout"
				description="Multi-site rollouts are custom-priced. Book a 30-minute discovery call with our team to finish setup."
				primaryHref="https://cal.com/pebbledesk/discovery"
				primaryLabel="Book discovery call"
				secondaryHref="/dashboard"
				secondaryLabel="Skip — choose a plan later"
			/>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-lg rounded-xl border border-border bg-background p-8 shadow-sm">
				<div className="mb-8 text-center">
					<h1 className="text-2xl font-bold text-foreground">Set up your center</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{selectedPlan ? `${selectedPlan} plan selected. ` : ""}
						Tell us about your childcare center
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Add the basic details families and reports will use.
					</p>
				</div>

				<section className="mb-6 rounded-lg border border-border bg-muted/40 p-4">
					<h2 className="text-sm font-semibold text-foreground">What you will need</h2>
					<ul className="mt-3 space-y-2 text-sm text-muted-foreground">
						<li>Center name exactly as you want it shown in PebbleDesk.</li>
						<li>Street address, city, state, ZIP code, and phone number.</li>
						<li>The timezone your staff use for attendance and schedules.</li>
					</ul>
				</section>

				<EmailConfirmationReminder
					className="mb-6"
					email={authStatus?.email}
					emailVerified={authStatus?.emailVerified}
				/>

				<form onSubmit={handleSubmit} className="space-y-4" noValidate>
					<div className="space-y-2">
						<Label htmlFor="name">Center name</Label>
						<Input
							id="name"
							name="name"
							type="text"
							required
							value={form.name}
							onChange={handleChange}
							placeholder="Sunny Days Child Care"
							aria-invalid={Boolean(fieldErrors.name)}
							aria-describedby={fieldErrors.name ? ONBOARDING_ERROR_IDS.name : undefined}
							disabled={loading}
						/>
						{fieldErrors.name ? (
							<p id={ONBOARDING_ERROR_IDS.name} role="alert" className="text-sm text-destructive">
								{fieldErrors.name}
							</p>
						) : null}
					</div>

					<div className="space-y-2">
						<Label htmlFor="address">Street address</Label>
						<Input
							id="address"
							name="address"
							type="text"
							required
							value={form.address}
							onChange={handleChange}
							placeholder="123 Main St"
							aria-invalid={Boolean(fieldErrors.address)}
							aria-describedby={fieldErrors.address ? ONBOARDING_ERROR_IDS.address : undefined}
							disabled={loading}
						/>
						{fieldErrors.address ? (
							<p
								id={ONBOARDING_ERROR_IDS.address}
								role="alert"
								className="text-sm text-destructive"
							>
								{fieldErrors.address}
							</p>
						) : null}
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="city">City</Label>
							<Input
								id="city"
								name="city"
								type="text"
								required
								value={form.city}
								onChange={handleChange}
								placeholder="Springfield"
								aria-invalid={Boolean(fieldErrors.city)}
								aria-describedby={fieldErrors.city ? ONBOARDING_ERROR_IDS.city : undefined}
								disabled={loading}
							/>
							{fieldErrors.city ? (
								<p id={ONBOARDING_ERROR_IDS.city} role="alert" className="text-sm text-destructive">
									{fieldErrors.city}
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="state">State</Label>
							<Input
								id="state"
								name="state"
								type="text"
								required
								maxLength={2}
								value={form.state}
								onChange={handleChange}
								className="uppercase"
								placeholder="IL"
								aria-invalid={Boolean(fieldErrors.state)}
								aria-describedby={fieldErrors.state ? ONBOARDING_ERROR_IDS.state : undefined}
								disabled={loading}
							/>
							{fieldErrors.state ? (
								<p
									id={ONBOARDING_ERROR_IDS.state}
									role="alert"
									className="text-sm text-destructive"
								>
									{fieldErrors.state}
								</p>
							) : null}
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="zip">ZIP code</Label>
							<Input
								id="zip"
								name="zip"
								type="text"
								required
								value={form.zip}
								onChange={handleChange}
								placeholder="62701"
								aria-invalid={Boolean(fieldErrors.zip)}
								aria-describedby={fieldErrors.zip ? ONBOARDING_ERROR_IDS.zip : undefined}
								disabled={loading}
							/>
							{fieldErrors.zip ? (
								<p id={ONBOARDING_ERROR_IDS.zip} role="alert" className="text-sm text-destructive">
									{fieldErrors.zip}
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="phone">Phone</Label>
							<Input
								id="phone"
								name="phone"
								type="tel"
								required
								value={form.phone}
								onChange={handleChange}
								placeholder="(217) 555-0100"
								aria-invalid={Boolean(fieldErrors.phone)}
								aria-describedby={fieldErrors.phone ? ONBOARDING_ERROR_IDS.phone : undefined}
								disabled={loading}
							/>
							{fieldErrors.phone ? (
								<p
									id={ONBOARDING_ERROR_IDS.phone}
									role="alert"
									className="text-sm text-destructive"
								>
									{fieldErrors.phone}
								</p>
							) : null}
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="timezone">Timezone</Label>
						<Select value={form.timezone} onValueChange={handleTimezoneChange}>
							<SelectTrigger id="timezone">
								<SelectValue placeholder="Select a timezone" />
							</SelectTrigger>
							<SelectContent>
								{CENTER_TIMEZONE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							This keeps attendance, schedules, and billing dates on your local time.
						</p>
					</div>

					{error && (
						<div
							aria-live="polite"
							className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2"
						>
							<p className="text-sm text-destructive">{error.message}</p>
							{error.requiresAuth ? (
								<a
									href="/login"
									className="inline-flex text-sm font-medium text-destructive underline underline-offset-2"
								>
									Return to sign in
								</a>
							) : null}
						</div>
					)}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading
							? "Creating center..."
							: isSelfServePlan
								? "Start free trial"
								: "Continue to dashboard"}
					</Button>
				</form>
			</div>
		</div>
	);
}
