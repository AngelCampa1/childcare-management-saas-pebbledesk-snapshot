import { Button } from "@pebbledesk/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@pebbledesk/ui/components/dialog";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { Textarea } from "@pebbledesk/ui/components/textarea";
import { Loader2, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import { formatUserFacingError } from "../lib/user-facing-error";

const MAX_MESSAGE_LENGTH = 5000;
const PULSE_DELAY_MS = 10000;
const AUTO_CLOSE_DELAY_MS = 1500;
const SESSION_KEY = "feedback_widget_pulsed";

function isValidEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export interface FeedbackWidgetProps {
	userEmail?: string;
}

export function FeedbackWidget({ userEmail }: FeedbackWidgetProps) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState(userEmail ?? "");
	const [message, setMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [validationError, setValidationError] = useState<string | null>(null);
	const [succeeded, setSucceeded] = useState(false);
	const [isPulsing, setIsPulsing] = useState(false);
	const pulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pulseEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const openRef = useRef(open);

	useEffect(() => {
		openRef.current = open;
	}, [open]);

	useEffect(() => {
		try {
			if (sessionStorage.getItem(SESSION_KEY)) return;
		} catch {
			// sessionStorage unavailable (e.g. Safari private mode)
			return;
		}

		pulseTimeoutRef.current = setTimeout(() => {
			if (!openRef.current) {
				setIsPulsing(true);
				try {
					sessionStorage.setItem(SESSION_KEY, "1");
				} catch {
					// sessionStorage unavailable — pulse still works, just won't persist
				}
				pulseEndTimeoutRef.current = setTimeout(() => setIsPulsing(false), 700);
			}
		}, PULSE_DELAY_MS);

		return () => {
			if (pulseTimeoutRef.current !== null) {
				clearTimeout(pulseTimeoutRef.current);
			}
			if (pulseEndTimeoutRef.current !== null) {
				clearTimeout(pulseEndTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		return () => {
			if (closeTimeoutRef.current !== null) {
				clearTimeout(closeTimeoutRef.current);
			}
		};
	}, []);

	function handleOpenChange(next: boolean) {
		if (!next) {
			if (closeTimeoutRef.current !== null) {
				clearTimeout(closeTimeoutRef.current);
				closeTimeoutRef.current = null;
			}
			setMessage("");
			setSubmitError(null);
			setValidationError(null);
			setSucceeded(false);
			setEmail(userEmail ?? "");
		}
		setOpen(next);
	}

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();

		if (!isValidEmail(email)) {
			setValidationError("Please enter a valid email address.");
			return;
		}

		if (message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) {
			setValidationError(`Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`);
			return;
		}

		setValidationError(null);
		setSubmitError(null);
		setIsSubmitting(true);

		try {
			const res = await apiFetch("/api/feedback", {
				method: "POST",
				body: JSON.stringify({
					reporterEmail: email,
					message,
					pageUrl: window.location.pathname,
					userAgent: navigator.userAgent,
					viewport: `${window.innerWidth}x${window.innerHeight}`,
				}),
			});

			if (!res.ok) {
				setSubmitError("Something went wrong. Please try again.");
				return;
			}

			setSucceeded(true);
			closeTimeoutRef.current = setTimeout(() => {
				handleOpenChange(false);
			}, AUTO_CLOSE_DELAY_MS);
		} catch (error) {
			setSubmitError(formatUserFacingError(error, "Something went wrong. Please try again."));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<style>{`
				@keyframes feedback-pulse {
					0%, 100% { transform: scale(1); }
					50% { transform: scale(1.12); }
				}
				.feedback-pulse {
					animation: feedback-pulse 0.6s ease-in-out;
				}
			`}</style>

			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogTrigger asChild>
					<Button
						variant="default"
						size="default"
						className={`fixed bottom-6 right-6 z-50 min-h-11 min-w-11 rounded-full shadow-lg gap-2 transition-all duration-200 motion-safe:hover:scale-105 hover:shadow-xl${isPulsing ? " feedback-pulse" : ""}`}
						aria-label="Feedback"
					>
						<MessageCircle size={16} />
						<span className="hidden sm:inline">Feedback</span>
					</Button>
				</DialogTrigger>

				<DialogContent>
					<DialogHeader>
						<DialogTitle>Send feedback</DialogTitle>
						<DialogDescription>Tell us what's broken or what you'd like to see.</DialogDescription>
					</DialogHeader>

					{succeeded ? (
						<p className="text-center text-sm text-muted-foreground py-4">
							Thanks — we'll get back to you.
						</p>
					) : (
						<form onSubmit={handleSubmit} noValidate>
							<div className="grid gap-4 py-2">
								<div className="grid gap-1.5">
									<Label htmlFor="feedback-email">Your email</Label>
									<Input
										id="feedback-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										autoComplete="email"
									/>
								</div>

								<div className="grid gap-1.5">
									<Label htmlFor="feedback-message">Message</Label>
									<Textarea
										id="feedback-message"
										className="h-28"
										placeholder="Describe the issue or feature request…"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
										maxLength={MAX_MESSAGE_LENGTH}
									/>
									<p className="text-xs text-muted-foreground text-right">
										{message.length} / {MAX_MESSAGE_LENGTH}
									</p>
								</div>
							</div>

							{(validationError ?? submitError) ? (
								<p className="text-sm text-destructive mb-2">{validationError ?? submitError}</p>
							) : null}

							<DialogFooter>
								<Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? (
										<>
											<Loader2 className="animate-spin" />
											Sending…
										</>
									) : (
										"Send"
									)}
								</Button>
							</DialogFooter>
						</form>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
