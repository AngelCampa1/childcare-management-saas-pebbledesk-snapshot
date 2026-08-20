export interface SendEmailInput {
	to: string;
	subject: string;
	html: string;
	text: string;
	replyTo?: string;
	/** Override the sender address; defaults to fromEmail when omitted */
	from?: string;
	apiKey: string;
	fromEmail?: string;
	/** Resend analytics tags */
	tags?: Array<{ name: string; value: string }>;
	/** Custom Resend message headers, such as List-Unsubscribe */
	headers?: Record<string, string>;
	/** Stable key used by Resend to dedupe retries of the same logical send */
	idempotencyKey?: string;
}

type ResendErrorBody = {
	message?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
	const payload: Record<string, unknown> = {
		from: input.from ?? input.fromEmail,
		to: input.to,
		subject: input.subject,
		html: input.html,
		text: input.text,
	};

	if (input.replyTo !== undefined) {
		payload.reply_to = input.replyTo;
	}

	if (input.tags !== undefined && input.tags.length > 0) {
		payload.tags = input.tags;
	}

	if (input.headers !== undefined && Object.keys(input.headers).length > 0) {
		payload.headers = input.headers;
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.apiKey}`,
			"Content-Type": "application/json",
			...(input.idempotencyKey !== undefined ? { "Idempotency-Key": input.idempotencyKey } : {}),
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		let message: string;
		try {
			const body = (await response.json()) as ResendErrorBody;
			message = body.message ?? `Failed to send email: ${response.status}`;
		} catch {
			message = `Failed to send email: ${response.status}`;
		}
		throw new Error(message);
	}
}
