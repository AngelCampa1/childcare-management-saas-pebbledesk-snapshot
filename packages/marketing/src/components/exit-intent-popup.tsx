import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { clsx } from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { EXIT_POPUP_DEFAULTS } from "../lib/exit-popup-defaults";
import {
	detectScrollBack,
	isSignedUp,
	isWithinSuppressWindow,
	SUPPRESS_DAYS,
	setSuppressed,
} from "../lib/exit-popup-utils";
import { useFocusTrap } from "../lib/focus-trap";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import type { LeadMagnet } from "../types";
import { LeadCaptureForm } from "./lead-capture-form";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";

interface ExitIntentPopupProps {
	apiUrl: string;
	siteName: string;
	sourcePage?: string;
	leadMagnet?: LeadMagnet;
	headline: string;
	description: string;
	ctaText: string;
	leftPanelLabel: string;
	successSubMessage: string;
	showLeadMagnetContent?: boolean;
	declineText?: string;
	privacyNote?: string;
	errorInvalidEmail?: string;
	errorDuplicate?: string;
	errorGeneric?: string;
	successMessage?: string;
	loadingText?: string;
	turnstileSiteKey?: string;
}

function ExitIntentPopupInner({
	apiUrl,
	siteName,
	sourcePage = "exit-popup",
	leadMagnet,
	headline,
	description,
	ctaText,
	leftPanelLabel,
	successSubMessage,
	showLeadMagnetContent = true,
	declineText = EXIT_POPUP_DEFAULTS.declineText,
	privacyNote = EXIT_POPUP_DEFAULTS.privacyNote,
	turnstileSiteKey,
}: ExitIntentPopupProps) {
	const [visible, setVisible] = useState(false);
	const triggeredRef = useRef(false);
	const dismissedRef = useRef(false);
	const shownTrackedRef = useRef(false);
	const peakScrollYRef = useRef(0);
	const dialogRef = useRef<HTMLDivElement>(null);

	const resolvedDescription =
		showLeadMagnetContent && leadMagnet?.description
			? leadMagnet.description
			: description || "Enter your email and we will send the resource to your inbox.";
	const panelTitle = showLeadMagnetContent ? (leadMagnet?.title ?? `${siteName} Guide`) : undefined;
	const resolvedMagnetTitle = leadMagnet?.title ?? `${siteName} Guide`;
	const resolvedMagnetSlug = leadMagnet?.slug;

	const dismiss = useCallback(() => {
		setSuppressed();
		dismissedRef.current = true;
		triggeredRef.current = false;
		setVisible(false);
		trackEvent(ANALYTICS_EVENTS.exitPopupDismissed);
	}, []);

	useEffect(() => {
		if (!visible) return;

		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") {
				dismiss();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [visible, dismiss]);

	useFocusTrap(dialogRef, visible);

	useEffect(() => {
		if (!visible) return;
		lockScroll();
		return () => {
			unlockScroll();
		};
	}, [visible]);

	useEffect(() => {
		if (!resolvedMagnetSlug || isSignedUp() || isWithinSuppressWindow(SUPPRESS_DAYS)) {
			return;
		}

		const timer = setTimeout(() => {
			triggeredRef.current = true;
		}, 5000);

		function handleMouseLeave(e: MouseEvent) {
			if (triggeredRef.current && !dismissedRef.current && e.clientY < 5) {
				setVisible(true);
				if (!shownTrackedRef.current) {
					shownTrackedRef.current = true;
					trackEvent(ANALYTICS_EVENTS.exitPopupShown, { trigger: "mouseleave" });
				}
			}
		}

		document.addEventListener("mouseleave", handleMouseLeave);

		let scrollHandler: (() => void) | null = null;

		if ("ontouchstart" in window) {
			scrollHandler = () => {
				const currentY = window.scrollY;
				if (currentY > peakScrollYRef.current) {
					peakScrollYRef.current = currentY;
				}
				if (
					triggeredRef.current &&
					!dismissedRef.current &&
					detectScrollBack(currentY, peakScrollYRef.current, 300, 200)
				) {
					setVisible(true);
					if (!shownTrackedRef.current) {
						shownTrackedRef.current = true;
						trackEvent(ANALYTICS_EVENTS.exitPopupShown, { trigger: "scroll_back" });
					}
				}
			};
			window.addEventListener("scroll", scrollHandler, { passive: true });
		}

		return () => {
			clearTimeout(timer);
			document.removeEventListener("mouseleave", handleMouseLeave);
			if (scrollHandler) {
				window.removeEventListener("scroll", scrollHandler);
			}
		};
	}, [resolvedMagnetSlug]);

	if (!visible || !resolvedMagnetSlug) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay intentionally dismisses on click/Escape; dialog element inside provides keyboard accessibility
		<div
			data-backdrop
			role="presentation"
			onClick={dismiss}
			onKeyDown={(e) => {
				if (e.key === "Escape") dismiss();
			}}
			className="fixed inset-0 flex items-center justify-center z-[80]"
			style={{ background: "var(--exit-popup-overlay-bg)" }}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="exit-popup-heading"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				className="relative flex flex-col sm:flex-row w-full max-w-[540px] mx-4 rounded-[var(--radius-lg)] overflow-hidden shadow-[var(--shadow-ambient)]"
			>
				<div className="flex flex-col items-center justify-center gap-3 p-6 sm:w-44 sm:shrink-0 bg-[var(--color-primary-50)] border-r border-[var(--color-neutral-200)]">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
						<rect
							x="8"
							y="4"
							width="28"
							height="36"
							rx="3"
							style={{ fill: "var(--color-primary-700)" }}
							fillOpacity="0.25"
						/>
						<rect
							x="10"
							y="6"
							width="24"
							height="32"
							rx="2"
							style={{ fill: "var(--color-primary-700)" }}
							fillOpacity="0.9"
						/>
						<rect x="14" y="13" width="16" height="2" rx="1" fill="var(--color-primary-50)" />
						<rect x="14" y="19" width="12" height="2" rx="1" fill="var(--color-primary-50)" />
						<rect x="14" y="25" width="16" height="2" rx="1" fill="var(--color-primary-50)" />
					</svg>
					<span className="text-xs font-semibold tracking-[0.16em] uppercase text-[var(--color-primary-800)]">
						{leftPanelLabel}
					</span>
					{panelTitle && (
						<p className="text-center text-sm font-medium text-[var(--color-brand-text)]">
							{panelTitle}
						</p>
					)}
				</div>

				<div className="relative flex-1 bg-[var(--surface-elevated)] p-6 sm:p-8">
					<button
						type="button"
						onClick={dismiss}
						aria-label="Close"
						className={clsx(
							"absolute right-4 top-4 rounded-full p-2 text-[var(--color-brand-muted)] transition-colors",
							"hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-brand-text)]",
						)}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 6L18 18M18 6L6 18"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							/>
						</svg>
					</button>

					<div className="pr-8">
						<h2
							id="exit-popup-heading"
							className="font-heading text-[length:var(--text-heading)] font-bold text-[var(--color-brand-text)]"
						>
							{headline}
						</h2>
						<p className="mt-3 text-sm leading-6 text-[var(--color-brand-muted)]">
							{resolvedDescription}
						</p>
						<p className="mt-3 text-sm leading-6 text-[var(--color-brand-muted)]">
							{successSubMessage}
						</p>
					</div>

					<div className="mt-6">
						<LeadCaptureForm
							apiUrl={apiUrl}
							magnetSlug={resolvedMagnetSlug}
							magnetTitle={resolvedMagnetTitle}
							sourcePage={sourcePage}
							buttonText={ctaText}
							turnstileSiteKey={turnstileSiteKey}
							onSuccess={() => {
								setSuppressed();
								trackEvent(ANALYTICS_EVENTS.exitPopupConverted);
							}}
						/>
					</div>
					<div className="mt-3 flex justify-center">
						<button
							type="button"
							onClick={dismiss}
							className="btn-secondary inline-flex items-center justify-center"
						>
							{declineText}
						</button>
					</div>

					<p className="mt-4 text-xs leading-5 text-[var(--color-brand-muted)]">{privacyNote}</p>
				</div>
			</div>
		</div>
	);
}

export const ExitIntentPopup = withMarketingIslandErrorBoundary(ExitIntentPopupInner, {
	componentName: "ExitIntentPopup",
	mode: "silent",
});
