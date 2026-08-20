import { Button } from "@pebbledesk/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { useState } from "react";
import { DateInput } from "../../../components/date-input";
import { EmptyState } from "../../../components/empty-state";
import { GuidancePanel } from "../../../components/guidance";
import { FieldHelp, HelpTip, PageHelpPanel } from "../../../components/help-tip";
import { useAuthSession } from "../../../hooks/use-auth-session";
import { useGenerateReport, useReportDownload, useReports } from "../../../hooks/use-reports";
import { formatDate } from "../../../lib/format-date";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/reports/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: ReportsPage,
});

type ReportType = "attendance" | "ratio" | "subsidy" | "licensing";
type StateVariant = "TX" | "CA" | "FL";

function ReportHistoryRow({
	fileName,
	id,
	generatedAt,
	centerTimezone,
}: {
	id: string;
	fileName?: string | null;
	generatedAt: string;
	centerTimezone?: string;
}) {
	const download = useReportDownload(id);

	return (
		<div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
			<div className="space-y-1">
				<p className="font-medium text-foreground">{fileName ?? "Generated report"}</p>
				<p className="text-sm text-muted-foreground">
					Generated {formatDate(generatedAt, { centerTimezone })}
				</p>
			</div>
			<Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
				Download
			</Button>
		</div>
	);
}

type ReportFormat = "pdf" | "csv";

export function ReportsPage() {
	const [reportType, setReportType] = useState<ReportType>("attendance");
	const [periodStart, setPeriodStart] = useState("");
	const [periodEnd, setPeriodEnd] = useState("");
	const [stateVariant, setStateVariant] = useState<StateVariant | "generic">("generic");
	const [reportFormat, setReportFormat] = useState<ReportFormat>("pdf");
	const { data: reports, isLoading, isError, refetch } = useReports();
	const { data: session } = useAuthSession();
	const centerTimezone = session?.center.timezone ?? undefined;
	const generateReport = useGenerateReport();
	const hasBothDates =
		Boolean(periodStart) &&
		Boolean(periodEnd) &&
		!Number.isNaN(Date.parse(periodStart)) &&
		!Number.isNaN(Date.parse(periodEnd));
	const hasInvalidDateRange = hasBothDates && periodEnd < periodStart;
	const canGenerateReport = hasBothDates && !hasInvalidDateRange;

	return (
		<div className="space-y-6">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Reports</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Generate compliance exports and download saved report history.
					</p>
				</div>
				<Button asChild variant="outline" className="self-start">
					<Link to="/reports/audit-log">View audit log</Link>
				</Button>
			</div>

			<section className="rounded-lg border border-border bg-background p-6 space-y-4">
				<div className="grid gap-4 md:grid-cols-3">
					<div className="space-y-2">
						<FieldHelp
							htmlFor="report-type"
							label="Report type"
							help="Pick the kind of proof someone asked for: attendance, ratio, subsidy, or licensing."
						/>
						<Select
							value={reportType}
							onValueChange={(value) => {
								setReportType(value as ReportType);
								setStateVariant("generic");
							}}
						>
							<SelectTrigger id="report-type" aria-label="Report type">
								<SelectValue placeholder="Select report type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="attendance">Attendance</SelectItem>
								<SelectItem value="ratio">Ratio</SelectItem>
								<SelectItem value="subsidy">Subsidy</SelectItem>
								<SelectItem value="licensing">Licensing</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<FieldHelp
							htmlFor="report-period-start"
							label="Period start"
							help="The first day that should be included in the report."
						/>
						<DateInput
							id="report-period-start"
							value={periodStart}
							onChange={(event) => setPeriodStart(event.target.value)}
							aria-label="Period start"
						/>
					</div>
					<div className="space-y-2">
						<FieldHelp
							htmlFor="report-period-end"
							label="Period end"
							help="The last day that should be included in the report."
						/>
						<DateInput
							id="report-period-end"
							value={periodEnd}
							onChange={(event) => setPeriodEnd(event.target.value)}
							aria-label="Period end"
						/>
					</div>
				</div>
				<div className="space-y-2 max-w-xs">
					<p className="text-sm font-medium leading-none text-foreground">Format</p>
					<div className="flex items-center gap-1 rounded-md border border-border bg-muted p-0.5 w-fit">
						<button
							type="button"
							onClick={() => setReportFormat("pdf")}
							className={[
								"rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
								reportFormat === "pdf"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							].join(" ")}
						>
							PDF
						</button>
						<button
							type="button"
							onClick={() => setReportFormat("csv")}
							className={[
								"rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
								reportFormat === "csv"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							].join(" ")}
						>
							CSV
						</button>
					</div>
				</div>

				{reportType === "licensing" && (
					<div className="space-y-2 max-w-xs">
						<FieldHelp
							htmlFor="state-variant"
							label="State Format (optional)"
							help="Choose this only when your licensing office requested a specific state form."
						/>
						<Select
							value={stateVariant}
							onValueChange={(value) => setStateVariant(value as StateVariant | "generic")}
						>
							<SelectTrigger id="state-variant" aria-label="State format">
								<SelectValue placeholder="Select state format" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="generic">Generic</SelectItem>
								<SelectItem value="TX">Texas (HHSC 2936)</SelectItem>
								<SelectItem value="CA">California (LIC 9040)</SelectItem>
								<SelectItem value="FL">Florida (DCF CF-FSP 5337)</SelectItem>
							</SelectContent>
						</Select>
					</div>
				)}
				{!hasBothDates ? (
					<p role="alert" className="text-sm text-warning-foreground">
						Choose a start and end date to generate this export.
					</p>
				) : hasInvalidDateRange ? (
					<p role="alert" className="text-sm text-warning-foreground">
						The end date must be the same day or later than the start date.
					</p>
				) : null}
				<Button
					onClick={() =>
						generateReport.mutate({
							reportType,
							periodStart,
							periodEnd,
							format: reportFormat,
							...(reportType === "licensing" && stateVariant !== "generic" ? { stateVariant } : {}),
						})
					}
					disabled={generateReport.isPending || !canGenerateReport}
				>
					Generate report
				</Button>
			</section>

			<GuidancePanel
				guideId="download-pdf-report"
				userRole="director"
				title="Need help downloading a report?"
			/>
			<PageHelpPanel route="/reports" />

			<div className="space-y-3">
				<h2 className="text-lg font-semibold text-foreground">Report history</h2>
				<HelpTip label="Help: report history">
					Generated reports stay here so you can download the same file again later.
				</HelpTip>
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-16 w-full" />
						<Skeleton className="h-16 w-full" />
					</div>
				) : isError ? (
					<div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
						<p className="text-sm text-destructive">Failed to load report history.</p>
						<button
							type="button"
							onClick={() => void refetch()}
							className="mt-3 text-sm font-medium text-primary hover:underline"
						>
							Try again
						</button>
					</div>
				) : reports?.length ? (
					reports.map((report) => (
						<ReportHistoryRow
							key={report.id}
							id={report.id}
							fileName={report.fileName}
							generatedAt={report.generatedAt}
							centerTimezone={centerTimezone}
						/>
					))
				) : (
					<EmptyState
						tone="compliance"
						icon={<FileText className="h-6 w-6" aria-hidden="true" />}
						title="You're audit-ready"
						description="Generate a compliance export above and we'll keep your audit history filed here."
					/>
				)}
			</div>
		</div>
	);
}
