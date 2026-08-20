import { Button } from "@pebbledesk/ui/components/button";
import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { captureException } from "../lib/sentry";
import { BrandMark } from "./brand-mark";

type RootErrorBoundaryProps = {
	error: Error;
	reset: () => void;
};

export function RootErrorBoundary({ error, reset }: RootErrorBoundaryProps) {
	const router = useRouter();

	useEffect(() => {
		console.error("[RootErrorBoundary]", error);
		captureException(error, {
			tags: { component: "RootErrorBoundary", surface: "app" },
		});
	}, [error]);

	function handleTryAgain() {
		router.invalidate();
		reset();
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted px-6 py-12">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-sm">
				<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
				<h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					An unexpected error occurred. Try again or return to the dashboard.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
					<Button onClick={handleTryAgain}>Try again</Button>
					<Button asChild variant="outline">
						<a href="/">Go to dashboard</a>
					</Button>
				</div>
			</div>
		</div>
	);
}
