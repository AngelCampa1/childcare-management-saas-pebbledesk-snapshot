import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Popover, PopoverContent, PopoverTrigger } from "@pebbledesk/ui/components/popover";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle, Clock3, LogOut, Menu, ShieldCheck } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { resolveStateLabel } from "../lib/us-states";
import { CenterSwitcher } from "./center-switcher";

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));

type RatioStatus = "ok" | "warning" | "violation" | "unknown";

interface HeaderProps {
	centerName: string;
	centerState: string;
	activeCenterId?: string;
	ratioStatus?: RatioStatus;
	ratioUpdatedAt?: number;
	userName: string;
	onOpenNavigation?: () => void;
	navigationButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function formatRatioFreshness(updatedAt: number, now: number): string {
	const diffMs = Math.max(0, now - updatedAt);
	const diffSec = Math.round(diffMs / 1000);
	if (diffSec < 10) return "Live · just updated";
	if (diffSec < 60) return `Live · updated ${diffSec}s ago`;
	const diffMin = Math.round(diffSec / 60);
	if (diffMin < 60) return `Live · updated ${diffMin}m ago`;
	const diffHr = Math.round(diffMin / 60);
	return `Live · updated ${diffHr}h ago`;
}

const ratioBadgeConfig: Record<
	RatioStatus,
	{
		className: string;
		icon: typeof CheckCircle;
		label: string;
	}
> = {
	ok: {
		className: "border-success/20 bg-success/15 text-success",
		icon: CheckCircle,
		label: "All Ratios OK",
	},
	warning: {
		className: "border-warning/20 bg-warning/15 text-warning",
		icon: AlertTriangle,
		label: "Ratio attention needed",
	},
	violation: {
		className: "border-destructive/20 bg-destructive/10 text-destructive",
		icon: AlertTriangle,
		label: "Active ratio violation",
	},
	unknown: {
		className: "border-border bg-muted text-muted-foreground",
		icon: Clock3,
		label: "Checking ratios",
	},
};

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function Header({
	centerName,
	centerState,
	activeCenterId,
	ratioStatus = "unknown",
	ratioUpdatedAt,
	userName,
	onOpenNavigation,
	navigationButtonRef,
}: HeaderProps) {
	const badge = ratioBadgeConfig[ratioStatus];
	const BadgeIcon = badge.icon;
	const [now, setNow] = useState<number>(() => Date.now());

	useEffect(() => {
		if (!ratioUpdatedAt) return;
		const id = setInterval(() => setNow(Date.now()), 15_000);
		return () => clearInterval(id);
	}, [ratioUpdatedAt]);

	const freshnessLabel =
		ratioUpdatedAt && ratioStatus !== "unknown" ? formatRatioFreshness(ratioUpdatedAt, now) : null;

	return (
		<header className="flex items-start justify-between gap-3 border-b border-border bg-background px-4 py-3 sm:items-center sm:px-6">
			<div className="flex min-w-0 items-start gap-3">
				{onOpenNavigation ? (
					<button
						ref={navigationButtonRef}
						type="button"
						onClick={onOpenNavigation}
						className="mt-0.5 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted lg:hidden"
						aria-label="Open navigation"
					>
						<Menu className="h-4 w-4" />
					</button>
				) : null}
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						{activeCenterId ? <CenterSwitcher activeCenterId={activeCenterId} /> : null}
						<p className="truncate text-sm font-semibold text-foreground lg:text-xs lg:font-medium lg:text-muted-foreground">
							{centerName}
							{centerState ? (
								<>
									<span aria-hidden="true" className="mx-1.5 text-muted-foreground">
										·
									</span>
									<span
										role="img"
										className="text-xs font-medium text-muted-foreground"
										title={resolveStateLabel(centerState)}
										aria-label={resolveStateLabel(centerState)}
									>
										{centerState}
									</span>
								</>
							) : null}
						</p>
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
						<div
							data-testid="ratio-badge"
							className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${badge.className}`}
						>
							<BadgeIcon className="h-3.5 w-3.5" />
							{badge.label}
						</div>
						{freshnessLabel ? (
							<span data-testid="ratio-freshness" className="text-xs text-muted-foreground">
								{freshnessLabel}
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<span className="hidden text-sm text-muted-foreground sm:block">{userName}</span>
				<UserMenu userName={userName} />
			</div>
		</header>
	);
}

function UserMenu({ userName }: { userName: string }) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [signingOut, setSigningOut] = useState(false);
	const [signOutError, setSignOutError] = useState<string | null>(null);

	async function handleSignOut() {
		setSignOutError(null);
		setSigningOut(true);
		try {
			const result = await authClient.signOut();
			if (result && typeof result === "object" && "error" in result && result.error) {
				throw new Error(
					typeof result.error === "object" &&
						result.error &&
						"message" in result.error &&
						typeof result.error.message === "string"
						? result.error.message
						: "We couldn't sign you out. Please try again.",
				);
			}
			setOpen(false);
			queryClient.clear();
			void navigate({ to: "/login", replace: true });
		} catch {
			setSignOutError("We couldn't sign you out. Please try again.");
		} finally {
			setSigningOut(false);
		}
	}

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setSignOutError(null);
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Open account menu"
					className="flex min-h-11 min-w-11 select-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-transform motion-safe:hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					{getInitials(userName)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-2">
				<div className="border-b border-border px-2 py-2">
					<p className="truncate text-sm font-medium text-foreground">{userName}</p>
				</div>
				{signOutError ? (
					<p role="alert" className="px-2 pt-2 text-xs text-destructive">
						{signOutError}
					</p>
				) : null}
				<Link
					to="/account"
					onClick={() => setOpen(false)}
					className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
				>
					<ShieldCheck className="h-4 w-4" />
					Account security
				</Link>
				<button
					type="button"
					onClick={handleSignOut}
					disabled={signingOut}
					className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
				>
					<LogOut className="h-4 w-4" />
					{signingOut ? "Signing out..." : "Sign out"}
				</button>
			</PopoverContent>
		</Popover>
	);
}
