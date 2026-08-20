import { beforeEach, describe, expect, it, vi } from "vitest";

const renderSpy = vi.fn();
const createRootSpy = vi.fn(() => ({ render: renderSpy }));
const setQueryClientForApiSpy = vi.fn();
const initSentrySpy = vi.fn();
const captureExceptionSpy = vi.fn();
const sanitizeQueryKeySpy = vi.fn((queryKey: readonly unknown[]) =>
	queryKey.map((item) =>
		typeof item === "object" && item !== null && !Array.isArray(item)
			? { search: "[redacted]" }
			: item,
	),
);

vi.mock("react-dom/client", () => ({
	createRoot: createRootSpy,
}));

vi.mock("./api", () => ({
	setQueryClientForApi: setQueryClientForApiSpy,
}));

vi.mock("./router", () => ({
	createAppRouter: vi.fn(() => ({ routeTree: {} })),
}));

vi.mock("@tanstack/react-router", () => ({
	RouterProvider: () => null,
}));

vi.mock("./error-boundary", () => ({
	FallbackErrorBoundary: ({ children }: { children: unknown }) => children,
}));

vi.mock("./lib/sentry", () => ({
	initSentry: initSentrySpy,
	captureException: captureExceptionSpy,
	sanitizeQueryKey: sanitizeQueryKeySpy,
}));

describe("main bootstrap", () => {
	beforeEach(() => {
		vi.resetModules();
		document.body.innerHTML = '<div id="root"></div>';
		renderSpy.mockClear();
		createRootSpy.mockClear();
		setQueryClientForApiSpy.mockClear();
		initSentrySpy.mockClear();
		captureExceptionSpy.mockClear();
		sanitizeQueryKeySpy.mockClear();
	});

	it("initializes Sentry, wires the query client, and renders the app", async () => {
		await import("./main");

		expect(initSentrySpy).toHaveBeenCalledOnce();
		expect(setQueryClientForApiSpy).toHaveBeenCalledOnce();
		expect(createRootSpy).toHaveBeenCalledOnce();
		expect(renderSpy).toHaveBeenCalledOnce();
	});

	it("captures bootstrap failures when the root element is missing", async () => {
		document.body.innerHTML = "";

		await expect(import("./main")).rejects.toThrow("Root element not found");

		expect(initSentrySpy).toHaveBeenCalledOnce();
		expect(captureExceptionSpy).toHaveBeenCalledWith(expect.any(Error), {
			tags: { component: "Bootstrap", surface: "app" },
		});
		expect(createRootSpy).not.toHaveBeenCalled();
	});

	it("captures unexpected query failures with sanitized query metadata", async () => {
		captureExceptionSpy.mockReturnValueOnce(true);
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { queryClient } = await import("./main");
		const queryCache = queryClient.getQueryCache();
		const query = queryCache.build(queryClient, {
			queryKey: ["guardians", { search: "Taylor Reed" }],
		});
		const error = new Error("query failed");

		queryCache.config.onError?.(error, query);

		expect(sanitizeQueryKeySpy).toHaveBeenCalledWith(["guardians", { search: "Taylor Reed" }]);
		expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
			tags: { component: "QueryCache", surface: "app" },
			extra: { queryKey: ["guardians", { search: "[redacted]" }] },
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith("[QueryCache]", error, [
			"guardians",
			{ search: "Taylor Reed" },
		]);

		consoleErrorSpy.mockRestore();
	});

	it("does not log expected auth verification failures to the browser console", async () => {
		captureExceptionSpy.mockReturnValueOnce(false);
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { queryClient } = await import("./main");
		const queryCache = queryClient.getQueryCache();
		const query = queryCache.build(queryClient, {
			queryKey: ["authStatus"],
		});
		const error = Object.assign(new Error("Failed to verify auth session"), {
			name: "AuthVerificationError",
		});

		queryCache.config.onError?.(error, query);

		expect(captureExceptionSpy).toHaveBeenCalledWith(error, {
			tags: { component: "QueryCache", surface: "app" },
			extra: { queryKey: ["authStatus"] },
		});
		expect(consoleErrorSpy).not.toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});
});
