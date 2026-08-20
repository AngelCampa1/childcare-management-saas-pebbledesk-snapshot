import { AiCsWidget as SharedAiCsWidget } from "@ventora/ai-cs/react";
import { useMemo } from "react";
import { resolveApiBaseUrl } from "../lib/api-origin";

/**
 * PebbleDesk AI-CS support widget.
 *
 * Wraps the shared @ventora/ai-cs widget and wires it to the pebbledesk BFF at
 * /api/ai-cs. The BFF lives on the API origin (api.pebbledesk.app in
 * production), a different host than the static web app (my.pebbledesk.app), so
 * we prefix the path with the resolved API origin — the same helper the rest of
 * the app uses. Posting same-origin would hit the static host (no BFF routes →
 * 405). When no absolute origin is configured (dev/proxy) the helper returns ""
 * and the widget falls back to same-origin /api/ai-cs. The BFF gates all calls
 * behind a better-auth session and HMAC-signs requests to the Ventora AI-CS
 * Worker — the frontend never holds the HMAC secret.
 *
 * Only mounts when userId is available (authenticated users only).
 * Brand palette derived from the PebbleDesk design tokens (globals.css):
 *   --color-primary:            #c2410c  (burnt orange, main CTA / accent)
 *   --color-primary-foreground: #ffffff  (white on primary)
 *   --color-background:         #ffffff  (page surface)
 *   --color-foreground:         #1c1917  (near-black warm text)
 */

const BRAND = {
	accentColor: "#c2410c",
	accentTextColor: "#ffffff",
	surfaceColor: "#ffffff",
	textColor: "#1c1917",
} as const;

interface AiCsWidgetProps {
	/** Authenticated session user id, or undefined while the session loads. */
	userId: string | undefined;
	/** Current route path exposed to the assistant for contextual help. */
	currentPath: string;
}

export function AiCsWidget({ userId, currentPath }: AiCsWidgetProps) {
	const session = useMemo(
		() => ({ appId: "pebbledesk", userId: userId as string, currentPath }),
		[userId, currentPath],
	);

	const api = useMemo(
		() => ({
			baseUrl: `${resolveApiBaseUrl(import.meta.env)}/api/ai-cs`,
			credentials: "include" as const,
		}),
		[],
	);

	if (!userId) return null;

	return <SharedAiCsWidget api={api} session={session} brand={BRAND} />;
}
