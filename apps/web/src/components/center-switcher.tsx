import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@pebbledesk/ui/components/dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { useMemberships, useSwitchCenter } from "../hooks/use-memberships";

interface CenterSwitcherProps {
	activeCenterId: string;
}

export function CenterSwitcher({ activeCenterId }: CenterSwitcherProps) {
	const { data: memberships } = useMemberships();
	const { mutate: switchCenter, isPending } = useSwitchCenter();

	if (!memberships || memberships.length <= 1) {
		return null;
	}

	const activeMembership = memberships.find((m) => m.centerId === activeCenterId);
	const activeLabel = activeMembership?.centerName ?? "Switch center";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={isPending}
					aria-label={activeLabel}
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted motion-safe:hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
				>
					<span className="max-w-[160px] truncate">{activeLabel}</span>
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				{memberships.map((membership) => {
					const isActive = membership.centerId === activeCenterId;
					return (
						<DropdownMenuItem
							key={membership.id}
							data-testid={`center-item-${membership.centerId}`}
							data-active={isActive ? "true" : "false"}
							onSelect={() => {
								if (!isActive) {
									switchCenter(membership.centerId);
								}
							}}
							className="flex items-center gap-2 transition-colors duration-150"
						>
							<span className="flex-1 truncate">{membership.centerName}</span>
							{isActive && (
								<Check data-testid="check-icon" className="h-4 w-4 shrink-0 text-primary" />
							)}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
