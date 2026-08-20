import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

expect.extend(jestDomMatchers);

vi.mock("../lib/exit-popup-utils", () => ({
	isSignedUp: vi.fn(() => false),
	setSignedUp: vi.fn(),
}));

vi.mock("../lib/sentry-client", () => ({
	captureException: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
	trackEvent: vi.fn(),
}));

import { trackEvent } from "../lib/analytics";
import { setSignedUp } from "../lib/exit-popup-utils";
import { captureException } from "../lib/sentry-client";
import {
	__resetTurnstileScriptStateForTests,
	__setTurnstileReadyTimeoutMsForTests,
	__waitForTurnstileReadyForTests,
	LeadCaptureFormInner as LeadCaptureForm,
} from "./lead-capture-form";

const mockSetSignedUp = setSignedUp as ReturnType<typeof vi.fn>;
const mockTrackEvent = vi.mocked(trackEvent);

const defaultProps = {
	apiUrl: "https://api.test",
	magnetSlug: "licensing-compliance-checklist",
	magnetTitle: "Daycare Licensing Compliance Checklist",
};

// Helper to build a fake window.turnstile mock
function makeTurnstileMock(opts: { invokeCallbackImmediately?: boolean } = {}) {
	const widgetId = "mock-widget-id";
	let successCallback: ((token: string) => void) | undefined;

	const render = vi.fn(
		(
			_el: HTMLElement,
			params: {
				sitekey: string;
				callback: (token: string) => void;
				"error-callback": () => void;
				"expired-callback": () => void;
			},
		) => {
			successCallback = params.callback;
			if (opts.invokeCallbackImmediately) {
				params.callback("mock-turnstile-token");
			}
			return widgetId;
		},
	);
	const reset = vi.fn();
	const remove = vi.fn();

	return {
		mock: { render, reset, remove },
		invokeSuccess: (token = "mock-turnstile-token") => {
			successCallback?.(token);
		},
		widgetId,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", vi.fn());
	Object.defineProperty(window, "location", {
		value: { search: "" },
		writable: true,
	});
	// Clean up any turnstile script tags injected during tests
	for (const el of document.querySelectorAll('script[src*="turnstile"]')) {
		el.remove();
	}
	// Reset the module-level script-load singleton so the script-injection and
	// existing-tag branches are reachable independently in each test.
	__resetTurnstileScriptStateForTests();
	// biome-ignore lint/suspicious/noExplicitAny: intentional deletion of test global
	delete (window as any).turnstile;
});

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: intentional deletion of test global
	delete (window as any).turnstile;
	for (const el of document.querySelectorAll('script[src*="turnstile"]')) {
		el.remove();
	}
});

describe("LeadCaptureForm", () => {
	it("shows inline validation without posting when email is empty", async () => {
		render(<LeadCaptureForm {...defaultProps} />);

		expect(screen.getByRole("form")).toHaveAttribute("novalidate");
		fireEvent.click(screen.getByRole("button", { name: "Get my free guide" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Email address is required.");
		expect(screen.getByLabelText(/email/i)).toHaveAttribute(
			"aria-describedby",
			"lead-capture-email-error",
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_validation_failed", {
			magnet_slug: "licensing-compliance-checklist",
			reason: "email_required",
			source_page: undefined,
		});
	});

	it("shows inline validation without posting when email is invalid", async () => {
		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "not-an-email" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Get my free guide" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
		expect(fetch).not.toHaveBeenCalled();
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_validation_failed", {
			magnet_slug: "licensing-compliance-checklist",
			reason: "email_invalid",
			source_page: undefined,
		});
	});
	it("renders email input and submit button without asking for first name", () => {
		render(<LeadCaptureForm {...defaultProps} />);

		expect(screen.getByLabelText(/email/i)).toBeDefined();
		expect(screen.queryByLabelText(/first name/i)).toBeNull();
		expect(screen.getByRole("button", { name: /get.*free|download|get my/i })).toBeDefined();
	});

	it("shows loading state on submit", async () => {
		let resolveFetch!: (val: Response) => void;
		const fetchPromise = new Promise<Response>((res) => {
			resolveFetch = res;
		});
		vi.mocked(fetch).mockReturnValue(fetchPromise);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /sending/i })).toBeDefined();
		});

		// cleanup
		resolveFetch(new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }));
	});

	it("shows emailed success state with download link after successful POST", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({ downloadUrl: "/guides/licensing-checklist.pdf", emailed: true }),
				{
					status: 200,
				},
			),
		);

		render(<LeadCaptureForm {...defaultProps} magnetTitle="Licensing Checklist" />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByText(/check your inbox/i)).toBeDefined();
			expect(screen.getByText(/Licensing Checklist/)).toBeDefined();
		});

		const downloadLink = screen.getByRole("link", { name: /download/i });
		expect(downloadLink.getAttribute("href")).toBe("/guides/licensing-checklist.pdf");
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_started", {
			magnet_slug: "licensing-compliance-checklist",
			source_page: undefined,
		});
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_completed", {
			magnet_slug: "licensing-compliance-checklist",
			source_page: undefined,
			emailed: true,
			download_available: true,
		});
	});

	it("shows direct download copy when the API did not email the resource", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(
				JSON.stringify({
					downloadUrl: "/lead-magnets/licensing-compliance-checklist.pdf",
					emailed: false,
				}),
				{
					status: 200,
				},
			),
		);

		render(<LeadCaptureForm {...defaultProps} magnetTitle="Licensing Checklist" />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByText(/your download is ready/i)).toBeDefined();
		});

		expect(screen.queryByText(/check your inbox/i)).toBeNull();
		const downloadLink = screen.getByRole("link", { name: /download/i });
		expect(downloadLink.getAttribute("href")).toBe(
			"/lead-magnets/licensing-compliance-checklist.pdf",
		);
	});

	it("shows error state with request ID on failed 5xx POST", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ requestId: "req_123" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			}),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeDefined();
			expect(screen.getByText(/something went wrong/i)).toBeDefined();
			expect(screen.getByText(/Reference ID: req_123/i)).toBeDefined();
		});
		expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "LeadCaptureForm", status: 500, surface: "marketing" },
		});
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_failed", {
			magnet_slug: "licensing-compliance-checklist",
			source_page: undefined,
			reason: "server_error",
			status_code: 500,
		});
	});

	it("uses request ID response header when failed 5xx body has no usable ID", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ requestId: "" }), {
				status: 500,
				headers: {
					"content-type": "application/json",
					"x-request-id": "req_header",
				},
			}),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByText(/Reference ID: req_header/i)).toBeDefined();
		});
	});

	it("shows generic failed 5xx message when no request ID is available", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("alert").textContent).toBe("Something went wrong. Please try again.");
		});
	});

	it("does not capture expected validation POST failures", async () => {
		vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 400 }));

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeDefined();
		});
		expect(captureException).not.toHaveBeenCalled();
	});

	it("shows error state on network error", async () => {
		vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toBeInTheDocument();
			expect(screen.getByText(/something went wrong/i)).toBeDefined();
		});
		expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_failed", {
			magnet_slug: "licensing-compliance-checklist",
			source_page: undefined,
			reason: "network_error",
		});
	});

	it("calls setSignedUp on success", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(mockSetSignedUp).toHaveBeenCalledTimes(1);
		});
	});

	it("includes magnetSlug in the POST body", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} magnetSlug="ratio-tracking-cheatsheet" />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [url, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/api/leads");
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.magnetSlug).toBe("ratio-tracking-cheatsheet");
	});

	it("includes email and omits firstName in the POST body", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "test@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.email).toBe("test@example.com");
		expect(body.firstName).toBeUndefined();
	});

	it("includes sourcePage in POST body when provided", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} sourcePage="/free/licensing-compliance-checklist" />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.sourcePage).toBe("/free/licensing-compliance-checklist");
	});

	it("includes UTM params in POST body when present in URL search", async () => {
		Object.defineProperty(window, "location", {
			value: { search: "?utm_source=google&utm_medium=cpc&utm_campaign=compliance" },
			writable: true,
		});

		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.utmSource).toBe("google");
		expect(body.utmMedium).toBe("cpc");
		expect(body.utmCampaign).toBe("compliance");
	});

	it("does not include UTM params when search string is empty", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.utmSource).toBeUndefined();
	});

	it("shows success state without download link when downloadUrl is absent", async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: null }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} magnetTitle="My Guide" />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(screen.getByText(/check your inbox/i)).toBeDefined();
		});

		expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
	});

	it("handles window.location.search throwing gracefully (no UTM params included)", async () => {
		Object.defineProperty(window, "location", {
			get() {
				throw new Error("location unavailable");
			},
			configurable: true,
		});

		vi.mocked(fetch).mockResolvedValue(
			new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
		);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
		});

		const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(options.body as string) as Record<string, unknown>;
		expect(body.utmSource).toBeUndefined();

		// restore
		Object.defineProperty(window, "location", {
			value: { search: "" },
			writable: true,
			configurable: true,
		});
	});

	it("disables form fields during loading", async () => {
		let resolveFetch!: (val: Response) => void;
		const fetchPromise = new Promise<Response>((res) => {
			resolveFetch = res;
		});
		vi.mocked(fetch).mockReturnValue(fetchPromise);

		render(<LeadCaptureForm {...defaultProps} />);

		fireEvent.change(screen.getByLabelText(/email/i), {
			target: { value: "jane@example.com" },
		});
		fireEvent.submit(screen.getByRole("form"));

		await waitFor(() => {
			expect((screen.getByLabelText(/email/i) as HTMLInputElement).disabled).toBe(true);
		});

		resolveFetch(new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }));
	});

	describe("honeypot field", () => {
		it("renders a hidden company_website input that is aria-hidden and not in tab order", () => {
			render(<LeadCaptureForm {...defaultProps} />);

			const honeypot = document.querySelector('input[name="company_website"]');
			expect(honeypot).not.toBeNull();
			expect(honeypot?.getAttribute("aria-hidden")).toBe("true");
			expect((honeypot as HTMLInputElement).tabIndex).toBe(-1);
		});

		it("includes company_website with empty string in POST body by default", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
			});

			const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as Record<string, unknown>;
			expect(body.company_website).toBe("");
		});

		it("forwards a filled honeypot value in the POST body", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
			fireEvent.change(honeypot, { target: { value: "https://bot.example.com" } });

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
			});

			const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as Record<string, unknown>;
			expect(body.company_website).toBe("https://bot.example.com");
		});

		it("does NOT block submit client-side when honeypot is filled", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
			fireEvent.change(honeypot, { target: { value: "spam" } });

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
			});
		});

		it("has a different id from the email input", () => {
			render(<LeadCaptureForm {...defaultProps} />);

			const emailInput = screen.getByLabelText(/email/i);
			const honeypot = document.querySelector('input[name="company_website"]') as HTMLInputElement;
			expect(honeypot.id).not.toBe(emailInput.id);
		});
	});

	describe("Turnstile widget — no site key", () => {
		it("does NOT render a turnstile widget when no turnstileSiteKey is provided", () => {
			render(<LeadCaptureForm {...defaultProps} />);
			expect(document.querySelector("[data-turnstile-widget]")).toBeNull();
		});

		it("does NOT include turnstileToken in POST body when no site key is configured", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
			});

			const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as Record<string, unknown>;
			expect("turnstileToken" in body).toBe(false);
		});
	});

	describe("Turnstile widget — with site key", () => {
		it("clears the token when the turnstile error-callback fires", async () => {
			let errorCallback: (() => void) | undefined;
			const turnstileMock = {
				render: vi.fn(
					(
						_el: HTMLElement,
						params: {
							sitekey: string;
							callback: (token: string) => void;
							"error-callback": () => void;
							"expired-callback": () => void;
						},
					) => {
						errorCallback = params["error-callback"];
						// First give a token
						params.callback("tok_initial");
						return "widget-id";
					},
				),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			vi.stubGlobal("turnstile", turnstileMock);

			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});

			// Trigger the error callback to clear the token
			act(() => {
				errorCallback?.();
			});

			// Now submit — should be blocked
			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Please complete the verification challenge.",
				);
			});
			expect(fetch).not.toHaveBeenCalled();
		});

		it("clears the token when the turnstile expired-callback fires", async () => {
			let expiredCallback: (() => void) | undefined;
			const turnstileMock = {
				render: vi.fn(
					(
						_el: HTMLElement,
						params: {
							sitekey: string;
							callback: (token: string) => void;
							"error-callback": () => void;
							"expired-callback": () => void;
						},
					) => {
						expiredCallback = params["expired-callback"];
						params.callback("tok_initial");
						return "widget-id";
					},
				),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			vi.stubGlobal("turnstile", turnstileMock);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});

			act(() => {
				expiredCallback?.();
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Please complete the verification challenge.",
				);
			});
			expect(fetch).not.toHaveBeenCalled();
		});

		it("injects the turnstile script tag and resolves when window.turnstile is not pre-set", async () => {
			// Do NOT set window.turnstile before render — test the script injection path
			// Simulate script injection success by setting turnstile after the script tag appears
			const turnstileMock = {
				render: vi.fn(() => "widget-id"),
				reset: vi.fn(),
				remove: vi.fn(),
			};

			// Use a MutationObserver-like approach: after the script is injected, set turnstile and fire onload
			const originalAppendChild = document.head.appendChild.bind(document.head);
			const appendChildSpy = vi
				.spyOn(document.head, "appendChild")
				.mockImplementation((node: Node) => {
					const result = originalAppendChild(node);
					if (node instanceof HTMLScriptElement && node.src.includes("turnstile")) {
						// Simulate successful script load
						vi.stubGlobal("turnstile", turnstileMock);
						node.onload?.(new Event("load"));
					}
					return result;
				});

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});

			appendChildSpy.mockRestore();
		});

		it("resolves immediately via waitForTurnstileReady early-exit when window.turnstile is already set on an existing script tag", async () => {
			// This covers the `if (window.turnstile) { resolve(); return; }` early-exit inside
			// waitForTurnstileReady: an existing script tag is in the DOM AND window.turnstile
			// is already defined, so we resolve without waiting for any event.
			const existingScript = document.createElement("script");
			existingScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
			document.head.appendChild(existingScript);

			const turnstileMock = {
				render: vi.fn(() => "widget-id"),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			// Set turnstile BEFORE rendering so waitForTurnstileReady hits the early-exit
			vi.stubGlobal("turnstile", turnstileMock);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});
		});

		it("covers the direct waitForTurnstileReady early-ready branch", async () => {
			const existingScript = document.createElement("script");
			existingScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
			document.head.appendChild(existingScript);

			vi.stubGlobal("turnstile", {
				render: vi.fn(() => "widget-id"),
				reset: vi.fn(),
				remove: vi.fn(),
			});

			await expect(__waitForTurnstileReadyForTests(existingScript)).resolves.toBeUndefined();
		});

		it("reuses an existing turnstile script tag without injecting a duplicate", async () => {
			// An existing Turnstile script tag is already in the DOM (e.g. injected by
			// another island), and window.turnstile is not yet defined. loadTurnstileScript
			// must wait for the script to finish before resolving, without appending a second tag.
			const existingScript = document.createElement("script");
			existingScript.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
			document.head.appendChild(existingScript);

			const turnstileMock = {
				render: vi.fn(() => "widget-id"),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			const appendChildSpy = vi.spyOn(document.head, "appendChild");

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			expect(turnstileMock.render).not.toHaveBeenCalled();

			vi.stubGlobal("turnstile", turnstileMock);
			existingScript.dispatchEvent(new Event("load"));

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});

			// No second Turnstile script tag should have been appended.
			const injectedTurnstileScript = appendChildSpy.mock.calls.some(
				([node]) => node instanceof HTMLScriptElement && node.src.includes("turnstile"),
			);
			expect(injectedTurnstileScript).toBe(false);
			expect(document.querySelectorAll('script[src*="turnstile"]')).toHaveLength(1);

			appendChildSpy.mockRestore();
		});

		it("shows verification-unavailable state without reporting when the turnstile script fails to load", async () => {
			// window.turnstile is undefined and no existing tag, so loadTurnstileScript
			// injects a script and wires up error handling. Dispatching an error event
			// rejects the promise, which the effect's .catch() forwards to Sentry.
			const originalAppendChild = document.head.appendChild.bind(document.head);
			const appendChildSpy = vi
				.spyOn(document.head, "appendChild")
				.mockImplementation((node: Node) => {
					const result = originalAppendChild(node);
					if (node instanceof HTMLScriptElement && node.src.includes("turnstile")) {
						node.dispatchEvent(new Event("error"));
					}
					return result;
				});

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Verification is temporarily unavailable. Please reload the page and try again.",
				);
			});
			expect(captureException).not.toHaveBeenCalled();
			expect(document.querySelectorAll('script[src*="turnstile"]')).toHaveLength(0);

			appendChildSpy.mockRestore();
		});

		it("can retry loading turnstile after a script load failure", async () => {
			const turnstileMock = {
				render: vi.fn(() => "widget-id"),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			let loadAttempt = 0;
			const originalAppendChild = document.head.appendChild.bind(document.head);
			const appendChildSpy = vi
				.spyOn(document.head, "appendChild")
				.mockImplementation((node: Node) => {
					const result = originalAppendChild(node);
					if (node instanceof HTMLScriptElement && node.src.includes("turnstile")) {
						loadAttempt += 1;
						if (loadAttempt === 1) {
							node.dispatchEvent(new Event("error"));
						} else {
							vi.stubGlobal("turnstile", turnstileMock);
							node.dispatchEvent(new Event("load"));
						}
					}
					return result;
				});

			const firstRender = render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Verification is temporarily unavailable. Please reload the page and try again.",
				);
			});

			firstRender.unmount();
			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstileMock.render).toHaveBeenCalled();
			});
			expect(loadAttempt).toBe(2);
			expect(captureException).not.toHaveBeenCalled();

			appendChildSpy.mockRestore();
		});

		it("shows verification-unavailable state without reporting when turnstile initialization times out", async () => {
			// Covers the timeout callback (lines 105-107) in waitForTurnstileReady.
			// The script is injected but window.turnstile never appears → timeout fires.
			__setTurnstileReadyTimeoutMsForTests(20);

			const originalAppendChild = document.head.appendChild.bind(document.head);
			const appendChildSpy = vi
				.spyOn(document.head, "appendChild")
				.mockImplementation((node: Node) => {
					// Append the node but never set window.turnstile or fire onload,
					// so the interval never resolves and the short timeout fires.
					return originalAppendChild(node);
				});

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(
				() => {
					expect(screen.getByRole("alert")).toHaveTextContent(
						"Verification is temporarily unavailable. Please reload the page and try again.",
					);
				},
				{ timeout: 3000 },
			);
			expect(captureException).not.toHaveBeenCalled();
			expect(document.querySelectorAll('script[src*="turnstile"]')).toHaveLength(0);

			appendChildSpy.mockRestore();
			__setTurnstileReadyTimeoutMsForTests(10_000);
		});

		it("reports unexpected turnstile.render errors", async () => {
			const renderError = new Error("render failed");
			const turnstileMock = {
				render: vi.fn(() => {
					throw renderError;
				}),
				reset: vi.fn(),
				remove: vi.fn(),
			};
			vi.stubGlobal("turnstile", turnstileMock);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(captureException).toHaveBeenCalledWith(renderError, {
					tags: { component: "LeadCaptureForm", surface: "marketing" },
				});
			});
		});

		it("renders a turnstile widget container when turnstileSiteKey is provided", async () => {
			const turnstile = makeTurnstileMock();
			vi.stubGlobal("turnstile", turnstile.mock);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(document.querySelector("[data-turnstile-widget]")).not.toBeNull();
			});
		});

		it("blocks submit and shows an error when no turnstile token is available", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Please complete the verification challenge.",
				);
			});
			expect(fetch).not.toHaveBeenCalled();
		});

		it("includes turnstileToken in POST body when token is available", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			// Supply the token via the callback
			act(() => {
				turnstile.invokeSuccess("tok_abc123");
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
			});

			const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as Record<string, unknown>;
			expect(body.turnstileToken).toBe("tok_abc123");
		});

		it("resets the widget after a successful submit", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ downloadUrl: "/test.pdf" }), { status: 200 }),
			);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			act(() => {
				turnstile.invokeSuccess("tok_abc");
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByText(/check your inbox/i)).toBeDefined();
			});

			expect(turnstile.mock.reset).toHaveBeenCalledWith(turnstile.widgetId);
		});

		it("resets the widget after a failed server response", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			act(() => {
				turnstile.invokeSuccess("tok_abc");
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toBeDefined();
			});

			expect(turnstile.mock.reset).toHaveBeenCalledWith(turnstile.widgetId);
		});

		it("calls turnstile.remove on unmount when widget exists", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			const { unmount } = render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			unmount();

			expect(turnstile.mock.remove).toHaveBeenCalledWith(turnstile.widgetId);
		});

		it("reports unexpected turnstile.remove errors on unmount", async () => {
			const removeError = new Error("remove failed");
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			turnstile.mock.remove.mockImplementation(() => {
				throw removeError;
			});
			vi.stubGlobal("turnstile", turnstile.mock);

			const { unmount } = render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			unmount();

			expect(captureException).toHaveBeenCalledWith(removeError, {
				tags: { component: "LeadCaptureForm", surface: "marketing", turnstileOperation: "remove" },
			});
		});
	});

	describe("403 / 429 error handling", () => {
		it("shows verification message on 403 with turnstileSiteKey, does NOT call captureException", async () => {
			const turnstile = makeTurnstileMock({ invokeCallbackImmediately: false });
			vi.stubGlobal("turnstile", turnstile.mock);

			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ error: "verification_failed" }), {
					status: 403,
					headers: { "content-type": "application/json" },
				}),
			);

			render(<LeadCaptureForm {...defaultProps} turnstileSiteKey="0x4AAAA" />);

			await waitFor(() => {
				expect(turnstile.mock.render).toHaveBeenCalled();
			});

			act(() => {
				turnstile.invokeSuccess("tok_abc");
			});

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Verification failed. Please complete the challenge and try again.",
				);
			});
			expect(captureException).not.toHaveBeenCalled();
			expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_failed", {
				magnet_slug: "licensing-compliance-checklist",
				source_page: undefined,
				reason: "verification_failed",
				status_code: 403,
			});
		});

		it("shows verification message on 403 with NO turnstileSiteKey AND calls captureException", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ error: "verification_failed" }), {
					status: 403,
					headers: { "content-type": "application/json" },
				}),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Verification failed. Please complete the challenge and try again.",
				);
			});
			expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
				tags: { component: "LeadCaptureForm", status: 403, surface: "marketing" },
			});
		});

		it("shows rate-limit message on 429 and does NOT call captureException", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ error: "rate_limited" }), {
					status: 429,
					headers: { "content-type": "application/json" },
				}),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent(
					"Too many attempts. Please wait a moment and try again.",
				);
			});
			expect(captureException).not.toHaveBeenCalled();
			expect(mockTrackEvent).toHaveBeenCalledWith("lead_capture_failed", {
				magnet_slug: "licensing-compliance-checklist",
				source_page: undefined,
				reason: "rate_limited",
				status_code: 429,
			});
		});

		it("still captures and shows formatted message on 500", async () => {
			vi.mocked(fetch).mockResolvedValue(
				new Response(JSON.stringify({ requestId: "req_500" }), {
					status: 500,
					headers: { "content-type": "application/json" },
				}),
			);

			render(<LeadCaptureForm {...defaultProps} />);

			fireEvent.change(screen.getByLabelText(/email/i), {
				target: { value: "jane@example.com" },
			});
			fireEvent.submit(screen.getByRole("form"));

			await waitFor(() => {
				expect(screen.getByRole("alert")).toHaveTextContent("Reference ID: req_500");
			});
			expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
				tags: { component: "LeadCaptureForm", status: 500, surface: "marketing" },
			});
		});
	});
});
