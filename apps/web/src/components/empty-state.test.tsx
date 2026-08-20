import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
	it("defaults to operations tone with neutral icon tile", () => {
		render(
			<EmptyState icon={<svg aria-label="icon" />} title="No items" description="Try again." />,
		);

		const wrapper = screen.getByRole("region", { name: "No items" });
		expect(wrapper).toHaveAttribute("data-tone", "operations");
		// Default shape has no left-border accent — centered layout makes it asymmetric
		expect(wrapper.className).not.toContain("border-l-");
		// Icon wrappers are decorative — hidden from AT.
		const iconTile = wrapper.querySelector('div[aria-hidden="true"]');
		expect(iconTile).not.toBeNull();
	});

	it("applies compliance tone with success accents", () => {
		render(
			<EmptyState
				tone="compliance"
				icon={<svg aria-label="icon" />}
				title="Audit-ready"
				description="No violations."
			/>,
		);

		const wrapper = screen.getByRole("region", { name: "Audit-ready" });
		expect(wrapper).toHaveAttribute("data-tone", "compliance");
		// Default shape has no left-border accent; tone is conveyed via icon color
		expect(wrapper.className).not.toContain("border-l-");

		const iconTile = wrapper.querySelector('div[aria-hidden="true"]');
		expect(iconTile?.className).toContain("bg-success/10");
		expect(iconTile?.className).toContain("text-success");
	});

	it("applies finance tone with primary accents", () => {
		render(
			<EmptyState
				tone="finance"
				icon={<svg aria-label="icon" />}
				title="No money in motion"
				description="Send your first invoice."
			/>,
		);

		const wrapper = screen.getByRole("region", { name: "No money in motion" });
		expect(wrapper).toHaveAttribute("data-tone", "finance");
		// Default shape has no left-border accent
		expect(wrapper.className).not.toContain("border-l-");
	});

	it("renders an actionLabel button that triggers onAction", () => {
		const handler = vi.fn();
		render(
			<EmptyState
				title="Empty"
				description="Please act."
				actionLabel="Do thing"
				onAction={handler}
			/>,
		);

		screen.getByRole("button", { name: "Do thing" }).click();
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("renders a custom action node", () => {
		render(
			<EmptyState title="Hello" description="World" action={<a href="/x">Custom action</a>} />,
		);

		expect(screen.getByRole("link", { name: "Custom action" })).toHaveAttribute("href", "/x");
	});

	it("renders the inline shape with a compact left-aligned layout", () => {
		render(
			<EmptyState
				shape="inline"
				tone="people"
				icon={<svg aria-label="icon" />}
				title="No sent messages"
				description="Compose one when you are ready."
			/>,
		);

		const wrapper = screen.getByText("No sent messages").closest("[data-shape]");
		expect(wrapper).toHaveAttribute("data-shape", "inline");
		expect(wrapper).toHaveAttribute("data-tone", "people");
		expect(wrapper?.className).toContain("text-left");
	});

	it("renders the checklist shape with numbered steps", () => {
		render(
			<EmptyState
				shape="checklist"
				tone="operations"
				icon={<svg aria-label="icon" />}
				title="Set up opening week"
				description="Work through these in order."
				steps={[
					{ title: "Create your first classroom", description: "Rooms come first." },
					{ title: "Enroll your first child" },
					{ title: "Open attendance" },
				]}
				actionLabel="Start setup"
				onAction={() => undefined}
			/>,
		);

		const wrapper = screen.getByText("Set up opening week").closest("[data-shape]");
		expect(wrapper).toHaveAttribute("data-shape", "checklist");
		expect(screen.getByRole("list")).toBeInTheDocument();
		expect(screen.getByText("Create your first classroom")).toBeInTheDocument();
		expect(screen.getByText("Enroll your first child")).toBeInTheDocument();
		expect(screen.getByText("Open attendance")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Start setup" })).toBeInTheDocument();
	});

	it("renders a secondary action alongside the primary CTA", () => {
		render(
			<EmptyState
				shape="checklist"
				title="Set up billing"
				description="Finish a few steps to start charging families."
				actionLabel="Create invoice"
				onAction={() => undefined}
				secondaryAction={<a href="/settings">Open settings</a>}
			/>,
		);

		expect(screen.getByRole("button", { name: "Create invoice" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
			"href",
			"/settings",
		);
	});

	it("supports left-aligned default empty states for operational pages", () => {
		render(
			<EmptyState
				align="left"
				title="No guardians yet"
				description="Add a family contact to continue."
			/>,
		);

		const wrapper = screen.getByRole("region", { name: "No guardians yet" });
		expect(wrapper.className).toContain("text-left");
		expect(wrapper.className).not.toContain("items-center");
	});

	it("renders checklist steps with stable id fields instead of titles when provided", () => {
		render(
			<EmptyState
				shape="checklist"
				tone="compliance"
				title="Steps with ids"
				description="These steps have stable ids."
				steps={[
					{ id: "step-1", title: "Step one", description: "First step." },
					{ id: "step-2", title: "Step one", description: "Second step same title." },
				]}
			/>,
		);

		expect(screen.getByText("First step.")).toBeInTheDocument();
		expect(screen.getByText("Second step same title.")).toBeInTheDocument();
	});

	it("renders every checklist step even when ids are absent and titles collide", () => {
		render(
			<EmptyState
				shape="checklist"
				tone="operations"
				title="Steps without ids"
				description="Two steps share a title and have no id."
				steps={[
					{ title: "Repeat", description: "First repeated step." },
					{ title: "Repeat", description: "Second repeated step." },
				]}
			/>,
		);

		// Both steps must render distinctly; a non-unique key would drop or merge one.
		expect(screen.getByText("First repeated step.")).toBeInTheDocument();
		expect(screen.getByText("Second repeated step.")).toBeInTheDocument();
		expect(screen.getAllByText("Repeat")).toHaveLength(2);
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
	});
});
