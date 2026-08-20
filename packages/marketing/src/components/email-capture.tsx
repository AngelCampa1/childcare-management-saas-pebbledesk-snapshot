import { ANALYTICS_EVENTS } from "@pebbledesk/shared";
import { clsx } from "clsx";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { EMAIL_REGEX } from "../lib/email-validation";
import { trackEmailBlurWithoutSubmit, trackEmailFocus } from "../lib/form-interaction-tracker";
import { resolvePublicSignupCta } from "../lib/public-signup-cta";
import type { PublicSignupFlowConfig } from "../lib/public-signup-flow";
import { captureException } from "../lib/sentry-client";
import { persistSignupAttribution, resolveSignupAttribution } from "../lib/signup-attribution";
import type { ReferralReward, SurveyQualificationConfig, SurveyQuestion } from "../types";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";
import { PostSignupSurvey } from "./post-signup-survey";

interface SignupResponse {
	referralCode?: string;
	position?: number;
	surveyToken?: string;
}

type SubmitStatus =
	| "idle"
	| "loading"
	| "success"
	| "error-validation"
	| "error-duplicate"
	| "error-generic";

const PRE_SUBMIT_QUESTION_COPY_PATTERN = /\b(question|questions|survey|questionnaire)\b/i;

interface EmailCaptureProps {
	apiUrl: string;
	sourcePage: string;
	buttonText?: string;
	placeholder?: string;
	emailLabel?: string;
	inputId?: string;
	signupFlowConfigUrl?: string;
	surveyQuestions?: SurveyQuestion[];
	surveyQualification?: SurveyQualificationConfig;
	qualification?: SurveyQualificationConfig;
	discoveryCallUrl?: string;
	subtitle?: string;
	whatHappensNext?: string;
	privacyNote?: string;
	errorInvalidEmail?: string;
	errorDuplicate?: string;
	errorGeneric?: string;
	successMessage?: string;
	surveyPreview?: string;
	referralRewards?: ReferralReward[];
	productName?: string;
	productDomain?: string;
	qualifiedHeading?: string;
	qualifiedBody?: string;
	qualifiedCtaText?: string;
	unqualifiedHeading?: string;
	unqualifiedBody?: string;
	unqualifiedCtaText?: string;
	unqualifiedCtaTarget?: string;
	qualifiedDismissText?: string;
	unqualifiedDismissText?: string;
	ariaLabel?: string;
	loadingText?: string;
}

function EmailCaptureInner({
	apiUrl,
	sourcePage,
	buttonText = "Continue",
	placeholder,
	emailLabel = "Email address",
	inputId,
	signupFlowConfigUrl,
	surveyQuestions,
	surveyQualification,
	qualification,
	discoveryCallUrl,
	subtitle,
	whatHappensNext,
	privacyNote,
	errorInvalidEmail,
	errorDuplicate,
	errorGeneric,
	successMessage = "You're in!",
	surveyPreview,
	referralRewards,
	productName,
	productDomain,
	qualifiedHeading,
	qualifiedBody,
	qualifiedCtaText,
	unqualifiedHeading,
	unqualifiedBody,
	unqualifiedCtaText,
	unqualifiedCtaTarget,
	qualifiedDismissText,
	unqualifiedDismissText,
	ariaLabel = "Continue with your email",
	loadingText = "Sending…",
}: EmailCaptureProps) {
	const generatedInputId = useId().replace(/:/g, "");
	const resolvedInputId = inputId ?? `email-capture-${generatedInputId}`;
	const errorId = `${resolvedInputId}-error`;
	const [loadedSignupFlowConfig, setLoadedSignupFlowConfig] =
		useState<PublicSignupFlowConfig | null>(null);
	const [isLoadingSignupFlowConfig, setIsLoadingSignupFlowConfig] = useState(
		Boolean(signupFlowConfigUrl),
	);
	const [signupFlowLoadError, setSignupFlowLoadError] = useState<string | null>(null);
	const [email, setEmail] = useState("");
	const [status, setStatus] = useState<SubmitStatus>("idle");
	const [showSurvey, setShowSurvey] = useState(false);
	const [referralCode, setReferralCode] = useState<string | undefined>();
	const [position, setPosition] = useState<number | undefined>();
	const [surveyToken, setSurveyToken] = useState<string | undefined>();
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const signupFlowRequestRef = useRef<Promise<PublicSignupFlowConfig | null> | null>(null);
	const inlineSignupFlowConfig =
		surveyQuestions && discoveryCallUrl
			? ({
					surveyQuestions,
					surveyQualification,
					qualification: qualification ?? surveyQualification,
					discoveryCallUrl,
					subtitle,
					whatHappensNext,
					privacyNote,
					errorInvalidEmail,
					errorDuplicate,
					errorGeneric,
					successMessage,
					surveyPreview,
					referralRewards,
					productName,
					productDomain,
					qualifiedHeading,
					qualifiedBody,
					qualifiedCtaText,
					unqualifiedHeading,
					unqualifiedBody,
					unqualifiedCtaText,
					unqualifiedCtaTarget,
					qualifiedDismissText,
					unqualifiedDismissText,
				} satisfies PublicSignupFlowConfig)
			: null;
	const resolvedSignupFlowConfig = loadedSignupFlowConfig ?? inlineSignupFlowConfig;
	const resolvedQualification =
		resolvedSignupFlowConfig?.qualification ?? resolvedSignupFlowConfig?.surveyQualification;
	const resolvedSubtitle = subtitle ?? resolvedSignupFlowConfig?.subtitle;
	const visibleWhatHappensNext =
		(whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext) &&
		!PRE_SUBMIT_QUESTION_COPY_PATTERN.test(
			whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext ?? "",
		)
			? (whatHappensNext ?? resolvedSignupFlowConfig?.whatHappensNext)
			: undefined;

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current !== null) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	useEffect(() => {
		persistSignupAttribution();
	}, []);

	const loadSignupFlowConfig = useCallback(async (): Promise<PublicSignupFlowConfig | null> => {
		if (inlineSignupFlowConfig) {
			setSignupFlowLoadError(null);
			setIsLoadingSignupFlowConfig(false);
			return inlineSignupFlowConfig;
		}

		if (loadedSignupFlowConfig) {
			setSignupFlowLoadError(null);
			setIsLoadingSignupFlowConfig(false);
			return loadedSignupFlowConfig;
		}

		if (!signupFlowConfigUrl) {
			setIsLoadingSignupFlowConfig(false);
			return null;
		}

		if (!signupFlowRequestRef.current) {
			setIsLoadingSignupFlowConfig(true);
			setSignupFlowLoadError(null);
			signupFlowRequestRef.current = (async () => {
				const response = await fetch(signupFlowConfigUrl);
				if (!response.ok) {
					throw new Error(`Failed to load signup flow config from ${signupFlowConfigUrl}`);
				}

				const config = (await response.json()) as PublicSignupFlowConfig;
				setLoadedSignupFlowConfig(config);
				setIsLoadingSignupFlowConfig(false);
				return config;
			})().catch((error) => {
				signupFlowRequestRef.current = null;
				setIsLoadingSignupFlowConfig(false);
				setSignupFlowLoadError("We couldn't load the signup form. Please try again.");
				captureException(error);
				return null;
			});
		}

		return signupFlowRequestRef.current;
	}, [inlineSignupFlowConfig, loadedSignupFlowConfig, signupFlowConfigUrl]);

	useEffect(() => {
		void loadSignupFlowConfig();
	}, [loadSignupFlowConfig]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		if (params.get("survey") === "open") {
			const encoded = params.get("e");
			if (encoded) {
				try {
					const decodedEmail = atob(encoded);
					if (EMAIL_REGEX.test(decodedEmail)) {
						setEmail(decodedEmail);
						setStatus("success");
						setShowSurvey(true);
					}
				} catch {
					// ignore malformed base64
				}
			}
			const token = params.get("t");
			if (token) {
				setSurveyToken(token);
			}
		}
	}, []);

	function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
		setEmail(e.target.value);
		if (status.startsWith("error")) {
			setStatus("idle");
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!EMAIL_REGEX.test(email)) {
			setStatus("error-validation");
			return;
		}

		setStatus("loading");

		try {
			const attribution = resolveSignupAttribution();
			const res = await fetch(`${apiUrl}/api/signup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email,
					sourcePage,
					utmSource: attribution.utmSource,
					utmMedium: attribution.utmMedium,
					utmCampaign: attribution.utmCampaign,
					referredBy: attribution.referredBy,
				}),
			});

			if (res.ok) {
				try {
					const data = (await res.json()) as SignupResponse;
					if (data.referralCode) {
						setReferralCode(data.referralCode);
					}
					if (typeof data.position === "number") {
						setPosition(data.position);
					}
					if (data.surveyToken) {
						setSurveyToken(data.surveyToken);
					}
				} catch {
					// Response may not be JSON; continue without referral data
				}
				const utmProps: Record<string, string> = {};
				const utmSource = attribution.utmSource;
				const utmMedium = attribution.utmMedium;
				const utmCampaign = attribution.utmCampaign;
				if (utmSource) utmProps.utm_source = utmSource;
				if (utmMedium) utmProps.utm_medium = utmMedium;
				if (utmCampaign) utmProps.utm_campaign = utmCampaign;
				trackEvent(ANALYTICS_EVENTS.signupCompleted, {
					source_page: sourcePage,
					has_referral: attribution.referredBy !== undefined,
					...utmProps,
				});
				trackEvent(ANALYTICS_EVENTS.signupSubmitted, {
					source: "email_capture",
					source_page: sourcePage,
					...utmProps,
				});
				setStatus("success");
				if (timerRef.current) clearTimeout(timerRef.current);
				timerRef.current = setTimeout(() => {
					setShowSurvey(true);
				}, 1500);
			} else if (res.status === 409) {
				trackEvent(ANALYTICS_EVENTS.signupDuplicate, { source_page: sourcePage });
				if (errorDuplicate ?? resolvedSignupFlowConfig?.errorDuplicate) {
					setStatus("error-duplicate");
				} else {
					try {
						const data = (await res.json()) as SignupResponse;
						if (data.referralCode) {
							setReferralCode(data.referralCode);
						}
						if (typeof data.position === "number") {
							setPosition(data.position);
						}
						if (data.surveyToken) {
							setSurveyToken(data.surveyToken);
						}
					} catch {
						// continue without referral data
					}
					setStatus("success");
					if (timerRef.current) clearTimeout(timerRef.current);
					timerRef.current = setTimeout(() => {
						setShowSurvey(true);
					}, 1500);
				}
			} else {
				setStatus("error-generic");
			}
		} catch (err) {
			captureException(err);
			setStatus("error-generic");
		}
	}

	const isError =
		status === "error-validation" || status === "error-duplicate" || status === "error-generic";

	const currentErrorMessage =
		status === "error-validation"
			? (errorInvalidEmail ??
				resolvedSignupFlowConfig?.errorInvalidEmail ??
				"Please enter a valid email address")
			: status === "error-duplicate"
				? (errorDuplicate ?? resolvedSignupFlowConfig?.errorDuplicate)
				: status === "error-generic"
					? (errorGeneric ??
						resolvedSignupFlowConfig?.errorGeneric ??
						"Something went wrong. Please try again.")
					: "";

	if (!resolvedSignupFlowConfig) {
		if (signupFlowLoadError) {
			return (
				<div
					className="max-w-md mx-auto space-y-4 text-center"
					style={{ gap: "var(--component-gap-sm)" }}
				>
					<h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
						We couldn't load the signup form.
					</h3>
					<p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
						{signupFlowLoadError}
					</p>
					<button
						type="button"
						className="btn-primary mx-auto"
						onClick={() => void loadSignupFlowConfig()}
					>
						Try again
					</button>
				</div>
			);
		}

		return (
			<div
				className="max-w-md mx-auto space-y-4 text-center"
				style={{ gap: "var(--component-gap-sm)" }}
			>
				<h3 className="font-heading text-[length:var(--text-subheading)] font-bold text-[var(--color-brand-text)]">
					Loading signup form…
				</h3>
				<p className="text-[length:var(--text-body)] leading-7 text-[var(--color-brand-muted)]">
					We&apos;re preparing the next step for you.
				</p>
				{isLoadingSignupFlowConfig ? (
					<div
						className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-neutral-300)] border-t-[var(--color-accent-500)]"
						aria-hidden="true"
					/>
				) : null}
			</div>
		);
	}

	if (showSurvey) {
		return (
			<PostSignupSurvey
				apiUrl={apiUrl}
				surveyToken={surveyToken}
				questions={resolvedSignupFlowConfig.surveyQuestions}
				qualificationConfig={resolvedQualification}
				qualification={resolvedQualification}
				discoveryCallUrl={resolvedSignupFlowConfig.discoveryCallUrl}
				onComplete={() => setShowSurvey(false)}
				referralCode={referralCode}
				position={position}
				referralRewards={referralRewards ?? resolvedSignupFlowConfig.referralRewards}
				productName={productName ?? resolvedSignupFlowConfig.productName}
				productDomain={productDomain ?? resolvedSignupFlowConfig.productDomain}
				qualifiedHeading={qualifiedHeading ?? resolvedSignupFlowConfig.qualifiedHeading}
				qualifiedBody={qualifiedBody ?? resolvedSignupFlowConfig.qualifiedBody}
				qualifiedCtaText={qualifiedCtaText ?? resolvedSignupFlowConfig.qualifiedCtaText}
				unqualifiedHeading={unqualifiedHeading ?? resolvedSignupFlowConfig.unqualifiedHeading}
				unqualifiedBody={unqualifiedBody ?? resolvedSignupFlowConfig.unqualifiedBody}
				unqualifiedCtaText={unqualifiedCtaText ?? resolvedSignupFlowConfig.unqualifiedCtaText}
				unqualifiedCtaTarget={unqualifiedCtaTarget ?? resolvedSignupFlowConfig.unqualifiedCtaTarget}
				qualifiedDismissText={qualifiedDismissText ?? resolvedSignupFlowConfig.qualifiedDismissText}
				unqualifiedDismissText={
					unqualifiedDismissText ?? resolvedSignupFlowConfig.unqualifiedDismissText
				}
				sourcePage={sourcePage}
			/>
		);
	}

	return (
		<div
			className="max-w-md mx-auto"
			style={{
				display: "flex",
				flexDirection: "column",
				gap: "var(--component-gap-sm)",
			}}
		>
			<form
				onSubmit={handleSubmit}
				aria-label={ariaLabel}
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "var(--component-gap-sm)",
				}}
			>
				<div
					className="flex flex-col sm:flex-row items-end"
					style={{ gap: "var(--component-gap-sm)" }}
				>
					<div className="flex flex-col gap-1 flex-1">
						<label
							htmlFor={resolvedInputId}
							className="font-medium text-[var(--color-brand-text)]"
							style={{ fontSize: "var(--text-caption)" }}
						>
							{emailLabel}
						</label>
						<input
							id={resolvedInputId}
							type="email"
							required
							autoComplete="email"
							value={email}
							onChange={handleEmailChange}
							onFocus={() => trackEmailFocus(sourcePage)}
							onBlur={() => {
								if (status !== "success" && status !== "loading") {
									trackEmailBlurWithoutSubmit(sourcePage, email.length > 0);
								}
							}}
							placeholder={placeholder ?? "your@email.com"}
							aria-invalid={isError}
							aria-describedby={errorId}
							className={clsx(
								"w-full px-4 py-3 rounded-[var(--radius-md)] border",
								"bg-[var(--surface-sunken)]",
								"font-mono",
								"focus:outline-none focus:border-[var(--color-primary-500)] focus:border-2 focus:shadow-[var(--shadow-glow-primary)]",
								"transition-[border-color] duration-[var(--transition-fast)]",
								isError
									? "border-[var(--color-error-500)] animate-[shake_0.4s_ease-in-out]"
									: "border-[var(--color-neutral-300)]",
							)}
							disabled={status === "loading"}
							style={{
								caretColor: "var(--color-primary-500)",
								fontSize: "var(--text-body)",
								boxShadow: "var(--shadow-md)",
							}}
						/>
					</div>
					<button
						type="submit"
						disabled={status === "loading" || status === "success"}
						className={clsx(
							"btn-primary btn-shimmer",
							"disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100",
							"flex items-center justify-center gap-2 min-w-[140px]",
							status === "loading" && "cursor-wait",
						)}
					>
						{status === "loading" ? (
							<>
								<span
									className="w-4 h-4 rounded-full border-2 border-[var(--color-accent-950)] border-t-transparent animate-spin"
									aria-hidden="true"
								/>
								<span>{loadingText}</span>
							</>
						) : status === "success" ? (
							<>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
									<circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.2" />
									<path
										d="M4.5 8l2.5 2.5 4.5-5"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								{successMessage && <span>{successMessage}</span>}
							</>
						) : (
							buttonText
						)}
					</button>
				</div>
			</form>

			{status === "success" && (surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview) ? (
				<p
					className="text-[var(--color-brand-muted)] text-center"
					style={{ fontSize: "var(--text-caption)" }}
				>
					{surveyPreview ?? resolvedSignupFlowConfig?.surveyPreview}
				</p>
			) : null}

			<p
				id={errorId}
				aria-live="polite"
				className={isError && !!currentErrorMessage ? "text-[var(--color-error-500)]" : "sr-only"}
				style={isError && !!currentErrorMessage ? { fontSize: "var(--text-caption)" } : undefined}
			>
				{isError ? currentErrorMessage : ""}
			</p>

			{resolvedSubtitle ? (
				<p
					className="font-semibold text-[var(--color-brand-text)] text-center"
					style={{ fontSize: "var(--text-caption)" }}
				>
					{resolvedSubtitle}
				</p>
			) : null}

			{(privacyNote ?? resolvedSignupFlowConfig?.privacyNote) ? (
				<p className="text-[var(--color-brand-muted)]" style={{ fontSize: "var(--text-caption)" }}>
					{privacyNote ?? resolvedSignupFlowConfig?.privacyNote}
				</p>
			) : null}

			{status === "idle" && visibleWhatHappensNext ? (
				<p
					className="text-[var(--color-brand-muted)] text-center"
					style={{ fontSize: "var(--text-caption)" }}
				>
					{visibleWhatHappensNext}
				</p>
			) : null}
		</div>
	);
}

export const EmailCapture = withMarketingIslandErrorBoundary(EmailCaptureInner, {
	componentName: "EmailCapture",
	mode: "cta",
	getFallbackCta: ({ sourcePage, buttonText }) => {
		const resolvedCta = resolvePublicSignupCta({
			sourcePage,
			explicitText: buttonText,
		});

		return {
			href: resolvedCta.target,
			text: resolvedCta.text,
			description: "The guided signup flow is unavailable right now, but you can still continue.",
		};
	},
});
