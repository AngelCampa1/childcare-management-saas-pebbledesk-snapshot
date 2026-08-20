export interface SendEmailInput {
	to: string;
	subject: string;
	html: string;
	text: string;
	from: string;
	apiKey: string;
	tags?: Array<{ name: string; value: string }>;
	headers?: Record<string, string>;
}

type ResendErrorBody = {
	message?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
	const payload: Record<string, unknown> = {
		from: input.from,
		to: input.to,
		subject: input.subject,
		html: input.html,
		text: input.text,
	};

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
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		let message = `Failed to send email: ${response.status}`;
		try {
			const body = (await response.json()) as ResendErrorBody;
			message = body.message ?? message;
		} catch {
			// Keep the status-based fallback when Resend does not return JSON.
		}
		throw new Error(message);
	}
}
