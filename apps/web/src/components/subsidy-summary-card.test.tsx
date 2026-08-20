import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { withCenterTimezone } from "../test/with-center-timezone";
import { SubsidySummaryCard } from "./subsidy-summary-card";

describe("SubsidySummaryCard", () => {
	it("shows the active subsidy case and latest claim", () => {
		render(
			<SubsidySummaryCard
				childName="Ava Johnson"
				summary={{
					cases: [
						{
							id: "case-1",
							status: "active",
							program: "ccdf",
							caseNumber: "CASE-123",
							agencyName: "County Services",
							authorizedHoursWeekly: 32,
							rateDaily: 45,
							effectiveDate: "2026-01-01",
							createdAt: "2026-01-01T12:00:00.000Z",
							updatedAt: "2026-01-01T12:00:00.000Z",
							centerId: "center-1",
							childId: "child-1",
						},
					],
					activeCase: {
						id: "case-1",
						status: "active",
						program: "ccdf",
						caseNumber: "CASE-123",
						agencyName: "County Services",
						authorizedHoursWeekly: 32,
						rateDaily: 45,
						effectiveDate: "2026-01-01",
						createdAt: "2026-01-01T12:00:00.000Z",
						updatedAt: "2026-01-01T12:00:00.000Z",
						centerId: "center-1",
						childId: "child-1",
					},
					claims: [
						{
							id: "claim-1",
							status: "submitted",
							amountClaimed: 300,
							daysAttended: 5,
							hoursAttended: 24,
							periodStart: "2026-02-01",
							periodEnd: "2026-02-07",
							centerId: "center-1",
							subsidyCaseId: "case-1",
							createdAt: "2026-02-07T12:00:00.000Z",
							updatedAt: "2026-02-07T12:00:00.000Z",
						},
					],
					latestClaim: {
						id: "claim-1",
						status: "submitted",
						amountClaimed: 300,
						daysAttended: 5,
						hoursAttended: 24,
						periodStart: "2026-02-01",
						periodEnd: "2026-02-07",
						centerId: "center-1",
						subsidyCaseId: "case-1",
						createdAt: "2026-02-07T12:00:00.000Z",
						updatedAt: "2026-02-07T12:00:00.000Z",
					},
				}}
			/>,
		);

		expect(screen.getByText("Subsidy")).toBeInTheDocument();
		expect(screen.getByText("CASE-123")).toBeInTheDocument();
		expect(screen.getByText("County Services")).toBeInTheDocument();
		expect(screen.getByText("Latest claim")).toBeInTheDocument();
		expect(screen.getByText("Submitted")).toBeInTheDocument();
		// Whole-dollar amounts must render with two decimal places ($300.00 not $300)
		expect(screen.getByText("$300.00")).toBeInTheDocument();
		expect(screen.getByText("$45.00")).toBeInTheDocument();
	});

	it("renders date-only effective/claim dates without prev-day shift in negative-UTC zones", () => {
		// Naive `new Date("2026-01-01")` parses as UTC midnight, which renders as
		// Dec 31, 2025 in America/Los_Angeles. The helper must anchor at noon UTC
		// so the calendar date stays Jan 1, 2026 in every zone.
		render(
			withCenterTimezone(
				"America/Los_Angeles",
				<SubsidySummaryCard
					childName="Ava Johnson"
					summary={{
						cases: [],
						activeCase: {
							id: "case-1",
							status: "active",
							program: "ccdf",
							caseNumber: "CASE-123",
							agencyName: "County Services",
							authorizedHoursWeekly: 32,
							rateDaily: 45,
							effectiveDate: "2026-01-01",
							createdAt: "2026-01-01T12:00:00.000Z",
							updatedAt: "2026-01-01T12:00:00.000Z",
							centerId: "center-1",
							childId: "child-1",
						},
						claims: [],
						latestClaim: null,
					}}
				/>,
			),
		);

		expect(screen.getByText("Jan 1, 2026")).toBeInTheDocument();
	});

	it("shows the empty state when the child has no subsidy case", () => {
		render(<SubsidySummaryCard childName="Ava Johnson" summary={null} />);

		expect(screen.getByText(/No subsidy case yet for Ava Johnson/)).toBeInTheDocument();
	});

	it("renders date-only fields anchored to UTC so the day never shifts back", () => {
		render(
			<SubsidySummaryCard
				childName="Ava Johnson"
				summary={{
					cases: [],
					activeCase: {
						id: "case-2",
						status: "active",
						program: "ccdf",
						caseNumber: "CASE-999",
						agencyName: "County Services",
						authorizedHoursWeekly: 32,
						rateDaily: 45,
						// Date-only value: must render as Dec 31 (UTC-pinned), not Dec 30.
						effectiveDate: "2020-12-31",
						createdAt: "2020-12-31T12:00:00.000Z",
						updatedAt: "2020-12-31T12:00:00.000Z",
						centerId: "center-1",
						childId: "child-1",
					},
					claims: [],
					latestClaim: {
						id: "claim-2",
						status: "submitted",
						amountClaimed: 300,
						daysAttended: 5,
						hoursAttended: 24,
						periodStart: "2020-12-31",
						periodEnd: "2021-01-06",
						centerId: "center-1",
						subsidyCaseId: "case-2",
						createdAt: "2021-01-06T12:00:00.000Z",
						updatedAt: "2021-01-06T12:00:00.000Z",
					},
				}}
			/>,
		);

		// effectiveDate and periodStart both anchor to Dec 31, 2020.
		expect(screen.getAllByText(/Dec 31, 2020/).length).toBeGreaterThanOrEqual(1);
		// The period range must not collapse the start to Dec 30.
		expect(screen.queryByText(/Dec 30, 2020/)).toBeNull();
	});
});
