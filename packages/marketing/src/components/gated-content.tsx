import { isSignedUp } from "../lib/exit-popup-utils";
import { sanitizeHtml } from "../lib/sanitize";
import { LeadCaptureForm } from "./lead-capture-form";

interface GatedContentProps {
	apiUrl: string;
	leadMagnetTitle: string;
	description: string;
	ctaText: string;
	teaserHtml: string;
	privacyNote?: string;
	sourcePage?: string;
	magnetSlug: string;
	turnstileSiteKey?: string;
}

export function GatedContent({
	apiUrl,
	leadMagnetTitle,
	description,
	ctaText,
	teaserHtml,
	privacyNote,
	sourcePage,
	magnetSlug,
	turnstileSiteKey,
}: GatedContentProps) {
	if (isSignedUp()) {
		return (
			<div>
				<div
					className="prose prose-lg max-w-none"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized via sanitizeHtml before rendering
					dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
				/>
				<div
					className="rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center mt-6"
					style={{ background: "var(--surface-sunken)" }}
				>
					<p
						className="font-heading font-bold mb-2"
						style={{
							fontSize: "var(--text-heading, 1.25rem)",
							color: "var(--color-brand-text)",
						}}
					>
						You already have access.
					</p>
					<p
						className="mt-2"
						style={{
							fontSize: "var(--text-caption, 0.875rem)",
							color: "var(--color-brand-muted)",
						}}
					>
						Download your copy of {leadMagnetTitle}.
					</p>
					<a
						href={`/lead-magnets/${magnetSlug}.pdf`}
						className="btn-primary btn-shimmer inline-flex items-center justify-center whitespace-nowrap px-6 mt-4"
						download
					>
						Download now
					</a>
				</div>
			</div>
		);
	}

	return (
		<div>
			<div
				className="prose prose-lg max-w-none"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized via sanitizeHtml before rendering
				dangerouslySetInnerHTML={{ __html: sanitizeHtml(teaserHtml) }}
			/>

			<div className="lead-magnet-gate relative">
				<div
					className="pointer-events-none h-24 -mt-24 relative z-10"
					style={{
						background: "linear-gradient(to bottom, transparent, var(--surface-sunken))",
					}}
				/>

				<div
					className="relative z-20 rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8"
					style={{ background: "var(--surface-sunken)" }}
				>
					<h3
						className="font-heading font-bold mb-2 text-center"
						style={{
							fontSize: "var(--text-heading, 1.25rem)",
							color: "var(--color-brand-text)",
						}}
					>
						{leadMagnetTitle}
					</h3>
					<p
						className="mb-6 text-center"
						style={{
							fontSize: "var(--text-caption, 0.875rem)",
							color: "var(--color-brand-muted)",
						}}
					>
						{description}
					</p>

					<LeadCaptureForm
						apiUrl={apiUrl}
						magnetSlug={magnetSlug}
						magnetTitle={leadMagnetTitle}
						sourcePage={sourcePage}
						buttonText={ctaText}
						turnstileSiteKey={turnstileSiteKey}
					/>

					{privacyNote ? (
						<p
							className="mt-4 text-center"
							style={{
								fontSize: "var(--text-caption, 0.875rem)",
								color: "var(--color-brand-muted)",
							}}
						>
							{privacyNote}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}
