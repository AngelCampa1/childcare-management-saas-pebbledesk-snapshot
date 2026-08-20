import { cn } from "../lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"relative overflow-hidden rounded-md bg-muted",
				"motion-safe:after:absolute motion-safe:after:inset-0",
				"motion-safe:after:-translate-x-full",
				"motion-safe:after:bg-gradient-to-r motion-safe:after:from-transparent motion-safe:after:via-white/60 motion-safe:after:to-transparent",
				"motion-safe:after:animate-skeleton-shimmer",
				"motion-reduce:bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
