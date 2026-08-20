import { cn } from "@pebbledesk/ui/lib/utils";

interface BrandMarkProps {
	className?: string;
	wordmarkClassName?: string;
}

export function BrandMark({ className, wordmarkClassName }: BrandMarkProps) {
	return (
		<div className={cn("flex items-center gap-2", className)}>
			<svg width="32" height="32" viewBox="0 0 64 64" fill="none" aria-hidden="true">
				<path
					d="M14 41.5c0-9.2 7.9-16.5 17.9-16.5h7.3c8.9 0 15.8 5.8 15.8 13.2 0 8.4-7.8 15.8-19.3 15.8H23.2C17.8 54 14 48.5 14 41.5Z"
					fill="#6f8b72"
				/>
				<path
					d="M16 40.5c3.6-7.1 9.8-11.5 18.7-11.5h5.9c8 0 14.4 4.8 15.5 11.2"
					fill="none"
					stroke="#243446"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2.5"
				/>
				<rect
					x="19"
					y="17"
					width="26"
					height="21"
					rx="4.5"
					fill="#f3e7d6"
					stroke="#243446"
					strokeWidth="1.5"
				/>
				<path
					d="M28 27.7l3.5 3.7 8.1-8.4"
					fill="none"
					stroke="#d97b67"
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="3"
				/>
				<path d="M21 41.5h28" fill="none" stroke="#243446" strokeLinecap="round" strokeWidth="3" />
			</svg>
			<span
				className={cn("font-semibold text-sidebar-foreground tracking-tight", wordmarkClassName)}
			>
				PebbleDesk
			</span>
		</div>
	);
}
