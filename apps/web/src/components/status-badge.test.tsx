import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
	it("uses semantic status tokens instead of raw palette utilities", () => {
		const { container } = render(
			<div>
				<StatusBadge status="active" />
				<StatusBadge status="waitlist" />
				<StatusBadge status="sent" />
				<StatusBadge status="violation" />
				<StatusBadge status="archived" />
			</div>,
		);

		expect(screen.getByText("Active").className).toContain("bg-success/15");
		expect(screen.getByText("Waitlist").className).toContain("bg-warning/15");
		expect(screen.getByText("Sent").className).toContain("bg-primary/10");
		expect(screen.getByText("Violation").className).toContain("bg-destructive/10");
		expect(screen.getByText("Archived").className).toContain("bg-muted");
		expect(container.innerHTML).not.toMatch(/(?:gray|blue|green|red|amber)-\d{2,3}/);
	});
});
