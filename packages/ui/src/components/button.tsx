import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "../lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors motion-safe:transition-[color,background-color,border-color,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
				destructive:
					"bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
				outline:
					"border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground disabled:border-muted disabled:bg-muted/40 disabled:text-muted-foreground disabled:shadow-none",
				secondary:
					"bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
				ghost:
					"hover:bg-accent hover:text-accent-foreground disabled:bg-transparent disabled:text-muted-foreground",
				link: "text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-full px-3 text-xs",
				lg: "h-10 rounded-full px-8",
				icon: "h-9 w-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
		);
	},
);
Button.displayName = "Button";

export { Button, buttonVariants };
