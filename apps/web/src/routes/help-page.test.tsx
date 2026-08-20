import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuidancePanel } from "../components/guidance";
import { HelpPage } from "./_auth/help";

const mockedUseAuthSession = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-auth-session", () => ({
	useAuthSession: () => mockedUseAuthSession(),
}));

vi.mock("../api", () => ({
	apiFetch: apiFetchMock,
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
			<a href={to} {...props}>
				{children}
			</a>
		),
	};
});

function renderWithGuidanceClient(children: ReactNode) {
	const client = new QueryClient({
		defaultOptions: {
			queries: {
				retry: false,
			},
		},
	});

	return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

function renderHelp() {
	apiFetchMock.mockResolvedValue({
		json: async () => ({
			progress: {
				id: "",
				centerId: "center-1",
				membershipId: "membership-1",
				completedStepIds: [],
				dismissedGuideIds: [],
				lastOpenedGuideId: null,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
			},
		}),
	});

	return renderWithGuidanceClient(<HelpPage />);
}

describe("HelpPage", () => {
	beforeEach(() => {
		mockedUseAuthSession.mockReset();
		apiFetchMock.mockReset();
		mockedUseAuthSession.mockReturnValue({
			data: {
				membership: { id: "membership-1", centerId: "center-1", role: "owner" },
			},
			isLoading: false,
		});
	});

	it("searches plain-language help topics", async () => {
		renderHelp();

		fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "PDF" } });

		expect(await screen.findByText("Where did my PDF go?")).toBeInTheDocument();
		expect(screen.getAllByText(/Downloads folder/).length).toBeGreaterThan(0);
		expect(screen.queryByText("How do I check in a child?")).not.toBeInTheDocument();
	});

	it("shows staff-safe guidance without owner-only billing steps", async () => {
		mockedUseAuthSession.mockReturnValue({
			data: {
				membership: { id: "membership-1", centerId: "center-1", role: "staff" },
			},
			isLoading: false,
		});

		renderHelp();

		expect(await screen.findByRole("heading", { name: "Staff daily basics" })).toBeInTheDocument();
		expect(screen.queryByText("Billing and subsidy basics")).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: "Open billing" })).not.toBeInTheDocument();
	});

	it("shows a simple loading state while the session loads", () => {
		mockedUseAuthSession.mockReturnValue({
			data: undefined,
			isLoading: true,
		});

		renderHelp();

		expect(screen.queryByLabelText("Search help")).not.toBeInTheDocument();
	});

	it("shows a helpful empty state when search has no match", () => {
		renderHelp();

		fireEvent.change(screen.getByLabelText("Search help"), {
			target: { value: "purple tractor" },
		});

		expect(screen.getByText("No help topics found")).toBeInTheDocument();
		expect(screen.getByText(/Try a simpler word/)).toBeInTheDocument();
	});

	it("links direct, guide-derived, and fallback quick answers", async () => {
		renderHelp();

		fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "attendance" } });
		expect(
			await screen.findByRole("heading", { name: "How do I check in a child?" }),
		).toBeInTheDocument();
		expect(
			screen
				.getAllByRole("link", { name: "Open next step" })
				.map((link) => link.getAttribute("href")),
		).toContain("/attendance");

		fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "PDF" } });
		expect(
			await screen.findByRole("heading", { name: "Where did my PDF go?" }),
		).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open next step" })).toHaveAttribute(
			"href",
			"/reports",
		);

		fireEvent.change(screen.getByLabelText("Search help"), { target: { value: "stuck" } });
		expect(await screen.findByRole("heading", { name: "I still need help" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open next step" })).toHaveAttribute("href", "/help");
	});

	it("marks guide steps complete through the progress API", async () => {
		renderHelp();

		fireEvent.click(await screen.findByLabelText("Mark Add your classrooms done"));

		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalledWith(
				"/api/guidance/progress",
				expect.objectContaining({
					method: "PATCH",
					body: JSON.stringify({
						completeStepId: "owner-start.classrooms",
						lastOpenedGuideId: "owner-start-here",
					}),
				}),
			);
		});
	});

	it("marks a completed guide step incomplete", async () => {
		apiFetchMock.mockResolvedValue({
			json: async () => ({
				progress: {
					id: "progress-1",
					centerId: "center-1",
					membershipId: "membership-1",
					completedStepIds: ["owner-start.classrooms"],
					dismissedGuideIds: [],
					lastOpenedGuideId: "owner-start-here",
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			}),
		});
		renderWithGuidanceClient(<HelpPage />);

		fireEvent.click(await screen.findByLabelText("Mark Add your classrooms incomplete"));

		await waitFor(() => {
			expect(apiFetchMock).toHaveBeenCalledWith(
				"/api/guidance/progress",
				expect.objectContaining({
					method: "PATCH",
					body: JSON.stringify({
						uncompleteStepId: "owner-start.classrooms",
						lastOpenedGuideId: "owner-start-here",
					}),
				}),
			);
		});
	});

	it("hides contextual panels that do not match the role or guide", () => {
		const { container, rerender } = renderWithGuidanceClient(
			<GuidancePanel guideId="owner-start-here" userRole="staff" />,
		);

		expect(container).toBeEmptyDOMElement();

		rerender(
			<QueryClientProvider
				client={
					new QueryClient({
						defaultOptions: { queries: { retry: false } },
					})
				}
			>
				<GuidancePanel guideId="missing-guide" userRole="owner" />
			</QueryClientProvider>,
		);
		expect(container).toBeEmptyDOMElement();
	});
});
