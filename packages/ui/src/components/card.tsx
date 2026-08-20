import * as React from "react";

import { cn } from "../lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
	/**
	 * When true, the card responds to hover/focus with a subtle lift and shadow.
	 * Use on cards that wrap a Link/button or otherwise act as a clickable surface.
	 */
	interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
	({ className, interactive = false, ...props }, ref) => (
		<div
			ref={ref}
			data-interactive={interactive ? "true" : undefined}
			className={cn(
				"rounded-xl border bg-card text-card-foreground shadow",
				interactive &&
					"motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md",
				className,
			)}
			{...props}
		/>
	),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
	),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			className={cn("font-semibold leading-none tracking-tight", className)}
			{...props}
		/>
	),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
	),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
	),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
	({ className, ...props }, ref) => (
		<div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
	),
);
CardFooter.displayName = "CardFooter";

export type { CardProps };
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
