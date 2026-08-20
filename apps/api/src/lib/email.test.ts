import { describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email.js";

describe("sendEmail", () => {
	it("resolves when Resend returns 2xx", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await expect(
			sendEmail({
				to: "test@example.com",
				subject: "Test subject",
				html: "<p>Hello</p>",
				text: "Hello",
				replyTo: "reply@example.com",
				apiKey: "re_test_key",
				fromEmail: "angel.campa@pebbledesk.app",
			}),
		).resolves.toBeUndefined();

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.resend.com/emails");
		expect(init.method).toBe("POST");
		expect(init.headers).toMatchObject({
			Authorization: "Bearer re_test_key",
			"Content-Type": "application/json",
		});
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.from).toBe("angel.campa@pebbledesk.app");
		expect(body.to).toBe("test@example.com");
		expect(body.subject).toBe("Test subject");
		expect(body.html).toBe("<p>Hello</p>");
		expect(body.text).toBe("Hello");
		expect(body.reply_to).toBe("reply@example.com");

		vi.unstubAllGlobals();
	});

	it("uses custom from when provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			from: "Custom Sender <custom@pebbledesk.app>",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.from).toBe("Custom Sender <custom@pebbledesk.app>");

		vi.unstubAllGlobals();
	});

	it("omits reply_to when not provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.reply_to).toBeUndefined();

		vi.unstubAllGlobals();
	});

	it("throws with Resend error message on non-2xx response", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ message: "Invalid API key" }), { status: 422 }),
			);
		vi.stubGlobal("fetch", mockFetch);

		await expect(
			sendEmail({
				to: "test@example.com",
				subject: "Test",
				html: "<p>Hi</p>",
				text: "Hi",
				apiKey: "bad_key",
				fromEmail: "angel.campa@pebbledesk.app",
			}),
		).rejects.toThrow("Invalid API key");

		vi.unstubAllGlobals();
	});

	it("throws with fallback message when Resend returns non-2xx without message field", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ code: "domain_not_verified" }), { status: 403 }),
			);
		vi.stubGlobal("fetch", mockFetch);

		await expect(
			sendEmail({
				to: "test@example.com",
				subject: "Test",
				html: "<p>Hi</p>",
				text: "Hi",
				apiKey: "re_test_key",
				fromEmail: "angel.campa@pebbledesk.app",
			}),
		).rejects.toThrow("Failed to send email: 403");

		vi.unstubAllGlobals();
	});

	it("throws with status fallback when response body is not valid JSON", async () => {
		const mockFetch = vi.fn().mockResolvedValue(
			new Response("Internal Server Error", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			}),
		);
		vi.stubGlobal("fetch", mockFetch);

		await expect(
			sendEmail({
				to: "test@example.com",
				subject: "Test",
				html: "<p>Hi</p>",
				text: "Hi",
				apiKey: "re_test_key",
				fromEmail: "angel.campa@pebbledesk.app",
			}),
		).rejects.toThrow("Failed to send email: 500");

		vi.unstubAllGlobals();
	});

	it("includes tags in payload when provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
			tags: [
				{ name: "campaign", value: "nurture" },
				{ name: "template", value: "nurture-0-welcome" },
			],
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.tags).toEqual([
			{ name: "campaign", value: "nurture" },
			{ name: "template", value: "nurture-0-welcome" },
		]);

		vi.unstubAllGlobals();
	});

	it("includes custom headers in payload when provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
			headers: {
				"List-Unsubscribe":
					"<https://api.pebbledesk.app/api/unsubscribe?email=test%40example.com&token=abc>",
				"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
			},
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.headers).toEqual({
			"List-Unsubscribe":
				"<https://api.pebbledesk.app/api/unsubscribe?email=test%40example.com&token=abc>",
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});

		vi.unstubAllGlobals();
	});

	it("sends a Resend idempotency key header when provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
			idempotencyKey: "app-signup-sequencer:queue-1",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(init.headers).toMatchObject({
			"Idempotency-Key": "app-signup-sequencer:queue-1",
		});

		vi.unstubAllGlobals();
	});

	it("omits tags from payload when not provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.tags).toBeUndefined();

		vi.unstubAllGlobals();
	});

	it("omits tags from payload when empty array provided", async () => {
		const mockFetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
		vi.stubGlobal("fetch", mockFetch);

		await sendEmail({
			to: "test@example.com",
			subject: "Test",
			html: "<p>Hi</p>",
			text: "Hi",
			apiKey: "re_test_key",
			fromEmail: "angel.campa@pebbledesk.app",
			tags: [],
		});

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string) as Record<string, unknown>;
		expect(body.tags).toBeUndefined();

		vi.unstubAllGlobals();
	});
});
