import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils.js";

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn(
			"fixed inset-0 z-50 bg-foreground/35 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
			className,
		)}
		{...props}
	/>
));
SheetOverlay.displayName = "SheetOverlay";

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
	side?: "left" | "right";
}

const SheetContent = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Content>,
	SheetContentProps
>(({ side = "left", className, children, "aria-describedby": ariaDescribedBy, ...props }, ref) => (
	<SheetPortal>
		<SheetOverlay />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				"fixed z-50 flex h-full w-72 max-w-[85vw] flex-col bg-sidebar-background text-sidebar-foreground shadow-xl transition ease-in-out",
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
				side === "left"
					? "inset-y-0 left-0 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
					: "inset-y-0 right-0 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
				className,
			)}
			aria-describedby={ariaDescribedBy ?? undefined}
			{...props}
		>
			{children}
			<DialogPrimitive.Close className="absolute right-4 top-3 inline-flex h-9 items-center rounded-full border border-sidebar-border px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-ring">
				Close
				<X className="ml-1.5 h-4 w-4" aria-hidden="true" />
			</DialogPrimitive.Close>
		</DialogPrimitive.Content>
	</SheetPortal>
));
SheetContent.displayName = "SheetContent";

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("flex flex-col border-b border-sidebar-border px-4 py-3", className)}
		{...props}
	/>
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
	React.ElementRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn("text-sm font-medium text-sidebar-foreground", className)}
		{...props}
	/>
));
SheetTitle.displayName = "SheetTitle";

export { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger };
