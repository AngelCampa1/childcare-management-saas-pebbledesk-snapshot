import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import "./app.css";
import { setQueryClientForApi } from "./api";
import { FallbackErrorBoundary } from "./error-boundary";
import { initPostHog } from "./lib/analytics";
import { captureException, initSentry, sanitizeQueryKey } from "./lib/sentry";
import { createAppRouter } from "./router";

export { FallbackErrorBoundary } from "./error-boundary";

initSentry();
initPostHog();

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000,
			retry: 1,
		},
	},
	queryCache: new QueryCache({
		onError: (err, query) => {
			const captured = captureException(err, {
				tags: { component: "QueryCache", surface: "app" },
				extra: { queryKey: sanitizeQueryKey(query.queryKey) },
			});
			if (captured) {
				console.error("[QueryCache]", err, query.queryKey);
			}
		},
	}),
});

setQueryClientForApi(queryClient);

const appRouter = createAppRouter({ queryClient });

const rootElement = document.getElementById("root");
if (!rootElement) {
	const error = new Error("Root element not found");
	captureException(error, {
		tags: { component: "Bootstrap", surface: "app" },
	});
	throw error;
}

createRoot(rootElement).render(
	<StrictMode>
		<FallbackErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={appRouter} />
				<Toaster position="bottom-right" richColors />
			</QueryClientProvider>
		</FallbackErrorBoundary>
	</StrictMode>,
);
