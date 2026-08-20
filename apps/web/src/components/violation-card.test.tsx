import type { RatioViolation } from "@pebbledesk/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { withCenterTimezone } from "../test/with-center-timezone";
import { ViolationCard } from "./violation-card";

function buildViolation(overrides: Partial<RatioViolation> = {}): RatioViolation {
	return {
		id: "v-1",
		centerId: "c-1",
		classroomId: "room-1",
		snapshotId: null,
		detectedAt: "2026-04-11T12:00:00.000Z",
		resolvedAt: null,
		durationSeconds: null,
		resolutionNotes: null,
		...overrides,
	} as RatioViolation;
}

describe("ViolationCard formatDuration", () => {
	it("shows '< 1m' for sub-minute violations", () => {
		const now = new Date("2026-04-11T12:00:30.000Z");
		const detectedAt = new Date(now.getTime() - 30_000).toISOString();
		const resolvedAt = now.toISOString();
		render(
			<ViolationCard
				violation={buildViolation({ detectedAt, resolvedAt })}
				classroomName="Infants"
				onAddNotes={vi.fn()}
			/>,
		);
		expect(screen.getByText("< 1m")).toBeInTheDocument();
	});

	it("shows minutes for sub-hour violations", () => {
		const resolvedAt = new Date("2026-04-11T12:45:00.000Z").toISOString();
		const detectedAt = new Date("2026-04-11T12:00:00.000Z").toISOString();
		render(
			<ViolationCard
				violation={buildViolation({ detectedAt, resolvedAt })}
				classroomName="Infants"
				onAddNotes={vi.fn()}
			/>,
		);
		expect(screen.getByText("45m")).toBeInTheDocument();
	});
});

describe("ViolationCard timezone rendering", () => {
	it("renders the detected timestamp in the center timezone, not the browser zone", () => {
		// 2026-04-11T02:00:00Z is Apr 10, 7:00 PM in America/Los_Angeles (UTC-7 in DST).
		render(
			<ViolationCard
				violation={buildViolation({ detectedAt: "2026-04-11T02:00:00.000Z" })}
				classroomName="Infants"
				onAddNotes={vi.fn()}
				centerTimezone="America/Los_Angeles"
			/>,
		);
		expect(screen.getByText(/Apr 10, 2026 7:00\s?PM/)).toBeInTheDocument();
	});

	it("renders the resolved timestamp in the center timezone", () => {
		render(
			<ViolationCard
				violation={buildViolation({
					detectedAt: "2026-04-11T01:00:00.000Z",
					resolvedAt: "2026-04-11T02:00:00.000Z",
				})}
				classroomName="Infants"
				onAddNotes={vi.fn()}
				centerTimezone="America/Los_Angeles"
			/>,
		);
		expect(screen.getByText(/Apr 10, 2026 7:00\s?PM/)).toBeInTheDocument();
	});
});

describe("ViolationCard note states", () => {
	it("does not use side-stripe borders for status emphasis", () => {
		const { container } = render(
			<ViolationCard
				violation={buildViolation()}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);

		expect(container.firstElementChild?.className).not.toMatch(/border-l-[2-9]/);
	});

	it("renders a dashed-outline empty-note state for resolved violations without notes", () => {
		render(
			<ViolationCard
				violation={buildViolation({
					resolvedAt: "2026-04-11T13:00:00.000Z",
					resolutionNotes: null,
				})}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);

		const emptyState = screen.getByTestId("violation-notes-empty");
		expect(emptyState.textContent).toBe("No notes on this violation");
		// Dashed-outline mini state replaces the italic "yet" inline text.
		expect(emptyState.className).toMatch(/border-dashed/);
		expect(emptyState.className).not.toMatch(/italic/);
		expect(emptyState.textContent).not.toMatch(/yet/);
	});

	it("omits the empty-note badge when a resolution note is already present", () => {
		render(
			<ViolationCard
				violation={buildViolation({
					resolvedAt: "2026-04-11T13:00:00.000Z",
					resolutionNotes: "Rebalanced floater staff across rooms.",
				})}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);

		expect(screen.queryByTestId("violation-notes-empty")).toBeNull();
	});

	it("shows an Edit button when resolution notes exist on a resolved violation", () => {
		render(
			<ViolationCard
				violation={buildViolation({
					resolvedAt: "2026-04-11T13:00:00.000Z",
					resolutionNotes: "Floater staff rebalanced.",
				})}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);
		expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
	});

	it("pre-fills the notes textarea when Edit is clicked", async () => {
		render(
			<ViolationCard
				violation={buildViolation({
					resolvedAt: "2026-04-11T13:00:00.000Z",
					resolutionNotes: "Floater staff rebalanced.",
				})}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		const textarea = await screen.findByRole("textbox");
		expect(textarea).toHaveValue("Floater staff rebalanced.");
	});

	it("focuses the notes textarea on the next animation frame after opening", async () => {
		render(
			<ViolationCard
				violation={buildViolation()}
				classroomName="Toddlers"
				ageGroup="toddler"
				onAddNotes={vi.fn()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Add Note" }));

		await waitFor(() => {
			const textarea = screen.getByPlaceholderText("Add a note about this violation...");
			expect(textarea).toHaveFocus();
		});
	});

	it("formats detected/resolved timestamps in the active center timezone", () => {
		// 2026-04-11T13:30Z → 09:30 AM in America/New_York (EDT, UTC-4).
		render(
			withCenterTimezone(
				"America/New_York",
				<ViolationCard
					violation={buildViolation({
						detectedAt: "2026-04-11T13:30:00.000Z",
						resolvedAt: "2026-04-11T14:45:00.000Z",
					})}
					classroomName="Infants"
					onAddNotes={vi.fn()}
				/>,
			),
		);

		expect(screen.getByText("Apr 11, 2026 9:30 AM")).toBeInTheDocument();
		expect(screen.getByText("Apr 11, 2026 10:45 AM")).toBeInTheDocument();
	});
});
