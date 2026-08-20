import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { setSignedUp } from "../lib/exit-popup-utils";
import { captureException } from "../lib/sentry-client";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";

interface TurnstileInstance {
	render(
		container: HTMLElement,
		params: {
			sitekey: string;
			callback: (token: string) => void;
			"error-callback": () => void;
			"expired-callback": () => void;
		},
	): string;
	reset(widgetId: string): void;
	remove(widgetId: string): void;
}

declare global {
	interface Window {
		turnstile?: TurnstileInstance;
	}
}

interface LeadCaptureFormProps {
	apiUrl: string;
	magnetSlug: string;
	magnetTitle: string;
	sourcePage?: string;
	buttonText?: string;
	onSuccess?: (data: SuccessData) => void;
	turnstileSiteKey?: string;
}

type FormStatus = "idle" | "loading" | "success" | "error";

interface SuccessData {
	downloadUrl: string;
	emailed?: boolean;
}

const errorId = "lead-capture-email-error";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const VERIFICATION_ERROR_MESSAGE =
	"Verification failed. Please complete the challenge and try again.";
const VERIFICATION_UNAVAILABLE_MESSAGE =
	"Verification is temporarily unavailable. Please reload the page and try again.";
const RATE_LIMIT_ERROR_MESSAGE = "Too many attempts. Please wait a moment and try again.";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let turnstileReadyTimeoutMs = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class TurnstileAvailabilityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "TurnstileAvailabilityError";
	}
}

function isTurnstileAvailabilityError(err: unknown): err is TurnstileAvailabilityError {
	return err instanceof TurnstileAvailabilityError;
}

function readUtmParams(): Record<string, string> {
	try {
		const params = new URLSearchParams(window.location.search);
		const result: Record<string, string> = {};
		const utmSource = params.get("utm_source");
		const utmMedium = params.get("utm_medium");
		const utmCampaign = params.get("utm_campaign");
		if (utmSource) result.utmSource = utmSource;
		if (utmMedium) result.utmMedium = utmMedium;
		if (utmCampaign) result.utmCampaign = utmCampaign;
		return result;
	} catch {
		return {};
	}
}

// Module-level singleton to avoid injecting the script more than once
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
	// If turnstile is already available on window, no need to load the script
	if (window.turnstile) return Promise.resolve();

	if (turnstileScriptPromise) return turnstileScriptPromise;

	// Check if an existing script tag is already in the DOM
	const existingScript = document.querySelector<HTMLScriptElement>(
		`script[src="${TURNSTILE_SCRIPT_URL}"]`,
	);
	if (existingScript) {
		turnstileScriptPromise = waitForTurnstileReady(existingScript);
		return turnstileScriptPromise;
	}

	const script = document.createElement("script");
	script.src = TURNSTILE_SCRIPT_URL;
	script.async = true;
	script.defer = true;
	const scriptPromise = waitForTurnstileReady(script);
	turnstileScriptPromise = scriptPromise;
	document.head.appendChild(script);

	return scriptPromise;
}

function waitForTurnstileReady(script: HTMLScriptElement): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		if (window.turnstile) {
			resolve();
			return;
		}

		const timeout = window.setTimeout(() => {
			turnstileScriptPromise = null;
			cleanup();
			script.remove();
			reject(new TurnstileAvailabilityError("Timed out waiting for Turnstile to initialize"));
		}, turnstileReadyTimeoutMs);

		const interval = window.setInterval(checkReady, 25);

		function cleanup() {
			window.clearTimeout(timeout);
			window.clearInterval(interval);
			script.removeEventListener("load", checkReady);
			script.removeEventListener("error", handleError);
		}

		function checkReady() {
			if (!window.turnstile) return;
			cleanup();
			resolve();
		}

		function handleError() {
			turnstileScriptPromise = null;
			cleanup();
			script.remove();
			reject(new TurnstileAvailabilityError("Failed to load Turnstile script"));
		}

		script.addEventListener("load", checkReady);
		script.addEventListener("error", handleError);
	});
}

export function __waitForTurnstileReadyForTests(script: HTMLScriptElement): Promise<void> {
	return waitForTurnstileReady(script);
}

// Test-only: reset the module-level script singleton so each test exercises
// loadTurnstileScript from a clean state (mirrors the worker's reset helpers).
export function __resetTurnstileScriptStateForTests(): void {
	turnstileScriptPromise = null;
}

// Test-only: override the Turnstile ready timeout so tests can trigger the
// timeout path without waiting 10 s or requiring fake timers.
export function __setTurnstileReadyTimeoutMsForTests(ms: number): void {
	turnstileReadyTimeoutMs = ms;
}

export function LeadCaptureFormInner({
	apiUrl,
	magnetSlug,
	magnetTitle,
	sourcePage,
	buttonText = "Get my free guide",
	onSuccess,
	turnstileSiteKey,
}: LeadCaptureFormProps) {
	const [email, setEmail] = useState("");
	const [honeypot, setHoneypot] = useState("");
	const [status, setStatus] = useState<FormStatus>("idle");
	const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
	const [emailed, setEmailed] = useState(true);
	const [errorMessage, setErrorMessage] = useState(GENERIC_ERROR_MESSAGE);
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

	const turnstileContainerRef = useRef<HTMLDivElement>(null);
	const widgetIdRef = useRef<string | null>(null);

	function trackLeadEvent(event: string, properties?: Record<string, unknown>): void {
		trackEvent(event, {
			magnet_slug: magnetSlug,
			source_page: sourcePage,
			...properties,
		});
	}

	useEffect(() => {
		if (!turnstileSiteKey) return;

		let cancelled = false;

		loadTurnstileScript()
			.then(() => {
				if (cancelled || !turnstileContainerRef.current || !window.turnstile) return;

				widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
					sitekey: turnstileSiteKey,
					callback: (token: string) => {
						setTurnstileToken(token);
					},
					"error-callback": () => {
						setTurnstileToken(null);
					},
					"expired-callback": () => {
						setTurnstileToken(null);
					},
				});
			})
			.catch((err: unknown) => {
				if (isTurnstileAvailabilityError(err)) {
					if (!cancelled) {
						setTurnstileToken(null);
						setErrorMessage(VERIFICATION_UNAVAILABLE_MESSAGE);
						setStatus("error");
					}
					return;
				}
				captureException(err, { tags: { component: "LeadCaptureForm", surface: "marketing" } });
			});

		return () => {
			cancelled = true;
			if (widgetIdRef.current !== null && window.turnstile?.remove) {
				try {
					window.turnstile.remove(widgetIdRef.current);
				} catch (err) {
					captureException(err, {
						tags: {
							component: "LeadCaptureForm",
							surface: "marketing",
							turnstileOperation: "remove",
						},
					});
				}
			}
			widgetIdRef.current = null;
		};
	}, [turnstileSiteKey]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			setErrorMessage("Email address is required.");
			setStatus("error");
			trackLeadEvent("lead_capture_validation_failed", { reason: "email_required" });
			return;
		}
		if (!EMAIL_PATTERN.test(trimmedEmail)) {
			setErrorMessage("Enter a valid email address.");
			setStatus("error");
			trackLeadEvent("lead_capture_validation_failed", { reason: "email_invalid" });
			return;
		}

		if (turnstileSiteKey && !turnstileToken) {
			setErrorMessage("Please complete the verification challenge.");
			setStatus("error");
			trackLeadEvent("lead_capture_validation_failed", { reason: "verification_required" });
			return;
		}

		setStatus("loading");
		setErrorMessage(GENERIC_ERROR_MESSAGE);
		trackLeadEvent("lead_capture_started");

		try {
			const utmParams = readUtmParams();
			const body: Record<string, string | undefined> = {
				email: trimmedEmail,
				magnetSlug,
				sourcePage,
				company_website: honeypot,
				...utmParams,
			};

			if (turnstileSiteKey && turnstileToken) {
				body.turnstileToken = turnstileToken;
			}

			// Remove undefined values
			for (const key of Object.keys(body)) {
				if (body[key] === undefined) {
					delete body[key];
				}
			}

			const res = await fetch(`${apiUrl}/api/leads`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});

			// Reset Turnstile after each attempt (success or failure)
			if (widgetIdRef.current !== null && window.turnstile?.reset) {
				window.turnstile.reset(widgetIdRef.current);
				setTurnstileToken(null);
			}

			if (res.ok) {
				const data = (await res.json()) as SuccessData;
				setDownloadUrl(data.downloadUrl ?? null);
				setEmailed(data.emailed !== false);
				setSignedUp();
				onSuccess?.(data);
				setStatus("success");
				trackLeadEvent("lead_capture_completed", {
					emailed: data.emailed !== false,
					download_available: Boolean(data.downloadUrl),
				});
			} else {
				const requestId = await readRequestId(res);
				if (res.status === 403) {
					setErrorMessage(VERIFICATION_ERROR_MESSAGE);
					trackLeadEvent("lead_capture_failed", {
						reason: "verification_failed",
						status_code: res.status,
					});
					if (!turnstileSiteKey) {
						captureException(new Error(`Lead capture request failed with status ${res.status}`), {
							tags: { component: "LeadCaptureForm", status: 403, surface: "marketing" },
						});
					}
				} else if (res.status === 429) {
					setErrorMessage(RATE_LIMIT_ERROR_MESSAGE);
					trackLeadEvent("lead_capture_failed", {
						reason: "rate_limited",
						status_code: res.status,
					});
				} else if (res.status >= 500) {
					captureException(new Error(`Lead capture request failed with status ${res.status}`), {
						tags: { component: "LeadCaptureForm", status: res.status, surface: "marketing" },
					});
					setErrorMessage(formatErrorMessage(requestId));
					trackLeadEvent("lead_capture_failed", {
						reason: "server_error",
						status_code: res.status,
					});
				}
				setStatus("error");
			}
		} catch (err) {
			captureException(err);
			trackLeadEvent("lead_capture_failed", { reason: "network_error" });
			setStatus("error");
		}
	}

	if (status === "success") {
		return (
			<div
				className="rounded-[var(--radius-lg,12px)] border border-[var(--color-neutral-200)] p-6 sm:p-8 text-center animate-[fadeInUp_0.4s_ease-out]"
				style={{ background: "var(--surface-sunken)" }}
			>
				<p
					className="font-heading font-bold mb-2"
					style={{
						fontSize: "var(--text-heading, 1.25rem)",
						color: "var(--color-brand-text)",
					}}
				>
					{emailed
						? `Check your inbox. We just emailed your copy of ${magnetTitle}`
						: "Your download is ready"}
				</p>
				{downloadUrl ? (
					<a
						href={downloadUrl}
						className="btn-primary btn-shimmer inline-flex items-center justify-center whitespace-nowrap px-6 mt-4"
						download
					>
						Download now
					</a>
				) : null}
			</div>
		);
	}

	const isLoading = status === "loading";
	const isError = status === "error";

	return (
		<form onSubmit={handleSubmit} aria-label="Get free guide" className="space-y-4" noValidate>
			{/* Honeypot field; hidden from real users, filled only by bots */}
			<input
				name="company_website"
				type="text"
				value={honeypot}
				onChange={(e) => setHoneypot(e.target.value)}
				tabIndex={-1}
				autoComplete="off"
				aria-hidden="true"
				style={{
					position: "absolute",
					left: "-9999px",
					opacity: 0,
					height: 0,
					width: 0,
					overflow: "hidden",
				}}
			/>

			<div className="flex flex-col gap-1">
				<label
					htmlFor="lead-capture-email"
					className="font-medium text-[var(--color-brand-text)]"
					style={{ fontSize: "var(--text-caption)" }}
				>
					Email address
				</label>
				<input
					id="lead-capture-email"
					type="email"
					required
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="jane@yourprogram.com"
					disabled={isLoading}
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
					style={{ fontSize: "var(--text-body)" }}
				/>
			</div>

			{isError ? (
				<p
					id={errorId}
					role="alert"
					className="text-[var(--color-error-500)]"
					style={{ fontSize: "var(--text-caption)" }}
				>
					{errorMessage}
				</p>
			) : (
				<p id={errorId} className="sr-only" aria-live="polite" />
			)}

			{turnstileSiteKey ? <div data-turnstile-widget ref={turnstileContainerRef} /> : null}

			<button
				type="submit"
				disabled={isLoading}
				className={clsx(
					"btn-primary btn-shimmer w-full flex items-center justify-center gap-2",
					"disabled:opacity-50 disabled:cursor-not-allowed",
					isLoading && "cursor-wait",
				)}
			>
				{isLoading ? (
					<>
						<span
							className="w-4 h-4 rounded-full border-2 border-[var(--color-accent-950)] border-t-transparent animate-spin"
							aria-hidden="true"
						/>
						<span>Sending…</span>
					</>
				) : (
					buttonText
				)}
			</button>
		</form>
	);
}

export const LeadCaptureForm = withMarketingIslandErrorBoundary(LeadCaptureFormInner, {
	componentName: "LeadCaptureForm",
	mode: "silent",
});

async function readRequestId(res: Response): Promise<string | undefined> {
	const headerRequestId = res.headers.get("x-request-id") ?? undefined;

	try {
		const body = (await res.clone().json()) as { requestId?: unknown };
		return typeof body.requestId === "string" && body.requestId.trim()
			? body.requestId
			: headerRequestId;
	} catch {
		return headerRequestId;
	}
}

function formatErrorMessage(requestId: string | undefined): string {
	if (!requestId?.trim()) {
		return GENERIC_ERROR_MESSAGE;
	}

	return `${GENERIC_ERROR_MESSAGE} Reference ID: ${requestId}`;
}
