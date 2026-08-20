import { useRef, useState } from "react";
import { formatAnnualPrice } from "../lib/pricing-utils";
import { resolvePublicSignupCta, sanitizePublicSignupCtaText } from "../lib/public-signup-cta";
import type { PricingTier } from "../types";

interface FakeDoorPricingProps {
	apiUrl: string;
	sourcePage: string;
	tiers: PricingTier[];
	heading?: string;
	trialBannerText?: string;
	buttonPrefix?: string;
	popularTier?: string;
	popularBadgeText?: string;
	annualSavingsText?: string;
	monthlyToggleLabel?: string;
	annualToggleLabel?: string;
	showBillingToggle?: boolean;
}

export function FakeDoorPricing({
	sourcePage,
	tiers,
	heading,
	trialBannerText,
	buttonPrefix,
	popularTier,
	popularBadgeText = "Most Popular",
	annualSavingsText,
	monthlyToggleLabel = "Monthly",
	annualToggleLabel = "Annual",
	showBillingToggle,
}: FakeDoorPricingProps) {
	const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
	const billingRadioRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const selfServeTiers = tiers.filter(
		(tier) => tier.slug !== "enterprise" && tier.name !== "Enterprise",
	);
	const enterpriseTier = tiers.find(
		(tier) => tier.slug === "enterprise" || tier.name === "Enterprise",
	);

	const canShowToggle =
		showBillingToggle !== false &&
		selfServeTiers.some((tier) => tier.monthlyPriceCents !== undefined);
	const billingOptions = [
		{ key: "monthly" as const, label: monthlyToggleLabel },
		{ key: "annual" as const, label: annualToggleLabel },
	];

	function selectBillingOption(nextBillingPeriod: "monthly" | "annual") {
		setBillingPeriod(nextBillingPeriod);
	}

	function focusBillingOption(index: number) {
		billingRadioRefs.current[index]?.focus();
	}

	function handleBillingRadioKeyDown(
		event: React.KeyboardEvent<HTMLButtonElement>,
		currentIndex: number,
	) {
		const lastIndex = billingOptions.length - 1;

		if (event.key === "ArrowRight" || event.key === "ArrowDown") {
			event.preventDefault();
			const nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
			selectBillingOption(billingOptions[nextIndex].key);
			focusBillingOption(nextIndex);
			return;
		}

		if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
			event.preventDefault();
			const nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
			selectBillingOption(billingOptions[nextIndex].key);
			focusBillingOption(nextIndex);
			return;
		}

		if (event.key === "Home") {
			event.preventDefault();
			selectBillingOption(billingOptions[0].key);
			focusBillingOption(0);
			return;
		}

		if (event.key === "End") {
			event.preventDefault();
			selectBillingOption(billingOptions[lastIndex].key);
			focusBillingOption(lastIndex);
		}
	}

	return (
		<section
			className="px-4 py-[var(--section-py)]"
			style={{ background: "var(--section-gradient-b)" }}
		>
			<div className="mx-auto max-w-5xl">
				{heading ? (
					<h2 className="mb-8 text-[length:var(--text-heading)] font-bold font-heading text-[var(--color-brand-text)]">
						{heading}
					</h2>
				) : null}

				{trialBannerText ? (
					<p className="mb-6 rounded-[var(--radius-md)] border border-[var(--color-accent-200)] bg-[var(--color-accent-50)] px-4 py-3 text-[length:var(--text-caption)] text-[var(--color-brand-text)]">
						{trialBannerText}
					</p>
				) : null}

				{canShowToggle ? (
					<div role="radiogroup" aria-label="Billing period" className="mb-8 flex justify-center">
						<div className="inline-flex rounded-full border border-[var(--color-neutral-300)] p-1 bg-[var(--surface-secondary)]">
							{billingOptions.map((option, index) => {
								const isSelected = billingPeriod === option.key;

								return (
									// biome-ignore lint/a11y/useSemanticElements: styled toggle button inside radiogroup requires role="radio" on <button> to preserve keyboard/screen-reader UX without resetting browser input styles
									<button
										key={option.key}
										ref={(element) => {
											billingRadioRefs.current[index] = element;
										}}
										role="radio"
										type="button"
										tabIndex={isSelected ? 0 : -1}
										aria-checked={isSelected}
										onClick={() => selectBillingOption(option.key)}
										onKeyDown={(event) => handleBillingRadioKeyDown(event, index)}
										className="min-h-11 rounded-full px-5 py-2 text-[length:var(--text-caption)] font-medium"
									>
										{option.label}
									</button>
								);
							})}
						</div>
					</div>
				) : null}

				<div
					className={`grid gap-6 ${selfServeTiers.length === 1 ? "max-w-lg mx-auto" : selfServeTiers.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}
				>
					{selfServeTiers.map((tier) => {
						const cta = resolvePublicSignupCta({
							sourcePage,
							explicitTarget: `/?plan=${tier.name.toLowerCase()}#pricing`,
							explicitText:
								tier.ctaText ?? (buttonPrefix ? `${buttonPrefix} ${tier.name}` : tier.name),
						});
						const isPopular =
							popularTier !== undefined && tier.name.toLowerCase() === popularTier.toLowerCase();
						const displayPrice =
							billingPeriod === "annual" && tier.monthlyPriceCents !== undefined
								? formatAnnualPrice(tier.monthlyPriceCents, tier.unitLabel)
								: tier.price;

						return (
							<article
								key={tier.name}
								className={[
									"rounded-[var(--radius-md)] border p-8 shadow-[var(--shadow-card)]",
									tier.highlighted
										? "border-2 border-[var(--color-accent-400)] bg-[var(--color-accent-50)]"
										: "border-[var(--color-neutral-300)] bg-[var(--surface-primary)]",
								].join(" ")}
							>
								{isPopular ? (
									<span className="mb-3 inline-flex rounded-full bg-[var(--color-accent-500)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--color-accent-950)]">
										{popularBadgeText}
									</span>
								) : null}
								{billingPeriod === "annual" && annualSavingsText ? (
									<span className="mb-3 inline-flex rounded-full bg-[var(--color-accent-100)] px-3 py-1 text-[length:var(--text-caption)] font-semibold text-[var(--color-accent-700)]">
										{annualSavingsText}
									</span>
								) : null}
								<h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
									{tier.name}
								</h3>
								<p className="mt-3 font-mono text-[length:var(--text-hero)] font-bold text-[var(--color-brand-text)]">
									{displayPrice}
								</p>
								{tier.description ? (
									<p className="mt-2 text-[length:var(--text-caption)] text-[var(--color-brand-muted)]">
										{tier.description}
									</p>
								) : null}
								<ul className="mt-6 space-y-3">
									{tier.features.map((feature) => (
										<li
											key={feature}
											className="text-[length:var(--text-caption)] text-[var(--color-brand-text)]"
										>
											{feature}
										</li>
									))}
								</ul>
								<a
									href={cta.target}
									className="btn-primary btn-shimmer mt-8 inline-flex w-full items-center justify-center"
								>
									{sanitizePublicSignupCtaText(cta.text)}
								</a>
							</article>
						);
					})}
				</div>
				{enterpriseTier ? (
					<aside className="mt-4 border-t border-[var(--color-neutral-300)] pt-4 text-[length:var(--text-caption)] leading-6 text-[var(--color-brand-muted)]">
						<span className="font-semibold text-[var(--color-brand-text)]">
							{enterpriseTier.name}
						</span>
						<span className="mx-2 text-[var(--color-neutral-300)]">|</span>
						<span>{enterpriseTier.price}</span>
						{enterpriseTier.description ? (
							<>
								<span className="mx-2 text-[var(--color-neutral-300)]">|</span>
								<span>{enterpriseTier.description}</span>
							</>
						) : null}
						<span className="mx-2 text-[var(--color-neutral-300)]">|</span>
						<a
							href="/pricing/#contact"
							className="font-medium text-[var(--color-brand-text)] underline underline-offset-4"
						>
							Contact sales
						</a>
					</aside>
				) : null}
			</div>
		</section>
	);
}
