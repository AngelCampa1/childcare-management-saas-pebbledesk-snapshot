import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { authSessionQuery } from "../hooks/use-auth-session";

/**
 * TanStack Router `beforeLoad` guard that redirects staff users away from
 * director/owner-only routes.
 *
 * This function is async and returns a `Promise<void>` that the router awaits.
 * It resolves (returns `undefined`) when the role check passes, and throws a
 * redirect error when access is denied.
 *
 * Uses `ensureQueryData` so it works on both warm and cold cache (e.g. hard
 * refresh, open-in-new-tab). When the cache is warm the data is returned
 * synchronously-ish; when cold it fetches first. If the fetch throws (e.g.
 * `AuthSessionError` with code `onboarding_required` / `invite_pending`, or a
 * network error) the error is re-thrown so the `_auth` layout error boundary
 * handles it exactly as it does for non-guarded routes — it is NOT converted
 * to a `denied` redirect.
 *
 * Usage in a route file — the promise MUST be returned so the router awaits it:
 *   beforeLoad: ({ context }) => requireDirectorOrOwner(context)
 */
export async function requireDirectorOrOwner(context: { queryClient: QueryClient }): Promise<void> {
	const session = await context.queryClient.ensureQueryData(authSessionQuery);
	const role = session?.membership?.role;
	if (role !== "owner" && role !== "director") {
		throw redirect({ to: "/dashboard", search: { denied: "true" } });
	}
}

/**
 * TanStack Router `beforeLoad` guard that restricts a route to owners only.
 * Redirects non-owners (directors and staff) to /dashboard?denied=true.
 *
 * Async — returns a `Promise<void>` that resolves when the role check passes.
 * The promise MUST be returned from `beforeLoad` (not wrapped in a block body
 * that drops the return value) so the router awaits it:
 *   beforeLoad: ({ context }) => requireOwner(context)
 *
 * Same cold-cache and error-propagation semantics as `requireDirectorOrOwner`.
 */
export async function requireOwner(context: { queryClient: QueryClient }): Promise<void> {
	const session = await context.queryClient.ensureQueryData(authSessionQuery);
	const role = session?.membership?.role;
	if (role !== "owner") {
		throw redirect({ to: "/dashboard", search: { denied: "true" } });
	}
}
