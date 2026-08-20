import type { PlanFeature, Role } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Activity,
	Baby,
	BadgeDollarSign,
	BookUser,
	Building2,
	CalendarDays,
	ClipboardCheck,
	CreditCard,
	FileText,
	HelpCircle,
	LayoutDashboard,
	MessageSquare,
	School,
	Settings,
	Upload,
	Users,
} from "lucide-react";
import { useMultiCenterOverview } from "../hooks/use-overview";
import { PlanGate } from "../lib/plan-gate";
import { resolveStateLabel } from "../lib/us-states";
import { BrandMark } from "./brand-mark";
import { PlanRequirementBadge } from "./plan-requirement-badge";

interface NavItem {
	label: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	roles: Role[];
	feature?: PlanFeature;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
	{
		title: "Today",
		items: [
			{
				label: "Dashboard",
				href: "/dashboard",
				icon: LayoutDashboard,
				roles: ["owner", "director", "staff"],
			},
			{
				label: "Attendance",
				href: "/attendance",
				icon: Activity,
				roles: ["owner", "director", "staff"],
			},
			{
				label: "Ratios",
				href: "/ratios",
				icon: Users,
				roles: ["owner", "director"],
			},
		],
	},
	{
		title: "Families",
		items: [
			{
				label: "Children",
				href: "/children",
				icon: Baby,
				roles: ["owner", "director"],
			},
			{
				label: "Guardians",
				href: "/guardians",
				icon: BookUser,
				roles: ["owner", "director"],
			},
		],
	},
	{
		title: "Operations",
		items: [
			{
				label: "Classrooms",
				href: "/classrooms",
				icon: School,
				roles: ["owner", "director"],
			},
			{
				label: "Scheduling",
				href: "/scheduling",
				icon: CalendarDays,
				roles: ["owner", "director", "staff"],
			},
			{
				label: "Time Entries",
				href: "/scheduling/time",
				icon: ClipboardCheck,
				roles: ["owner", "director"],
			},
		],
	},
	{
		title: "Finance",
		items: [
			{
				label: "Subsidies",
				href: "/subsidies",
				icon: BadgeDollarSign,
				roles: ["owner", "director"],
				feature: "subsidies",
			},
			{
				label: "Billing",
				href: "/billing",
				icon: CreditCard,
				roles: ["owner"],
			},
			{
				label: "Payments",
				href: "/billing/payments",
				icon: CreditCard,
				roles: ["owner", "director"],
			},
		],
	},
	{
		title: "Compliance",
		items: [
			{
				label: "Reports",
				href: "/reports",
				icon: FileText,
				roles: ["owner", "director"],
			},
			{
				label: "Audit Log",
				href: "/reports/audit-log",
				icon: ClipboardCheck,
				roles: ["owner", "director"],
			},
			{
				label: "Import",
				href: "/import",
				icon: Upload,
				roles: ["owner", "director"],
				feature: "imports",
			},
		],
	},
	{
		title: "Help",
		items: [
			{
				label: "Help Center",
				href: "/help",
				icon: HelpCircle,
				roles: ["owner", "director", "staff"],
			},
		],
	},
];

const DIRECT_NAV_HREFS = new Set([
	...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
	"/messages",
	"/overview",
	"/settings",
]);

function navLinkClass(active: boolean): string {
	const base =
		"flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out motion-safe:active:scale-[0.98]";
	const activeClass = "bg-sidebar-primary text-sidebar-primary-foreground motion-safe:shadow-sm";
	const inactiveClass =
		"text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
	return `${base} ${active ? activeClass : inactiveClass}`;
}

interface SidebarProps {
	role: Role;
	centerName: string;
	centerState: string;
	onNavigate?: () => void;
}

export function Sidebar({ role, centerName, centerState, onNavigate }: SidebarProps) {
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const { data: centerOverviews } = useMultiCenterOverview();
	const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

	const totalUnreadAlertCount =
		centerOverviews?.reduce((sum, c) => sum + c.unreadAlertCount, 0) ?? 0;

	const hasActiveViolation = centerOverviews?.some((c) => c.ratioStatus === "violation") ?? false;
	const currentPathHasDirectNavItem = DIRECT_NAV_HREFS.has(currentPath);

	function isActive(href: string) {
		if (currentPathHasDirectNavItem) return currentPath === href;
		return currentPath === href || currentPath.startsWith(`${href}/`);
	}

	function renderNavItem(item: NavItem) {
		const Icon = item.icon;
		const active = isActive(item.href);
		const link = (
			<li key={item.href}>
				<Link to={item.href} className={navLinkClass(active)} onClick={onNavigate}>
					<Icon className="w-4 h-4 shrink-0" />
					{item.label}
					{item.feature ? <PlanRequirementBadge feature={item.feature} /> : null}
					{item.href === "/ratios" && totalUnreadAlertCount > 0 && (
						<Badge
							data-testid="ratios-alert-badge"
							variant="destructive"
							className="ml-auto px-1.5 py-0 text-xs min-w-[1.25rem] text-center"
							aria-label={`${totalUnreadAlertCount} unread alert${totalUnreadAlertCount === 1 ? "" : "s"}`}
						>
							{totalUnreadAlertCount}
						</Badge>
					)}
				</Link>
			</li>
		);

		if (!item.feature) return link;
		return (
			<PlanGate key={item.href} features={[item.feature]}>
				{link}
			</PlanGate>
		);
	}

	return (
		<aside className="flex h-full min-h-0 w-full flex-col bg-sidebar-background text-sidebar-foreground lg:w-60">
			{/* Logo */}
			<div className="flex items-center border-b border-sidebar-border px-5 py-5">
				<BrandMark />
			</div>

			<div className="border-b border-sidebar-border px-3 py-4">
				<div className="rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 px-3 py-3">
					<p className="truncate text-sm font-semibold text-sidebar-foreground">{centerName}</p>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-sidebar-foreground/75">
						{centerState ? <span>{resolveStateLabel(centerState)}</span> : null}
						{centerState ? <span aria-hidden="true">/</span> : null}
						<span>{roleLabel}</span>
					</div>
				</div>
			</div>

			<nav className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4">
				{getVisibleNavGroups(role).map((group) => {
					const visibleItems = group.items;
					return (
						<div key={group.title}>
							<p className="mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/75 flex items-center gap-1.5">
								{group.title}
								{group.title === "Compliance" && hasActiveViolation && (
									<span
										data-testid="compliance-violation-dot"
										className="h-1.5 w-1.5 rounded-full bg-destructive"
										aria-hidden="true"
									/>
								)}
							</p>
							<ul className="space-y-0.5">{visibleItems.map((item) => renderNavItem(item))}</ul>
						</div>
					);
				})}
			</nav>

			{/* Enterprise: All Locations */}
			<PlanGate features={["multi_center"]}>
				<div className="border-t border-sidebar-border px-3 pt-4">
					<Link to="/overview" className={navLinkClass(isActive("/overview"))} onClick={onNavigate}>
						<Building2 className="w-4 h-4 shrink-0" />
						All Locations
					</Link>
				</div>
			</PlanGate>

			{/* Messages + Settings at bottom */}
			<div className="border-t border-sidebar-border px-3 py-4 space-y-0.5">
				<Link to="/messages" className={navLinkClass(isActive("/messages"))} onClick={onNavigate}>
					<MessageSquare className="w-4 h-4 shrink-0" />
					Messages
				</Link>
				{role === "owner" && (
					<Link to="/settings" className={navLinkClass(isActive("/settings"))} onClick={onNavigate}>
						<Settings className="w-4 h-4 shrink-0" />
						Settings
					</Link>
				)}
			</div>
		</aside>
	);
}

export function getVisibleNavGroups(role: Role) {
	return NAV_GROUPS.map((group) => ({
		...group,
		items: group.items.filter((item) => item.roles.includes(role)),
	})).filter((group) => group.items.length > 0);
}
