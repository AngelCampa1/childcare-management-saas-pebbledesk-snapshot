import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { captureException } from "./lib/sentry";

type FallbackErrorBoundaryState = { hasError: boolean };

export class FallbackErrorBoundary extends Component<
	{ children: ReactNode },
	FallbackErrorBoundaryState
> {
	constructor(props: { children: ReactNode }) {
		super(props);
		this.state = { hasError: false };
	}

	static getDerivedStateFromError(): FallbackErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[FallbackErrorBoundary]", error, info);
		captureException(error, {
			tags: { component: "FallbackErrorBoundary", surface: "app" },
			extra: { componentStack: info.componentStack },
		});
	}

	render() {
		if (this.state.hasError) {
			return (
				<div
					style={{
						display: "flex",
						minHeight: "100vh",
						alignItems: "center",
						justifyContent: "center",
						padding: "2rem",
						textAlign: "center",
					}}
				>
					<div>
						<h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
						<p
							style={{
								marginTop: "0.5rem",
								fontSize: "0.875rem",
								color: "var(--color-muted-foreground)",
							}}
						>
							Please refresh the page to continue.
						</p>
						<button
							type="button"
							style={{
								marginTop: "1rem",
								padding: "0.5rem 1rem",
								borderRadius: "9999px",
								cursor: "pointer",
							}}
							onClick={() => {
								this.setState({ hasError: false });
								window.location.reload();
							}}
						>
							Refresh
						</button>
					</div>
				</div>
			);
		}
		return this.props.children;
	}
}
