import {
	createChildSchema,
	createGuardianSchema,
	createInvoiceSchema,
	enrollChildSchema,
} from "@pebbledesk/shared/validators";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@pebbledesk/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@pebbledesk/ui/components/table";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle, Upload, XCircle } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState } from "react";
import type { ZodIssue } from "zod";
import { GuidancePanel } from "../../../components/guidance";
import { FieldHelp, PageHelpPanel } from "../../../components/help-tip";
import type { ImportResult } from "../../../hooks/use-imports";
import {
	useImportChildren,
	useImportEnroll,
	useImportGuardians,
	useImportInvoices,
} from "../../../hooks/use-imports";
import { extractErrorMessage } from "../../../lib/extract-error-message";
import { applyPreset, findPreset } from "../../../lib/migration-presets";
import { usePlanCheck } from "../../../lib/plan-gate";
import { requireDirectorOrOwner } from "../../../lib/role-guards";

export const Route = createFileRoute("/_auth/import/")({
	beforeLoad: ({ context }) => requireDirectorOrOwner(context),
	component: ImportPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportType = "children" | "guardians" | "invoices" | "enroll";
type SourcePreset = "generic" | "brightwheel" | "procare";
type WizardStep = 1 | 2 | 3 | 4;

interface ValidatedRow {
	rowIndex: number;
	/** Flat coerced row, used for the readable preview table. */
	raw: Record<string, unknown>;
	/**
	 * The shape actually submitted to the API. For flat imports this is identical
	 * to `raw`; for `enroll` it is the nested `{ child, guardians[], classroom? }`
	 * payload that `enrollChildSchema` expects.
	 */
	payload: Record<string, unknown>;
	valid: boolean;
	errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
	children: "Children",
	guardians: "Guardians",
	invoices: "Invoices",
	enroll: "Full Enrollment",
};

const SOURCE_PRESET_LABELS: Record<SourcePreset, string> = {
	generic: "Generic CSV",
	brightwheel: "Brightwheel",
	procare: "Procare",
};

const MAX_IMPORT_ROWS = 500;

const NUMERIC_FIELDS = new Set([
	"quantity",
	"unitPrice",
	"amount",
	"subtotal",
	"subsidyCredit",
	"amountDue",
	"dueDays",
]);

// Fields whose values should be lowercased + underscored to match enum constants
// e.g. "Toddler" → "toddler", "Pre K" → "pre_k", "Young Toddler" → "young_toddler"
const ENUM_FIELDS = new Set([
	"ageGroup",
	"enrollmentStatus",
	"reportType",
	"program",
	"paymentMethod",
]);

function normalizeEnumValue(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function coerceCsvString(key: string, value: string): unknown {
	if (value === "true") return true;
	if (value === "false") return false;
	const trimmed = value.trim();
	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		try {
			return JSON.parse(trimmed);
		} catch {
			return value;
		}
	}
	if (NUMERIC_FIELDS.has(key) && value !== "" && !Number.isNaN(Number(value))) {
		return Number(value);
	}
	if (ENUM_FIELDS.has(key)) {
		return normalizeEnumValue(value);
	}
	return value;
}

// Per-type aliases applied before generic snake_case conversion
const IMPORT_TYPE_ALIASES: Record<ImportType, Record<string, string>> = {
	children: { status: "enrollmentStatus" },
	enroll: { status: "enrollmentStatus" },
	guardians: {},
	invoices: {},
};

function snakeToCamel(key: string): string {
	return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function coerceCsvRow(
	row: Record<string, unknown>,
	importType: ImportType,
): Record<string, unknown> {
	const aliases = IMPORT_TYPE_ALIASES[importType];
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		const aliasedKey = aliases[key] ?? key;
		const normalizedKey = snakeToCamel(aliasedKey);
		result[normalizedKey] =
			typeof value === "string" ? coerceCsvString(normalizedKey, value) : value;
	}
	return result;
}

function camelToWords(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}

function formatZodIssue(issue: ZodIssue): string {
	const field = issue.path.length > 0 ? camelToWords(String(issue.path[0])) : null;
	const prefix = field ? `${field}: ` : "";

	switch (issue.code) {
		case "invalid_type":
			if (
				("input" in issue && (issue.input === undefined || issue.input === null)) ||
				issue.message.toLowerCase().includes("undefined") ||
				issue.message.toLowerCase().includes("null")
			) {
				return `${prefix}required`;
			}
			return `${prefix}invalid value`;
		case "invalid_value":
			return `${prefix}invalid value`;
		case "too_small":
			return `${prefix}must be at least ${issue.minimum}`;
		case "too_big":
			return `${prefix}must be at most ${issue.maximum}`;
		default:
			return prefix ? `${prefix}${issue.message.toLowerCase()}` : issue.message;
	}
}

// Flat camelCase enrollment columns → nested `enrollChildSchema` shape.
const ENROLL_CHILD_FIELDS = [
	"firstName",
	"lastName",
	"dateOfBirth",
	"ageGroup",
	"enrollmentStatus",
	"subsidyEligible",
] as const;

// Flat `guardian*` column → newGuardian field name.
const ENROLL_GUARDIAN_FIELD_MAP: Record<string, string> = {
	guardianFirstName: "firstName",
	guardianLastName: "lastName",
	guardianEmail: "email",
	guardianPhone: "phone",
	guardianRelationship: "relationship",
	guardianIsPrimary: "isPrimary",
	guardianAuthorizedPickup: "authorizedPickup",
};

function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null && value !== "";
}

/**
 * Reshape a flat coerced enrollment row into the nested
 * `{ child, guardians[], classroom? }` payload that `enrollChildSchema` expects.
 *
 * Two source shapes are supported:
 *   - Already-nested rows (CSV columns literally named `child`/`guardians`
 *     holding JSON), in which case the coerced row is passed through unchanged.
 *   - Flat exports (Brightwheel/Procare/generic) where each field is its own
 *     column — mapped into `child`, a single `new` guardian, and an optional
 *     classroom assignment.
 */
function buildEnrollPayload(coerced: Record<string, unknown>): Record<string, unknown> {
	// Already-nested path: a `child` object means the row carried JSON columns.
	if (typeof coerced.child === "object" && coerced.child !== null) {
		return coerced;
	}

	const child: Record<string, unknown> = {};
	for (const field of ENROLL_CHILD_FIELDS) {
		if (isPresent(coerced[field])) {
			child[field] = coerced[field];
		}
	}

	let guardians: unknown;
	if (Array.isArray(coerced.guardians)) {
		guardians = coerced.guardians;
	} else {
		const guardian: Record<string, unknown> = { type: "new" };
		for (const [flatKey, guardianKey] of Object.entries(ENROLL_GUARDIAN_FIELD_MAP)) {
			if (isPresent(coerced[flatKey])) {
				guardian[guardianKey] = coerced[flatKey];
			}
		}
		guardians = [guardian];
	}

	const payload: Record<string, unknown> = { child, guardians };

	if (isPresent(coerced.classroomId)) {
		payload.classroom = {
			classroomId: coerced.classroomId,
			effectiveDate: coerced.classroomEffectiveDate ?? coerced.effectiveDate,
		};
	}

	return payload;
}

function validateRow(
	importType: ImportType,
	row: Record<string, unknown>,
	rowIndex: number,
): ValidatedRow {
	const coerced = coerceCsvRow(row, importType);
	const payload = importType === "enroll" ? buildEnrollPayload(coerced) : coerced;
	let result: { success: true } | { success: false; error: { issues: ZodIssue[] } };

	switch (importType) {
		case "children":
			result = createChildSchema.safeParse(payload);
			break;
		case "guardians":
			result = createGuardianSchema.safeParse(payload);
			break;
		case "invoices":
			result = createInvoiceSchema.safeParse(payload);
			break;
		case "enroll":
			result = enrollChildSchema.safeParse(payload);
			break;
	}

	if (result.success) {
		return { rowIndex, raw: coerced, payload, valid: true, errors: [] };
	}

	return {
		rowIndex,
		raw: coerced,
		payload,
		valid: false,
		errors: result.success ? [] : result.error.issues.map((i) => formatZodIssue(i)),
	};
}

function getColumnKeys(rows: ValidatedRow[]): string[] {
	const keys = new Set<string>();
	for (const row of rows) {
		for (const key of Object.keys(row.raw)) {
			keys.add(key);
		}
	}
	return Array.from(keys).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

interface Step1Props {
	importType: ImportType;
	sourcePreset: SourcePreset;
	onImportTypeChange: (v: ImportType) => void;
	onSourcePresetChange: (v: SourcePreset) => void;
	onNext: () => void;
}

function Step1Configure({
	importType,
	sourcePreset,
	onImportTypeChange,
	onSourcePresetChange,
	onNext,
}: Step1Props) {
	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="text-xl">Configure Import</CardTitle>
				<p className="text-sm text-muted-foreground">
					Choose what you are importing and which format your file uses.
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="space-y-2">
					<FieldHelp
						htmlFor="import-type"
						label="Import type"
						help="Choose the kind of records inside your CSV file."
					/>
					<Select value={importType} onValueChange={(v) => onImportTypeChange(v as ImportType)}>
						<SelectTrigger id="import-type" className="w-full">
							<SelectValue placeholder="Select type" />
						</SelectTrigger>
						<SelectContent>
							{(Object.entries(IMPORT_TYPE_LABELS) as [ImportType, string][]).map(
								([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<FieldHelp
						htmlFor="source-preset"
						label="Source preset"
						help="Choose where the spreadsheet came from so PebbleDesk can read the columns."
					/>
					<Select
						value={sourcePreset}
						onValueChange={(v) => onSourcePresetChange(v as SourcePreset)}
					>
						<SelectTrigger id="source-preset" className="w-full">
							<SelectValue placeholder="Select source" />
						</SelectTrigger>
						<SelectContent>
							{(Object.entries(SOURCE_PRESET_LABELS) as [SourcePreset, string][]).map(
								([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								),
							)}
						</SelectContent>
					</Select>
				</div>

				<div className="flex justify-end pt-2">
					<Button
						onClick={onNext}
						className="transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						Next
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

interface Step2Props {
	importType: ImportType;
	rowCount: number;
	onFileChange: (file: File) => void;
	onBack: () => void;
	onNext: () => void;
	hasFile: boolean;
	isParsing?: boolean;
	parseError?: string | null;
	noPresetNotice?: boolean;
}

function Step2Upload({
	importType,
	rowCount,
	onFileChange,
	onBack,
	onNext,
	hasFile,
	isParsing,
	parseError,
	noPresetNotice,
}: Step2Props) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) onFileChange(file);
	}

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="text-xl">Upload CSV</CardTitle>
				<p className="text-sm text-muted-foreground">
					Upload a CSV file containing {IMPORT_TYPE_LABELS[importType].toLowerCase()} data.
				</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border p-8">
					<Upload className="h-8 w-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">Click to select a CSV file</p>
					<input
						ref={fileInputRef}
						type="file"
						accept=".csv"
						onChange={handleChange}
						className="hidden"
						data-testid="csv-file-input"
					/>
					<Button
						variant="outline"
						onClick={() => fileInputRef.current?.click()}
						className="transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						Select File
					</Button>
				</div>

				{noPresetNotice && (
					<p
						className="panel-warning rounded-md border px-4 py-3 text-sm"
						data-testid="no-preset-notice"
					>
						No column mapping available for this source — columns must match PebbleDesk field names
						exactly.
					</p>
				)}

				{isParsing && <p className="text-center text-sm text-muted-foreground">Parsing file…</p>}

				{parseError && (
					<p className="panel-destructive rounded-md border px-4 py-3 text-sm">{parseError}</p>
				)}

				{hasFile && !isParsing && !parseError && (
					<p className="text-center text-sm font-medium text-foreground">
						{rowCount} rows detected
					</p>
				)}

				<div className="flex justify-between pt-2">
					<Button
						variant="outline"
						onClick={onBack}
						className="gap-2 transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						<ArrowLeft className="h-4 w-4" />
						Back
					</Button>
					<Button
						onClick={onNext}
						disabled={!hasFile || isParsing || parseError !== null}
						className="transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						Next
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

interface Step3Props {
	importType: ImportType;
	rows: ValidatedRow[];
	onBack: () => void;
	onImport: () => void;
	isPending: boolean;
	submitError: string | null;
	overCapWarning?: boolean;
}

function Step3Preview({
	importType,
	rows,
	onBack,
	onImport,
	isPending,
	submitError,
	overCapWarning,
}: Step3Props) {
	const validCount = rows.filter((r) => r.valid).length;
	const importableCount = Math.min(validCount, MAX_IMPORT_ROWS);
	const invalidCount = rows.filter((r) => !r.valid).length;
	const columns = getColumnKeys(rows);
	const invalidSummary =
		invalidCount === 0
			? "All preview rows are ready to import."
			: `${invalidCount} row${invalidCount === 1 ? "" : "s"} ${
					invalidCount === 1 ? "needs" : "need"
				} attention and will be skipped.`;

	return (
		<Card className="mx-auto max-w-5xl">
			<CardHeader>
				<CardTitle className="text-xl">Preview &amp; Validate</CardTitle>
				<p className="text-sm text-muted-foreground">
					Reviewing {IMPORT_TYPE_LABELS[importType].toLowerCase()} data. Invalid rows will be
					skipped.
				</p>
				<div className="flex items-center gap-4 pt-1">
					<span className="flex items-center gap-1.5 text-sm font-medium text-success">
						<CheckCircle className="h-4 w-4" />
						{validCount} valid
					</span>
					<span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
						<XCircle className="h-4 w-4" />
						{invalidCount} invalid
					</span>
				</div>
				<p
					role="status"
					className={
						invalidCount > 0
							? "rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-sm text-warning-foreground"
							: "rounded-md border border-success/20 bg-success/10 px-3 py-2 text-sm text-success"
					}
				>
					{invalidSummary}
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				{overCapWarning && (
					<div
						data-testid="cap-warning"
						className="panel-warning rounded-md border px-4 py-3 text-sm"
					>
						Your file has more than {MAX_IMPORT_ROWS} rows. Only the first {MAX_IMPORT_ROWS} valid
						rows will be imported.
					</div>
				)}

				{submitError && (
					<div className="panel-destructive rounded-md border px-4 py-3 text-sm">{submitError}</div>
				)}

				<div className="overflow-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">Status</TableHead>
								{columns.map((col) => (
									<TableHead key={col}>{col}</TableHead>
								))}
								<TableHead>Issues</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow
									key={`row-${row.rowIndex}`}
									className={row.valid ? "" : "bg-destructive/5"}
								>
									<TableCell>
										{row.valid ? (
											<CheckCircle className="h-4 w-4 text-success" />
										) : (
											<XCircle className="h-4 w-4 text-destructive" />
										)}
									</TableCell>
									{columns.map((col) => (
										<TableCell key={col} className="max-w-40 truncate text-sm">
											{String(row.raw[col] ?? "")}
										</TableCell>
									))}
									<TableCell className="text-xs text-destructive">
										{row.errors.join(", ")}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<div className="flex justify-between pt-2">
					<Button
						variant="outline"
						onClick={onBack}
						disabled={isPending}
						className="gap-2 transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						<ArrowLeft className="h-4 w-4" />
						Back
					</Button>
					<Button
						onClick={onImport}
						disabled={isPending || validCount === 0}
						className="transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
					>
						{isPending ? "Importing..." : `Import ${importableCount} rows`}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

interface Step4Props {
	result: ImportResult;
	onReset: () => void;
}

function Step4Result({ result, onReset }: Step4Props) {
	return (
		<Card className="mx-auto max-w-lg text-center">
			<CardHeader>
				<div className="tone-success mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full">
					<CheckCircle className="h-6 w-6 text-success" />
				</div>
				<CardTitle className="text-xl">Import Complete</CardTitle>
				<p className="text-sm text-muted-foreground">Your data has been imported successfully.</p>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid grid-cols-3 gap-4 rounded-lg border bg-muted/30 p-4">
					<div className="space-y-1">
						<p className="text-2xl font-bold text-foreground">{result.inserted}</p>
						<p className="text-xs text-muted-foreground">Inserted</p>
					</div>
					<div className="space-y-1">
						<p className="text-2xl font-bold text-foreground">{result.skipped}</p>
						<p className="text-xs text-muted-foreground">Skipped</p>
					</div>
					<div className="space-y-1">
						<p className="text-2xl font-bold text-foreground">{result.errors.length}</p>
						<p className="text-xs text-muted-foreground">Errors</p>
					</div>
				</div>

				{result.errors.length > 0 && (
					<ul className="space-y-1 text-left text-sm text-destructive">
						{result.errors.map((err) => (
							<li key={`${err.rowIndex}-${err.message}`}>
								Row {err.rowIndex + 1}: {err.message}
							</li>
						))}
					</ul>
				)}

				<Button
					onClick={onReset}
					className="w-full transition-all duration-200 motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98]"
				>
					Import Another
				</Button>
			</CardContent>
		</Card>
	);
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

function ImportPage() {
	const [step, setStep] = useState<WizardStep>(1);
	const [importType, setImportType] = useState<ImportType>("children");
	const [sourcePreset, setSourcePreset] = useState<SourcePreset>("generic");
	const [rows, setRows] = useState<ValidatedRow[]>([]);
	const [rawRowCount, setRawRowCount] = useState(0);
	const [hasFile, setHasFile] = useState(false);
	const [isParsing, setIsParsing] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [parseError, setParseError] = useState<string | null>(null);
	const parseGenerationRef = useRef(0);

	const importChildren = useImportChildren();
	const importGuardians = useImportGuardians();
	const importInvoices = useImportInvoices();
	const importEnroll = useImportEnroll();
	const { allowed: hasImportFeature } = usePlanCheck({ features: ["imports"] });

	const isPending =
		importChildren.isPending ||
		importGuardians.isPending ||
		importInvoices.isPending ||
		importEnroll.isPending;

	function clearUploadedRows() {
		parseGenerationRef.current += 1;
		setRows([]);
		setRawRowCount(0);
		setHasFile(false);
		setIsParsing(false);
		setSubmitError(null);
		setParseError(null);
	}

	function handleImportTypeChange(nextImportType: ImportType) {
		if (nextImportType !== importType) {
			clearUploadedRows();
		}
		setImportType(nextImportType);
	}

	function handleSourcePresetChange(nextSourcePreset: SourcePreset) {
		if (nextSourcePreset !== sourcePreset) {
			clearUploadedRows();
		}
		setSourcePreset(nextSourcePreset);
	}

	function handleFileChange(file: File) {
		const parseGeneration = parseGenerationRef.current + 1;
		parseGenerationRef.current = parseGeneration;
		const parseImportType = importType;
		const parseSourcePreset = sourcePreset;

		setParseError(null);
		setHasFile(false);
		setRows([]);
		setIsParsing(true);
		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			transformHeader: (h: string) => h.replace(/^\uFEFF/, "").trim(),
			complete(parsed) {
				if (parseGenerationRef.current !== parseGeneration) {
					return;
				}

				const parsedRows = parsed.data as Record<string, string>[];
				setRawRowCount(parsedRows.length);
				setHasFile(true);

				const preset =
					parseSourcePreset !== "generic" ? findPreset(parseSourcePreset, parseImportType) : null;

				const mappedRows: Record<string, unknown>[] = parsedRows.map((row) =>
					preset ? applyPreset(row, preset) : row,
				);

				const validated = mappedRows.map((row, idx) => validateRow(parseImportType, row, idx));
				setRows(validated);
				setIsParsing(false);
			},
			error(err) {
				if (parseGenerationRef.current !== parseGeneration) {
					return;
				}

				setParseError(err.message ?? "Failed to parse CSV file");
				setIsParsing(false);
			},
		});
	}

	async function handleImport() {
		const validRows = rows
			.filter((r) => r.valid)
			.slice(0, MAX_IMPORT_ROWS)
			.map((r) => r.payload);
		const payload = { rows: validRows, dedupeStrategy: "skip" as const };

		setSubmitError(null);

		try {
			let importResult: ImportResult;

			switch (importType) {
				case "children":
					importResult = await importChildren.mutateAsync(payload);
					break;
				case "guardians":
					importResult = await importGuardians.mutateAsync(payload);
					break;
				case "invoices":
					importResult = await importInvoices.mutateAsync(payload);
					break;
				case "enroll":
					importResult = await importEnroll.mutateAsync(payload);
					break;
			}

			setResult(importResult);
			if (importResult.inserted === 0 && importResult.errors.length > 0) {
				setSubmitError(
					`Import failed: ${importResult.errors.length} row(s) had errors. No records were inserted.`,
				);
			} else {
				setStep(4);
			}
		} catch (err) {
			setSubmitError(extractErrorMessage(err, "Failed to import data"));
		}
	}

	function handleReset() {
		setStep(1);
		setImportType("children");
		setSourcePreset("generic");
		setRows([]);
		setRawRowCount(0);
		setHasFile(false);
		setIsParsing(false);
		setResult(null);
		setSubmitError(null);
		setParseError(null);
	}

	if (!hasImportFeature) {
		return (
			<div className="flex flex-col gap-6 p-6">
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Import Data</h1>
					<p className="text-sm text-muted-foreground">
						CSV imports are available on Center Starter and larger plans.
					</p>
				</div>
				<Card>
					<CardHeader>
						<CardTitle>Upgrade required</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Use manual entry for this plan, or update billing to unlock guided imports.
						</p>
						<Button asChild className="mt-4" size="sm">
							<Link to="/billing">Upgrade plan</Link>
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			{/* Page header */}
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Import Data</h1>
				<p className="text-sm text-muted-foreground">
					Import children, guardians, invoices, or full enrollment records from a CSV file.
				</p>
			</div>

			<GuidancePanel
				guideId="csv-import-basics"
				userRole="director"
				title="Need help with CSV imports?"
			/>
			<PageHelpPanel route="/import" />

			{/* Step indicator */}
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				{(["Configure", "Upload", "Preview", "Done"] as const).map((label, idx) => {
					const stepNum = (idx + 1) as WizardStep;
					const active = step === stepNum;
					const done = step > stepNum;
					return (
						<div key={label} className="flex items-center gap-2">
							<span
								className={[
									"flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
									active ? "bg-primary text-primary-foreground" : "",
									done ? "tone-success" : "",
									!active && !done ? "bg-muted text-muted-foreground" : "",
								].join(" ")}
							>
								{done ? <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> : stepNum}
							</span>
							<span className={active ? "font-medium text-foreground" : ""}>{label}</span>
							{idx < 3 && <span className="text-muted-foreground/50">/</span>}
						</div>
					);
				})}
			</div>

			{/* Step content */}
			{step === 1 && (
				<Step1Configure
					importType={importType}
					sourcePreset={sourcePreset}
					onImportTypeChange={handleImportTypeChange}
					onSourcePresetChange={handleSourcePresetChange}
					onNext={() => setStep(2)}
				/>
			)}

			{step === 2 && (
				<Step2Upload
					importType={importType}
					rowCount={rawRowCount}
					onFileChange={handleFileChange}
					onBack={() => setStep(1)}
					onNext={() => setStep(3)}
					hasFile={hasFile}
					isParsing={isParsing}
					parseError={parseError}
					noPresetNotice={
						sourcePreset !== "generic" && findPreset(sourcePreset, importType) === null
					}
				/>
			)}

			{step === 3 && (
				<Step3Preview
					importType={importType}
					rows={rows}
					onBack={() => setStep(2)}
					onImport={handleImport}
					isPending={isPending}
					submitError={submitError}
					overCapWarning={rawRowCount > MAX_IMPORT_ROWS}
				/>
			)}

			{step === 4 && result && <Step4Result result={result} onReset={handleReset} />}
		</div>
	);
}
