import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";

beforeEach(() => {
	vi.stubGlobal("fetch", vi.fn());
});

describe("sendEmail", () => {
	it("posts a Resend email payload with optional tags", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

		await sendEmail({
			to: "lead@example.com",
			from: "angel.campa@pebbledesk.app",
			subject: "Subject",
			html: "<p>Hello</p>",
			text: "Hello",
			apiKey: "re_test",
			tags: [{ name: "campaign", value: "nurture" }],
		});

		expect(fetch).toHaveBeenCalledWith(
			"https://api.resend.com/emails",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: "Bearer re_test",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					from: "angel.campa@pebbledesk.app",
					to: "lead@example.com",
					subject: "Subject",
					html: "<p>Hello</p>",
					text: "Hello",
					tags: [{ name: "campaign", value: "nurture" }],
				}),
			}),
		);
	});

	it("includes custom headers when provided", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

		await sendEmail({
			to: "lead@example.com",
			from: "angel.campa@pebbledesk.app",
			subject: "Subject",
			html: "<p>Hello</p>",
			text: "Hello",
			apiKey: "re_test",
			headers: {
				"List-Unsubscribe":
					"<https://pebbledesk.app/api/unsubscribe?email=lead%40example.com&token=abc>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		});

		const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.headers).toEqual({
			"List-Unsubscribe":
				"<https://pebbledesk.app/api/unsubscribe?email=lead%40example.com&token=abc>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
	});

	it("throws the Resend error message when delivery fails with JSON", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ message: "domain not verified" }), { status: 400 }),
		);

		await expect(
			sendEmail({
				to: "lead@example.com",
				from: "angel.campa@pebbledesk.app",
				subject: "Subject",
				html: "<p>Hello</p>",
				text: "Hello",
				apiKey: "re_test",
			}),
		).rejects.toThrow("domain not verified");
	});

	it("throws a status fallback when delivery fails without JSON", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response("not json", { status: 500 }));

		await expect(
			sendEmail({
				to: "lead@example.com",
				from: "angel.campa@pebbledesk.app",
				subject: "Subject",
				html: "<p>Hello</p>",
				text: "Hello",
				apiKey: "re_test",
			}),
		).rejects.toThrow("Failed to send email: 500");
	});
});
