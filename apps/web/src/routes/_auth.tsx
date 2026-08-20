import {
	ANALYTICS_EVENTS,
	isServiceAllowedSubscriptionStatus,
	type Role,
	type SubscriptionStatus,
} from "@pebbledesk/shared";
import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { Sheet, SheetContent, SheetTitle } from "@pebbledesk/ui/components/sheet";
import { useQueryClient } from "@tanstack/react-query";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createFileRoute, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { AiCsWidget } from "../components/ai-cs-widget";
import { BrandMark } from "../components/brand-mark";
import { CrmFeedbackWidget } from "../components/crm-feedback-widget";
import { Header } from "../components/header";
import { PendingInvitationCard } from "../components/pending-invitation-card";
import { RecoveryState } from "../components/recovery-state";
import { Sidebar } from "../components/sidebar";
import { SubscriptionRequired } from "../components/subscription-required";
import { AuthSessionError, AuthVerificationError, useAuthSession } from "../hooks/use-auth-session";
import { useAuthStatus } from "../hooks/use-auth-status";
import { useRatios } from "../hooks/use-ratios";
import { useSubscriptionStatus } from "../hooks/use-subscription";
import { groupCenter, identifyAuthenticatedUser, resetAnalytics, track } from "../lib/analytics";
import { captureException } from "../lib/sentry";

const SUPPORT_MAILTO_HREF = `mailto:${PUBLIC_BRAND_KNOWLEDGE.supportEmail}`;

export function hasActiveSubscription(status: SubscriptionStatus | undefined): boolean {
	if (!status) {
		return false;
	}
	return isServiceAllowedSubscriptionStatus(status);
}

const CHECKOUT_POLL_MAX_ATTEMPTS = 30;

/**
 * Polling interval for the subscription status query during checkout.
 * Stops polling once Stripe has transitioned the subscription to an active
 * state allowed by the shared service-access policy, or after CHECKOUT_POLL_MAX_ATTEMPTS
 * attempts to avoid polling indefinitely on failed webhooks.
 * Returns 1000ms otherwise so the UI reflects the transition quickly.
 */
export function subscriptionPollingInterval(
	query: {
		state: { data?: { subscriptionStatus?: SubscriptionStatus } };
	},
	attemptCount: number,
): number | false {
	if (attemptCount >= CHECKOUT_POLL_MAX_ATTEMPTS) {
		return false;
	}
	const status = query.state.data?.subscriptionStatus;
	if (status && isServiceAllowedSubscriptionStatus(status)) {
		return false;
	}
	return 1000;
}

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	errorComponent: AuthRouteBoundary,
});

type HeaderRatioStatus = "ok" | "warning" | "violation" | "unknown";

function summarizeHeaderRatioStatus(
	hasVisibleShell: boolean,
	ratios:
		| Array<{ inCompliance: boolean; nearLimit: boolean; openViolationId?: string }>
		| undefined,
	isLoading: boolean,
): HeaderRatioStatus {
	if (!hasVisibleShell || isLoading || !ratios) {
		return "unknown";
	}

	if (ratios.some((ratio) => !ratio.inCompliance || Boolean(ratio.openViolationId))) {
		return "violation";
	}

	if (ratios.some((ratio) => ratio.nearLimit)) {
		return "warning";
	}

	return "ok";
}

function isOnboardingRequiredError(error: unknown): boolean {
	return (
		(error instanceof AuthSessionError && error.code === "onboarding_required") ||
		(typeof error === "object" &&
			error !== null &&
			"code" in error &&
			(error as { code?: unknown }).code === "onboarding_required")
	);
}

function getInvitePendingError(error: unknown): AuthSessionError | null {
	if (error instanceof AuthSessionError && error.code === "invite_pending" && error.invitation) {
		return error;
	}

	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "invite_pending" &&
		"invitation" in error
	) {
		return error as AuthSessionError;
	}

	return null;
}

function isAuthVerificationError(error: unknown): boolean {
	return (
		error instanceof AuthVerificationError ||
		(typeof error === "object" &&
			error !== null &&
			"name" in error &&
			(error as { name?: unknown }).name === "AuthVerificationError")
	);
}

const NO_REDIRECT_PATHS = new Set(["/", "/login", "/signup", "/onboarding"]);

/**
 * Builds the login href, optionally encoding the current path as a `?redirect=`
 * parameter so the user is returned to their intended destination after sign-in.
 *
 * The redirect is omitted for non-redirectable paths (root, login, signup,
 * onboarding) to avoid pointless or circular redirects.
 */
export function buildLoginHref(pathname: string, searchStr: string): string {
	if (NO_REDIRECT_PATHS.has(pathname)) {
		return "/login";
	}
	const destination = pathname + searchStr;
	return `/login?redirect=${encodeURIComponent(destination)}`;
}

function LoadingWorkspaceState() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
				<p className="text-lg font-semibold text-foreground">Loading your workspace...</p>
				<p className="mt-2 text-sm text-muted-foreground">
					Checking your session and restoring the right center view.
				</p>
			</div>
		</div>
	);
}

type BoundaryRouter = {
	invalidate: () => Promise<void> | void;
};

type AuthRouteErrorBoundaryProps = ErrorComponentProps & {
	router: BoundaryRouter;
	currentPath?: string;
};

function WorkspaceShellFrame({ children }: { children: ReactNode }) {
	return (
		<>
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:left-4 focus:top-4 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
			>
				Skip to main content
			</a>
			<div className="flex h-screen overflow-hidden bg-muted/40">
				<nav
					aria-label="Primary"
					className="hidden h-screen w-60 shrink-0 border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground lg:flex lg:flex-col"
				>
					<div className="flex items-center border-b border-sidebar-border px-5 py-5">
						<BrandMark />
					</div>
					<div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4">
						<div>
							<p className="mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/75">
								Main
							</p>
							<ul className="space-y-0.5">
								{[
									["Dashboard", "/dashboard"],
									["Attendance", "/attendance"],
									["Ratios", "/ratios"],
								].map(([label, href]) => (
									<li key={href}>
										<a
											href={href}
											className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
										>
											{label}
										</a>
									</li>
								))}
							</ul>
						</div>
					</div>
				</nav>
				<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
					<header className="border-b border-border bg-background px-4 py-3 sm:px-6">
						<p className="text-sm font-semibold text-foreground">PebbleDesk workspace</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Your workspace shell is still available while this view reloads.
						</p>
					</header>
					<main id="main-content" className="flex-1 overflow-y-auto p-6">
						{children}
					</main>
				</div>
			</div>
		</>
	);
}

export function AuthRouteErrorBoundary({
	currentPath = typeof window === "undefined" ? "unknown" : window.location.pathname,
	error,
	info,
	reset,
	router,
}: AuthRouteErrorBoundaryProps) {
	useEffect(() => {
		captureException(error, {
			tags: { component: "AuthRouteErrorBoundary", route: currentPath, surface: "app" },
			extra: info?.componentStack ? { componentStack: info.componentStack } : undefined,
		});
	}, [currentPath, error, info]);

	async function handleTryAgain() {
		reset();
		await router.invalidate();
	}

	return (
		<WorkspaceShellFrame>
			<RecoveryState
				title="This workspace view needs to reload"
				description="Try the page again or head back to the dashboard while we restore this screen."
				primaryHref="/dashboard"
				primaryLabel="Try again"
				onPrimaryAction={handleTryAgain}
				secondaryHref="/dashboard"
				secondaryLabel="Go to dashboard"
			/>
		</WorkspaceShellFrame>
	);
}

export function AuthRouteBoundary(props: ErrorComponentProps) {
	const router = useRouter();
	const currentPath = useRouterState({ select: (state) => state.location.pathname });
	return <AuthRouteErrorBoundary {...props} currentPath={currentPath} router={router} />;
}

export function AuthLayout() {
	const queryClient = useQueryClient();
	const {
		data: authStatus,
		error: authStatusError,
		isLoading: authStatusLoading,
	} = useAuthStatus();
	const shouldLoadSession = authStatus?.status === "authenticated";
	const { data: session, error, isLoading } = useAuthSession({ enabled: shouldLoadSession });
	const {
		data: ratios,
		isLoading: ratiosLoading,
		dataUpdatedAt: ratiosUpdatedAt,
	} = useRatios({
		enabled: Boolean(session && session.membership.role !== "staff"),
	});
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const search = useRouterState({ select: (state) => state.location.search });
	const searchStr = useRouterState({ select: (state) => state.location.searchStr });
	const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
	const mobileNavigationTriggerRef = useRef<HTMLButtonElement | null>(null);
	const wasMobileNavigationOpenRef = useRef(false);
	const [pollExhausted, setPollExhausted] = useState(false);
	const checkoutPollCountRef = useRef(0);
	const checkoutParamClearedRef = useRef(false);
	const isCheckoutSuccess =
		typeof search === "object" && search !== null
			? (search as Record<string, unknown>).checkout === "success"
			: false;

	// Clear the ?checkout=success param from the URL once observed so it isn't
	// preserved across navigations or reloads. Also set a sessionStorage flag so
	// the billing page can display a confirmation banner.
	useEffect(() => {
		if (isCheckoutSuccess && !checkoutParamClearedRef.current) {
			checkoutParamClearedRef.current = true;
			track(ANALYTICS_EVENTS.subscriptionCheckoutCompleted, { checkout_result: "success" });
			sessionStorage.setItem("pebbledesk.checkoutJustCompleted", "1");
			void queryClient.invalidateQueries({ queryKey: ["authSession"] });
			void queryClient.invalidateQueries({ queryKey: ["subscriptionStatus"] });
			const url = new URL(window.location.href);
			url.searchParams.delete("checkout");
			window.history.replaceState(null, "", url.toString());
		}
	}, [isCheckoutSuccess, queryClient]);

	const liveStatusQuery = useSubscriptionStatus({
		enabled: shouldLoadSession,
		refetchInterval: isCheckoutSuccess
			? (query) => {
					checkoutPollCountRef.current += 1;
					const interval = subscriptionPollingInterval(query, checkoutPollCountRef.current);
					if (interval === false && checkoutPollCountRef.current >= CHECKOUT_POLL_MAX_ATTEMPTS) {
						setPollExhausted(true);
					}
					return interval;
				}
			: false,
	});

	useEffect(() => {
		if (!pathname) {
			return;
		}

		setIsMobileNavigationOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (authStatus?.status === "unauthenticated") {
			resetAnalytics();
		}
	}, [authStatus?.status]);

	useEffect(() => {
		if (!session) return;

		identifyAuthenticatedUser({
			id: session.user.id,
			email: session.user.email,
			role: session.membership.role,
			emailVerified: authStatus?.status === "authenticated" ? authStatus.emailVerified : undefined,
			centerCount: 1,
		});
		groupCenter({
			id: session.center.id,
			plan: session.center.subscriptionPlan,
			subscriptionStatus: session.center.subscriptionStatus,
			state: session.center.state,
			timezone: session.center.timezone,
			role: session.membership.role,
			classroomCount: session.classroomIds?.length ?? 0,
		});
	}, [authStatus, session]);

	useEffect(() => {
		if (wasMobileNavigationOpenRef.current && !isMobileNavigationOpen) {
			const id = window.setTimeout(() => {
				mobileNavigationTriggerRef.current?.focus();
			}, 0);
			wasMobileNavigationOpenRef.current = isMobileNavigationOpen;
			return () => window.clearTimeout(id);
		}
		wasMobileNavigationOpenRef.current = isMobileNavigationOpen;
	}, [isMobileNavigationOpen]);

	if (authStatusLoading || (shouldLoadSession && isLoading)) {
		return <LoadingWorkspaceState />;
	}

	if (!shouldLoadSession) {
		if (authStatus?.status === "invite_pending" && authStatus.invitation) {
			return <PendingInvitationCard invitation={authStatus.invitation} />;
		}

		if (authStatus?.status === "center_selection_required") {
			if (pathname === "/overview") {
				return <Outlet />;
			}

			return (
				<RecoveryState
					fullPage
					showBrandMark
					title="Choose your center"
					description="Select which center you want to open before we load the workspace."
					primaryHref="/overview"
					primaryLabel="Choose a center"
					secondaryHref="/login"
					secondaryLabel="Use a different account"
				/>
			);
		}

		if (authStatus?.status === "onboarding_required") {
			return (
				<RecoveryState
					fullPage
					showBrandMark
					title="Finish setting up your center"
					description="Your account is ready. Add your center details to unlock the director workspace."
					primaryHref="/onboarding"
					primaryLabel="Continue onboarding"
					secondaryHref="/login"
					secondaryLabel="Use a different account"
				/>
			);
		}

		if (authStatusError) {
			return (
				<RecoveryState
					fullPage
					showBrandMark
					title="We couldn't verify your session"
					description="Refresh and try again. If the problem persists, sign in again to continue."
					primaryHref="/login"
					primaryLabel="Return to sign in"
					secondaryHref="/dashboard"
					secondaryLabel="Try again"
				/>
			);
		}

		return (
			<RecoveryState
				fullPage
				showBrandMark
				title="Sign in required"
				description="Your session has ended or this page requires an authenticated account."
				primaryHref={buildLoginHref(pathname, searchStr)}
				primaryLabel="Return to sign in"
			/>
		);
	}

	if (session?.centerInvalid) {
		return (
			<RecoveryState
				fullPage
				showBrandMark
				title="Your center access has changed"
				description="Your session is no longer linked to an active center. Sign in again to continue."
				primaryHref="/login"
				primaryLabel="Return to sign in"
			/>
		);
	}

	if (!session) {
		const invitePendingError = getInvitePendingError(error);
		if (invitePendingError?.invitation) {
			return <PendingInvitationCard invitation={invitePendingError.invitation} />;
		}

		if (isOnboardingRequiredError(error)) {
			return (
				<RecoveryState
					fullPage
					showBrandMark
					title="Finish setting up your center"
					description="Your account is ready. Add your center details to unlock the director workspace."
					primaryHref="/onboarding"
					primaryLabel="Continue onboarding"
					secondaryHref="/login"
					secondaryLabel="Use a different account"
				/>
			);
		}

		if (isAuthVerificationError(error)) {
			return (
				<RecoveryState
					fullPage
					showBrandMark
					title="We couldn't verify your session"
					description="Refresh and try again. If the problem persists, sign in again to continue."
					primaryHref="/login"
					primaryLabel="Return to sign in"
					secondaryHref={pathname || "/dashboard"}
					secondaryLabel="Try again"
				/>
			);
		}

		return (
			<RecoveryState
				fullPage
				showBrandMark
				title="Sign in required"
				description="Your session has ended or this page requires an authenticated account."
				primaryHref={buildLoginHref(pathname, searchStr)}
				primaryLabel="Return to sign in"
			/>
		);
	}

	const role: Role = session.membership.role;
	const centerName = session.center.name;
	const centerState = session.center.state;
	const headerRatioStatus = summarizeHeaderRatioStatus(true, ratios, ratiosLoading);
	const userName = session.user.name;
	const userId = session.user.id;
	const pendingInvitation = session.pendingInvitation;
	const sessionSubscriptionStatus = session.center.subscriptionStatus;
	const subscriptionStatus = liveStatusQuery.data?.subscriptionStatus ?? sessionSubscriptionStatus;
	const isSubscriptionGateExemptPath = pathname.startsWith("/account");
	const subscriptionGateActive =
		!isSubscriptionGateExemptPath && !hasActiveSubscription(subscriptionStatus);

	const DIRECTOR_ONLY_PREFIXES = [
		"/reports",
		"/ratios",
		"/children",
		"/guardians",
		"/classrooms",
		"/scheduling/time",
		"/subsidies",
		"/billing/payments",
		"/import",
	];
	const isOwnerOnlyPath =
		pathname.startsWith("/settings") ||
		(pathname.startsWith("/billing") &&
			!pathname.startsWith("/billing/payments") &&
			!pathname.startsWith("/billing/templates"));
	const accessDeniedState =
		role === "staff" && DIRECTOR_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
			? {
					title: "Director access required",
					description: "This section is only available to directors and owners.",
				}
			: isOwnerOnlyPath && role !== "owner"
				? {
						title: "Owner access required",
						description:
							"Billing, settings, and QuickBooks controls are only available to center owners.",
					}
				: null;

	return (
		<div className="flex h-screen overflow-hidden bg-muted/40">
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md"
			>
				Skip to main content
			</a>
			<div className="hidden h-screen shrink-0 lg:flex">
				<Sidebar role={role} centerName={centerName} centerState={centerState} />
			</div>
			<Sheet open={isMobileNavigationOpen} onOpenChange={setIsMobileNavigationOpen}>
				<SheetContent side="left" className="lg:hidden" aria-label="Navigation">
					<SheetTitle className="sr-only">Navigation</SheetTitle>
					<div className="min-h-0 flex-1 pt-12">
						<Sidebar
							role={role}
							centerName={centerName}
							centerState={centerState}
							onNavigate={() => setIsMobileNavigationOpen(false)}
						/>
					</div>
				</SheetContent>
			</Sheet>
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<Header
					centerName={centerName}
					centerState={centerState}
					activeCenterId={session.membership.centerId}
					ratioStatus={headerRatioStatus}
					ratioUpdatedAt={ratiosUpdatedAt || undefined}
					userName={userName}
					onOpenNavigation={() => setIsMobileNavigationOpen(true)}
					navigationButtonRef={mobileNavigationTriggerRef}
				/>
				<main id="main-content" className="flex-1 overflow-y-auto p-6">
					{pendingInvitation ? (
						<div className="mb-6">
							<PendingInvitationCard invitation={pendingInvitation} variant="inline" />
						</div>
					) : null}
					{!isSubscriptionGateExemptPath &&
					pollExhausted &&
					!hasActiveSubscription(subscriptionStatus) ? (
						<RecoveryState
							title="Your payment is processing"
							description="Your payment is processing longer than expected."
							primaryHref={window.location.pathname}
							primaryLabel="Refresh"
							secondaryHref={SUPPORT_MAILTO_HREF}
							secondaryLabel="Contact support"
						/>
					) : subscriptionGateActive && subscriptionStatus ? (
						<SubscriptionRequired userRole={role} subscriptionStatus={subscriptionStatus} />
					) : accessDeniedState ? (
						<RecoveryState
							title={accessDeniedState.title}
							description={accessDeniedState.description}
							primaryHref="/dashboard"
							primaryLabel="Go to dashboard"
						/>
					) : (
						<Outlet />
					)}
				</main>
				<AiCsWidget userId={userId} currentPath={pathname} />
				{/* CrmFeedbackWidget replaces the local FeedbackWidget mount on the authenticated surface.
				    FeedbackWidget source is kept; only the mount here is swapped. When VITE_CRM_WIDGET_KEY
				    is unset (e.g. local dev without the key), it renders nothing — expected behaviour. */}
				<CrmFeedbackWidget />
			</div>
		</div>
	);
}
