import { Button } from "@pebbledesk/ui/components/button";
import { BrandMark } from "./brand-mark";

export type RecoveryStateProps = {
	title: string;
	description: string;
	primaryHref: string;
	primaryLabel: string;
	/** Called when the primary action button is clicked. When provided, the
	 *  button renders as a `<button>` rather than an `<a>`. */
	onPrimaryAction?: () => Promise<void> | void;
	secondaryHref?: string;
	secondaryLabel?: string;
	/** When true the component fills the full viewport with a centred card. */
	fullPage?: boolean;
	/** When true the BrandMark logo is shown at the top of the card. */
	showBrandMark?: boolean;
	/** Optional extra content rendered between the description and the buttons
	 *  (e.g. the EmailConfirmationReminder in the signup recovery flow). */
	children?: React.ReactNode;
};

/**
 * Shared recovery/error-state card used across the auth shell, login, and
 * signup recovery flows. Keeps the visual chrome consistent so every "oops,
 * something went wrong" screen looks the same.
 */
export function RecoveryState({
	title,
	description,
	primaryHref,
	primaryLabel,
	onPrimaryAction,
	secondaryHref,
	secondaryLabel,
	fullPage = false,
	showBrandMark = false,
	children,
}: RecoveryStateProps) {
	const content = (
		<div className="w-full max-w-md rounded-xl border border-border bg-background p-6 text-center shadow-sm">
			{showBrandMark ? (
				<BrandMark className="mb-5 justify-center" wordmarkClassName="text-foreground" />
			) : null}
			<h1 className="text-lg font-semibold text-foreground">{title}</h1>
			<p className="mt-2 text-sm text-muted-foreground">{description}</p>
			{children}
			<div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
				{onPrimaryAction ? (
					<Button type="button" onClick={onPrimaryAction}>
						{primaryLabel}
					</Button>
				) : (
					<Button asChild>
						<a href={primaryHref}>{primaryLabel}</a>
					</Button>
				)}
				{secondaryHref && secondaryLabel ? (
					<Button asChild variant="outline">
						<a href={secondaryHref}>{secondaryLabel}</a>
					</Button>
				) : null}
			</div>
		</div>
	);

	if (fullPage) {
		return (
			<div className="flex h-screen items-center justify-center bg-muted/40 p-6">{content}</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center">{content}</div>
	);
}
