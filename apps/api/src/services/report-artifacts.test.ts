import util from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateReportArtifact, toCsvStream } from "./report-artifacts.js";

async function readBodyAsText(
	body: string | Uint8Array | ReadableStream<Uint8Array>,
): Promise<string> {
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}
	const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
	let offset = 0;
	for (const chunk of chunks) {
		combined.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder().decode(combined);
}

function sqlConditionColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) {
		return [];
	}

	const names: string[] = [];
	for (const chunk of value.queryChunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if ("name" in chunk && typeof chunk.name === "string") {
			names.push(chunk.name);
		}
		names.push(...sqlConditionColumnNames(chunk, seen));
	}

	return names;
}

function makeThenable(result: unknown, extra: Record<string, unknown> = {}): Promise<unknown> {
	const p = Promise.resolve(result);
	return Object.assign(p, extra);
}

function createSelectChain(result: unknown) {
	// Returns a thenable that also supports .orderBy().limit() so both
	// plain-await callers and orderBy+limit callers work without separate helpers.
	const limitMock = vi.fn().mockResolvedValue(result);
	const orderByMock = vi.fn().mockReturnValue(makeThenable(result, { limit: limitMock }));
	const whereResult = makeThenable(result, { orderBy: orderByMock });
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue(whereResult),
		}),
	};
}

function createOrderBySelectChain(result: unknown) {
	// Supports .orderBy() followed by either await or .limit()
	const limitMock = vi.fn().mockResolvedValue(result);
	const orderByResult = makeThenable(result, { limit: limitMock });
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue(orderByResult),
			}),
		}),
	};
}

function createJoinSelectChain(result: unknown) {
	return {
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(result),
			}),
		}),
	};
}

function createOrderByLimitSelectChain(result: unknown) {
	const limitMock = vi.fn().mockResolvedValue(result);
	const orderByMock = vi.fn().mockReturnValue(makeThenable(result, { limit: limitMock }));
	// whereResult supports both:
	//   await db.select().from().where()   (plain await, for code that hasn't been updated yet)
	//   await db.select().from().where().orderBy(...).limit(N)  (new pattern)
	const whereResult = makeThenable(result, { orderBy: orderByMock });
	return {
		chain: {
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue(whereResult),
			}),
		},
		orderByMock,
		limitMock,
	};
}

function createActiveClassroomsSelectChain(activeResult: unknown, archivedResult: unknown) {
	return {
		from: vi.fn().mockReturnValue({
			where: vi.fn().mockImplementation((condition: unknown) => {
				return Promise.resolve(
					sqlConditionColumnNames(condition).includes("archived_at")
						? activeResult
						: archivedResult,
				);
			}),
		}),
	};
}

function createActiveDirectorJoinSelectChain(activeResult: unknown, inactiveResult: unknown) {
	return {
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockImplementation((condition: unknown) => {
					const columnNames = sqlConditionColumnNames(condition);
					const requiresAccepted = columnNames.includes("accepted_at");
					const excludesDeactivated = columnNames.includes("deactivated_at");
					return Promise.resolve(
						requiresAccepted && excludesDeactivated ? activeResult : inactiveResult,
					);
				}),
			}),
		}),
	};
}

function readUInt16(buffer: Uint8Array, offset: number) {
	return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUInt32(buffer: Uint8Array, offset: number) {
	return (
		buffer[offset] |
		(buffer[offset + 1] << 8) |
		(buffer[offset + 2] << 16) |
		(buffer[offset + 3] << 24)
	);
}

function listZipEntries(buffer: Uint8Array) {
	const decoder = new TextDecoder();
	const entries: string[] = [];
	let offset = 0;

	while (offset + 4 <= buffer.length && readUInt32(buffer, offset) === 0x04034b50) {
		const fileNameLength = readUInt16(buffer, offset + 26);
		const extraFieldLength = readUInt16(buffer, offset + 28);
		const compressedSize = readUInt32(buffer, offset + 18);
		const fileNameStart = offset + 30;
		const fileNameEnd = fileNameStart + fileNameLength;
		entries.push(decoder.decode(buffer.slice(fileNameStart, fileNameEnd)));
		offset = fileNameEnd + extraFieldLength + compressedSize;
	}

	return entries;
}

function extractZipEntry(buffer: Uint8Array, targetFileName: string): string {
	const decoder = new TextDecoder();
	let offset = 0;

	while (offset + 4 <= buffer.length && readUInt32(buffer, offset) === 0x04034b50) {
		const fileNameLength = readUInt16(buffer, offset + 26);
		const extraFieldLength = readUInt16(buffer, offset + 28);
		const compressedSize = readUInt32(buffer, offset + 18);
		const fileNameStart = offset + 30;
		const fileNameEnd = fileNameStart + fileNameLength;
		const fileName = decoder.decode(buffer.slice(fileNameStart, fileNameEnd));
		const dataStart = fileNameEnd + extraFieldLength;
		const dataEnd = dataStart + compressedSize;

		if (fileName === targetFileName) {
			return decoder.decode(buffer.slice(dataStart, dataEnd));
		}

		offset = dataEnd;
	}

	return "";
}

describe("generateReportArtifact", () => {
	beforeEach(() => {
		vi.useRealTimers();
	});

	it("streams CSV rows with escaped values", async () => {
		const stream = toCsvStream([
			{ name: "Alice", note: 'He said "hello"' },
			{ name: "+formula", note: null },
		]);

		await expect(readBodyAsText(stream)).resolves.toBe(
			'name,note\n"Alice","He said ""hello"""\n"\'+formula",""',
		);
	});

	it("streams an empty CSV for empty row sets", async () => {
		await expect(readBodyAsText(toCsvStream([]))).resolves.toBe("");
	});

	it("builds an attendance csv", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([
					{ id: "check-in-1", centerId: "center-1", childId: "child-1" },
				]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "classroom-1",
				childId: "child-1",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("attendance-2026-04-01-2026-04-07.csv");
		expect(artifact.contentType).toContain("text/csv");
		expect(await readBodyAsText(artifact.body)).toContain("check-in-1");
	});

	it("builds an attendance pdf when requested", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([
					{ id: "check-in-1", centerId: "center-1", childId: "child-1" },
				]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				format: "pdf",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("attendance-2026-04-01-2026-04-07.pdf");
		expect(artifact.contentType).toBe("application/pdf");
		expect(await readBodyAsText(artifact.body)).toContain("%PDF-1.4");
	});

	it("builds attendance csv without optional classroomId or childId filters", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([
					{ id: "check-in-2", centerId: "center-1", childId: "child-2" },
				]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("attendance-2026-04-01-2026-04-07.csv");
		expect(await readBodyAsText(artifact.body)).toContain("check-in-2");
	});

	it("builds ratio csv without optional classroomId filter", async () => {
		const ratioSelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "snapshot-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "violation-1", centerId: "center-1" }]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "ratio",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select: ratioSelect } as never,
		);

		expect(artifact.fileName).toBe("ratio-2026-04-01-2026-04-07.csv");
		expect(artifact.body).toContain("snapshot-1");
	});

	it("toCsv handles null values gracefully in CSV output", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "check-in-1", centerId: "center-1", note: null }])
					.chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		// The null value should be serialized as empty string in CSV
		const bodyText = await readBodyAsText(artifact.body);
		expect(bodyText).toContain("check-in-1");
		expect(bodyText).toContain('""'); // null serialized as empty string
	});

	it("builds ratio and subsidy csv exports", async () => {
		const ratioSelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "snapshot-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "violation-1", centerId: "center-1" }]).chain,
			);
		const ratioArtifact = await generateReportArtifact(
			{
				reportType: "ratio",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "classroom-1",
			},
			{ centerId: "center-1" },
			{ select: ratioSelect } as never,
		);

		expect(ratioArtifact.fileName).toBe("ratio-2026-04-01-2026-04-07.csv");
		expect(ratioArtifact.body).toContain("snapshot-1");
		expect(ratioArtifact.body).toContain("violation-1");

		const subsidySelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "case-1", centerId: "center-1" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "claim-1", centerId: "center-1", subsidyCaseId: "case-1" }]),
			);
		const subsidyArtifact = await generateReportArtifact(
			{
				reportType: "subsidy",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select: subsidySelect } as never,
		);

		expect(subsidyArtifact.fileName).toBe("subsidy-2026-04-01-2026-04-07.csv");
		expect(subsidyArtifact.body).toContain("case-1");
		expect(subsidyArtifact.body).toContain("claim-1");
	});

	it("filters subsidy exports by child when requested", async () => {
		const subsidySelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "case-1", centerId: "center-1", childId: "child-1" }]),
			)
			.mockReturnValueOnce(
				createSelectChain([
					{ id: "claim-1", centerId: "center-1", subsidyCaseId: "case-1" },
					{ id: "claim-2", centerId: "center-1", subsidyCaseId: "case-2" },
				]),
			);

		const subsidyArtifact = await generateReportArtifact(
			{
				reportType: "subsidy",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				childId: "child-1",
			},
			{ centerId: "center-1" },
			{ select: subsidySelect } as never,
		);

		expect(subsidyArtifact.body).toContain("case-1");
		expect(subsidyArtifact.body).toContain("claim-1");
		expect(subsidyArtifact.body).not.toContain("case-2");
		expect(subsidyArtifact.body).not.toContain("claim-2");
	});

	it("ignores ended classroom assignments when filtering subsidy exports by classroom", async () => {
		const assignedChildrenWhere = vi.fn().mockImplementation((condition: unknown) => {
			const serialized = util.inspect(condition, { depth: 10, colors: false });
			if (serialized.includes("end_date")) {
				return Promise.resolve([]);
			}

			return Promise.resolve([{ childId: "child-1" }]);
		});
		const subsidySelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: assignedChildrenWhere,
				}),
			})
			.mockReturnValueOnce(
				createSelectChain([{ id: "case-1", centerId: "center-1", childId: "child-1" }]),
			)
			.mockReturnValueOnce(
				createSelectChain([{ id: "claim-1", centerId: "center-1", subsidyCaseId: "case-1" }]),
			);

		const subsidyArtifact = await generateReportArtifact(
			{
				reportType: "subsidy",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "classroom-1",
			},
			{ centerId: "center-1" },
			{ select: subsidySelect } as never,
		);

		expect(subsidyArtifact.body).toBe("");
	});

	it("filters subsidy classroom exports to assignments overlapping the report period", async () => {
		let assignedChildrenCondition: unknown;
		const subsidySelect = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockImplementation((condition: unknown) => {
						assignedChildrenCondition = condition;
						return Promise.resolve([]);
					}),
				}),
			});

		await generateReportArtifact(
			{
				reportType: "subsidy",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "classroom-1",
			},
			{ centerId: "center-1" },
			{ select: subsidySelect } as never,
		);

		expect(sqlConditionColumnNames(assignedChildrenCondition)).toContain("effective_date");
		expect(sqlConditionColumnNames(assignedChildrenCondition)).toContain("end_date");
	});

	it("filters subsidy exports by classroom when children are found", async () => {
		const subsidySelect = vi
			.fn()
			// First call: center timezone query
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			// Second call: classroomAssignments query returns children in classroom
			.mockReturnValueOnce(createSelectChain([{ childId: "child-1" }, { childId: "child-2" }]))
			// Third call: subsidyCases filtered to those children
			.mockReturnValueOnce(
				createSelectChain([
					{ id: "case-1", centerId: "center-1", childId: "child-1" },
					{ id: "case-2", centerId: "center-1", childId: "child-2" },
				]),
			)
			// Fourth call: subsidyClaims
			.mockReturnValueOnce(
				createSelectChain([
					{ id: "claim-1", centerId: "center-1", subsidyCaseId: "case-1" },
					{ id: "claim-2", centerId: "center-1", subsidyCaseId: "case-2" },
				]),
			);

		const subsidyArtifact = await generateReportArtifact(
			{
				reportType: "subsidy",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				classroomId: "classroom-1",
			},
			{ centerId: "center-1" },
			{ select: subsidySelect } as never,
		);

		expect(subsidyArtifact.body).toContain("case-1");
		expect(subsidyArtifact.body).toContain("case-2");
		expect(subsidyArtifact.body).toContain("claim-1");
		expect(subsidyArtifact.body).toContain("claim-2");
	});

	it("builds a real licensing zip bundle with expected files", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "Pebble Desk" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "classroom-1", centerId: "center-1" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "child-1", centerId: "center-1", enrollmentStatus: "active" }]),
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "snapshot-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "violation-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "audit-1", centerId: "center-1" }]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("licensing-2026-04-01-2026-04-07.zip");
		expect(artifact.contentType).toBe("application/zip");
		expect(artifact.body).toBeInstanceOf(Uint8Array);
		expect(Array.from((artifact.body as Uint8Array).slice(0, 4))).toEqual([80, 75, 3, 4]);
		expect(listZipEntries(artifact.body as Uint8Array)).toEqual([
			"manifest.csv",
			"center.csv",
			"classrooms.csv",
			"children.csv",
			"ratio_snapshots.csv",
			"ratio_violations.csv",
			"audit_log.csv",
		]);
	});

	it("excludes archived classrooms from generic licensing reports", async () => {
		const activeClassrooms = [
			{
				id: "classroom-active",
				centerId: "center-1",
				name: "Infant Room",
				archivedAt: null,
			},
		];
		const allClassrooms = [
			...activeClassrooms,
			{
				id: "classroom-archived",
				centerId: "center-1",
				name: "Archived Room",
				archivedAt: "2026-03-15T00:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "Pebble Desk" }]))
			.mockReturnValueOnce(createActiveClassroomsSelectChain(activeClassrooms, allClassrooms))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const classroomsCsv = extractZipEntry(artifact.body as Uint8Array, "classrooms.csv");
		expect(classroomsCsv).toContain("Infant Room");
		expect(classroomsCsv).not.toContain("Archived Room");
	});

	it("builds a TX licensing report with HHSC 2936-equivalent columns", async () => {
		const center = {
			id: "center-1",
			name: "Sunny Days Center",
			licenseNumber: "TX-12345",
		};
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const childData = [
			{ id: "child-1", classroomId: "classroom-1" },
			{ id: "child-2", classroomId: "classroom-1" },
		];
		const snapshotData = [
			{
				classroomId: "classroom-1",
				staffCount: 2,
				childrenCount: 6,
				snapshotAt: "2026-04-01T10:00:00.000Z",
			},
		];
		const violationData = [
			{
				classroomId: "classroom-1",
				description: "Ratio exceeded during pickup",
				detectedAt: "2026-04-01T17:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain(childData))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain(violationData))
			.mockReturnValueOnce(
				createJoinSelectChain([{ directorName: "Jane Smith", directorEmail: "jane@example.com" }]),
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("licensing-tx-2026-04-01-2026-04-07.zip");
		expect(artifact.contentType).toBe("application/zip");
		const entries = listZipEntries(artifact.body as Uint8Array);
		expect(entries).toContain("facility_inspection_report.csv");

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		// TX HHSC Form 2936 equivalent columns
		expect(csvContent).toContain("center_name");
		expect(csvContent).toContain("license_number");
		expect(csvContent).toContain("director_name");
		expect(csvContent).toContain("director_phone");
		expect(csvContent).toContain("director_email");
		expect(csvContent).toContain("classroom_name");
		expect(csvContent).toContain("age_group");
		expect(csvContent).toContain("licensed_capacity");
		expect(csvContent).toContain("ratio_required");
		expect(csvContent).toContain("enrolled_count");
		expect(csvContent).toContain("staff_present");
		expect(csvContent).toContain("violation_flag");
		expect(csvContent).toContain("violation_description");
		// Data values
		expect(csvContent).toContain("Sunny Days Center");
		expect(csvContent).toContain("TX-12345");
		expect(csvContent).toContain("Infant Room");
		expect(csvContent).toContain("1:4"); // TX infant ratio from TX Admin Code 746.3303
		// Director info columns populated from membership join
		expect(csvContent).toContain("Jane Smith");
		expect(csvContent).toContain("jane@example.com");
	});

	it("excludes archived classrooms from state licensing reports", async () => {
		const center = {
			id: "center-1",
			name: "Sunny Days Center",
			licenseNumber: "TX-12345",
		};
		const activeClassrooms = [
			{
				id: "classroom-active",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
				archivedAt: null,
			},
		];
		const allClassrooms = [
			...activeClassrooms,
			{
				id: "classroom-archived",
				name: "Archived Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
				archivedAt: "2026-03-15T00:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createActiveClassroomsSelectChain(activeClassrooms, allClassrooms))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		expect(csvContent).toContain("Infant Room");
		expect(csvContent).not.toContain("Archived Room");
	});

	it("uses only accepted active directors in state licensing reports", async () => {
		const center = {
			id: "center-1",
			name: "Sunny Days Center",
			licenseNumber: "TX-12345",
		};
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createActiveDirectorJoinSelectChain(
					[{ directorName: "Active Director", directorEmail: "active@example.com" }],
					[{ directorName: "Former Director", directorEmail: "former@example.com" }],
				),
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		expect(csvContent).toContain("Active Director");
		expect(csvContent).toContain("active@example.com");
		expect(csvContent).not.toContain("Former Director");
		expect(csvContent).not.toContain("former@example.com");
	});

	it("builds a CA licensing report with LIC 9040-equivalent columns", async () => {
		const center = {
			id: "center-1",
			name: "Golden State Kids",
			licenseNumber: "CA-98765",
		};
		const classroomData = [
			{
				id: "classroom-1",
				name: "Preschool Room",
				ageGroup: "preschool",
				maxCapacity: 24,
				minRatioStaff: 1,
				minRatioChildren: 12,
			},
		];
		const childData = [{ id: "child-1", classroomId: "classroom-1" }];
		const snapshotData = [
			{
				classroomId: "classroom-1",
				staffCount: 2,
				childrenCount: 20,
				snapshotAt: "2026-04-01T10:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain(childData))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("licensing-ca-2026-04-01-2026-04-07.zip");
		const entries = listZipEntries(artifact.body as Uint8Array);
		expect(entries).toContain("facility_program_statement.csv");

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		// CA LIC 9040 equivalent columns
		expect(csvContent).toContain("center_name");
		expect(csvContent).toContain("facility_number");
		expect(csvContent).toContain("classroom_name");
		expect(csvContent).toContain("age_group");
		expect(csvContent).toContain("capacity");
		expect(csvContent).toContain("actual_enrollment");
		expect(csvContent).toContain("required_ratio");
		expect(csvContent).toContain("actual_ratio");
		expect(csvContent).toContain("compliance_status");
		// Data values
		expect(csvContent).toContain("Golden State Kids");
		expect(csvContent).toContain("CA-98765");
		expect(csvContent).toContain("1:12"); // CA preschool ratio from CA Title 22 §101216.3
	});

	it("builds a FL licensing report with DCF CF-FSP 5337-equivalent columns", async () => {
		const center = {
			id: "center-1",
			name: "Sunshine Learning",
			licenseNumber: "FL-55555",
		};
		const classroomData = [
			{
				id: "classroom-1",
				name: "Toddler Room",
				ageGroup: "toddler",
				maxCapacity: 22,
				minRatioStaff: 1,
				minRatioChildren: 11,
			},
		];
		const childData = [
			{ id: "child-1", classroomId: "classroom-1" },
			{ id: "child-2", classroomId: "classroom-1" },
		];
		const snapshotData = [
			{
				classroomId: "classroom-1",
				staffCount: 1,
				childrenCount: 9,
				snapshotAt: "2026-04-01T10:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain(childData))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("licensing-fl-2026-04-01-2026-04-07.zip");
		const entries = listZipEntries(artifact.body as Uint8Array);
		expect(entries).toContain("staff_child_ratio_record.csv");

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		// FL DCF CF-FSP 5337 equivalent columns
		expect(csvContent).toContain("center_name");
		expect(csvContent).toContain("license_number");
		expect(csvContent).toContain("date_range");
		expect(csvContent).toContain("room_name");
		expect(csvContent).toContain("age_group");
		expect(csvContent).toContain("maximum_children_allowed");
		expect(csvContent).toContain("actual_count");
		expect(csvContent).toContain("staff_count");
		expect(csvContent).toContain("ratio_in_compliance");
		// Data values
		expect(csvContent).toContain("Sunshine Learning");
		expect(csvContent).toContain("FL-55555");
		expect(csvContent).toContain("11"); // FL toddler max per FL 65C-22.001(5)(a)3
	});

	it("handles CA licensing with no snapshots (N/A ratio and compliance)", async () => {
		const center = { id: "center-1", name: "Bay Area Kids", licenseNumber: "CA-11111" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 6,
				minRatioStaff: 1,
				minRatioChildren: 3,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		expect(csvContent).toContain("N/A");
	});

	it("handles CA licensing where staffCount is 0 and children present (Non-Compliant)", async () => {
		const center = { id: "center-1", name: "Bay Area Kids", licenseNumber: "CA-11111" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 6,
				minRatioStaff: 1,
				minRatioChildren: 3,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([{ id: "child-1", classroomId: "classroom-1" }]))
			.mockReturnValueOnce(
				createOrderBySelectChain([{ classroomId: "classroom-1", staffCount: 0, childrenCount: 3 }]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		// compliance_status must be Non-Compliant when staff=0 and children present
		expect(csvContent).toContain("Non-Compliant");
		// actual_ratio remains N/A (can't compute ratio without staff) — that's correct
		expect(csvContent).toMatch(/actual_ratio/);
	});

	it("handles FL licensing with no snapshots (N/A compliance)", async () => {
		const center = { id: "center-1", name: "Sunshine Prep", licenseNumber: "FL-11111" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		expect(csvContent).toContain("N/A");
	});

	it("handles FL licensing where staffCount is 0 and children present (N compliance)", async () => {
		const center = { id: "center-1", name: "Sunshine Prep", licenseNumber: "FL-11111" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([{ id: "child-1", classroomId: "classroom-1" }]))
			.mockReturnValueOnce(
				createOrderBySelectChain([{ classroomId: "classroom-1", staffCount: 0, childrenCount: 3 }]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		// staffCount=0 but childCount=3 → non-compliant, not N/A
		expect(csvContent).toContain('"N"');
		expect(csvContent).not.toContain("N/A");
	});

	it("handles TX licensing with no violations (violation_flag N)", async () => {
		const center = { id: "center-1", name: "Lone Star Kids", licenseNumber: "TX-99999" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "School Age Room",
				ageGroup: "school_age",
				maxCapacity: 52,
				minRatioStaff: 1,
				minRatioChildren: 26,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		expect(csvContent).toContain('"N"');
		expect(csvContent).toContain("1:26"); // TX school_age ratio
	});

	it("handles licensing with missing center gracefully", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		expect(artifact.fileName).toBe("licensing-tx-2026-04-01-2026-04-07.zip");
	});

	it("handles TX licensing with null licenseNumber and null violation description", async () => {
		const center = { id: "center-1", name: "No License Center", licenseNumber: null };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Toddler Room",
				ageGroup: "toddler",
				maxCapacity: 18,
				minRatioStaff: 1,
				minRatioChildren: 9,
			},
		];
		const violationData = [
			{
				classroomId: "classroom-1",
				description: null,
				detectedAt: "2026-04-01T17:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([{ id: "child-1", classroomId: "classroom-1" }]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain(violationData))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		// licenseNumber null case and violation description null case both handled
		expect(csvContent).toContain("No License Center");
		expect(csvContent).toContain('"Y"'); // violation flag Y
	});

	it("handles CA licensing with null licenseNumber (facility_number empty)", async () => {
		const center = { id: "center-1", name: "No Number Center", licenseNumber: null };
		const classroomData = [
			{
				id: "classroom-1",
				name: "School Age Room",
				ageGroup: "school_age",
				maxCapacity: 28,
				minRatioStaff: 1,
				minRatioChildren: 14,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createOrderBySelectChain([
					{ classroomId: "classroom-1", staffCount: 2, childrenCount: 28 },
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		// Non-compliant path: 28 children / 2 staff = 14 per staff, CA school_age max is 14, so exactly compliant
		expect(csvContent).toContain("Compliant");
		expect(csvContent).toContain("No Number Center");
	});

	it("handles CA licensing Non-Compliant when ratio exceeds limit", async () => {
		const center = { id: "center-1", name: "Over Ratio Center", licenseNumber: "CA-99999" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 6,
				minRatioStaff: 1,
				minRatioChildren: 3,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			// Snapshot: 1 staff, 5 children (CA infant limit is 1:3 — exceeds)
			.mockReturnValueOnce(
				createOrderBySelectChain([{ classroomId: "classroom-1", staffCount: 1, childrenCount: 5 }]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		expect(csvContent).toContain("Non-Compliant");
	});

	it("handles FL licensing with null licenseNumber", async () => {
		const center = { id: "center-1", name: "FL No License", licenseNumber: null };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Pre-K Room",
				ageGroup: "pre_k",
				maxCapacity: 40,
				minRatioStaff: 1,
				minRatioChildren: 20,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createOrderBySelectChain([
					{ classroomId: "classroom-1", staffCount: 2, childrenCount: 30 },
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		// 30 children / 2 staff = 15 per staff, FL pre_k limit is 20 — compliant
		expect(csvContent).toContain('"Y"');
		expect(csvContent).toContain("FL No License");
	});

	it("handles FL licensing Non-Compliant when ratio exceeds limit", async () => {
		const center = { id: "center-1", name: "FL Over Ratio", licenseNumber: "FL-77777" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Young Toddler Room",
				ageGroup: "young_toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 6,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			// 1 staff, 10 children (FL young_toddler max is 6 — exceeds)
			.mockReturnValueOnce(
				createOrderBySelectChain([
					{ classroomId: "classroom-1", staffCount: 1, childrenCount: 10 },
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		expect(csvContent).toContain('"N"');
	});

	it("handles TX licensing with unknown ageGroup (ratio_required is N/A)", async () => {
		const center = { id: "center-1", name: "Unknown Age Center", licenseNumber: "TX-00000" };
		// Use an ageGroup string not in TX state table to trigger the N/A fallback
		const classroomData = [
			{
				id: "classroom-1",
				name: "Special Room",
				ageGroup: "unknown_group",
				maxCapacity: 10,
				minRatioStaff: 1,
				minRatioChildren: 5,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		// TX table won't find this ageGroup so ratio_required = "N/A"
		expect(csvContent).toContain('"N/A"');
	});

	it("handles CA licensing with unknown ageGroup (required_ratio is N/A, compliance N/A with snapshot)", async () => {
		const center = { id: "center-1", name: "Unknown CA Center", licenseNumber: "CA-00000" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Special Room",
				ageGroup: "unknown_group",
				maxCapacity: 10,
				minRatioStaff: 1,
				minRatioChildren: 5,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			// Snapshot with staffCount > 0 but no ratioRule — triggers the ?? Infinity path
			.mockReturnValueOnce(
				createOrderBySelectChain([
					{ classroomId: "classroom-1", staffCount: 1, childrenCount: 100 },
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		// CA table won't find this ageGroup so required_ratio = "N/A"
		// And with no ratioRule, maxAllowed = Infinity so 100/1=100 <= Infinity => Compliant
		expect(csvContent).toContain('"N/A"');
		expect(csvContent).toContain("Compliant");
	});

	it("handles FL licensing with unknown ageGroup (falls back to minRatioChildren)", async () => {
		const center = { id: "center-1", name: "Unknown FL Center", licenseNumber: "FL-00000" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Special Room",
				ageGroup: "unknown_group",
				maxCapacity: 10,
				minRatioStaff: 1,
				minRatioChildren: 5,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createOrderBySelectChain([{ classroomId: "classroom-1", staffCount: 1, childrenCount: 3 }]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		// FL table won't find unknown_group, falls back to minRatioChildren=5
		// 3 children / 1 staff = 3 <= 5 => Y
		expect(csvContent).toContain('"Y"');
		expect(csvContent).toContain("5"); // maxChildrenAllowed falls back to minRatioChildren
	});

	it("handles multiple snapshots for same classroom in TX report (latest wins)", async () => {
		const center = { id: "center-1", name: "Multi Snapshot Center", licenseNumber: "TX-88888" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Toddler Room",
				ageGroup: "toddler",
				maxCapacity: 18,
				minRatioStaff: 1,
				minRatioChildren: 9,
			},
		];
		// Two snapshots for same classroom — second should be ignored (first wins in map)
		const snapshotData = [
			{
				classroomId: "classroom-1",
				staffCount: 2,
				childrenCount: 8,
				snapshotAt: "2026-04-01T10:00:00.000Z",
			},
			{
				classroomId: "classroom-1",
				staffCount: 3,
				childrenCount: 10,
				snapshotAt: "2026-04-01T14:00:00.000Z",
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		// First snapshot (staffCount: 2) is used since the map deduplicates by classroom
		expect(csvContent).toContain('"2"');
	});

	it("handles multiple snapshots for same classroom in CA report (first wins)", async () => {
		const center = { id: "center-1", name: "Multi Snapshot CA", licenseNumber: "CA-88888" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Young Toddler Room",
				ageGroup: "young_toddler",
				maxCapacity: 12,
				minRatioStaff: 1,
				minRatioChildren: 6,
			},
		];
		const snapshotData = [
			{ classroomId: "classroom-1", staffCount: 2, childrenCount: 10 },
			{ classroomId: "classroom-1", staffCount: 3, childrenCount: 15 },
		];
		// Children with null classroomId (covers the if(child.classroomId) false branch)
		const childData = [
			{ id: "child-1", classroomId: null },
			{ id: "child-2", classroomId: "classroom-1" },
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain(childData))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "CA",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_program_statement.csv",
		);
		expect(csvContent).toContain("Multi Snapshot CA");
	});

	it("handles multiple snapshots for same classroom in FL report (first wins)", async () => {
		const center = { id: "center-1", name: "Multi Snapshot FL", licenseNumber: "FL-88888" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "School Age Room",
				ageGroup: "school_age",
				maxCapacity: 50,
				minRatioStaff: 1,
				minRatioChildren: 25,
			},
		];
		const snapshotData = [
			{ classroomId: "classroom-1", staffCount: 2, childrenCount: 20 },
			{ classroomId: "classroom-1", staffCount: 3, childrenCount: 30 },
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain(snapshotData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "FL",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(artifact.body as Uint8Array, "staff_child_ratio_record.csv");
		expect(csvContent).toContain("Multi Snapshot FL");
	});

	it("handles children with null classroomId in TX report (not counted in any classroom)", async () => {
		const center = { id: "center-1", name: "Multi Room Center", licenseNumber: "TX-11111" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Preschool Room",
				ageGroup: "preschool",
				maxCapacity: 30,
				minRatioStaff: 1,
				minRatioChildren: 15,
			},
		];
		// Child with no classroomId assigned
		const childData = [
			{ id: "child-1", classroomId: null },
			{ id: "child-2", classroomId: "classroom-1" },
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain(childData))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		expect(csvContent).toContain("Multi Room Center");
		// Only child-2 is counted in classroom-1
		expect(csvContent).toContain("1:15"); // TX preschool ratio
	});

	it("falls back to generic columns when no stateVariant is provided", async () => {
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "Pebble Desk" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "classroom-1", centerId: "center-1" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "child-1", centerId: "center-1", enrollmentStatus: "active" }]),
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "snapshot-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "violation-1", centerId: "center-1" }]).chain,
			)
			.mockReturnValueOnce(
				createOrderByLimitSelectChain([{ id: "audit-1", centerId: "center-1" }]).chain,
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		// Generic licensing report produces the standard zip file set
		expect(artifact.fileName).toBe("licensing-2026-04-01-2026-04-07.zip");
		expect(listZipEntries(artifact.body as Uint8Array)).toEqual([
			"manifest.csv",
			"center.csv",
			"classrooms.csv",
			"children.csv",
			"ratio_snapshots.csv",
			"ratio_violations.csv",
			"audit_log.csv",
		]);
	});

	it("sanitizes formula-injection strings in CSV output (Bug C)", async () => {
		// Center name starting with = would be executed as formula in Excel/Sheets
		const center = { id: "center-1", name: "=SUM(A1)", licenseNumber: "+malicious" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "-DROP TABLE",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createJoinSelectChain([{ directorName: "@admin", directorEmail: "test@example.com" }]),
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		// Formula-injection strings must be prefixed with a single quote
		expect(csvContent).toContain("'=SUM(A1)");
		expect(csvContent).toContain("'+malicious");
		expect(csvContent).toContain("'-DROP TABLE");
		expect(csvContent).toContain("'@admin");
		// Must NOT appear unquoted
		expect(csvContent).not.toMatch(/"=SUM\(A1\)"/);
		expect(csvContent).not.toMatch(/"\+malicious"/);
	});

	it("caps the audit log query and reports no truncation when under the limit (DoS guard)", async () => {
		const auditLogChain = createOrderByLimitSelectChain([{ id: "audit-1", centerId: "center-1" }]);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "Pebble Desk" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "classroom-1", centerId: "center-1" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "child-1", centerId: "center-1", enrollmentStatus: "active" }]),
			)
			.mockReturnValueOnce(createSelectChain([{ id: "snapshot-1", centerId: "center-1" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "violation-1", centerId: "center-1" }]))
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		// Fetch one extra row so a full page can be distinguished from a truncated one.
		expect(auditLogChain.limitMock).toHaveBeenCalledWith(5001);
		expect(auditLogChain.orderByMock).toHaveBeenCalled();

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("audit_log_truncated,false");
		expect(manifest).toContain("audit_log_row_limit,5000");
	});

	it("surfaces truncation in the manifest and caps rows when the audit log exceeds the limit", async () => {
		// 5001 rows returned (limit + 1) signals more entries exist than the cap.
		const overflowRows = Array.from({ length: 5001 }, (_, index) => ({
			id: `audit-${index}`,
			centerId: "center-1",
		}));
		const auditLogChain = createOrderByLimitSelectChain(overflowRows);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "Pebble Desk" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "classroom-1", centerId: "center-1" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "child-1", centerId: "center-1", enrollmentStatus: "active" }]),
			)
			.mockReturnValueOnce(createSelectChain([{ id: "snapshot-1", centerId: "center-1" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "violation-1", centerId: "center-1" }]))
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("audit_log_truncated,true");

		// The exported CSV is capped at the limit (1 header + 5000 data rows).
		const auditCsv = extractZipEntry(artifact.body as Uint8Array, "audit_log.csv");
		expect(auditCsv.trim().split("\n")).toHaveLength(5001);
	});

	// ── Bug 2: unbounded event-volume queries ──────────────────────────────────────

	it("throws when attendance checkIns exceeds CHECK_IN_REPORT_LIMIT", async () => {
		// LIMIT+1 rows signals more data exists than can be exported safely
		const overRows = Array.from({ length: 5001 }, (_, i) => ({
			id: `check-in-${i}`,
			centerId: "center-1",
		}));
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createOrderByLimitSelectChain(overRows).chain);

		await expect(
			generateReportArtifact(
				{ reportType: "attendance", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
				{ centerId: "center-1" },
				{ select } as never,
			),
		).rejects.toThrow("Report period too large to export; narrow the date range.");
	});

	it("succeeds when attendance checkIns is exactly at CHECK_IN_REPORT_LIMIT", async () => {
		const exactRows = Array.from({ length: 5000 }, (_, i) => ({
			id: `check-in-${i}`,
			centerId: "center-1",
		}));
		const checkInsChain = createOrderByLimitSelectChain(exactRows);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(checkInsChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "attendance", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);
		expect(artifact.fileName).toBe("attendance-2026-04-01-2026-04-07.csv");
		// Regression guard: production query must be bounded
		expect(checkInsChain.orderByMock).toHaveBeenCalled();
		expect(checkInsChain.limitMock).toHaveBeenCalledWith(5001);
	});

	it("throws when ratio ratioSnapshots exceeds RATIO_SNAPSHOT_REPORT_LIMIT", async () => {
		const overSnapshots = Array.from({ length: 5001 }, (_, i) => ({
			id: `snap-${i}`,
			centerId: "center-1",
		}));
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			// ratioSnapshots query returns LIMIT+1
			.mockReturnValueOnce(createOrderByLimitSelectChain(overSnapshots).chain)
			// ratioViolations — won't be reached but mock defensively
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain);

		await expect(
			generateReportArtifact(
				{ reportType: "ratio", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
				{ centerId: "center-1" },
				{ select } as never,
			),
		).rejects.toThrow("Report period too large to export; narrow the date range.");
	});

	it("throws when ratio ratioViolations exceeds RATIO_VIOLATION_REPORT_LIMIT", async () => {
		const overViolations = Array.from({ length: 5001 }, (_, i) => ({
			id: `viol-${i}`,
			centerId: "center-1",
		}));
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createOrderByLimitSelectChain([{ id: "snap-1" }]).chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain(overViolations).chain);

		await expect(
			generateReportArtifact(
				{ reportType: "ratio", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
				{ centerId: "center-1" },
				{ select } as never,
			),
		).rejects.toThrow("Report period too large to export; narrow the date range.");
	});

	it("succeeds for ratio report when snapshots and violations are exactly at their limits", async () => {
		const exactSnapshots = Array.from({ length: 5000 }, (_, i) => ({
			id: `snap-${i}`,
			centerId: "center-1",
		}));
		const exactViolations = Array.from({ length: 5000 }, (_, i) => ({
			id: `viol-${i}`,
			centerId: "center-1",
		}));
		const snapshotsChain = createOrderByLimitSelectChain(exactSnapshots);
		const violationsChain = createOrderByLimitSelectChain(exactViolations);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(snapshotsChain.chain)
			.mockReturnValueOnce(violationsChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "ratio", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);
		expect(artifact.fileName).toBe("ratio-2026-04-01-2026-04-07.csv");
		// Regression guard: both production queries must be bounded
		expect(snapshotsChain.orderByMock).toHaveBeenCalled();
		expect(snapshotsChain.limitMock).toHaveBeenCalledWith(5001);
		expect(violationsChain.orderByMock).toHaveBeenCalled();
		expect(violationsChain.limitMock).toHaveBeenCalledWith(5001);
	});

	it("surfaces ratio_snapshots_truncated=true in generic licensing manifest when over limit", async () => {
		const overSnapshots = Array.from({ length: 5001 }, (_, i) => ({
			id: `snap-${i}`,
			centerId: "center-1",
		}));
		const auditLogChain = createOrderByLimitSelectChain([]);
		const snapshotsChain = createOrderByLimitSelectChain(overSnapshots);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "PD" }]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(snapshotsChain.chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "licensing", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_snapshots_truncated,true");
		expect(manifest).toContain("ratio_snapshots_row_limit,5000");

		// The CSV itself should be capped at 5000 rows (header + 5000 data rows = 5001 lines)
		const snapshotsCsv = extractZipEntry(artifact.body as Uint8Array, "ratio_snapshots.csv");
		expect(snapshotsCsv.trim().split("\n")).toHaveLength(5001);
	});

	it("surfaces ratio_snapshots_truncated=false in generic licensing manifest when under limit", async () => {
		const auditLogChain = createOrderByLimitSelectChain([]);
		const snapshotsChain = createOrderByLimitSelectChain([{ id: "snap-1" }]);
		const violationsChain = createOrderByLimitSelectChain([]);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "PD" }]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(snapshotsChain.chain)
			.mockReturnValueOnce(violationsChain.chain)
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "licensing", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_snapshots_truncated,false");
		// Regression guard: snapshots and violations queries must be bounded
		expect(snapshotsChain.orderByMock).toHaveBeenCalled();
		expect(snapshotsChain.limitMock).toHaveBeenCalledWith(5001);
		expect(violationsChain.orderByMock).toHaveBeenCalled();
		expect(violationsChain.limitMock).toHaveBeenCalledWith(5001);
	});

	it("surfaces ratio_violations_truncated=true in generic licensing manifest when over limit", async () => {
		const overViolations = Array.from({ length: 5001 }, (_, i) => ({
			id: `viol-${i}`,
			centerId: "center-1",
		}));
		const auditLogChain = createOrderByLimitSelectChain([]);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "PD" }]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain(overViolations).chain)
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "licensing", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_violations_truncated,true");
		expect(manifest).toContain("ratio_violations_row_limit,5000");

		const violationsCsv = extractZipEntry(artifact.body as Uint8Array, "ratio_violations.csv");
		expect(violationsCsv.trim().split("\n")).toHaveLength(5001);
	});

	it("surfaces ratio_violations_truncated=false in generic licensing manifest when under limit", async () => {
		const auditLogChain = createOrderByLimitSelectChain([]);
		const snapshotsChain = createOrderByLimitSelectChain([]);
		const violationsChain = createOrderByLimitSelectChain([{ id: "viol-1" }]);
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([{ id: "center-1", name: "PD" }]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(snapshotsChain.chain)
			.mockReturnValueOnce(violationsChain.chain)
			.mockReturnValueOnce(auditLogChain.chain);

		const artifact = await generateReportArtifact(
			{ reportType: "licensing", periodStart: "2026-04-01", periodEnd: "2026-04-07" },
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_violations_truncated,false");
		// Regression guard: snapshots and violations queries must be bounded
		expect(snapshotsChain.orderByMock).toHaveBeenCalled();
		expect(snapshotsChain.limitMock).toHaveBeenCalledWith(5001);
		expect(violationsChain.orderByMock).toHaveBeenCalled();
		expect(violationsChain.limitMock).toHaveBeenCalledWith(5001);
	});

	it("surfaces ratio_snapshots_truncated in state-variant (TX) licensing manifest when over limit", async () => {
		const overSnapshots = Array.from({ length: 5001 }, (_, i) => ({
			classroomId: "classroom-1",
			staffCount: 1,
			childrenCount: 1,
			snapshotAt: `2026-04-0${(i % 7) + 1}T10:00:00.000Z`,
		}));
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "center-1", name: "TX Cent", licenseNumber: "TX-1" }]),
			)
			.mockReturnValueOnce(
				createSelectChain([
					{
						id: "classroom-1",
						name: "Infant Room",
						ageGroup: "infant",
						maxCapacity: 8,
						minRatioStaff: 1,
						minRatioChildren: 4,
					},
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			// ratioSnapshots LIMIT+1
			.mockReturnValueOnce(createOrderByLimitSelectChain(overSnapshots).chain)
			// ratioViolations
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_snapshots_truncated,true");
		expect(manifest).toContain("ratio_snapshots_row_limit,5000");
	});

	it("surfaces ratio_violations_truncated in state-variant (TX) licensing manifest when over limit", async () => {
		const overViolations = Array.from({ length: 5001 }, (_, i) => ({
			classroomId: "classroom-1",
			description: `viol-${i}`,
			detectedAt: "2026-04-01T10:00:00.000Z",
		}));
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(
				createSelectChain([{ id: "center-1", name: "TX Cent", licenseNumber: "TX-1" }]),
			)
			.mockReturnValueOnce(
				createSelectChain([
					{
						id: "classroom-1",
						name: "Infant Room",
						ageGroup: "infant",
						maxCapacity: 8,
						minRatioStaff: 1,
						minRatioChildren: 4,
					},
				]),
			)
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderByLimitSelectChain([]).chain)
			.mockReturnValueOnce(createOrderByLimitSelectChain(overViolations).chain)
			.mockReturnValueOnce(createJoinSelectChain([]));

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const manifest = extractZipEntry(artifact.body as Uint8Array, "manifest.csv");
		expect(manifest).toContain("ratio_violations_truncated,true");
		expect(manifest).toContain("ratio_violations_row_limit,5000");
	});

	it("sanitizes @-prefix formula injection in CSV director name", async () => {
		const center = { id: "center-1", name: "Normal Center", licenseNumber: "TX-12345" };
		const classroomData = [
			{
				id: "classroom-1",
				name: "Infant Room",
				ageGroup: "infant",
				maxCapacity: 8,
				minRatioStaff: 1,
				minRatioChildren: 4,
			},
		];
		const select = vi
			.fn()
			.mockReturnValueOnce(createSelectChain([{ timezone: "UTC" }]))
			.mockReturnValueOnce(createSelectChain([center]))
			.mockReturnValueOnce(createSelectChain(classroomData))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(createOrderBySelectChain([]))
			.mockReturnValueOnce(createSelectChain([]))
			.mockReturnValueOnce(
				createJoinSelectChain([{ directorName: "@dangerous", directorEmail: "safe@example.com" }]),
			);

		const artifact = await generateReportArtifact(
			{
				reportType: "licensing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
				stateVariant: "TX",
			},
			{ centerId: "center-1" },
			{ select } as never,
		);

		const csvContent = extractZipEntry(
			artifact.body as Uint8Array,
			"facility_inspection_report.csv",
		);
		expect(csvContent).toContain("'@dangerous");
	});
});
