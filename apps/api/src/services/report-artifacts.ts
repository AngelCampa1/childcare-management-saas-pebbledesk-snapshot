import {
	auditLog,
	centers,
	checkIns,
	children,
	classroomAssignments,
	classrooms,
	memberships,
	ratioSnapshots,
	ratioViolations,
	subsidyCases,
	subsidyClaims,
	users,
} from "@pebbledesk/db";
import type { GenerateReportInput } from "@pebbledesk/shared";
import { toUtcMidnightForLocalDate } from "@pebbledesk/shared";
import { STATE_RATIO_TABLES } from "@pebbledesk/shared/constants";
import { and, desc, eq, gte, isNotNull, isNull, lte, or } from "drizzle-orm";
import type { Variables } from "../lib/context.js";
import { badRequest } from "../lib/errors.js";

// Memory guard for the licensing audit-log export. When a center exceeds this many
// audit entries in the reporting window the export is capped, but truncation is
// surfaced in manifest.csv so the report is never silently incomplete.
const AUDIT_LOG_REPORT_LIMIT = 5000;

// Memory guards for event-volume queries. Queries fetch LIMIT+1 rows so a full
// result set can be distinguished from a truncated one without a separate COUNT.
const CHECK_IN_REPORT_LIMIT = 5000;
const RATIO_SNAPSHOT_REPORT_LIMIT = 5000;
const RATIO_VIOLATION_REPORT_LIMIT = 5000;

type ArtifactBody = string | Uint8Array | ReadableStream<Uint8Array>;

function sanitizeCsvValue(value: string): string {
	if (/^[=+\-@\t\r]/.test(value)) {
		return `'${value}`;
	}
	return value;
}

function toCsv(rows: Array<Record<string, unknown>>) {
	if (rows.length === 0) return "";
	const headers = Object.keys(rows[0]);
	const escapeCsvValue = (value: unknown) => {
		if (typeof value === "string") {
			return `"${sanitizeCsvValue(value).replaceAll('"', '""')}"`;
		}
		return `"${String(value ?? "")}"`;
	};
	return [
		headers.join(","),
		...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(",")),
	].join("\n");
}

export function toCsvStream(rows: Array<Record<string, unknown>>): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream<Uint8Array>({
		start(controller) {
			if (rows.length === 0) {
				controller.close();
				return;
			}
			const headers = Object.keys(rows[0]);
			const escapeCsvValue = (value: unknown) => {
				if (typeof value === "string") {
					return `"${sanitizeCsvValue(value).replaceAll('"', '""')}"`;
				}
				return `"${String(value ?? "")}"`;
			};
			controller.enqueue(encoder.encode(headers.join(",")));
			for (const row of rows) {
				controller.enqueue(
					encoder.encode(`\n${headers.map((h) => escapeCsvValue(row[h])).join(",")}`),
				);
			}
			controller.close();
		},
	});
}

function crc32(bytes: Uint8Array) {
	let crc = -1;
	for (const byte of bytes) {
		crc ^= byte;
		for (let index = 0; index < 8; index += 1) {
			const mask = -(crc & 1);
			crc = (crc >>> 1) ^ (0xedb88320 & mask);
		}
	}
	return (crc ^ -1) >>> 0;
}

function writeUInt16(value: number) {
	return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function writeUInt32(value: number) {
	return new Uint8Array([
		value & 0xff,
		(value >>> 8) & 0xff,
		(value >>> 16) & 0xff,
		(value >>> 24) & 0xff,
	]);
}

function concatBytes(chunks: Uint8Array[]) {
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalSize);
	let offset = 0;

	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

function createStoredZip(entries: Array<{ fileName: string; contents: string }>) {
	const encoder = new TextEncoder();
	const localChunks: Uint8Array[] = [];
	const centralChunks: Uint8Array[] = [];
	let localOffset = 0;

	for (const entry of entries) {
		const nameBytes = encoder.encode(entry.fileName);
		const dataBytes = encoder.encode(entry.contents);
		const checksum = crc32(dataBytes);

		const localHeader = concatBytes([
			writeUInt32(0x04034b50),
			writeUInt16(20),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(checksum),
			writeUInt32(dataBytes.length),
			writeUInt32(dataBytes.length),
			writeUInt16(nameBytes.length),
			writeUInt16(0),
			nameBytes,
		]);
		localChunks.push(localHeader, dataBytes);

		const centralHeader = concatBytes([
			writeUInt32(0x02014b50),
			writeUInt16(20),
			writeUInt16(20),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(checksum),
			writeUInt32(dataBytes.length),
			writeUInt32(dataBytes.length),
			writeUInt16(nameBytes.length),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt16(0),
			writeUInt32(0),
			writeUInt32(localOffset),
			nameBytes,
		]);
		centralChunks.push(centralHeader);

		localOffset += localHeader.length + dataBytes.length;
	}

	const centralDirectory = concatBytes(centralChunks);
	const endOfCentralDirectory = concatBytes([
		writeUInt32(0x06054b50),
		writeUInt16(0),
		writeUInt16(0),
		writeUInt16(entries.length),
		writeUInt16(entries.length),
		writeUInt32(centralDirectory.length),
		writeUInt32(localOffset),
		writeUInt16(0),
	]);

	return concatBytes([...localChunks, centralDirectory, endOfCentralDirectory]);
}

function buildArtifact(fileName: string, contentType: string, body: ArtifactBody) {
	return {
		fileName,
		contentType,
		body,
	};
}

function escapePdfText(value: string) {
	return value
		.replace(/[^\x20-\x7e]/g, "?")
		.replace(/\\/g, "\\\\")
		.replace(/\(/g, "\\(")
		.replace(/\)/g, "\\)");
}

function wrapPdfLine(value: string, maxLength = 95) {
	const chunks: string[] = [];
	let current = value;
	while (current.length > maxLength) {
		chunks.push(current.slice(0, maxLength));
		current = current.slice(maxLength);
	}
	chunks.push(current);
	return chunks;
}

function createPdfDocument(title: string, body: string) {
	const sourceLines = [title, "", ...(body ? body.split(/\r?\n/) : ["No records found."])];
	const lines = sourceLines.flatMap((line) => wrapPdfLine(line));
	const linesPerPage = 52;
	const pages = Array.from(
		{ length: Math.max(1, Math.ceil(lines.length / linesPerPage)) },
		(_, index) => lines.slice(index * linesPerPage, (index + 1) * linesPerPage),
	);
	const fontObjectId = 3 + pages.length * 2;
	const objects: Array<{ id: number; body: string }> = [
		{ id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
		{
			id: 2,
			body: `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
		},
	];

	for (const [index, pageLines] of pages.entries()) {
		const pageObjectId = 3 + index * 2;
		const contentObjectId = pageObjectId + 1;
		const content = [
			"BT",
			"/F1 9 Tf",
			"50 760 Td",
			"14 TL",
			...pageLines.map((line, lineIndex) =>
				lineIndex === 0 ? `(${escapePdfText(line)}) Tj` : `T* (${escapePdfText(line)}) Tj`,
			),
			"ET",
		].join("\n");

		objects.push(
			{
				id: pageObjectId,
				body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
			},
			{
				id: contentObjectId,
				body: `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
			},
		);
	}

	objects.push({
		id: fontObjectId,
		body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	});

	let pdf = "%PDF-1.4\n";
	const offsets = [0];
	for (const object of objects.sort((left, right) => left.id - right.id)) {
		offsets[object.id] = pdf.length;
		pdf += `${object.id} 0 obj\n${object.body}\nendobj\n`;
	}
	const xrefOffset = pdf.length;
	pdf += `xref\n0 ${fontObjectId + 1}\n0000000000 65535 f \n`;
	for (let id = 1; id <= fontObjectId; id += 1) {
		pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
	}
	pdf += `trailer\n<< /Size ${fontObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

	return new TextEncoder().encode(pdf);
}

function buildCsvOrPdfArtifact(
	input: GenerateReportInput,
	baseName: string,
	csv: string,
	title = baseName,
) {
	if (input.format === "pdf") {
		return buildArtifact(`${baseName}.pdf`, "application/pdf", createPdfDocument(title, csv));
	}

	return buildArtifact(`${baseName}.csv`, "text/csv; charset=utf-8", csv);
}

function buildZipOrPdfArtifact(
	input: GenerateReportInput,
	baseName: string,
	entries: Array<{ fileName: string; contents: string }>,
) {
	if (input.format === "pdf") {
		const body = entries
			.map((entry) => [`# ${entry.fileName}`, entry.contents].join("\n"))
			.join("\n\n");
		return buildArtifact(`${baseName}.pdf`, "application/pdf", createPdfDocument(baseName, body));
	}

	return buildArtifact(`${baseName}.zip`, "application/zip", createStoredZip(entries));
}

type StateVariant = "TX" | "CA" | "FL";

type CenterRow = {
	name: string;
	licenseNumber?: string | null;
	[key: string]: unknown;
};

type ClassroomRow = {
	id: string;
	name: string;
	ageGroup: string;
	maxCapacity: number;
	minRatioChildren: number;
	[key: string]: unknown;
};

type ChildRow = {
	id: string;
	classroomId?: string | null;
	[key: string]: unknown;
};

type SnapshotRow = {
	classroomId: string;
	staffCount: number;
	childrenCount: number;
	[key: string]: unknown;
};

type ViolationRow = {
	classroomId: string;
	description?: string | null;
	[key: string]: unknown;
};

type DirectorRow = {
	directorName: string;
	directorPhone: string;
	directorEmail: string;
};

/**
 * Builds a TX HHSC Form 2936-equivalent facility inspection report CSV.
 * Columns sourced from Texas HHSC Minimum Standards for Licensed Child Care Centers (746).
 * TX Admin Code 746.3303 defines required staff:child ratios by age group.
 */
function buildTxLicensingCsv(
	center: CenterRow,
	classroomRows: ClassroomRow[],
	childRows: ChildRow[],
	snapshotRows: SnapshotRow[],
	violationRows: ViolationRow[],
	director: DirectorRow,
): string {
	const childCountByClassroom = new Map<string, number>();
	for (const child of childRows) {
		if (child.classroomId) {
			childCountByClassroom.set(
				child.classroomId,
				(childCountByClassroom.get(child.classroomId) ?? 0) + 1,
			);
		}
	}

	const latestSnapshotByClassroom = new Map<string, SnapshotRow>();
	for (const snapshot of snapshotRows) {
		const existing = latestSnapshotByClassroom.get(snapshot.classroomId);
		if (!existing) {
			latestSnapshotByClassroom.set(snapshot.classroomId, snapshot);
		}
	}

	const violationsByClassroom = new Map<string, ViolationRow[]>();
	for (const violation of violationRows) {
		const list = violationsByClassroom.get(violation.classroomId) ?? [];
		list.push(violation);
		violationsByClassroom.set(violation.classroomId, list);
	}

	const rows = classroomRows.map((classroom) => {
		const ageGroup = classroom.ageGroup as keyof (typeof STATE_RATIO_TABLES)["TX"];
		const ratioRule = STATE_RATIO_TABLES.TX[ageGroup];
		const ratioRequired = ratioRule ? `1:${ratioRule.children}` : "N/A";
		const snapshot = latestSnapshotByClassroom.get(classroom.id);
		const violations = violationsByClassroom.get(classroom.id) ?? [];
		const hasViolation = violations.length > 0;

		return {
			center_name: center.name,
			license_number: center.licenseNumber ?? "",
			// TX HHSC Form 2936 requires director contact information
			director_name: director.directorName,
			director_phone: director.directorPhone,
			director_email: director.directorEmail,
			classroom_name: classroom.name,
			age_group: classroom.ageGroup,
			licensed_capacity: classroom.maxCapacity,
			// TX Admin Code 746.3303 staff:child ratio requirement
			ratio_required: ratioRequired,
			enrolled_count: childCountByClassroom.get(classroom.id) ?? 0,
			staff_present: snapshot?.staffCount ?? 0,
			violation_flag: hasViolation ? "Y" : "N",
			violation_description: violations.map((v) => v.description ?? "").join("; "),
		};
	});

	return toCsv(rows);
}

/**
 * Builds a CA LIC 9040-equivalent facility program statement CSV.
 * Columns sourced from California Department of Social Services LIC 9040.
 * CA Title 22 CCR §101216.3 defines required staff:child ratios by age group.
 */
function buildCaLicensingCsv(
	center: CenterRow,
	classroomRows: ClassroomRow[],
	childRows: ChildRow[],
	snapshotRows: SnapshotRow[],
): string {
	const childCountByClassroom = new Map<string, number>();
	for (const child of childRows) {
		if (child.classroomId) {
			childCountByClassroom.set(
				child.classroomId,
				(childCountByClassroom.get(child.classroomId) ?? 0) + 1,
			);
		}
	}

	const latestSnapshotByClassroom = new Map<string, SnapshotRow>();
	for (const snapshot of snapshotRows) {
		const existing = latestSnapshotByClassroom.get(snapshot.classroomId);
		if (!existing) {
			latestSnapshotByClassroom.set(snapshot.classroomId, snapshot);
		}
	}

	const rows = classroomRows.map((classroom) => {
		const ageGroup = classroom.ageGroup as keyof (typeof STATE_RATIO_TABLES)["CA"];
		const ratioRule = STATE_RATIO_TABLES.CA[ageGroup];
		const requiredRatio = ratioRule ? `1:${ratioRule.children}` : "N/A";
		const snapshot = latestSnapshotByClassroom.get(classroom.id);
		const enrollment = childCountByClassroom.get(classroom.id) ?? 0;
		let actualRatio = "N/A";
		let complianceStatus = "N/A";

		if (snapshot && snapshot.staffCount > 0) {
			const childrenPerStaff = snapshot.childrenCount / snapshot.staffCount;
			actualRatio = `1:${childrenPerStaff.toFixed(1)}`;
			const maxAllowed = ratioRule?.children ?? Number.POSITIVE_INFINITY;
			complianceStatus = childrenPerStaff <= maxAllowed ? "Compliant" : "Non-Compliant";
		} else if (snapshot && snapshot.staffCount === 0 && snapshot.childrenCount > 0) {
			// No staff present but children are — this is a non-compliant ratio
			complianceStatus = "Non-Compliant";
		}

		return {
			center_name: center.name,
			// CA LIC 9040 uses facility number
			facility_number: center.licenseNumber ?? "",
			classroom_name: classroom.name,
			age_group: classroom.ageGroup,
			capacity: classroom.maxCapacity,
			actual_enrollment: enrollment,
			// CA Title 22 §101216.3 required ratio
			required_ratio: requiredRatio,
			actual_ratio: actualRatio,
			compliance_status: complianceStatus,
		};
	});

	return toCsv(rows);
}

/**
 * Builds a FL DCF CF-FSP 5337-equivalent staff/child ratio record CSV.
 * Columns sourced from Florida Department of Children and Families CF-FSP 5337.
 * FL 65C-22.001(5)(a) defines maximum children per staff member by age group.
 */
function buildFlLicensingCsv(
	center: CenterRow,
	classroomRows: ClassroomRow[],
	snapshotRows: SnapshotRow[],
	periodStart: string,
	periodEnd: string,
): string {
	const latestSnapshotByClassroom = new Map<string, SnapshotRow>();
	for (const snapshot of snapshotRows) {
		const existing = latestSnapshotByClassroom.get(snapshot.classroomId);
		if (!existing) {
			latestSnapshotByClassroom.set(snapshot.classroomId, snapshot);
		}
	}

	const rows = classroomRows.map((classroom) => {
		const ageGroup = classroom.ageGroup as keyof (typeof STATE_RATIO_TABLES)["FL"];
		const ratioRule = STATE_RATIO_TABLES.FL[ageGroup];
		// FL 65C-22.001(5)(a) maximum children allowed per staff member
		const maxChildrenAllowed = ratioRule?.children ?? classroom.minRatioChildren;
		const snapshot = latestSnapshotByClassroom.get(classroom.id);
		let ratioInCompliance = "N/A";

		if (snapshot && snapshot.staffCount > 0) {
			const childrenPerStaff = snapshot.childrenCount / snapshot.staffCount;
			ratioInCompliance = childrenPerStaff <= maxChildrenAllowed ? "Y" : "N";
		} else if (snapshot && snapshot.staffCount === 0 && snapshot.childrenCount > 0) {
			// No staff present but children are — non-compliant
			ratioInCompliance = "N";
		}

		return {
			center_name: center.name,
			license_number: center.licenseNumber ?? "",
			date_range: `${periodStart} to ${periodEnd}`,
			room_name: classroom.name,
			age_group: classroom.ageGroup,
			// FL 65C-22.001(5)(a) maximum children per staff member
			maximum_children_allowed: maxChildrenAllowed,
			actual_count: snapshot?.childrenCount ?? 0,
			staff_count: snapshot?.staffCount ?? 0,
			ratio_in_compliance: ratioInCompliance,
		};
	});

	return toCsv(rows);
}

/**
 * Builds a state-specific licensing report zip bundle.
 * Each state emits one primary CSV file named after the state form equivalent.
 */
function buildStateLicensingReport(
	stateVariant: StateVariant,
	center: CenterRow,
	classroomRows: ClassroomRow[],
	childRows: ChildRow[],
	snapshotRows: SnapshotRow[],
	violationRows: ViolationRow[],
	periodStart: string,
	periodEnd: string,
	director: DirectorRow,
	snapshotsTruncated: boolean,
	violationsTruncated: boolean,
): { fileName: string; entries: Array<{ fileName: string; contents: string }> } {
	const prefix = `licensing-${stateVariant.toLowerCase()}-${periodStart}-${periodEnd}`;
	const manifest = [
		`report_type,licensing`,
		`state_variant,${stateVariant}`,
		`period_start,${periodStart}`,
		`period_end,${periodEnd}`,
		`ratio_snapshots_truncated,${snapshotsTruncated}`,
		`ratio_snapshots_row_limit,${RATIO_SNAPSHOT_REPORT_LIMIT}`,
		`ratio_violations_truncated,${violationsTruncated}`,
		`ratio_violations_row_limit,${RATIO_VIOLATION_REPORT_LIMIT}`,
	].join("\n");

	if (stateVariant === "TX") {
		// TX HHSC Form 2936 equivalent — facility_inspection_report
		return {
			fileName: `${prefix}.zip`,
			entries: [
				{ fileName: "manifest.csv", contents: manifest },
				{
					fileName: "facility_inspection_report.csv",
					contents: buildTxLicensingCsv(
						center,
						classroomRows,
						childRows,
						snapshotRows,
						violationRows,
						director,
					),
				},
			],
		};
	}

	if (stateVariant === "CA") {
		// CA LIC 9040 equivalent — facility_program_statement
		return {
			fileName: `${prefix}.zip`,
			entries: [
				{ fileName: "manifest.csv", contents: manifest },
				{
					fileName: "facility_program_statement.csv",
					contents: buildCaLicensingCsv(center, classroomRows, childRows, snapshotRows),
				},
			],
		};
	}

	// FL DCF CF-FSP 5337 equivalent — staff_child_ratio_record
	return {
		fileName: `${prefix}.zip`,
		entries: [
			{ fileName: "manifest.csv", contents: manifest },
			{
				fileName: "staff_child_ratio_record.csv",
				contents: buildFlLicensingCsv(center, classroomRows, snapshotRows, periodStart, periodEnd),
			},
		],
	};
}

export async function generateReportArtifact(
	input: GenerateReportInput,
	context: { centerId: string },
	db: Variables["db"],
) {
	// Fetch center timezone once for all report types so period windows are correct for the center's locale
	const [centerTimezoneRow] = await db
		.select({ timezone: centers.timezone })
		.from(centers)
		.where(eq(centers.id, context.centerId));
	const timezone = centerTimezoneRow?.timezone ?? "UTC";

	// Build period window boundaries in the center's local timezone
	const periodStartUtc = toUtcMidnightForLocalDate(input.periodStart, timezone);
	// End of periodEnd in local timezone = start of the following day minus 1ms
	const periodEndUtc = new Date(
		toUtcMidnightForLocalDate(input.periodEnd, timezone).getTime() + 86_400_000 - 1,
	);

	switch (input.reportType) {
		case "attendance": {
			const rawRows = await db
				.select()
				.from(checkIns)
				.where(
					and(
						eq(checkIns.centerId, context.centerId),
						gte(checkIns.checkedInAt, periodStartUtc),
						lte(checkIns.checkedInAt, periodEndUtc),
						...(input.classroomId ? [eq(checkIns.classroomId, input.classroomId)] : []),
						...(input.childId ? [eq(checkIns.childId, input.childId)] : []),
					),
				)
				.orderBy(desc(checkIns.checkedInAt))
				.limit(CHECK_IN_REPORT_LIMIT + 1);

			if ((rawRows as unknown[]).length > CHECK_IN_REPORT_LIMIT) {
				badRequest("Report period too large to export; narrow the date range.");
			}

			const rows = rawRows;

			return buildCsvOrPdfArtifact(
				input,
				`attendance-${input.periodStart}-${input.periodEnd}`,
				toCsv(rows as Array<Record<string, unknown>>),
				"Attendance report",
			);
		}
		case "ratio": {
			const [rawSnapshots, rawViolations] = await Promise.all([
				db
					.select()
					.from(ratioSnapshots)
					.where(
						and(
							eq(ratioSnapshots.centerId, context.centerId),
							gte(ratioSnapshots.snapshotAt, periodStartUtc),
							lte(ratioSnapshots.snapshotAt, periodEndUtc),
							...(input.classroomId ? [eq(ratioSnapshots.classroomId, input.classroomId)] : []),
						),
					)
					.orderBy(desc(ratioSnapshots.snapshotAt))
					.limit(RATIO_SNAPSHOT_REPORT_LIMIT + 1),
				db
					.select()
					.from(ratioViolations)
					.where(
						and(
							eq(ratioViolations.centerId, context.centerId),
							gte(ratioViolations.detectedAt, periodStartUtc),
							lte(ratioViolations.detectedAt, periodEndUtc),
							...(input.classroomId ? [eq(ratioViolations.classroomId, input.classroomId)] : []),
						),
					)
					.orderBy(desc(ratioViolations.detectedAt))
					.limit(RATIO_VIOLATION_REPORT_LIMIT + 1),
			]);

			if ((rawSnapshots as unknown[]).length > RATIO_SNAPSHOT_REPORT_LIMIT) {
				badRequest("Report period too large to export; narrow the date range.");
			}
			if ((rawViolations as unknown[]).length > RATIO_VIOLATION_REPORT_LIMIT) {
				badRequest("Report period too large to export; narrow the date range.");
			}

			const snapshots = rawSnapshots;
			const violations = rawViolations;

			return buildCsvOrPdfArtifact(
				input,
				`ratio-${input.periodStart}-${input.periodEnd}`,
				`${toCsv(snapshots as Array<Record<string, unknown>>)}\n\n${toCsv(
					violations as Array<Record<string, unknown>>,
				)}`.trim(),
				"Ratio report",
			);
		}
		case "subsidy": {
			const caseConditions = [eq(subsidyCases.centerId, context.centerId)];
			if (input.childId) {
				caseConditions.push(eq(subsidyCases.childId, input.childId));
			}
			if (input.classroomId) {
				const assignedChildren = await db
					.select({ childId: classroomAssignments.childId })
					.from(classroomAssignments)
					.where(
						and(
							eq(classroomAssignments.centerId, context.centerId),
							eq(classroomAssignments.classroomId, input.classroomId),
							lte(classroomAssignments.effectiveDate, input.periodEnd),
							or(
								isNull(classroomAssignments.endDate),
								gte(classroomAssignments.endDate, input.periodStart),
							),
						),
					);
				const assignedChildIds = assignedChildren.map((assignment) => assignment.childId);
				if (assignedChildIds.length === 0) {
					return buildCsvOrPdfArtifact(
						input,
						`subsidy-${input.periodStart}-${input.periodEnd}`,
						"",
						"Subsidy report",
					);
				}
				const childIdConditions = assignedChildIds.map((childId) =>
					eq(subsidyCases.childId, childId),
				);
				const classroomCondition = or(...childIdConditions);
				if (classroomCondition) {
					caseConditions.push(classroomCondition);
				}
			}

			const [cases, claims] = await Promise.all([
				db
					.select()
					.from(subsidyCases)
					.where(and(...caseConditions)),
				db
					.select()
					.from(subsidyClaims)
					.where(
						and(
							eq(subsidyClaims.centerId, context.centerId),
							gte(subsidyClaims.periodStart, input.periodStart),
							lte(subsidyClaims.periodEnd, input.periodEnd),
						),
					),
			]);
			const filteredCaseIds = new Set(cases.map((subsidyCase) => subsidyCase.id));
			const filteredClaims = claims.filter((claim) => filteredCaseIds.has(claim.subsidyCaseId));

			return buildCsvOrPdfArtifact(
				input,
				`subsidy-${input.periodStart}-${input.periodEnd}`,
				`${toCsv(cases as Array<Record<string, unknown>>)}\n\n${toCsv(
					filteredClaims as Array<Record<string, unknown>>,
				)}`.trim(),
				"Subsidy report",
			);
		}
		case "licensing": {
			if (input.stateVariant) {
				// State-specific licensing report: fetch center, classrooms, children, snapshots, violations, director
				const [centerRows, classroomRows, childRows, snapshotRows, violationRows, directorRows] =
					await Promise.all([
						db.select().from(centers).where(eq(centers.id, context.centerId)),
						db
							.select()
							.from(classrooms)
							.where(and(eq(classrooms.centerId, context.centerId), isNull(classrooms.archivedAt))),
						db
							.select()
							.from(children)
							.where(
								and(
									eq(children.centerId, context.centerId),
									eq(children.enrollmentStatus, "active"),
								),
							),
						db
							.select()
							.from(ratioSnapshots)
							.where(
								and(
									eq(ratioSnapshots.centerId, context.centerId),
									gte(ratioSnapshots.snapshotAt, periodStartUtc),
									lte(ratioSnapshots.snapshotAt, periodEndUtc),
								),
							)
							.orderBy(desc(ratioSnapshots.snapshotAt))
							.limit(RATIO_SNAPSHOT_REPORT_LIMIT + 1),
						db
							.select()
							.from(ratioViolations)
							.where(
								and(
									eq(ratioViolations.centerId, context.centerId),
									gte(ratioViolations.detectedAt, periodStartUtc),
									lte(ratioViolations.detectedAt, periodEndUtc),
								),
							)
							.orderBy(desc(ratioViolations.detectedAt))
							.limit(RATIO_VIOLATION_REPORT_LIMIT + 1),
						db
							.select({
								directorName: users.name,
								directorEmail: users.email,
							})
							.from(memberships)
							.leftJoin(users, eq(memberships.userId, users.id))
							.where(
								and(
									eq(memberships.centerId, context.centerId),
									eq(memberships.role, "director"),
									isNotNull(memberships.acceptedAt),
									isNull(memberships.deactivatedAt),
								),
							),
					]);

				const directorRow = directorRows[0];
				// The auth users table does not store a phone number; director_phone is always blank
				const director: DirectorRow = {
					directorName: directorRow?.directorName ?? "",
					directorPhone: "",
					directorEmail: directorRow?.directorEmail ?? "",
				};

				const rawStateSnapshotRows = snapshotRows as unknown[];
				const rawStateViolationRows = violationRows as unknown[];
				const stateSnapshotsTruncated = rawStateSnapshotRows.length > RATIO_SNAPSHOT_REPORT_LIMIT;
				const stateViolationsTruncated =
					rawStateViolationRows.length > RATIO_VIOLATION_REPORT_LIMIT;
				const slicedStateSnapshotRows = rawStateSnapshotRows.slice(
					0,
					RATIO_SNAPSHOT_REPORT_LIMIT,
				) as SnapshotRow[];
				const slicedStateViolationRows = rawStateViolationRows.slice(
					0,
					RATIO_VIOLATION_REPORT_LIMIT,
				) as ViolationRow[];

				const center = (centerRows[0] ?? { name: "", licenseNumber: null }) as CenterRow;
				const { fileName, entries } = buildStateLicensingReport(
					input.stateVariant,
					center,
					classroomRows as ClassroomRow[],
					childRows as ChildRow[],
					slicedStateSnapshotRows,
					slicedStateViolationRows,
					input.periodStart,
					input.periodEnd,
					director,
					stateSnapshotsTruncated,
					stateViolationsTruncated,
				);

				return buildZipOrPdfArtifact(input, fileName.replace(/\.zip$/, ""), entries);
			}

			// Generic licensing report (no state variant)
			const [centerRows, classroomRows, childRows, snapshotRows, violationRows, auditRowsRaw] =
				await Promise.all([
					db.select().from(centers).where(eq(centers.id, context.centerId)),
					db
						.select()
						.from(classrooms)
						.where(and(eq(classrooms.centerId, context.centerId), isNull(classrooms.archivedAt))),
					db
						.select()
						.from(children)
						.where(
							and(eq(children.centerId, context.centerId), eq(children.enrollmentStatus, "active")),
						),
					db
						.select()
						.from(ratioSnapshots)
						.where(
							and(
								eq(ratioSnapshots.centerId, context.centerId),
								gte(ratioSnapshots.snapshotAt, periodStartUtc),
								lte(ratioSnapshots.snapshotAt, periodEndUtc),
							),
						)
						.orderBy(desc(ratioSnapshots.snapshotAt))
						.limit(RATIO_SNAPSHOT_REPORT_LIMIT + 1),
					db
						.select()
						.from(ratioViolations)
						.where(
							and(
								eq(ratioViolations.centerId, context.centerId),
								gte(ratioViolations.detectedAt, periodStartUtc),
								lte(ratioViolations.detectedAt, periodEndUtc),
							),
						)
						.orderBy(desc(ratioViolations.detectedAt))
						.limit(RATIO_VIOLATION_REPORT_LIMIT + 1),
					db
						.select()
						.from(auditLog)
						.where(
							and(
								eq(auditLog.centerId, context.centerId),
								gte(auditLog.createdAt, periodStartUtc),
								lte(auditLog.createdAt, periodEndUtc),
							),
						)
						.orderBy(desc(auditLog.createdAt))
						// Fetch one extra row so a full result set can be distinguished from a
						// truncated one. The cap is a memory guard; for an audit-ready export we
						// must never silently drop entries, so truncation is surfaced in the manifest.
						.limit(AUDIT_LOG_REPORT_LIMIT + 1),
				]);

			const auditRows = (auditRowsRaw as Array<Record<string, unknown>>).slice(
				0,
				AUDIT_LOG_REPORT_LIMIT,
			);
			const auditLogTruncated = (auditRowsRaw as unknown[]).length > AUDIT_LOG_REPORT_LIMIT;

			const rawGenSnapshotRows = snapshotRows as unknown[];
			const rawGenViolationRows = violationRows as unknown[];
			const snapshotsTruncated = rawGenSnapshotRows.length > RATIO_SNAPSHOT_REPORT_LIMIT;
			const violationsTruncated = rawGenViolationRows.length > RATIO_VIOLATION_REPORT_LIMIT;
			const slicedSnapshotRows = rawGenSnapshotRows.slice(0, RATIO_SNAPSHOT_REPORT_LIMIT);
			const slicedViolationRows = rawGenViolationRows.slice(0, RATIO_VIOLATION_REPORT_LIMIT);

			const manifest = [
				`report_type,licensing`,
				`period_start,${input.periodStart}`,
				`period_end,${input.periodEnd}`,
				`sections,center|classrooms|children|ratio_snapshots|ratio_violations|audit_log`,
				`ratio_snapshots_truncated,${snapshotsTruncated}`,
				`ratio_snapshots_row_limit,${RATIO_SNAPSHOT_REPORT_LIMIT}`,
				`ratio_violations_truncated,${violationsTruncated}`,
				`ratio_violations_row_limit,${RATIO_VIOLATION_REPORT_LIMIT}`,
				`audit_log_truncated,${auditLogTruncated}`,
				`audit_log_row_limit,${AUDIT_LOG_REPORT_LIMIT}`,
			].join("\n");

			return buildZipOrPdfArtifact(input, `licensing-${input.periodStart}-${input.periodEnd}`, [
				{ fileName: "manifest.csv", contents: manifest },
				{
					fileName: "center.csv",
					contents: toCsv(centerRows as Array<Record<string, unknown>>),
				},
				{
					fileName: "classrooms.csv",
					contents: toCsv(classroomRows as Array<Record<string, unknown>>),
				},
				{
					fileName: "children.csv",
					contents: toCsv(childRows as Array<Record<string, unknown>>),
				},
				{
					fileName: "ratio_snapshots.csv",
					contents: toCsv(slicedSnapshotRows as Array<Record<string, unknown>>),
				},
				{
					fileName: "ratio_violations.csv",
					contents: toCsv(slicedViolationRows as Array<Record<string, unknown>>),
				},
				{
					fileName: "audit_log.csv",
					contents: toCsv(auditRows as Array<Record<string, unknown>>),
				},
			]);
		}
	}
}
