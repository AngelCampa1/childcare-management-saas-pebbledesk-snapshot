/* v8 ignore file */
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export interface RouterContext {
	queryClient: QueryClient;
}

export function createAppRouter(context: RouterContext) {
	return createRouter({ routeTree, context });
}

// Module-scope singleton used only for type inference via `Register`.
// main.tsx passes the real shared QueryClient to `createAppRouter` at runtime,
// so this instance never handles real data — it is only referenced by the
// TypeScript `Register` augmentation below.
const _typeInferenceQueryClient = new QueryClient();
export const router = createAppRouter({
	queryClient: _typeInferenceQueryClient,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
