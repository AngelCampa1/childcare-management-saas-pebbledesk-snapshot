import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { type AuthSessionData, authSessionQuery } from "../hooks/use-auth-session";

/**
 * Wraps a render tree in a QueryClientProvider that has the auth session
 * pre-seeded so {@link useCenterTimezone} returns the given IANA zone.
 * Useful for component tests that exercise center-zone date formatting.
 */
export function withCenterTimezone(timezone: string, children: ReactElement): ReactElement {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Infinity } },
	});
	const session: AuthSessionData = {
		user: { id: "u-test", name: "Test User", email: "test@example.com" },
		membership: { id: "m-test", centerId: "c-test", role: "owner" },
		center: {
			id: "c-test",
			name: "Test Center",
			state: "CA",
			timezone,
		},
		classroomIds: [],
	};
	client.setQueryData(authSessionQuery.queryKey, session);
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
