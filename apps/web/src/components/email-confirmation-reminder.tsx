import { Button } from "@pebbledesk/ui/components/button";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "../api";
import { extractErrorMessage } from "../lib/extract-error-message";

type EmailConfirmationReminderProps = {
	emailVerified?: boolean;
	email?: string;
	className?: string;
};

export function EmailConfirmationReminder({
	emailVerified,
	email,
	className,
}: EmailConfirmationReminderProps) {
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
	const [message, setMessage] = useState<string | null>(null);

	if (emailVerified !== false) {
		return null;
	}

	async function handleResend() {
		setStatus("sending");
		setMessage(null);
		try {
			await apiFetch("/api/auth/resend-verification", { method: "POST" });
			setStatus("sent");
			setMessage("Confirmation email sent.");
		} catch (error) {
			setStatus("error");
			setMessage(extractErrorMessage(error, "We could not resend that email."));
		}
	}

	return (
		<section
			className={`rounded-lg border border-warning/20 bg-warning/10 p-4 text-warning-foreground ${className ?? ""}`}
			aria-live="polite"
		>
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div className="flex gap-3">
					<MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
					<div>
						<h2 className="text-sm font-semibold">Confirm your email</h2>
						<p className="mt-1 text-sm leading-6 text-warning-foreground">
							{email
								? `We sent a confirmation link to ${email}.`
								: "We sent a confirmation link to your email."}{" "}
							You can keep setting up PebbleDesk while that is waiting.
						</p>
						{message ? (
							<p
								className={`mt-2 text-sm ${status === "error" ? "text-destructive" : "text-warning-foreground"}`}
							>
								{message}
							</p>
						) : null}
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					className="border-warning/20 bg-background text-warning-foreground hover:bg-warning/10"
					onClick={() => void handleResend()}
					disabled={status === "sending"}
				>
					{status === "sending" ? "Sending..." : "Resend email"}
				</Button>
			</div>
		</section>
	);
}
