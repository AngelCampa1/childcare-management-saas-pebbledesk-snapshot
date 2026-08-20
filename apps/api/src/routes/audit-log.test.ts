import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp } from "../test/setup.js";

vi.mock("../middleware/auth.js", async () => {
	const { createMiddleware } = await import("hono/factory");
	const { HTTPException } = await import("hono/http-exception");
	return {
		requireAuth: createMiddleware(async (_c, next) => {
			await next();
		}),
		// Intentionally permissive: this mock lets every role through so the
		// test suite can verify that the route's explicit requireRole guard
		// (belt-and-suspenders) blocks staff even if the permission table is
		// ever widened by mistake. The real permission table is enforced by
		// shared/constants tests.
		requirePermission: (_permission: string) =>
			createMiddleware(async (_c, next) => {
				await next();
			}),
		requireRole: (...roles: string[]) =>
			createMiddleware(async (c, next) => {
				const role = c.get("role");
				if (!role || !roles.includes(role)) {
					throw new HTTPException(403, { message: "Insufficient permissions" });
				}
				await next();
			}),
		requireCenter: createMiddleware(async (_c, next) => {
			await next();
		}),
	};
});

const { auditLogRoutes } = await import("./audit-log.js");

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
	if (typeof value === "string") return [value];
	if (!value || typeof value !== "object") return [];
	if (seen.has(value)) return [];
	seen.add(value);

	if (Array.isArray(value)) {
		return value.flatMap((item) => collectStringValues(item, seen));
	}

	return Object.values(value).flatMap((item) => collectStringValues(item, seen));
}

/**
 * Recursively walks a drizzle SQL condition tree and collects every Date value
 * found in queryChunks. This lets tests assert which Date boundaries were
 * passed to gte/lt without spying on ESM module exports (which ESM forbids).
 * Uses a visited set to guard against circular references in drizzle objects.
 */
function extractDatesFromSqlCondition(node: unknown, visited = new Set<object>()): Date[] {
	if (node instanceof Date) return [node];
	if (node == null || typeof node !== "object") return [];
	if (visited.has(node as object)) return [];
	visited.add(node as object);
	const obj = node as Record<string, unknown>;
	const results: Date[] = [];
	if (Array.isArray(obj.queryChunks)) {
		for (const chunk of obj.queryChunks as unknown[]) {
			results.push(...extractDatesFromSqlCondition(chunk, visited));
		}
	}
	for (const key of Object.keys(obj)) {
		if (key !== "queryChunks") {
			results.push(...extractDatesFromSqlCondition(obj[key], visited));
		}
	}
	return results;
}

function mountAuditLog(app: Hono<AppEnv>) {
	app.route("/api/audit-log", auditLogRoutes);
}

/**
 * Builds a mock DB with two select calls:
 * 1. Center timezone lookup → returns [{ timezone }]
 * 2. Audit log entries query → uses the provided chain
 */
function makeAuditLogDb(timezone: string, entryChain: () => unknown) {
	let selectCallCount = 0;
	return createMockDb({
		select: vi.fn().mockImplementation(() => {
			selectCallCount++;
			if (selectCallCount === 1) {
				// Center timezone lookup
				return {
					from: vi.fn().mockReturnValue({
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue([{ timezone }]),
						}),
					}),
				};
			}
			// Audit log entries query
			return entryChain();
		}),
	});
}

/**
 * Builds the audit log entry query chain ending at offset resolving to `rows`.
 */
function makeEntryChain(rows: unknown[]) {
	return () => ({
		from: vi.fn().mockReturnValue({
			leftJoin: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					orderBy: vi.fn().mockReturnValue({
						limit: vi.fn().mockReturnValue({
							offset: vi.fn().mockResolvedValue(rows),
						}),
					}),
				}),
			}),
		}),
	});
}

describe("audit-log routes", () => {
	it("lists audit records for directors", async () => {
		const entry = {
			id: "log-1",
			action: "export",
			entityType: "reports",
			entityId: "report-1",
			changes: { changedFields: ["fileUrl"] },
			createdAt: null,
		};
		const db = makeAuditLogDb("America/Chicago", makeEntryChain([entry]));

		const app = createTestApp(mountAuditLog, db, { role: "director" });
		const res = await app.request("/api/audit-log?action=export");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { entries: (typeof entry)[]; nextCursor: number | null };
		expect(body.entries).toEqual([entry]);
		expect(body.nextCursor).toBeNull();
	});

	it("applies audit log filters to the query", async () => {
		const offset = vi.fn().mockResolvedValue([]);
		const limit = vi.fn().mockReturnValue({ offset });
		const orderBy = vi.fn().mockReturnValue({ limit });
		const where = vi.fn().mockReturnValue({ orderBy });
		const leftJoin = vi.fn().mockReturnValue({ where });
		const db = makeAuditLogDb("America/Chicago", () => ({
			from: vi.fn().mockReturnValue({ leftJoin }),
		}));

		const app = createTestApp(mountAuditLog, db, { role: "owner" });
		const res = await app.request(
			"/api/audit-log?action=export&entityType=reports&entityId=report-1&userId=11111111-1111-1111-1111-111111111111&from=2026-04-01&to=2026-04-07",
		);

		expect(res.status).toBe(200);
		expect(where).toHaveBeenCalled();
		expect(orderBy).toHaveBeenCalled();
	});

	it("supports a partial action filter with an exact entity filter", async () => {
		const entry = {
			id: "log-1",
			action: "create",
			entityType: "classrooms",
			entityId: "classroom-1",
			createdAt: null,
		};
		const db = makeAuditLogDb("America/Chicago", makeEntryChain([entry]));

		const app = createTestApp(mountAuditLog, db, { role: "director" });
		const res = await app.request("/api/audit-log?action=crea&entityType=classrooms");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { entries: (typeof entry)[]; nextCursor: number | null };
		expect(body.entries).toEqual([entry]);
	});

	it("matches entityType exactly so 'check-ins' does not bleed into 'staff-check-ins'", async () => {
		const where = vi.fn().mockReturnValue({
			orderBy: vi.fn().mockReturnValue({
				limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
			}),
		});
		const db = makeAuditLogDb("America/Chicago", () => ({
			from: vi.fn().mockReturnValue({
				leftJoin: vi.fn().mockReturnValue({ where }),
			}),
		}));

		const app = createTestApp(mountAuditLog, db, { role: "director" });
		const res = await app.request("/api/audit-log?entityType=check-ins");

		expect(res.status).toBe(200);
		const values = collectStringValues(where.mock.calls[0]?.[0]);
		// Exact equality binds the literal segment, never a "%...%" substring pattern that
		// would also match "staff-check-ins".
		expect(values).toContain("check-ins");
		expect(values).not.toContain("%check-ins%");
	});

	it("rejects staff audit-log access", async () => {
		const app = createTestApp(mountAuditLog, createMockDb(), { role: "staff" });
		const res = await app.request("/api/audit-log");

		expect(res.status).toBe(403);
	});

	it("belt-and-suspenders: blocks staff even if requirePermission were permissive (P0-006)", async () => {
		// requirePermission is mocked permissively above; only requireRole stops staff.
		// This asserts the route declares an explicit requireRole("owner","director") guard
		// so a future widening of the permission table cannot leak audit logs to staff.
		const app = createTestApp(mountAuditLog, createMockDb(), { role: "staff" });
		const res = await app.request("/api/audit-log");

		expect(res.status).toBe(403);
	});

	it("returns only the first page when limit is applied", async () => {
		const entries = Array.from({ length: 3 }, (_, i) => ({
			id: `log-${i + 1}`,
			action: "export",
			entityType: "reports",
			entityId: `report-${i + 1}`,
			changes: null,
			createdAt: new Date(`2026-04-0${3 - i}T00:00:00.000Z`),
		}));
		const db = makeAuditLogDb("America/Chicago", makeEntryChain([entries[0], entries[1]]));

		const app = createTestApp(mountAuditLog, db, { role: "director" });
		const res = await app.request("/api/audit-log?limit=2");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { entries: unknown[]; nextCursor: number | null };
		expect(body.entries).toHaveLength(2);
		expect(body.nextCursor).toBe(2);
	});

	it("returns nextCursor=null when results are fewer than limit", async () => {
		const entries = [
			{
				id: "log-1",
				action: "export",
				entityType: "reports",
				entityId: "report-1",
				changes: null,
				createdAt: new Date("2026-04-01T00:00:00.000Z"),
			},
		];
		const db = makeAuditLogDb("America/Chicago", makeEntryChain(entries));

		const app = createTestApp(mountAuditLog, db, { role: "owner" });
		const res = await app.request("/api/audit-log?limit=50");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { entries: unknown[]; nextCursor: number | null };
		expect(body.entries).toHaveLength(1);
		expect(body.nextCursor).toBeNull();
	});

	it("rejects limit values above 200", async () => {
		const app = createTestApp(mountAuditLog, createMockDb(), { role: "owner" });
		const res = await app.request("/api/audit-log?limit=201");

		expect(res.status).toBe(400);
	});

	it("applies cursor as an offset for paginating", async () => {
		const db = makeAuditLogDb("America/Chicago", makeEntryChain([]));

		const app = createTestApp(mountAuditLog, db, { role: "owner" });
		const res = await app.request("/api/audit-log?cursor=50");

		expect(res.status).toBe(200);
		const body = (await res.json()) as { entries: unknown[]; nextCursor: number | null };
		expect(body.entries).toHaveLength(0);
		expect(body.nextCursor).toBeNull();
	});

	// ─── Timezone-correct date-range boundaries ──────────────────────────────

	describe("timezone-correct date-range boundaries", () => {
		it("fetches center timezone and passes timezone-correct UTC bounds for America/Chicago from=2025-03-02", async () => {
			// America/Chicago is UTC-6 in March (CST).
			// from=2025-03-02 → UTC midnight Chicago = 2025-03-02T06:00:00Z
			// to=2025-03-02   → next local day = 2025-03-03 → UTC midnight Chicago = 2025-03-03T06:00:00Z (exclusive upper)
			const whereMock = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
				}),
			});
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						// Center timezone lookup
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "America/Chicago" }]),
								}),
							}),
						};
					}
					// Audit log entries query — capture where args
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({ where: whereMock }),
						}),
					};
				}),
			});

			const app = createTestApp(mountAuditLog, db, { role: "director" });
			const res = await app.request("/api/audit-log?from=2025-03-02&to=2025-03-02");

			expect(res.status).toBe(200);

			const condition = whereMock.mock.calls[0]?.[0];
			const dates = extractDatesFromSqlCondition(condition);

			// America/Chicago CST (UTC-6) → midnight = 06:00Z
			const expectedFrom = new Date("2025-03-02T06:00:00.000Z");
			// Exclusive upper: start of next local day
			const expectedTo = new Date("2025-03-03T06:00:00.000Z");

			expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
			expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);

			// The old UTC-midnight value must NOT appear as the from bound
			const wrongFrom = new Date("2025-03-02T00:00:00.000Z");
			expect(dates.some((d) => d.toISOString() === wrongFrom.toISOString())).toBe(false);
		});

		it("falls back to DEFAULT_CENTER_TIMEZONE when center timezone lookup returns no rows", async () => {
			// DEFAULT_CENTER_TIMEZONE is America/Chicago (CST UTC-6 in March)
			const whereMock = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
				}),
			});
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({ where: whereMock }),
						}),
					};
				}),
			});

			const app = createTestApp(mountAuditLog, db, { role: "owner" });
			const res = await app.request("/api/audit-log?from=2025-03-02&to=2025-03-02");

			expect(res.status).toBe(200);

			const condition = whereMock.mock.calls[0]?.[0];
			const dates = extractDatesFromSqlCondition(condition);

			// Fallback tz = America/Chicago CST → 06:00Z
			const expectedFrom = new Date("2025-03-02T06:00:00.000Z");
			const expectedTo = new Date("2025-03-03T06:00:00.000Z");

			expect(dates.some((d) => d.toISOString() === expectedFrom.toISOString())).toBe(true);
			expect(dates.some((d) => d.toISOString() === expectedTo.toISOString())).toBe(true);
		});

		it("uses an exclusive upper bound (lt start-of-next-day) not inclusive 23:59:59", async () => {
			// Verify the upper bound is NOT the old 23:59:59.999Z pattern
			const whereMock = vi.fn().mockReturnValue({
				orderBy: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) }),
				}),
			});
			let selectCallCount = 0;
			const db = createMockDb({
				select: vi.fn().mockImplementation(() => {
					selectCallCount++;
					if (selectCallCount === 1) {
						return {
							from: vi.fn().mockReturnValue({
								where: vi.fn().mockReturnValue({
									limit: vi.fn().mockResolvedValue([{ timezone: "UTC" }]),
								}),
							}),
						};
					}
					return {
						from: vi.fn().mockReturnValue({
							leftJoin: vi.fn().mockReturnValue({ where: whereMock }),
						}),
					};
				}),
			});

			const app = createTestApp(mountAuditLog, db, { role: "owner" });
			await app.request("/api/audit-log?to=2025-03-02");

			const condition = whereMock.mock.calls[0]?.[0];
			const dates = extractDatesFromSqlCondition(condition);

			// Correct exclusive upper: 2025-03-03T00:00:00.000Z
			const correctUpper = new Date("2025-03-03T00:00:00.000Z");
			expect(dates.some((d) => d.toISOString() === correctUpper.toISOString())).toBe(true);

			// Old inclusive upper must NOT be present
			const wrongUpper = new Date("2025-03-02T23:59:59.999Z");
			expect(dates.some((d) => d.toISOString() === wrongUpper.toISOString())).toBe(false);
		});
	});
});
