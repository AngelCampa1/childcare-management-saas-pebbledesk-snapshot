import { Button } from "@pebbledesk/ui/components/button";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { createRootRouteWithContext, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Compass, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { BrandMark } from "../components/brand-mark";
import { trackPageView } from "../lib/analytics";
import { captureException } from "../lib/sentry";
import type { RouterContext } from "../router";

function AnalyticsPageViewTracker() {
	const location = useRouterState({ select: (state) => state.location });

	useEffect(() => {
		trackPageView(location.pathname, location.searchStr);
	}, [location.pathname, location.searchStr]);

	return null;
}

export function RootNotFound() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">
			<div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
				<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
				<div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
					<Compass className="h-7 w-7" aria-hidden="true" />
				</div>
				<h1 className="text-xl font-semibold text-foreground">We couldn't find that page</h1>
				<p className="mt-2 text-sm text-muted-foreground">Let's get you back to your center.</p>
				<Button asChild className="mt-6">
					<Link to="/dashboard">Return to dashboard</Link>
				</Button>
			</div>
		</div>
	);
}

export function RootErrorBoundary({ error, info, reset }: ErrorComponentProps) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });

	useEffect(() => {
		captureException(error, {
			tags: { component: "RouteRootErrorBoundary", route: pathname, surface: "app" },
			extra: info?.componentStack ? { componentStack: info.componentStack } : undefined,
		});
	}, [error, info, pathname]);

	function handleTryAgain() {
		reset();
		window.location.reload();
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">
			<div className="w-full max-w-md rounded-2xl border border-border bg-background p-8 text-center shadow-sm">
				<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
				<div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
					<RefreshCw className="h-7 w-7" aria-hidden="true" />
				</div>
				<h1 className="text-xl font-semibold text-foreground">PebbleDesk hit a snag</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Refresh and try again. If the issue sticks around, head back to sign in.
				</p>
				<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
					<Button onClick={handleTryAgain}>Try again</Button>
					<Button asChild variant="outline">
						<Link to="/login">Return to sign in</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<AnalyticsPageViewTracker />
			<Outlet />
		</>
	),
	errorComponent: ({ error, reset }) => <RootErrorBoundary error={error} reset={reset} />,
	notFoundComponent: RootNotFound,
});
