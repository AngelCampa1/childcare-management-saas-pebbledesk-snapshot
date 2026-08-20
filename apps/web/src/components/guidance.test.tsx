import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock router — Link is used inside GuideStepRow's interactive CTA branch
vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
		useNavigate: () => vi.fn(),
	};
});

// Mock guidance-progress hooks used only by the interactive path
vi.mock("../hooks/use-guidance-progress", () => ({
	useGuidanceProgress: vi.fn(() => ({ data: { completedStepIds: [] } })),
	usePatchGuidanceProgress: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import { getGuideById } from "../lib/guidance-content";
import { GuidancePanel, GuideCard, GuideChecklist } from "./guidance";

// Use the real "dashboard-basics" guide — it targets ALL_ROLES so both owner and staff can see it.
const REAL_GUIDE_ID = "dashboard-basics";

describe("GuidancePanel (static/non-interactive)", () => {
	it("renders each visible guide step title and description", () => {
		render(<GuidancePanel guideId={REAL_GUIDE_ID} userRole="director" />);

		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const visibleSteps = guide!.steps.filter(
			(step) => !step.roles || step.roles.includes("director"),
		);

		expect(visibleSteps.length).toBeGreaterThan(0);

		for (const step of visibleSteps) {
			expect(screen.getByText(step.title)).toBeInTheDocument();
			expect(screen.getByText(step.description)).toBeInTheDocument();
		}
	});

	it("static tip rows contain NO button, checkbox, or radio role for their markers", () => {
		render(<GuidancePanel guideId={REAL_GUIDE_ID} userRole="director" />);

		const buttons = screen.queryAllByRole("button");
		expect(buttons).toHaveLength(0);

		const checkboxes = screen.queryAllByRole("checkbox");
		expect(checkboxes).toHaveLength(0);

		const radios = screen.queryAllByRole("radio");
		expect(radios).toHaveLength(0);
	});

	it("static tip row markers are plain decorative dots, not SVG circle icons", () => {
		render(<GuidancePanel guideId={REAL_GUIDE_ID} userRole="director" />);

		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const visibleSteps = guide!.steps.filter(
			(step) => !step.roles || step.roles.includes("director"),
		);
		expect(visibleSteps.length).toBeGreaterThan(0);

		// Each list item should contain a decorative span bullet, NOT a Lucide <circle> SVG
		const listItems = screen.getAllByRole("listitem");
		// Filter to only the step rows (exclude any container list items if nesting occurs)
		const stepItems = listItems.filter((li) =>
			visibleSteps.some((step) => within(li).queryByText(step.title) !== null),
		);
		expect(stepItems.length).toBeGreaterThan(0);

		for (const item of stepItems) {
			// Must have a decorative span dot with the expected class
			const dot = item.querySelector('span[aria-hidden="true"].rounded-full');
			expect(dot).not.toBeNull();

			// Must NOT contain a Lucide SVG circle icon (which has a <circle> SVG element)
			// The Lucide Circle icon renders as <svg> with a <circle> child
			const svgWithCircle = item.querySelector("svg circle");
			expect(svgWithCircle).toBeNull();
		}
	});

	it("returns null when the guide does not apply to the given role", () => {
		const { container } = render(
			<GuidancePanel guideId="__nonexistent_guide__" userRole="staff" />,
		);
		expect(container).toBeEmptyDOMElement();
	});
});

describe("GuideChecklist (interactive)", () => {
	it("renders a clickable toggle button per visible step with the correct aria-label", () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const visibleSteps = guide?.steps.filter(
			(step) => !step.roles || step.roles.includes("director"),
		);
		expect(visibleSteps.length).toBeGreaterThan(0);

		for (const step of visibleSteps) {
			const btn = screen.getByRole("button", { name: new RegExp(`Mark ${step.title}`, "i") });
			expect(btn).toBeInTheDocument();
		}
	});

	it("renders a button per step that matches /Mark .* done/i for uncompleted steps", () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const doneButtons = screen.getAllByRole("button", { name: /mark .* done/i });
		expect(doneButtons.length).toBeGreaterThan(0);
	});

	it("interactive step rows use SVG icons (Circle or CheckCircle2), not plain dot spans", () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const listItems = screen.getAllByRole("listitem");
		expect(listItems.length).toBeGreaterThan(0);

		for (const item of listItems) {
			// Interactive rows must contain a Lucide SVG icon inside the toggle button
			const svgInsideButton = item.querySelector("button svg");
			expect(svgInsideButton).not.toBeNull();
		}
	});
});

describe("GuideChecklist (toggle interactions)", () => {
	it("calls mutate when a step toggle button is clicked", async () => {
		const mockMutate = vi.fn();
		const hooks = await import("../hooks/use-guidance-progress");
		vi.mocked(hooks.usePatchGuidanceProgress).mockReturnValue({
			mutate: mockMutate,
			isPending: false,
		} as ReturnType<typeof hooks.usePatchGuidanceProgress>);
		vi.mocked(hooks.useGuidanceProgress).mockReturnValue({
			data: { completedStepIds: [] },
		} as ReturnType<typeof hooks.useGuidanceProgress>);

		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const firstButton = screen.getAllByRole("button", { name: /mark .* done/i })[0];
		// biome-ignore lint/style/noNonNullAssertion: array confirmed non-empty by prior tests
		fireEvent.click(firstButton!);
		expect(mockMutate).toHaveBeenCalledOnce();
	});

	it("renders the 'Mark incomplete' label when a step is already completed", async () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const firstStep = guide!.steps[0];
		const hooks = await import("../hooks/use-guidance-progress");
		vi.mocked(hooks.useGuidanceProgress).mockReturnValue({
			// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
			data: { completedStepIds: [firstStep!.id] },
		} as ReturnType<typeof hooks.useGuidanceProgress>);

		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const incompleteBtn = screen.getByRole("button", {
			name: `Mark ${firstStep?.title} incomplete`,
		});
		expect(incompleteBtn).toBeInTheDocument();
	});

	it("renders a CTA link when an interactive step has href and ctaLabel", () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const stepWithCta = guide!.steps.find((s) => s.href && s.ctaLabel);
		if (!stepWithCta) {
			return;
		}

		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		// biome-ignore lint/style/noNonNullAssertion: guarded above
		expect(screen.getByRole("link", { name: stepWithCta.ctaLabel! })).toBeInTheDocument();
	});
});

describe("GuideChecklist (null progress data)", () => {
	it("renders all steps as uncompleted when progress data is null/undefined", async () => {
		const hooks = await import("../hooks/use-guidance-progress");
		vi.mocked(hooks.useGuidanceProgress).mockReturnValue({
			data: undefined,
		} as ReturnType<typeof hooks.useGuidanceProgress>);

		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const doneButtons = screen.getAllByRole("button", { name: /mark .* done/i });
		expect(doneButtons.length).toBeGreaterThan(0);
	});
});

describe("GuideChecklist (uncomplete path)", () => {
	it("calls mutate with uncompleteStepId when a completed step is clicked", async () => {
		const mockMutate = vi.fn();
		const hooks = await import("../hooks/use-guidance-progress");
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const firstStep = guide!.steps[0];
		vi.mocked(hooks.usePatchGuidanceProgress).mockReturnValue({
			mutate: mockMutate,
			isPending: false,
		} as ReturnType<typeof hooks.usePatchGuidanceProgress>);
		vi.mocked(hooks.useGuidanceProgress).mockReturnValue({
			// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
			data: { completedStepIds: [firstStep!.id] },
		} as ReturnType<typeof hooks.useGuidanceProgress>);

		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideChecklist guide={guide!} />);

		const incompleteBtn = screen.getByRole("button", {
			name: `Mark ${firstStep?.title} incomplete`,
		});
		fireEvent.click(incompleteBtn);

		expect(mockMutate).toHaveBeenCalledWith(
			expect.objectContaining({
				// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
				uncompleteStepId: firstStep!.id,
			}),
		);
	});
});

describe("GuideCard (interactive wrapper)", () => {
	it("renders a progress counter and interactive step buttons", () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);

		// Progress counter e.g. "0/3"
		expect(screen.getByText(/\d+\/\d+/)).toBeInTheDocument();

		// At least one interactive button
		const doneButtons = screen.getAllByRole("button", { name: /mark .* done/i });
		expect(doneButtons.length).toBeGreaterThan(0);
	});

	it("shows the 'Daily use' badge label for a daily-tone guide", () => {
		const guide = getGuideById("attendance-basics");
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);
		expect(screen.getByText("Daily use")).toBeInTheDocument();
	});

	it("shows the 'Compliance' badge label for a compliance-tone guide", () => {
		const guide = getGuideById("ratio-colors");
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);
		expect(screen.getByText("Compliance")).toBeInTheDocument();
	});

	it("shows the 'Money' badge label for a finance-tone guide", () => {
		const guide = getGuideById("billing-subsidy-flow");
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);
		expect(screen.getByText("Money")).toBeInTheDocument();
	});

	it("shows the 'Data' badge label for a data-tone guide", () => {
		const guide = getGuideById("csv-import-basics");
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);
		expect(screen.getByText("Data")).toBeInTheDocument();
	});

	it("shows the 'Start here' badge label for a start-tone guide", () => {
		const guide = getGuideById("owner-start-here");
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);
		expect(screen.getByText("Start here")).toBeInTheDocument();
	});

	it("shows the correct completed count in the progress counter", async () => {
		const guide = getGuideById(REAL_GUIDE_ID);
		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		const firstStep = guide!.steps[0];
		const hooks = await import("../hooks/use-guidance-progress");
		vi.mocked(hooks.useGuidanceProgress).mockReturnValue({
			// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
			data: { completedStepIds: [firstStep!.id] },
		} as ReturnType<typeof hooks.useGuidanceProgress>);

		// biome-ignore lint/style/noNonNullAssertion: test fixture is known-good
		render(<GuideCard guide={guide!} />);

		// Should show "1/N" now
		expect(screen.getByText(/^1\//)).toBeInTheDocument();
	});
});
