import { resolvePublicSignupCta } from "../lib/public-signup-cta";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";

interface PublicSignupCtaProps {
	sourcePage: string;
	buttonText?: string;
	ctaText?: string;
	ctaTarget?: string;
}

function PublicSignupCtaInner({
	sourcePage,
	buttonText,
	ctaText,
	ctaTarget,
}: PublicSignupCtaProps) {
	const resolvedCta = resolvePublicSignupCta({
		sourcePage,
		explicitTarget: ctaTarget,
		explicitText: ctaText ?? buttonText,
	});

	return (
		<a
			href={resolvedCta.target}
			className="btn-primary btn-shimmer inline-flex items-center justify-center"
		>
			{resolvedCta.text}
		</a>
	);
}

const PublicSignupCta = withMarketingIslandErrorBoundary(PublicSignupCtaInner, {
	componentName: "PublicSignupCta",
	mode: "cta",
	getFallbackCta: ({ sourcePage, buttonText, ctaText, ctaTarget }) => {
		const resolvedCta = resolvePublicSignupCta({
			sourcePage,
			explicitTarget: ctaTarget,
			explicitText: ctaText ?? buttonText,
		});

		return {
			href: resolvedCta.target,
			text: resolvedCta.text,
		};
	},
});

export default PublicSignupCta;
