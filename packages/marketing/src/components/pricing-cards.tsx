import { PUBLIC_BRAND_KNOWLEDGE } from "@pebbledesk/shared/public-knowledge";
import { useRef, useState } from "react";
import { trackBillingToggle } from "../lib/billing-toggle-tracker";
import type { PricingTier } from "../types";

type BillingPeriod = "monthly" | "annual";

interface TierWithCta extends PricingTier {
	cta: { text: string; target: string };
}

interface PricingCardsProps {
	tiers: TierWithCta[];
	enterpriseNote?: {
		label: string;
		price: string;
		summary: string;
		ctaText: string;
		ctaTarget?: string;
	};
	annualSavingsText?: string;
	monthlyToggleLabel?: string;
	annualToggleLabel?: string;
	sourcePage?: string;
	showBillingToggle?: boolean;
}

const CHECK_ICON = (
	<svg
		className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-primary-600)]"
		aria-hidden="true"
		viewBox="0 0 16 16"
		fill="currentColor"
	>
		<path d="M13.354 4.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3-3a.5.5 0 0 1 .708-.708L6 11.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
	</svg>
);

function formatMonthlyPrice(monthlyPriceCents: number, unitLabel?: string): string {
	const unit = unitLabel ?? "";
	return `$${(monthlyPriceCents / 100).toFixed(0)}${unit}/mo`;
}

function formatPrimaryPrice(price: string): string {
	return price.replace(/\s+billed annually$/i, "");
}

function withBillingCadence(target: string, billingPeriod: BillingPeriod): string {
	try {
		const parsed = target.startsWith("http")
			? new URL(target)
			: new URL(target, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
		if (parsed.pathname !== "/signup" && parsed.pathname !== "/start-trial") {
			return target;
		}
		parsed.searchParams.set("billing", billingPeriod);
		if (target.startsWith("http")) {
			return parsed.toString();
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return target;
	}
}

export function PricingCards({
	tiers,
	enterpriseNote,
	annualSavingsText,
	monthlyToggleLabel = "Monthly",
	annualToggleLabel = "Annual",
	sourcePage = "/pricing/",
	showBillingToggle,
}: PricingCardsProps) {
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
	const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const selfServeTiers = tiers.filter((tier) => tier.slug !== "enterprise");
	const suppliedEnterpriseTier = tiers.find((tier) => tier.slug === "enterprise");
	const resolvedEnterpriseNote =
		enterpriseNote ??
		(suppliedEnterpriseTier
			? {
					label: suppliedEnterpriseTier.name,
					price: suppliedEnterpriseTier.price,
					summary: suppliedEnterpriseTier.description ?? "Talk with sales first.",
					ctaText: suppliedEnterpriseTier.cta.text,
					ctaTarget: suppliedEnterpriseTier.cta.target,
				}
			: undefined);

	const canShowToggle =
		showBillingToggle !== false && selfServeTiers.some((t) => t.monthlyPriceCents !== undefined);

	const billingOptions: Array<{ key: BillingPeriod; label: string }> = [
		{ key: "monthly", label: monthlyToggleLabel },
		{ key: "annual", label: annualToggleLabel },
	];

	function selectPeriod(next: BillingPeriod) {
		if (next === billingPeriod) return;
		setBillingPeriod(next);
		trackBillingToggle(next, sourcePage);
	}

	function focusOption(index: number) {
		radioRefs.current[index]?.focus();
	}

	function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
		const lastIndex = billingOptions.length - 1;

		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			event.preventDefault();
			const nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
			selectPeriod(billingOptions[nextIndex].key);
			focusOption(nextIndex);
			return;
		}

		if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			event.preventDefault();
			const nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
			selectPeriod(billingOptions[nextIndex].key);
			focusOption(nextIndex);
			return;
		}

		if (event.key === "Home") {
			event.preventDefault();
			selectPeriod(billingOptions[0].key);
			focusOption(0);
			return;
		}

		if (event.key === "End") {
			event.preventDefault();
			selectPeriod(billingOptions[lastIndex].key);
			focusOption(lastIndex);
		}
	}

	return (
		<>
			{canShowToggle && (
				<div className="mb-8 flex flex-col items-center gap-3">
					<div
						role="radiogroup"
						aria-label="Billing period"
						className="inline-flex rounded-full border border-[var(--site-panel-border)] bg-[var(--surface-secondary)] p-1"
					>
						{billingOptions.map((option, index) => {
							const isSelected = billingPeriod === option.key;
							const isAnnual = option.key === "annual";

							return (
								// biome-ignore lint/a11y/useSemanticElements: styled toggle button inside radiogroup requires role="radio" on <button> to preserve keyboard/screen-reader UX without resetting browser input styles
								<button
									key={option.key}
									ref={(el) => {
										radioRefs.current[index] = el;
									}}
									role="radio"
									type="button"
									tabIndex={isSelected ? 0 : -1}
									aria-checked={isSelected}
									onClick={() => selectPeriod(option.key)}
									onKeyDown={(e) => handleKeyDown(e, index)}
									className={[
										"flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-600)] focus-visible:ring-offset-2",
										isSelected
											? "bg-[var(--color-brand-text)] text-white shadow-sm"
											: "text-[var(--color-brand-muted)] hover:text-[var(--color-brand-text)]",
									].join(" ")}
								>
									{option.label}
									{isAnnual && annualSavingsText && (
										<span
											className={[
												"rounded-full px-2 py-0.5 text-[length:var(--text-caption)] font-semibold leading-tight",
												isSelected
													? "bg-[var(--color-accent-400)] text-white"
													: "bg-[var(--color-accent-100)] text-[var(--color-accent-700)]",
											].join(" ")}
										>
											{annualSavingsText}
										</span>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}

			<section
				className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 scroll-px-4 md:overflow-visible md:gap-5 md:grid md:grid-cols-2 md:mx-0 md:px-0 xl:grid-cols-4"
				aria-roledescription="carousel"
				aria-label="Pricing plans"
			>
				{selfServeTiers.map((tier) => {
					const isAnnual = billingPeriod === "annual" && tier.monthlyPriceCents !== undefined;
					const promotionalPrice =
						billingPeriod === "annual"
							? tier.promotionalPrice?.annual
							: tier.promotionalPrice?.monthly;
					const promotionalBadgeLabel =
						billingPeriod === "annual"
							? tier.promotionalPrice?.annual.badgeLabel
							: tier.promotionalPrice?.monthly.badgeLabel;
					const displayPrice = promotionalPrice
						? formatPrimaryPrice(promotionalPrice.discountedPriceLabel)
						: billingPeriod === "monthly" && tier.monthlyPriceCents !== undefined
							? formatMonthlyPrice(tier.monthlyPriceCents, tier.unitLabel)
							: formatPrimaryPrice(tier.price);
					const annualTotal = promotionalPrice
						? tier.promotionalPrice?.annual.discountedAnnualTotalLabel
						: tier.annualPriceOverride;
					const standardDisplayPrice =
						billingPeriod === "monthly" && tier.monthlyPriceCents !== undefined
							? formatMonthlyPrice(tier.monthlyPriceCents, tier.unitLabel)
							: formatPrimaryPrice(tier.price);

					return (
						<article
							key={tier.slug ?? tier.name}
							className={[
								"snap-start shrink-0 w-[85%] max-w-[22rem] md:w-auto md:max-w-none md:shrink flex min-h-full flex-col rounded-[var(--radius-lg)] border bg-[var(--site-panel-bg)] p-7 shadow-[var(--shadow-card)]",
								tier.highlighted
									? "border-[var(--color-accent-700)] ring-1 ring-[var(--color-accent-200)]"
									: "border-[var(--site-panel-border)]",
							].join(" ")}
						>
							<div className="flex min-h-60 flex-col">
								<div className="flex min-h-20 items-start justify-between gap-4">
									<h3 className="font-mono text-[length:var(--text-caption)] uppercase tracking-[0.18em] text-[var(--color-accent-700)]">
										{tier.name}
									</h3>
									{tier.highlighted && (
										<span className="max-w-24 rounded-full bg-[var(--color-accent-50)] px-3 py-1 text-center text-[length:var(--text-caption)] font-medium leading-5 text-[var(--color-accent-700)]">
											Best fit
										</span>
									)}
								</div>
								<div className="mt-5">
									{promotionalBadgeLabel && (
										<span className="inline-flex rounded-full bg-[var(--color-accent-100)] px-2.5 py-1 text-[length:var(--text-caption)] font-semibold leading-tight text-[var(--color-accent-800)]">
											{promotionalBadgeLabel}
										</span>
									)}
									{promotionalPrice?.originalPriceLabel && (
										<p className="mt-2 text-[length:var(--text-caption)] leading-5 text-[var(--color-brand-muted)] line-through">
											{promotionalPrice.originalPriceLabel}
										</p>
									)}
									<p className="mt-1 font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
										{displayPrice}
									</p>
									{promotionalPrice?.renewalPriceLabel && (
										<p className="mt-1 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
											{promotionalPrice.renewalPriceLabel}
										</p>
									)}
									{isAnnual && (
										<p className="mt-2 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
											Billed yearly
											{annualTotal && (
												<>
													<span className="mx-2 text-[var(--site-panel-border)]">|</span>
													<span>{annualTotal}</span>
												</>
											)}
										</p>
									)}
									{!promotionalPrice && standardDisplayPrice !== displayPrice && (
										<span className="sr-only">{standardDisplayPrice}</span>
									)}
								</div>
								{tier.description && (
									<p className="mt-5 text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
										{tier.description}
									</p>
								)}
							</div>
							<details className="mt-6 rounded-[var(--radius-md)] border border-[var(--site-panel-border)] bg-[var(--surface-secondary)] p-4">
								<summary className="cursor-pointer text-[length:var(--text-caption)] font-semibold text-[var(--color-brand-text)]">
									Included workflows
								</summary>
								<ul className="mt-4 space-y-3 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
									{tier.features.map((feature) => (
										<li key={feature} className="flex items-start gap-2">
											{CHECK_ICON}
											{feature}
										</li>
									))}
								</ul>
							</details>
							<a
								href={withBillingCadence(tier.cta.target, billingPeriod)}
								className={[
									"mt-auto inline-flex w-full items-center justify-center rounded-full px-4 py-3 text-center font-medium no-underline transition-colors",
									tier.highlighted
										? "bg-[var(--color-accent-700)] text-white hover:bg-[var(--color-accent-800)]"
										: "border border-[var(--site-panel-border)] text-[var(--color-brand-text)] hover:bg-[var(--site-soft-surface)]",
								].join(" ")}
							>
								{tier.cta.text}
							</a>
						</article>
					);
				})}
			</section>
			{resolvedEnterpriseNote && (
				<aside className="mt-4 border-t border-[var(--site-panel-border)] pt-4 text-sm leading-6 text-[var(--color-brand-muted)]">
					<span className="font-semibold text-[var(--color-brand-text)]">
						{resolvedEnterpriseNote.label}
					</span>
					<span className="mx-2 text-[var(--site-panel-border)]">|</span>
					<span>{resolvedEnterpriseNote.price}</span>
					<span className="mx-2 text-[var(--site-panel-border)]">|</span>
					<span>{resolvedEnterpriseNote.summary}</span>
					<span className="mx-2 text-[var(--site-panel-border)]">|</span>
					{resolvedEnterpriseNote.ctaTarget ? (
						<a
							href={resolvedEnterpriseNote.ctaTarget}
							className="font-medium text-[var(--color-brand-text)] underline underline-offset-4"
						>
							{resolvedEnterpriseNote.ctaText}
						</a>
					) : (
						<span className="font-medium text-[var(--color-brand-text)]">
							{resolvedEnterpriseNote.ctaText}
						</span>
					)}
				</aside>
			)}
		</>
	);
}
