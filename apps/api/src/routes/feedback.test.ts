import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody } from "../test/setup.js";

// Mock sendEmail so tests don't make real HTTP calls
vi.mock("../lib/email.js", () => ({
	sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sentry.js", () => ({
	captureApiException: vi.fn(),
}));

// Mock the auth middleware to be pass-through in tests
vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException: HE } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(
			async (c: { get: (k: string) => string }, next: () => Promise<void>) => {
				const userId = c.get("userId");
				if (!userId) {
					throw new HE(401, { message: "Unauthorized" });
				}
				await next();
			},
		),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HE(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
	};
});

// Import after mocking
const { feedbackRoutes } = await import("./feedback.js");
const { sendEmail } = await import("../lib/email.js");
const { captureApiException } = await import("../lib/sentry.js");

function mountFeedback(app: Hono<AppEnv>) {
	app.route("/api/feedback", feedbackRoutes);
}

beforeEach(() => {
	vi.mocked(sendEmail).mockClear();
	vi.mocked(captureApiException).mockClear();
});

const TEST_ENV = {
	RESEND_API_KEY: "re_test_key",
	RESEND_FROM_EMAIL: "angel.campa@pebbledesk.app",
	FEEDBACK_TO_EMAIL: "angel.campa@pebbledesk.app",
};

const VALID_PAYLOAD = {
	message: "This is a great feature!",
	reporterEmail: "user@example.com",
	pageUrl: "https://app.pebbledesk.com/dashboard",
	userAgent: "Mozilla/5.0",
	viewport: "1440x900",
};

describe("POST /api/feedback", () => {
	it("returns 201 with inserted feedback on valid input", async () => {
		const now = new Date();
		const inserted = {
			id: "feedback-uuid-1",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "This is a great feature!",
			pageUrl: "https://app.pebbledesk.com/dashboard",
			userAgent: "Mozilla/5.0",
			viewport: "1440x900",
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request("/api/feedback", jsonBody(VALID_PAYLOAD), TEST_ENV);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { ok: boolean; emailed: boolean };
		expect(body.ok).toBe(true);
		expect(body.emailed).toBe(true);
		expect(db.insert).toHaveBeenCalledOnce();
	});

	it("calls sendEmail with correct arguments on success", async () => {
		const sendEmailMock = vi.mocked(sendEmail);

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-2",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "Send email test",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db, {
			userId: "user-1",
			centerId: "center-1",
			role: "owner",
		});

		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Send email test", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		expect(sendEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendEmailMock.mock.calls[0][0];
		expect(callArgs.to).toBe("angel.campa@pebbledesk.app");
		expect(callArgs.replyTo).toBe("user@example.com");
		expect(callArgs.subject).toContain("[PebbleDesk Feedback]");
		expect(callArgs.subject).toContain("Send email test");
		expect(callArgs.apiKey).toBe("re_test_key");
		expect(callArgs.fromEmail).toBe("angel.campa@pebbledesk.app");
	});

	it("returns 400 when message is missing", async () => {
		const db = createMockDb();
		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ reporterEmail: "user@example.com" }),
			TEST_ENV,
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when reporterEmail is invalid", async () => {
		const db = createMockDb();
		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Hello", reporterEmail: "not-an-email" }),
			TEST_ENV,
		);
		expect(res.status).toBe(400);
	});

	it("returns 400 when message is empty string", async () => {
		const db = createMockDb();
		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);
		expect(res.status).toBe(400);
	});

	it("returns 201 even when sendEmail throws (email failure does not block response)", async () => {
		const sendEmailMock = vi.mocked(sendEmail);
		sendEmailMock.mockRejectedValueOnce(new Error("Resend API unreachable"));

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-3",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "Email will fail",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Email will fail", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		expect(db.insert).toHaveBeenCalledOnce();
		expect(sendEmailMock).toHaveBeenCalledOnce();
	});

	it("returns emailed: false in response body when sendEmail rejects", async () => {
		const sendEmailMock = vi.mocked(sendEmail);
		const emailError = new Error("Resend API unreachable");
		sendEmailMock.mockRejectedValueOnce(emailError);

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-emailed-false",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "Email delivery check",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Email delivery check", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { ok: boolean; emailed: boolean };
		expect(body.ok).toBe(true);
		expect(body.emailed).toBe(false);
		expect(captureApiException).toHaveBeenCalledWith(emailError, expect.anything(), {
			task: "feedback-email",
		});
	});

	it("returns emailed: true in response body when sendEmail succeeds", async () => {
		const now = new Date();
		const inserted = {
			id: "feedback-uuid-emailed-true",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "Email success check",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Email success check", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		const body = (await res.json()) as { ok: boolean; emailed: boolean };
		expect(body.ok).toBe(true);
		expect(body.emailed).toBe(true);
	});

	it("returns 401 when no session (unauthenticated)", async () => {
		// Build a minimal app that mimics requireAuth throwing 401 for no userId
		const { Hono } = await import("hono");
		const unauthApp = new Hono<AppEnv>();
		unauthApp.post("/api/feedback", () => {
			throw new HTTPException(401, { message: "Unauthorized" });
		});
		unauthApp.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			if (err instanceof HTTPException || typeof maybe.status === "number") {
				const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
				return c.json({ error: maybe.message ?? "Error" }, status);
			}
			return c.json({ error: "Internal server error" }, 500);
		});

		const res = await unauthApp.request("/api/feedback", jsonBody(VALID_PAYLOAD));
		expect(res.status).toBe(401);
	});

	it("returns 401 when userId is empty in context", async () => {
		const db = createMockDb();
		const app = createTestApp(mountFeedback, db, { userId: "" });
		const res = await app.request("/api/feedback", jsonBody(VALID_PAYLOAD), TEST_ENV);
		expect(res.status).toBe(401);
	});

	it("uses fallback to address when FEEDBACK_TO_EMAIL env var is not set", async () => {
		const sendEmailMock = vi.mocked(sendEmail);

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-6",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: "Fallback email test",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		// Pass env without FEEDBACK_TO_EMAIL to hit the fallback
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Fallback email test", reporterEmail: "user@example.com" }),
			{ RESEND_API_KEY: "re_test_key", RESEND_FROM_EMAIL: "angel.campa@pebbledesk.app" },
		);

		expect(res.status).toBe(201);
		expect(sendEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendEmailMock.mock.calls[0][0];
		expect(callArgs.to).toBe("angel.campa@pebbledesk.app");
	});

	it("handles missing centerId and role (no active membership — centerId/role fallbacks)", async () => {
		const sendEmailMock = vi.mocked(sendEmail);

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-5",
			centerId: null,
			userId: "user-with-no-center",
			reporterEmail: "user@example.com",
			message: "No membership feedback",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: null,
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		// Build a custom app: userId set (so requireAuth passes), centerId/role unset (undefined)
		const { Hono } = await import("hono");
		const { HTTPException: HE } = await import("hono/http-exception");
		const appNoMembership = new Hono<AppEnv>();
		appNoMembership.use("*", async (c, next) => {
			c.set("db", db as unknown as import("../lib/context.js").Variables["db"]);
			c.set("userId", "user-with-no-center");
			// centerId and role deliberately NOT set — remain undefined
			await next();
		});
		mountFeedback(appNoMembership);
		appNoMembership.onError((err, c) => {
			const maybe = err as { status?: number; message?: string };
			if (err instanceof HE || typeof maybe.status === "number") {
				const status = (maybe.status ?? 500) as 400 | 401 | 403 | 404 | 500 | 502;
				return c.json({ error: maybe.message ?? "Error" }, status);
			}
			return c.json({ error: "Internal server error" }, 500);
		});

		const res = await appNoMembership.request(
			"/api/feedback",
			jsonBody({ message: "No membership feedback", reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		expect(sendEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendEmailMock.mock.calls[0][0];
		expect(callArgs.text).toContain("Center ID: —");
		expect(callArgs.text).toContain("Role: —");
	});

	it("truncates long subject to first 80 chars of message", async () => {
		const sendEmailMock = vi.mocked(sendEmail);

		const longMessage = "A".repeat(200);
		const now = new Date();
		const inserted = {
			id: "feedback-uuid-4",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "user@example.com",
			message: longMessage,
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: longMessage, reporterEmail: "user@example.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		expect(sendEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendEmailMock.mock.calls[0][0];
		// Subject: "[PebbleDesk Feedback] " + first 80 chars + ellipsis
		expect(callArgs.subject).toBe(`[PebbleDesk Feedback] ${"A".repeat(80)}…`);
	});

	it("uses session user email instead of body reporterEmail when user is found in DB", async () => {
		const sendEmailMock = vi.mocked(sendEmail);

		const now = new Date();
		const inserted = {
			id: "feedback-uuid-7",
			centerId: "center-1",
			userId: "user-1",
			reporterEmail: "real@session.com",
			message: "Override test",
			pageUrl: null,
			userAgent: null,
			viewport: null,
			role: "owner",
			status: "new",
			createdAt: now,
		};

		const db = createMockDb({
			select: vi.fn().mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						limit: vi.fn().mockResolvedValue([{ email: "real@session.com" }]),
					}),
				}),
			}),
			insert: vi.fn().mockReturnValue({
				values: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([inserted]),
				}),
			}),
		});

		const app = createTestApp(mountFeedback, db);
		const res = await app.request(
			"/api/feedback",
			jsonBody({ message: "Override test", reporterEmail: "spoofed@attacker.com" }),
			TEST_ENV,
		);

		expect(res.status).toBe(201);
		expect(sendEmailMock).toHaveBeenCalledOnce();
		const callArgs = sendEmailMock.mock.calls[0][0];
		// Should use the session email, not the body email
		expect(callArgs.replyTo).toBe("real@session.com");
		expect(callArgs.text).toContain("Reporter Email: real@session.com");
		expect(callArgs.text).not.toContain("spoofed@attacker.com");
	});
});
