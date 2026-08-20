import type { ComponentType, ReactNode } from "react";
import { Component } from "react";
import { captureException } from "../lib/sentry-client";

type SilentBoundaryMode = {
	mode: "silent";
};

type CtaBoundaryMode<TProps> = {
	mode: "cta";
	getFallbackCta: (props: TProps) => {
		href: string;
		text: string;
		description?: string;
	};
};

type MarketingIslandBoundaryOptions<TProps> = {
	componentName: string;
} & (SilentBoundaryMode | CtaBoundaryMode<TProps>);

type MarketingIslandErrorBoundaryProps = {
	componentName: string;
	fallback: ReactNode;
	children: ReactNode;
};

type MarketingIslandErrorBoundaryState = {
	hasError: boolean;
};

export class MarketingIslandErrorBoundary extends Component<
	MarketingIslandErrorBoundaryProps,
	MarketingIslandErrorBoundaryState
> {
	override state: MarketingIslandErrorBoundaryState = {
		hasError: false,
	};

	static getDerivedStateFromError(): MarketingIslandErrorBoundaryState {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown): void {
		captureException(error, {
			tags: { component: this.props.componentName, surface: "marketing" },
		});
	}

	override render() {
		if (this.state.hasError) {
			return this.props.fallback;
		}

		return this.props.children;
	}
}

export function MarketingIslandFallbackCta({
	href,
	text,
	description,
}: {
	href: string;
	text: string;
	description?: string;
}) {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
			{description ? (
				<p className="text-sm leading-6 text-[var(--color-brand-muted)]">{description}</p>
			) : null}
			<a href={href} className="btn-primary btn-shimmer inline-flex items-center justify-center">
				{text}
			</a>
		</div>
	);
}

export function withMarketingIslandErrorBoundary<TProps extends object>(
	WrappedComponent: ComponentType<TProps>,
	options: MarketingIslandBoundaryOptions<TProps>,
) {
	function MarketingIslandBoundaryWrapped(props: TProps) {
		const fallback =
			options.mode === "silent" ? null : (
				<MarketingIslandFallbackCta {...options.getFallbackCta(props)} />
			);

		return (
			<MarketingIslandErrorBoundary componentName={options.componentName} fallback={fallback}>
				<WrappedComponent {...props} />
			</MarketingIslandErrorBoundary>
		);
	}

	MarketingIslandBoundaryWrapped.displayName = `withMarketingIslandErrorBoundary(${options.componentName})`;

	return MarketingIslandBoundaryWrapped;
}
