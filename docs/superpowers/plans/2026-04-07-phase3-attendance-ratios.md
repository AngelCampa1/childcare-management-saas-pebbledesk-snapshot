# Phase 3: Attendance & Ratios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build child check-in/out, staff clock-in/out, a live ratio dashboard, ratio violation tracking, and an attendance calendar on child profiles — so staff can manage daily attendance and directors can monitor compliance in real time.

**Architecture:** Three new API route files (`check-ins`, `staff-check-ins`, `ratios`) following the existing Hono pattern. A shared ratio service evaluates room compliance after every attendance mutation. TanStack Router file-based routes for `/attendance`, `/ratios`, `/ratios/history`. TanStack Query hooks with optimistic updates for check-in/out and 15s polling (on-screen only) for the ratio dashboard.

**Tech Stack:** Hono, Drizzle ORM, Neon (neon-http), Zod, React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-04-07-phase3-attendance-ratios-design.md`

---

## File Structure

```
packages/shared/src/
├── types/attendance.ts                    — MODIFY: fix CheckIn, StaffCheckIn types, add RatioSnapshot, RatioViolation, RoomRatioStatus
├── validators/attendance.ts               — MODIFY: add query schemas, violation notes schema, update staffCheckInSchema

apps/api/src/
├── services/ratio.ts                      — CREATE: evaluateRoomRatio() shared service
├── services/ratio.test.ts                 — CREATE: ratio service unit tests
├── routes/check-ins.ts                    — CREATE: child check-in/out routes
├── routes/check-ins.test.ts               — CREATE: check-in route tests
├── routes/staff-check-ins.ts              — CREATE: staff clock-in/out routes
├── routes/staff-check-ins.test.ts         — CREATE: staff check-in route tests
├── routes/ratios.ts                       — CREATE: ratio dashboard + violations routes
├── routes/ratios.test.ts                  — CREATE: ratio route tests
├── index.ts                               — MODIFY: mount new routes

apps/web/src/
├── hooks/use-attendance.ts                — CREATE: check-in/out query + mutation hooks
├── hooks/use-ratios.ts                    — CREATE: ratio dashboard + violations hooks
├── components/attendance-roster.tsx        — CREATE: classroom roster with check-in/out rows
├── components/attendance-search.tsx        — CREATE: quick child search for attendance
├── components/ratio-card.tsx              — CREATE: single ratio card (green/amber/red states)
├── components/attendance-calendar.tsx      — CREATE: month calendar with color-coded days
├── components/violation-card.tsx           — CREATE: violation card (open/resolved states)
├── routes/_auth/attendance.tsx             — CREATE: attendance page with tabbed rooms
├── routes/_auth/ratios/index.tsx           — CREATE: ratio dashboard page
├── routes/_auth/ratios/history.tsx         — CREATE: ratio history (violations + snapshots)
├── routes/_auth/children/$id.tsx           — MODIFY: replace attendance placeholder with calendar
├── components/sidebar.tsx                 — MODIFY: update Ratios role filtering
```

---

## Task 1: Fix shared types and add validators

**Files:**
- Modify: `packages/shared/src/types/attendance.ts`
- Modify: `packages/shared/src/validators/attendance.ts`

- [ ] **Step 1: Write failing type test**

Create `packages/shared/src/types/attendance.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { CheckIn, RatioSnapshot, RatioViolation, RoomRatioStatus, StaffCheckIn } from "./attendance.js";

describe("attendance types", () => {
  it("CheckIn has correct shape", () => {
    const record: CheckIn = {
      id: "ci-1",
      centerId: "center-1",
      childId: "child-1",
      classroomId: "room-1",
      checkedInAt: "2026-04-07T08:00:00Z",
      checkedInBy: "membership-1",
      notes: "Arrived with mom",
    };
    expect(record.checkedInBy).toBe("membership-1");
    expect(record.checkedOutAt).toBeUndefined();
    expect(record.checkedOutBy).toBeUndefined();
  });

  it("StaffCheckIn has correct shape", () => {
    const record: StaffCheckIn = {
      id: "sci-1",
      centerId: "center-1",
      membershipId: "membership-1",
      classroomId: "room-1",
      clockedInAt: "2026-04-07T07:30:00Z",
    };
    expect(record.membershipId).toBe("membership-1");
    expect(record.clockedOutAt).toBeUndefined();
  });

  it("RatioSnapshot has correct shape", () => {
    const snapshot: RatioSnapshot = {
      id: "rs-1",
      centerId: "center-1",
      classroomId: "room-1",
      snapshotAt: "2026-04-07T08:00:00Z",
      staffCount: 3,
      childrenCount: 10,
      ratioRequired: 0.25,
      ratioActual: 0.3,
      inCompliance: true,
    };
    expect(snapshot.inCompliance).toBe(true);
  });

  it("RatioViolation has correct shape", () => {
    const violation: RatioViolation = {
      id: "rv-1",
      centerId: "center-1",
      classroomId: "room-1",
      detectedAt: "2026-04-07T10:00:00Z",
    };
    expect(violation.resolvedAt).toBeUndefined();
    expect(violation.resolvedBy).toBeUndefined();
    expect(violation.resolutionNotes).toBeUndefined();
  });

  it("RoomRatioStatus has correct shape", () => {
    const status: RoomRatioStatus = {
      classroomId: "room-1",
      classroomName: "Butterflies",
      ageGroup: "infant",
      maxCapacity: 16,
      minRatioStaff: 1,
      minRatioChildren: 4,
      currentChildCount: 10,
      currentStaffCount: 3,
      ratioRequired: 0.25,
      ratioActual: 0.3,
      inCompliance: true,
      nearLimit: false,
    };
    expect(status.openViolationId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pebbledesk/shared test -- --run packages/shared/src/types/attendance.test.ts`
Expected: FAIL — types don't exist yet.

- [ ] **Step 3: Rewrite attendance types**

Replace `packages/shared/src/types/attendance.ts` with:

```typescript
export interface CheckIn {
  id: string;
  centerId: string;
  childId: string;
  classroomId: string;
  checkedInAt: string;
  checkedOutAt?: string;
  checkedInBy: string;
  checkedOutBy?: string;
  notes?: string;
}

export interface StaffCheckIn {
  id: string;
  centerId: string;
  membershipId: string;
  classroomId: string;
  clockedInAt: string;
  clockedOutAt?: string;
}

export interface RatioSnapshot {
  id: string;
  centerId: string;
  classroomId: string;
  snapshotAt: string;
  staffCount: number;
  childrenCount: number;
  ratioRequired: number;
  ratioActual: number;
  inCompliance: boolean;
}

export interface RatioViolation {
  id: string;
  centerId: string;
  classroomId: string;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface RoomRatioStatus {
  classroomId: string;
  classroomName: string;
  ageGroup: string;
  maxCapacity: number;
  minRatioStaff: number;
  minRatioChildren: number;
  currentChildCount: number;
  currentStaffCount: number;
  ratioRequired: number;
  ratioActual: number;
  inCompliance: boolean;
  nearLimit: boolean;
  openViolationId?: string;
}
```

- [ ] **Step 4: Run type test to verify it passes**

Run: `pnpm --filter @pebbledesk/shared test -- --run packages/shared/src/types/attendance.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing validator tests**

Create `packages/shared/src/validators/attendance.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  attendanceQuerySchema,
  checkInHistoryQuerySchema,
  checkInSchema,
  checkOutSchema,
  staffAttendanceQuerySchema,
  staffCheckInSchema,
  violationNotesSchema,
  violationQuerySchema,
} from "./attendance.js";

describe("attendance validators", () => {
  describe("checkInSchema", () => {
    it("accepts valid check-in input", () => {
      const result = checkInSchema.safeParse({
        childId: "550e8400-e29b-41d4-a716-446655440000",
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
        notes: "Arrived with dad",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing childId", () => {
      const result = checkInSchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("checkOutSchema", () => {
    it("accepts empty body", () => {
      const result = checkOutSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts notes", () => {
      const result = checkOutSchema.safeParse({ notes: "Left early — sick" });
      expect(result.success).toBe(true);
    });
  });

  describe("staffCheckInSchema", () => {
    it("accepts classroomId only (self clock-in)", () => {
      const result = staffCheckInSchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
      });
      expect(result.success).toBe(true);
    });

    it("accepts membershipId for director override", () => {
      const result = staffCheckInSchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
        membershipId: "550e8400-e29b-41d4-a716-446655440002",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("attendanceQuerySchema", () => {
    it("accepts empty query (defaults to today)", () => {
      const result = attendanceQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("accepts all filters", () => {
      const result = attendanceQuerySchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
        date: "2026-04-07",
        childId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("checkInHistoryQuerySchema", () => {
    it("requires childId, from, to", () => {
      const result = checkInHistoryQuerySchema.safeParse({
        childId: "550e8400-e29b-41d4-a716-446655440000",
        from: "2026-04-01",
        to: "2026-04-30",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing childId", () => {
      const result = checkInHistoryQuerySchema.safeParse({
        from: "2026-04-01",
        to: "2026-04-30",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("staffAttendanceQuerySchema", () => {
    it("accepts optional classroomId and date", () => {
      const result = staffAttendanceQuerySchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("violationQuerySchema", () => {
    it("accepts all filters", () => {
      const result = violationQuerySchema.safeParse({
        classroomId: "550e8400-e29b-41d4-a716-446655440001",
        status: "open",
        from: "2026-04-01",
        to: "2026-04-30",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = violationQuerySchema.safeParse({ status: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("violationNotesSchema", () => {
    it("accepts valid notes", () => {
      const result = violationNotesSchema.safeParse({
        resolutionNotes: "Moved staff from Room B to cover.",
      });
      expect(result.success).toBe(true);
    });

    it("rejects notes over 2000 chars", () => {
      const result = violationNotesSchema.safeParse({
        resolutionNotes: "x".repeat(2001),
      });
      expect(result.success).toBe(false);
    });
  });
});
```

- [ ] **Step 6: Run validator tests to verify they fail**

Run: `pnpm --filter @pebbledesk/shared test -- --run packages/shared/src/validators/attendance.test.ts`
Expected: FAIL — new schemas don't exist yet.

- [ ] **Step 7: Update validators**

Replace `packages/shared/src/validators/attendance.ts` with:

```typescript
import { z } from "zod";

export const checkInSchema = z.object({
  childId: z.string().uuid(),
  classroomId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

export const checkOutSchema = z.object({
  notes: z.string().max(1000).optional(),
});

export const staffCheckInSchema = z.object({
  classroomId: z.string().uuid(),
  membershipId: z.string().uuid().optional(),
});

export const attendanceQuerySchema = z.object({
  classroomId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  childId: z.string().uuid().optional(),
});

export const checkInHistoryQuerySchema = z.object({
  childId: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const staffAttendanceQuerySchema = z.object({
  classroomId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const violationQuerySchema = z.object({
  classroomId: z.string().uuid().optional(),
  status: z.enum(["open", "resolved"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const violationNotesSchema = z.object({
  resolutionNotes: z.string().max(2000),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type StaffCheckInInput = z.infer<typeof staffCheckInSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type CheckInHistoryQuery = z.infer<typeof checkInHistoryQuerySchema>;
export type StaffAttendanceQuery = z.infer<typeof staffAttendanceQuerySchema>;
export type ViolationQuery = z.infer<typeof violationQuerySchema>;
export type ViolationNotesInput = z.infer<typeof violationNotesSchema>;
```

- [ ] **Step 8: Run all shared tests to verify they pass**

Run: `pnpm --filter @pebbledesk/shared test -- --run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types/attendance.ts packages/shared/src/types/attendance.test.ts packages/shared/src/validators/attendance.ts packages/shared/src/validators/attendance.test.ts
git commit -m "feat(shared): fix attendance types and add Phase 3 validators"
```

---

## Task 2: Ratio service

**Files:**
- Create: `apps/api/src/services/ratio.ts`
- Create: `apps/api/src/services/ratio.test.ts`

- [ ] **Step 1: Write failing ratio service tests**

Create `apps/api/src/services/ratio.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { evaluateRoomRatio } from "./ratio.js";

function createMockTx() {
  let selectResults: Record<string, unknown[]> = {};
  let insertedTables: string[] = [];
  let updatedTables: string[] = [];

  const tx = {
    select: vi.fn().mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      let tableName = "";

      chain.from = vi.fn().mockImplementation((table: { _: { name: string } }) => {
        tableName = table?._.name ?? table?.[Symbol.for("drizzle:Name")] ?? "unknown";
        return chain;
      });
      chain.where = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockImplementation(() => {
        return Promise.resolve(selectResults[tableName] ?? []);
      });
      // For count queries
      chain.then = undefined;
      return chain;
    }),
    insert: vi.fn().mockImplementation((table: { _: { name: string } }) => {
      const tableName = table?._.name ?? "unknown";
      insertedTables.push(tableName);
      return {
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: `${tableName}-new-1` }]),
        }),
      };
    }),
    update: vi.fn().mockImplementation((table: { _: { name: string } }) => {
      const tableName = table?._.name ?? "unknown";
      updatedTables.push(tableName);
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: `${tableName}-updated-1` }]),
          }),
        }),
      };
    }),
    _setResults: (results: Record<string, unknown[]>) => {
      selectResults = results;
    },
    _getInserted: () => insertedTables,
    _getUpdated: () => updatedTables,
  };

  return tx;
}

describe("evaluateRoomRatio", () => {
  it("returns compliant when room is empty (0 children, 0 staff)", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [],
      staff_check_ins: [],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.childrenCount).toBe(0);
    expect(result.staffCount).toBe(0);
    expect(result.inCompliance).toBe(true);
    // No snapshot for empty room
    expect(tx._getInserted()).not.toContain("ratio_snapshots");
  });

  it("creates snapshot and detects compliance when ratio is healthy", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }],
      staff_check_ins: [{ id: "1" }, { id: "2" }],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.childrenCount).toBe(4);
    expect(result.staffCount).toBe(2);
    expect(result.inCompliance).toBe(true);
    expect(tx._getInserted()).toContain("ratio_snapshots");
    expect(tx._getInserted()).not.toContain("ratio_violations");
  });

  it("creates violation when ratio breached", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }],
      staff_check_ins: [{ id: "1" }],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.childrenCount).toBe(5);
    expect(result.staffCount).toBe(1);
    expect(result.inCompliance).toBe(false);
    expect(tx._getInserted()).toContain("ratio_snapshots");
    expect(tx._getInserted()).toContain("ratio_violations");
  });

  it("auto-resolves open violation when compliance restores", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [{ id: "1" }, { id: "2" }, { id: "3" }],
      staff_check_ins: [{ id: "1" }],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [{ id: "violation-1" }],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.inCompliance).toBe(true);
    expect(tx._getUpdated()).toContain("ratio_violations");
  });

  it("does not create duplicate violation if one already open", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }],
      staff_check_ins: [{ id: "1" }],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [{ id: "existing-violation" }],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.inCompliance).toBe(false);
    expect(tx._getInserted()).not.toContain("ratio_violations");
  });

  it("detects violation when children present but zero staff", async () => {
    const tx = createMockTx();
    tx._setResults({
      check_ins: [{ id: "1" }],
      staff_check_ins: [],
      classrooms: [{ minRatioStaff: 1, minRatioChildren: 4 }],
      ratio_violations: [],
    });

    const result = await evaluateRoomRatio("room-1", "center-1", tx as never);

    expect(result.inCompliance).toBe(false);
    expect(tx._getInserted()).toContain("ratio_violations");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/services/ratio.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement ratio service**

Create `apps/api/src/services/ratio.ts`:

```typescript
import {
  checkIns,
  classrooms,
  ratioSnapshots,
  ratioViolations,
  staffCheckIns,
} from "@pebbledesk/db";
import { and, eq, isNull } from "drizzle-orm";

interface RatioResult {
  childrenCount: number;
  staffCount: number;
  ratioRequired: number;
  ratioActual: number;
  inCompliance: boolean;
}

export async function evaluateRoomRatio(
  classroomId: string,
  centerId: string,
  tx: Parameters<Parameters<import("@pebbledesk/db").Database["transaction"]>[0]>[0],
): Promise<RatioResult> {
  // 1. Count children currently checked in
  const checkedInChildren = await tx
    .select({ id: checkIns.id })
    .from(checkIns)
    .where(
      and(
        eq(checkIns.classroomId, classroomId),
        eq(checkIns.centerId, centerId),
        isNull(checkIns.checkedOutAt),
      ),
    );
  const childrenCount = checkedInChildren.length;

  // 2. Count staff currently clocked in
  const clockedInStaff = await tx
    .select({ id: staffCheckIns.id })
    .from(staffCheckIns)
    .where(
      and(
        eq(staffCheckIns.classroomId, classroomId),
        eq(staffCheckIns.centerId, centerId),
        isNull(staffCheckIns.clockedOutAt),
      ),
    );
  const staffCount = clockedInStaff.length;

  // 3. Get classroom ratio requirements
  const [room] = await tx
    .select({
      minRatioStaff: classrooms.minRatioStaff,
      minRatioChildren: classrooms.minRatioChildren,
    })
    .from(classrooms)
    .where(eq(classrooms.id, classroomId))
    .limit(1);

  const ratioRequired = room.minRatioStaff / room.minRatioChildren;

  // 4. Empty room — compliant, no snapshot
  if (childrenCount === 0 && staffCount === 0) {
    return { childrenCount, staffCount, ratioRequired, ratioActual: 0, inCompliance: true };
  }

  // 5. Compute actual ratio
  const ratioActual = childrenCount > 0 ? staffCount / childrenCount : Infinity;
  const inCompliance = childrenCount === 0 || ratioActual >= ratioRequired;

  // 6. Insert snapshot
  await tx.insert(ratioSnapshots).values({
    centerId,
    classroomId,
    staffCount,
    childrenCount,
    ratioRequired,
    ratioActual: ratioActual === Infinity ? 999 : ratioActual,
    inCompliance,
  });

  // 7. Check for existing open violation
  const [openViolation] = await tx
    .select({ id: ratioViolations.id })
    .from(ratioViolations)
    .where(
      and(
        eq(ratioViolations.classroomId, classroomId),
        eq(ratioViolations.centerId, centerId),
        isNull(ratioViolations.resolvedAt),
      ),
    )
    .limit(1);

  // 8. Create or resolve violations
  if (!inCompliance && !openViolation) {
    await tx.insert(ratioViolations).values({
      centerId,
      classroomId,
    });
  } else if (inCompliance && openViolation) {
    await tx
      .update(ratioViolations)
      .set({ resolvedAt: new Date() })
      .where(eq(ratioViolations.id, openViolation.id));
  }

  return { childrenCount, staffCount, ratioRequired, ratioActual, inCompliance };
}
```

- [ ] **Step 4: Run ratio service tests**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/services/ratio.test.ts`
Expected: PASS (or adjust mocking approach if needed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/ratio.ts apps/api/src/services/ratio.test.ts
git commit -m "feat(api): add ratio evaluation service"
```

---

## Task 3: Check-in API routes

**Files:**
- Create: `apps/api/src/routes/check-ins.ts`
- Create: `apps/api/src/routes/check-ins.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing check-in route tests**

Create `apps/api/src/routes/check-ins.test.ts`:

```typescript
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", () => {
  const { createMiddleware } = require("hono/factory");
  return {
    requireAuth: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
    requireRole: (...roles: string[]) =>
      createMiddleware(async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
        const role = c.get("role");
        if (!role || !roles.includes(role)) {
          const { HTTPException } = require("hono/http-exception");
          throw new HTTPException(403, { message: "Insufficient permissions" });
        }
        await next();
      }),
  };
});

vi.mock("../services/ratio.js", () => ({
  evaluateRoomRatio: vi.fn().mockResolvedValue({
    childrenCount: 1,
    staffCount: 1,
    ratioRequired: 0.25,
    ratioActual: 1,
    inCompliance: true,
  }),
}));

const { checkInsRoutes } = await import("./check-ins.js");

function mountCheckIns(app: Hono<AppEnv>) {
  app.route("/api/check-ins", checkInsRoutes);
}

describe("check-ins routes", () => {
  describe("POST /api/check-ins", () => {
    it("checks in a child (201)", async () => {
      const newCheckIn = {
        id: "ci-1",
        centerId: "center-1",
        childId: "child-1",
        classroomId: "room-1",
        checkedInAt: new Date().toISOString(),
        checkedInBy: "membership-1",
      };

      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        transaction: vi.fn().mockImplementation(async (fn) => {
          const txDb = {
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newCheckIn]),
              }),
            }),
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
          return fn(txDb);
        }),
      });

      const app = createTestApp(mountCheckIns, db);

      const res = await app.request(
        "/api/check-ins",
        jsonBody({
          childId: "550e8400-e29b-41d4-a716-446655440000",
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.checkIn).toBeDefined();
    });

    it("rejects duplicate check-in (400)", async () => {
      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-ci" }]),
            }),
          }),
        }),
      });

      const app = createTestApp(mountCheckIns, db);

      const res = await app.request(
        "/api/check-ins",
        jsonBody({
          childId: "550e8400-e29b-41d4-a716-446655440000",
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/check-ins/:id/check-out", () => {
    it("checks out a child (200)", async () => {
      const updatedCheckIn = {
        id: "ci-1",
        centerId: "center-1",
        childId: "child-1",
        classroomId: "room-1",
        checkedInAt: new Date().toISOString(),
        checkedOutAt: new Date().toISOString(),
        checkedOutBy: "membership-1",
      };

      const db = createMockDb({
        transaction: vi.fn().mockImplementation(async (fn) => {
          const txDb = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([updatedCheckIn]),
                }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
          return fn(txDb);
        }),
      });

      const app = createTestApp(mountCheckIns, db);

      const res = await app.request(
        "/api/check-ins/ci-1/check-out",
        patchBody({ notes: "Picked up by dad" }),
      );

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/check-ins", () => {
    it("returns today's attendance log", async () => {
      const records = [
        { id: "ci-1", childId: "child-1", checkedInAt: new Date().toISOString() },
      ];

      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(records),
          }),
        }),
      });

      const app = createTestApp(mountCheckIns, db);
      const res = await app.request("/api/check-ins");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.checkIns).toBeDefined();
    });
  });

  describe("GET /api/check-ins/history", () => {
    it("returns historical records for a child", async () => {
      const records = [
        { id: "ci-1", childId: "child-1", checkedInAt: "2026-04-01T08:00:00Z", checkedOutAt: "2026-04-01T16:00:00Z" },
      ];

      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(records),
          }),
        }),
      });

      const app = createTestApp(mountCheckIns, db);
      const res = await app.request(
        "/api/check-ins/history?childId=550e8400-e29b-41d4-a716-446655440000&from=2026-04-01&to=2026-04-30",
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.checkIns).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/check-ins.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement check-in routes**

Create `apps/api/src/routes/check-ins.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import { checkIns } from "@pebbledesk/db";
import {
  attendanceQuerySchema,
  checkInHistoryQuerySchema,
  checkInSchema,
  checkOutSchema,
} from "@pebbledesk/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { evaluateRoomRatio } from "../services/ratio.js";

const checkInsRoutes = new Hono<AppEnv>();

// GET /history — historical records (BEFORE /:id to avoid route conflict)
checkInsRoutes.get("/history", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const childId = c.req.query("childId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  if (!childId || !from || !to) {
    badRequest("childId, from, and to are required");
  }

  const parsed = checkInHistoryQuerySchema.safeParse({ childId, from, to });
  if (!parsed.success) badRequest("Invalid query parameters");

  const conditions = [
    eq(checkIns.centerId, centerId),
    eq(checkIns.childId, parsed.data.childId),
    gte(checkIns.checkedInAt, new Date(`${parsed.data.from}T00:00:00Z`)),
    lte(checkIns.checkedInAt, new Date(`${parsed.data.to}T23:59:59Z`)),
  ];

  const results = await db
    .select()
    .from(checkIns)
    .where(and(...conditions));

  return c.json({ checkIns: results });
});

// POST / — check in a child
checkInsRoutes.post(
  "/",
  requireAuth,
  zValidator("json", checkInSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const membershipId = c.get("membershipId");
    const db = c.get("db");
    const data = c.req.valid("json");

    // Check for duplicate open check-in
    const [existing] = await db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(
        and(
          eq(checkIns.childId, data.childId),
          eq(checkIns.centerId, centerId),
          isNull(checkIns.checkedOutAt),
        ),
      )
      .limit(1);

    if (existing) badRequest("Child is already checked in");

    const result = await db.transaction(async (tx) => {
      const [checkIn] = await tx
        .insert(checkIns)
        .values({
          centerId,
          childId: data.childId,
          classroomId: data.classroomId,
          checkedInBy: membershipId,
          notes: data.notes,
        })
        .returning();

      if (!checkIn) throw new Error("Failed to create check-in");

      await evaluateRoomRatio(data.classroomId, centerId, tx);

      return checkIn;
    });

    return c.json({ checkIn: result }, 201);
  },
);

// PATCH /:id/check-out — check out a child
checkInsRoutes.patch(
  "/:id/check-out",
  requireAuth,
  zValidator("json", checkOutSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const id = c.req.param("id");
    const membershipId = c.get("membershipId");
    const db = c.get("db");
    const data = c.req.valid("json");

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(checkIns)
        .set({
          checkedOutAt: new Date(),
          checkedOutBy: membershipId,
          notes: data.notes ?? undefined,
        })
        .where(
          and(
            eq(checkIns.id, id),
            eq(checkIns.centerId, centerId),
            isNull(checkIns.checkedOutAt),
          ),
        )
        .returning();

      if (!updated) notFound("Check-in not found or already checked out");

      await evaluateRoomRatio(updated.classroomId, centerId, tx);

      return updated;
    });

    return c.json({ checkIn: result });
  },
);

// GET / — today's attendance log
checkInsRoutes.get("/", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const classroomId = c.req.query("classroomId");
  const dateStr = c.req.query("date");
  const childId = c.req.query("childId");

  const date = dateStr ?? new Date().toISOString().split("T")[0];
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const conditions = [
    eq(checkIns.centerId, centerId),
    gte(checkIns.checkedInAt, dayStart),
    lte(checkIns.checkedInAt, dayEnd),
  ];

  if (classroomId) conditions.push(eq(checkIns.classroomId, classroomId));
  if (childId) conditions.push(eq(checkIns.childId, childId));

  const results = await db
    .select()
    .from(checkIns)
    .where(and(...conditions));

  return c.json({ checkIns: results });
});

export { checkInsRoutes };
```

- [ ] **Step 4: Run check-in route tests**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/check-ins.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/check-ins.ts apps/api/src/routes/check-ins.test.ts
git commit -m "feat(api): add child check-in/out routes"
```

---

## Task 4: Staff check-in API routes

**Files:**
- Create: `apps/api/src/routes/staff-check-ins.ts`
- Create: `apps/api/src/routes/staff-check-ins.test.ts`

- [ ] **Step 1: Write failing staff check-in route tests**

Create `apps/api/src/routes/staff-check-ins.test.ts`:

```typescript
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", () => {
  const { createMiddleware } = require("hono/factory");
  return {
    requireAuth: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
    requireRole: (...roles: string[]) =>
      createMiddleware(async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
        const role = c.get("role");
        if (!role || !roles.includes(role)) {
          const { HTTPException } = require("hono/http-exception");
          throw new HTTPException(403, { message: "Insufficient permissions" });
        }
        await next();
      }),
  };
});

vi.mock("../services/ratio.js", () => ({
  evaluateRoomRatio: vi.fn().mockResolvedValue({
    childrenCount: 0,
    staffCount: 1,
    ratioRequired: 0.25,
    ratioActual: Infinity,
    inCompliance: true,
  }),
}));

const { staffCheckInsRoutes } = await import("./staff-check-ins.js");

function mountStaffCheckIns(app: Hono<AppEnv>) {
  app.route("/api/staff-check-ins", staffCheckInsRoutes);
}

describe("staff-check-ins routes", () => {
  describe("POST /api/staff-check-ins", () => {
    it("clocks in self (201)", async () => {
      const newClockIn = {
        id: "sci-1",
        centerId: "center-1",
        membershipId: "membership-1",
        classroomId: "room-1",
        clockedInAt: new Date().toISOString(),
      };

      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        transaction: vi.fn().mockImplementation(async (fn) => {
          const txDb = {
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newClockIn]),
              }),
            }),
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
          return fn(txDb);
        }),
      });

      const app = createTestApp(mountStaffCheckIns, db);

      const res = await app.request(
        "/api/staff-check-ins",
        jsonBody({
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      );

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.staffCheckIn).toBeDefined();
    });

    it("director clocks in another staff member (201)", async () => {
      const newClockIn = {
        id: "sci-1",
        centerId: "center-1",
        membershipId: "membership-2",
        classroomId: "room-1",
        clockedInAt: new Date().toISOString(),
      };

      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        transaction: vi.fn().mockImplementation(async (fn) => {
          const txDb = {
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([newClockIn]),
              }),
            }),
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          };
          return fn(txDb);
        }),
      });

      const app = createTestApp(mountStaffCheckIns, db, { role: "director" });

      const res = await app.request(
        "/api/staff-check-ins",
        jsonBody({
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
          membershipId: "550e8400-e29b-41d4-a716-446655440002",
        }),
      );

      expect(res.status).toBe(201);
    });

    it("staff cannot clock in another staff member (403)", async () => {
      const db = createMockDb();
      const app = createTestApp(mountStaffCheckIns, db, { role: "staff" });

      const res = await app.request(
        "/api/staff-check-ins",
        jsonBody({
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
          membershipId: "550e8400-e29b-41d4-a716-446655440099",
        }),
      );

      expect(res.status).toBe(403);
    });

    it("rejects duplicate clock-in (400)", async () => {
      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-sci" }]),
            }),
          }),
        }),
      });

      const app = createTestApp(mountStaffCheckIns, db);

      const res = await app.request(
        "/api/staff-check-ins",
        jsonBody({
          classroomId: "550e8400-e29b-41d4-a716-446655440001",
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/staff-check-ins/:id/clock-out", () => {
    it("clocks out (200)", async () => {
      const updated = {
        id: "sci-1",
        centerId: "center-1",
        membershipId: "membership-1",
        classroomId: "room-1",
        clockedInAt: new Date().toISOString(),
        clockedOutAt: new Date().toISOString(),
      };

      const db = createMockDb({
        transaction: vi.fn().mockImplementation(async (fn) => {
          const txDb = {
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([updated]),
                }),
              }),
            }),
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          };
          return fn(txDb);
        }),
      });

      const app = createTestApp(mountStaffCheckIns, db);

      const res = await app.request("/api/staff-check-ins/sci-1/clock-out", patchBody({}));

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/staff-check-ins", () => {
    it("returns staff attendance for directors", async () => {
      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: "sci-1" }]),
          }),
        }),
      });

      const app = createTestApp(mountStaffCheckIns, db, { role: "director" });
      const res = await app.request("/api/staff-check-ins");

      expect(res.status).toBe(200);
    });

    it("rejects staff role (403)", async () => {
      const db = createMockDb();
      const app = createTestApp(mountStaffCheckIns, db, { role: "staff" });

      const res = await app.request("/api/staff-check-ins");

      expect(res.status).toBe(403);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/staff-check-ins.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement staff check-in routes**

Create `apps/api/src/routes/staff-check-ins.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import { staffCheckIns } from "@pebbledesk/db";
import { staffCheckInSchema } from "@pebbledesk/shared";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { evaluateRoomRatio } from "../services/ratio.js";

const staffCheckInsRoutes = new Hono<AppEnv>();

// POST / — clock in
staffCheckInsRoutes.post(
  "/",
  requireAuth,
  zValidator("json", staffCheckInSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const role = c.get("role");
    const selfMembershipId = c.get("membershipId");
    const db = c.get("db");
    const data = c.req.valid("json");

    // Determine target membership
    const targetMembershipId = data.membershipId ?? selfMembershipId;

    // Staff can only clock themselves in
    if (data.membershipId && data.membershipId !== selfMembershipId && role === "staff") {
      forbidden("Staff can only clock themselves in");
    }

    // Check for duplicate open clock-in
    const [existing] = await db
      .select({ id: staffCheckIns.id })
      .from(staffCheckIns)
      .where(
        and(
          eq(staffCheckIns.membershipId, targetMembershipId),
          eq(staffCheckIns.centerId, centerId),
          isNull(staffCheckIns.clockedOutAt),
        ),
      )
      .limit(1);

    if (existing) badRequest("Staff member is already clocked in");

    const result = await db.transaction(async (tx) => {
      const [clockIn] = await tx
        .insert(staffCheckIns)
        .values({
          centerId,
          membershipId: targetMembershipId,
          classroomId: data.classroomId,
        })
        .returning();

      if (!clockIn) throw new Error("Failed to create staff check-in");

      await evaluateRoomRatio(data.classroomId, centerId, tx);

      return clockIn;
    });

    return c.json({ staffCheckIn: result }, 201);
  },
);

// PATCH /:id/clock-out — clock out
staffCheckInsRoutes.patch(
  "/:id/clock-out",
  requireAuth,
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const id = c.req.param("id");
    const db = c.get("db");

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(staffCheckIns)
        .set({ clockedOutAt: new Date() })
        .where(
          and(
            eq(staffCheckIns.id, id),
            eq(staffCheckIns.centerId, centerId),
            isNull(staffCheckIns.clockedOutAt),
          ),
        )
        .returning();

      if (!updated) notFound("Staff check-in not found or already clocked out");

      await evaluateRoomRatio(updated.classroomId, centerId, tx);

      return updated;
    });

    return c.json({ staffCheckIn: result });
  },
);

// GET / — today's staff attendance (directors only)
staffCheckInsRoutes.get(
  "/",
  requireAuth,
  requireRole("owner", "director"),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const classroomId = c.req.query("classroomId");
    const dateStr = c.req.query("date");

    const date = dateStr ?? new Date().toISOString().split("T")[0];
    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59Z`);

    const conditions = [
      eq(staffCheckIns.centerId, centerId),
      gte(staffCheckIns.clockedInAt, dayStart),
      lte(staffCheckIns.clockedInAt, dayEnd),
    ];

    if (classroomId) conditions.push(eq(staffCheckIns.classroomId, classroomId));

    const results = await db
      .select()
      .from(staffCheckIns)
      .where(and(...conditions));

    return c.json({ staffCheckIns: results });
  },
);

export { staffCheckInsRoutes };
```

- [ ] **Step 4: Run staff check-in tests**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/staff-check-ins.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/staff-check-ins.ts apps/api/src/routes/staff-check-ins.test.ts
git commit -m "feat(api): add staff clock-in/out routes"
```

---

## Task 5: Ratios API routes

**Files:**
- Create: `apps/api/src/routes/ratios.ts`
- Create: `apps/api/src/routes/ratios.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing ratio route tests**

Create `apps/api/src/routes/ratios.test.ts`:

```typescript
import type { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/context.js";
import { createMockDb, createTestApp, patchBody } from "../test/setup.js";

vi.mock("../middleware/auth.js", () => {
  const { createMiddleware } = require("hono/factory");
  return {
    requireAuth: createMiddleware(async (_c: unknown, next: () => Promise<void>) => {
      await next();
    }),
    requireRole: (...roles: string[]) =>
      createMiddleware(async (c: { get: (key: string) => string }, next: () => Promise<void>) => {
        const role = c.get("role");
        if (!role || !roles.includes(role)) {
          const { HTTPException } = require("hono/http-exception");
          throw new HTTPException(403, { message: "Insufficient permissions" });
        }
        await next();
      }),
  };
});

const { ratiosRoutes } = await import("./ratios.js");

function mountRatios(app: Hono<AppEnv>) {
  app.route("/api/ratios", ratiosRoutes);
}

describe("ratios routes", () => {
  describe("GET /api/ratios", () => {
    it("returns current ratio status for all rooms (director)", async () => {
      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: "room-1",
                name: "Butterflies",
                ageGroup: "infant",
                maxCapacity: 16,
                minRatioStaff: 1,
                minRatioChildren: 4,
              },
            ]),
          }),
        }),
      });

      const app = createTestApp(mountRatios, db, { role: "director" });
      const res = await app.request("/api/ratios");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ratios).toBeDefined();
    });

    it("rejects staff role (403)", async () => {
      const db = createMockDb();
      const app = createTestApp(mountRatios, db, { role: "staff" });

      const res = await app.request("/api/ratios");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/ratios/violations", () => {
    it("returns violations", async () => {
      const db = createMockDb({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: "v-1" }]),
          }),
        }),
      });

      const app = createTestApp(mountRatios, db, { role: "owner" });
      const res = await app.request("/api/ratios/violations");

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.violations).toBeDefined();
    });
  });

  describe("PATCH /api/ratios/violations/:id", () => {
    it("adds resolution notes (200)", async () => {
      const db = createMockDb({
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "v-1", resolutionNotes: "Fixed" }]),
            }),
          }),
        }),
      });

      const app = createTestApp(mountRatios, db, { role: "director" });
      const res = await app.request(
        "/api/ratios/violations/v-1",
        patchBody({ resolutionNotes: "Moved staff from Room B" }),
      );

      expect(res.status).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/ratios.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement ratios routes**

Create `apps/api/src/routes/ratios.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import {
  checkIns,
  classrooms,
  ratioSnapshots,
  ratioViolations,
  staffCheckIns,
} from "@pebbledesk/db";
import { violationNotesSchema } from "@pebbledesk/shared";
import { and, eq, gte, isNull, lte, not } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const ratiosRoutes = new Hono<AppEnv>();

// GET / — current ratio status for all rooms (computed live)
ratiosRoutes.get(
  "/",
  requireAuth,
  requireRole("owner", "director"),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");

    // Get all active classrooms
    const rooms = await db
      .select()
      .from(classrooms)
      .where(
        and(eq(classrooms.centerId, centerId), isNull(classrooms.archivedAt)),
      );

    // For each room, count checked-in children and clocked-in staff
    const ratios = await Promise.all(
      rooms.map(async (room) => {
        const checkedIn = await db
          .select({ id: checkIns.id })
          .from(checkIns)
          .where(
            and(
              eq(checkIns.classroomId, room.id),
              eq(checkIns.centerId, centerId),
              isNull(checkIns.checkedOutAt),
            ),
          );

        const clockedIn = await db
          .select({ id: staffCheckIns.id })
          .from(staffCheckIns)
          .where(
            and(
              eq(staffCheckIns.classroomId, room.id),
              eq(staffCheckIns.centerId, centerId),
              isNull(staffCheckIns.clockedOutAt),
            ),
          );

        const currentChildCount = checkedIn.length;
        const currentStaffCount = clockedIn.length;
        const ratioRequired = room.minRatioStaff / room.minRatioChildren;
        const ratioActual =
          currentChildCount > 0 ? currentStaffCount / currentChildCount : 0;
        const inCompliance =
          currentChildCount === 0 || ratioActual >= ratioRequired;

        // Near limit: would adding 1 more child breach the ratio?
        const nextChildRatio =
          currentStaffCount / (currentChildCount + 1);
        const nearLimit = inCompliance && nextChildRatio < ratioRequired && currentChildCount > 0;

        // Check for open violation
        const [openViolation] = await db
          .select({ id: ratioViolations.id })
          .from(ratioViolations)
          .where(
            and(
              eq(ratioViolations.classroomId, room.id),
              eq(ratioViolations.centerId, centerId),
              isNull(ratioViolations.resolvedAt),
            ),
          )
          .limit(1);

        return {
          classroomId: room.id,
          classroomName: room.name,
          ageGroup: room.ageGroup,
          maxCapacity: room.maxCapacity,
          minRatioStaff: room.minRatioStaff,
          minRatioChildren: room.minRatioChildren,
          currentChildCount,
          currentStaffCount,
          ratioRequired,
          ratioActual,
          inCompliance,
          nearLimit,
          openViolationId: openViolation?.id,
        };
      }),
    );

    return c.json({ ratios });
  },
);

// GET /snapshots — historical snapshots
ratiosRoutes.get(
  "/snapshots",
  requireAuth,
  requireRole("owner", "director"),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const classroomId = c.req.query("classroomId");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const conditions = [eq(ratioSnapshots.centerId, centerId)];

    if (classroomId) conditions.push(eq(ratioSnapshots.classroomId, classroomId));
    if (from) conditions.push(gte(ratioSnapshots.snapshotAt, new Date(`${from}T00:00:00Z`)));
    if (to) conditions.push(lte(ratioSnapshots.snapshotAt, new Date(`${to}T23:59:59Z`)));

    const results = await db
      .select()
      .from(ratioSnapshots)
      .where(and(...conditions));

    return c.json({ snapshots: results });
  },
);

// GET /violations — violation records
ratiosRoutes.get(
  "/violations",
  requireAuth,
  requireRole("owner", "director"),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const classroomId = c.req.query("classroomId");
    const status = c.req.query("status");
    const from = c.req.query("from");
    const to = c.req.query("to");

    const conditions = [eq(ratioViolations.centerId, centerId)];

    if (classroomId) conditions.push(eq(ratioViolations.classroomId, classroomId));
    if (status === "open") conditions.push(isNull(ratioViolations.resolvedAt));
    if (status === "resolved") {
      conditions.push(not(isNull(ratioViolations.resolvedAt)));
    }
    if (from) conditions.push(gte(ratioViolations.detectedAt, new Date(`${from}T00:00:00Z`)));
    if (to) conditions.push(lte(ratioViolations.detectedAt, new Date(`${to}T23:59:59Z`)));

    const results = await db
      .select()
      .from(ratioViolations)
      .where(and(...conditions));

    return c.json({ violations: results });
  },
);

// PATCH /violations/:id — add resolution notes
ratiosRoutes.patch(
  "/violations/:id",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", violationNotesSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const id = c.req.param("id");
    const db = c.get("db");
    const data = c.req.valid("json");

    const [updated] = await db
      .update(ratioViolations)
      .set({
        resolutionNotes: data.resolutionNotes,
        resolvedBy: c.get("membershipId"),
      })
      .where(
        and(eq(ratioViolations.id, id), eq(ratioViolations.centerId, centerId)),
      )
      .returning();

    if (!updated) notFound("Violation not found");

    return c.json({ violation: updated });
  },
);

export { ratiosRoutes };
```

- [ ] **Step 4: Run ratio route tests**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/ratios.test.ts`
Expected: PASS

- [ ] **Step 5: Mount new routes in index.ts**

Add to `apps/api/src/index.ts`:

```typescript
// Add imports at top:
import { checkInsRoutes } from "./routes/check-ins.js";
import { ratiosRoutes } from "./routes/ratios.js";
import { staffCheckInsRoutes } from "./routes/staff-check-ins.js";

// Add route mounts after existing routes:
app.route("/api/check-ins", checkInsRoutes);
app.route("/api/staff-check-ins", staffCheckInsRoutes);
app.route("/api/ratios", ratiosRoutes);
```

- [ ] **Step 6: Run all API tests**

Run: `pnpm --filter @pebbledesk/api test -- --run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/ratios.ts apps/api/src/routes/ratios.test.ts apps/api/src/index.ts
git commit -m "feat(api): add ratio dashboard and violations routes, mount all Phase 3 routes"
```

---

## Task 6: Frontend hooks — attendance and ratios

**Files:**
- Create: `apps/web/src/hooks/use-attendance.ts`
- Create: `apps/web/src/hooks/use-ratios.ts`

- [ ] **Step 1: Create attendance hooks**

Create `apps/web/src/hooks/use-attendance.ts`:

```typescript
import type { CheckIn, CheckInInput, StaffCheckIn } from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

interface AttendanceFilters {
  classroomId?: string;
  date?: string;
  childId?: string;
}

export function useCheckIns(filters?: AttendanceFilters) {
  return useQuery({
    queryKey: ["checkIns", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.classroomId) params.set("classroomId", filters.classroomId);
      if (filters?.date) params.set("date", filters.date);
      if (filters?.childId) params.set("childId", filters.childId);

      const query = params.toString();
      const path = `/api/check-ins${query ? `?${query}` : ""}`;
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("Failed to fetch check-ins");
      const data: { checkIns: CheckIn[] } = await res.json();
      return data.checkIns;
    },
  });
}

export function useCheckInHistory(childId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["checkInHistory", childId, from, to],
    queryFn: async () => {
      const params = new URLSearchParams({ childId, from, to });
      const res = await apiFetch(`/api/check-ins/history?${params}`);
      if (!res.ok) throw new Error("Failed to fetch check-in history");
      const data: { checkIns: CheckIn[] } = await res.json();
      return data.checkIns;
    },
    enabled: !!childId && !!from && !!to,
  });
}

export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CheckInInput) => {
      const res = await apiFetch("/api/check-ins", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to check in");
      const data: { checkIn: CheckIn } = await res.json();
      return data.checkIn;
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["checkIns"] });
      const previous = queryClient.getQueryData<CheckIn[]>(["checkIns"]);

      // Optimistic: add a temporary check-in
      queryClient.setQueriesData<CheckIn[]>({ queryKey: ["checkIns"] }, (old) => {
        if (!old) return old;
        return [
          ...old,
          {
            id: `temp-${Date.now()}`,
            centerId: "",
            childId: input.childId,
            classroomId: input.classroomId,
            checkedInAt: new Date().toISOString(),
            checkedInBy: "",
            notes: input.notes,
          },
        ];
      });

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueriesData({ queryKey: ["checkIns"] }, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["checkIns"] });
      queryClient.invalidateQueries({ queryKey: ["ratios"] });
    },
  });
}

export function useCheckOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const res = await apiFetch(`/api/check-ins/${id}/check-out`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to check out");
      const data: { checkIn: CheckIn } = await res.json();
      return data.checkIn;
    },
    onMutate: async ({ id }) => {
      await queryClient.cancelQueries({ queryKey: ["checkIns"] });
      const previous = queryClient.getQueryData<CheckIn[]>(["checkIns"]);

      queryClient.setQueriesData<CheckIn[]>({ queryKey: ["checkIns"] }, (old) => {
        if (!old) return old;
        return old.map((ci) =>
          ci.id === id
            ? { ...ci, checkedOutAt: new Date().toISOString() }
            : ci,
        );
      });

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueriesData({ queryKey: ["checkIns"] }, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["checkIns"] });
      queryClient.invalidateQueries({ queryKey: ["ratios"] });
    },
  });
}

export function useStaffCheckIns(filters?: { classroomId?: string; date?: string }) {
  return useQuery({
    queryKey: ["staffCheckIns", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.classroomId) params.set("classroomId", filters.classroomId);
      if (filters?.date) params.set("date", filters.date);

      const query = params.toString();
      const path = `/api/staff-check-ins${query ? `?${query}` : ""}`;
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("Failed to fetch staff check-ins");
      const data: { staffCheckIns: StaffCheckIn[] } = await res.json();
      return data.staffCheckIns;
    },
  });
}

export function useStaffClockIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { classroomId: string; membershipId?: string }) => {
      const res = await apiFetch("/api/staff-check-ins", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Failed to clock in");
      const data: { staffCheckIn: StaffCheckIn } = await res.json();
      return data.staffCheckIn;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["staffCheckIns"] });
      queryClient.invalidateQueries({ queryKey: ["ratios"] });
    },
  });
}

export function useStaffClockOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/staff-check-ins/${id}/clock-out`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to clock out");
      const data: { staffCheckIn: StaffCheckIn } = await res.json();
      return data.staffCheckIn;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["staffCheckIns"] });
      queryClient.invalidateQueries({ queryKey: ["ratios"] });
    },
  });
}
```

- [ ] **Step 2: Create ratios hooks**

Create `apps/web/src/hooks/use-ratios.ts`:

```typescript
import type {
  RatioSnapshot,
  RatioViolation,
  RoomRatioStatus,
  ViolationNotesInput,
} from "@pebbledesk/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

export function useRatios() {
  return useQuery({
    queryKey: ["ratios"],
    queryFn: async () => {
      const res = await apiFetch("/api/ratios");
      if (!res.ok) throw new Error("Failed to fetch ratios");
      const data: { ratios: RoomRatioStatus[] } = await res.json();
      return data.ratios;
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

interface SnapshotFilters {
  classroomId?: string;
  from?: string;
  to?: string;
}

export function useRatioSnapshots(filters?: SnapshotFilters) {
  return useQuery({
    queryKey: ["ratioSnapshots", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.classroomId) params.set("classroomId", filters.classroomId);
      if (filters?.from) params.set("from", filters.from);
      if (filters?.to) params.set("to", filters.to);

      const query = params.toString();
      const path = `/api/ratios/snapshots${query ? `?${query}` : ""}`;
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("Failed to fetch snapshots");
      const data: { snapshots: RatioSnapshot[] } = await res.json();
      return data.snapshots;
    },
  });
}

interface ViolationFilters {
  classroomId?: string;
  status?: "open" | "resolved";
  from?: string;
  to?: string;
}

export function useRatioViolations(filters?: ViolationFilters) {
  return useQuery({
    queryKey: ["ratioViolations", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.classroomId) params.set("classroomId", filters.classroomId);
      if (filters?.status) params.set("status", filters.status);
      if (filters?.from) params.set("from", filters.from);
      if (filters?.to) params.set("to", filters.to);

      const query = params.toString();
      const path = `/api/ratios/violations${query ? `?${query}` : ""}`;
      const res = await apiFetch(path);
      if (!res.ok) throw new Error("Failed to fetch violations");
      const data: { violations: RatioViolation[] } = await res.json();
      return data.violations;
    },
  });
}

export function useUpdateViolationNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: ViolationNotesInput & { id: string }) => {
      const res = await apiFetch(`/api/ratios/violations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ resolutionNotes: input.resolutionNotes }),
      });
      if (!res.ok) throw new Error("Failed to update violation notes");
      const data: { violation: RatioViolation } = await res.json();
      return data.violation;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["ratioViolations"] });
    },
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/use-attendance.ts apps/web/src/hooks/use-ratios.ts
git commit -m "feat(web): add attendance and ratio TanStack Query hooks"
```

---

## Task 7: Attendance page UI

**Files:**
- Create: `apps/web/src/components/attendance-roster.tsx`
- Create: `apps/web/src/components/attendance-search.tsx`
- Create: `apps/web/src/routes/_auth/attendance.tsx`
- Modify: `apps/web/src/components/sidebar.tsx`

This task creates the attendance page with tabbed classroom roster, check-in/out rows, staff clock-in/out, and search. The implementing agent should follow the spec's UI design closely, including all micro-interactions (row color transitions, staggered fade-in, tab cross-fade, search expand, button press scale). Use Shadcn `Tabs`, `Input`, `Button`, `Badge` components. Reference `apps/web/src/routes/_auth/children/index.tsx` for the existing page pattern.

- [ ] **Step 1: Add Shadcn Progress component**

Run: `pnpm --filter @pebbledesk/ui dlx shadcn@latest add progress`

- [ ] **Step 2: Add Shadcn Tooltip component**

Run: `pnpm --filter @pebbledesk/ui dlx shadcn@latest add tooltip`

- [ ] **Step 3: Create attendance-roster component**

Create `apps/web/src/components/attendance-roster.tsx` — the classroom roster list showing children with their attendance status and check-in/out buttons. Each row has three visual states: checked-in (green bg `#f0fdf4`, green border, "Check Out" button), not-here (gray bg, muted text, blue "Check In" button), checked-out (red-tinted bg `#fef2f2`, red border, departure time). Rows sorted: checked-in first, then not-here, then checked-out. Include micro-interactions: press scale on buttons (`scale(0.97)`), row background color transition (300ms ease), staggered fade-in on load (50ms offset per row). Use the `useCheckIn()` and `useCheckOut()` mutation hooks.

- [ ] **Step 4: Create attendance-search component**

Create `apps/web/src/components/attendance-search.tsx` — expandable search bar that starts as an icon and expands to full input on focus (width transition). Searches children by name across all classrooms. Results show child name, classroom, and a "Check In" button if not already checked in. Uses `useChildren()` hook with search filter.

- [ ] **Step 5: Create attendance page**

Create `apps/web/src/routes/_auth/attendance.tsx` — the main attendance page. Uses Shadcn `Tabs` for classroom switching. Header shows page title + date, search bar, and staff clock-in/out button. Room info bar below tabs shows child count, staff count, compliance dot + ratio with number counter animation. Tab content cross-fades (150ms opacity transition). Directors see tabs for all rooms; staff sees only their assigned room. Includes a "Staff" secondary tab (directors only) showing staff assigned to the room with clock-in status.

- [ ] **Step 6: Update sidebar role filtering for Ratios**

In `apps/web/src/components/sidebar.tsx`, the Ratios nav item currently shows for all roles including `teacher`. Update: Ratios should only show for `owner` and `director`. Also note the sidebar uses `"teacher"` where the shared types use `"staff"` — this is a pre-existing mismatch but mention it in a code comment for future cleanup.

Change line 46 in sidebar.tsx:

```typescript
// Change roles for Ratios from:
roles: ["owner", "director", "teacher", "admin"],
// To:
roles: ["owner", "director"],
```

- [ ] **Step 7: Verify page renders**

Run: `pnpm --filter @pebbledesk/web dev` and navigate to `/attendance`. Verify the page loads with tabs and roster.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/attendance-roster.tsx apps/web/src/components/attendance-search.tsx apps/web/src/routes/_auth/attendance.tsx apps/web/src/components/sidebar.tsx
git commit -m "feat(web): add attendance page with tabbed roster, search, and staff clock-in"
```

---

## Task 8: Ratio dashboard page

**Files:**
- Create: `apps/web/src/components/ratio-card.tsx`
- Create: `apps/web/src/routes/_auth/ratios/index.tsx`

This task creates the ratio dashboard with color-coded cards. The implementing agent should follow the spec's visual design closely.

- [ ] **Step 1: Create ratio-card component**

Create `apps/web/src/components/ratio-card.tsx` — a single classroom ratio card with three states. **Compliant (green):** default border, green capacity bar, green ratio text, "Compliant" badge. **Near Limit (amber):** amber 2px border, amber capacity bar, amber ratio text, "Near Limit" badge, "1 more child triggers violation" warning. **Violation (red):** red 2px border, `#fef2f2` background, red capacity bar, red ratio text, "Violation" badge, "need X more staff" alert. Shows: room name, age group, required ratio, large staff/child/ratio numbers, capacity progress bar. Micro-interactions: hover lift (`translateY(-2px)`, shadow-md, 200ms ease), compliance badge color pulse on status change, capacity bar width animation (300ms ease-out), ratio number counter transition, red card subtle border glow pulse, amber card gentle border pulse. Card is clickable (receives `onClick` prop to navigate to attendance page).

- [ ] **Step 2: Create ratios index page**

Create `apps/web/src/routes/_auth/ratios/index.tsx` — the ratio dashboard. Header with title "Staff-to-Child Ratios", subtitle "Live · Updates every 15 seconds", summary pills (compliant/near-limit/violation counts), "View History" link to `/ratios/history`. 2-column card grid of `RatioCard` components. Poll indicator dot in header that briefly flashes on each successful refetch. Uses `useRatios()` hook. Skeleton loading state with card-shaped skeleton loaders. Click a card → navigate to `/attendance` with `?room=classroomId` search param.

- [ ] **Step 3: Verify page renders**

Run: `pnpm --filter @pebbledesk/web dev` and navigate to `/ratios`. Verify cards render with mock data from the API.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ratio-card.tsx apps/web/src/routes/_auth/ratios/index.tsx
git commit -m "feat(web): add ratio dashboard with color-coded compliance cards"
```

---

## Task 9: Ratio history page

**Files:**
- Create: `apps/web/src/components/violation-card.tsx`
- Create: `apps/web/src/routes/_auth/ratios/history.tsx`

- [ ] **Step 1: Create violation-card component**

Create `apps/web/src/components/violation-card.tsx` — a violation record card with two states. **Open:** red left border (4px), live elapsed duration (updates every minute via `setInterval`), "Add Resolution Notes" button that expands inline textarea with smooth height transition. **Resolved with notes:** green left border, notes shown inline in green `#f0fdf4` panel, duration shown. **Resolved without notes:** green left border, "Add Notes" button with subtle prompt text. Shows: room name, age group, detected timestamp, staff/child counts (from associated snapshot), actual ratio. Micro-interactions: staggered fade-in on load, textarea expansion with smooth height transition.

- [ ] **Step 2: Create ratio history page**

Create `apps/web/src/routes/_auth/ratios/history.tsx` — two tabs: Violations (primary) and Snapshots. Header with title "Ratio History" and filters (room dropdown, date range, status dropdown). Violations tab: list of `ViolationCard` components using `useRatioViolations()`. Snapshots tab: Shadcn `Table` of `ratio_snapshots` records using `useRatioSnapshots()` — columns: timestamp, room, staff count, children count, required ratio, actual ratio, compliance badge. Filter changes cross-fade list to new results. Uses `useUpdateViolationNotes()` mutation for adding notes.

- [ ] **Step 3: Verify page renders**

Run: `pnpm --filter @pebbledesk/web dev` and navigate to `/ratios/history`. Verify tabs, filters, and violation cards render.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/violation-card.tsx apps/web/src/routes/_auth/ratios/history.tsx
git commit -m "feat(web): add ratio history page with violations and snapshots"
```

---

## Task 10: Attendance calendar on child profile

**Files:**
- Create: `apps/web/src/components/attendance-calendar.tsx`
- Modify: `apps/web/src/routes/_auth/children/$id.tsx`

- [ ] **Step 1: Create attendance-calendar component**

Create `apps/web/src/components/attendance-calendar.tsx` — a month calendar showing attendance history for a single child. Takes `childId` prop. Summary stats bar (4 cards): days attended, attendance rate %, avg hours/day, partial days count. Calendar grid: Sun–Sat, day cells color-coded (green `#dcfce7` for 6+ hours, amber `#fef3c7` for <6 hours, light gray `#fafafa` for absent/weekend, blue ring for today). Each attended day shows hours inside cell. Click a day → detail panel slides open below calendar (250ms ease height animation) showing check-in time, check-out time, who performed each, classroom name, total hours, notes. Month navigation with ← → arrows, stats update per month. Summary stat numbers use counter animation on month change. Day cells have hover scale (`scale(1.05)`) with subtle shadow. Calendar grid cross-fades between months (200ms). Uses `useCheckInHistory()` hook.

- [ ] **Step 2: Replace placeholder on child profile**

In `apps/web/src/routes/_auth/children/$id.tsx`, find the "Attendance History" card placeholder (around line 229-237):

```tsx
<Card>
  <CardHeader>
    <CardTitle className="text-gray-400">Attendance History</CardTitle>
  </CardHeader>
  <CardContent>
    <p className="text-sm text-gray-400">Coming in Phase 3</p>
  </CardContent>
</Card>
```

Replace with:

```tsx
<AttendanceCalendar childId={id} />
```

Add the import at the top of the file:

```typescript
import { AttendanceCalendar } from "../../../components/attendance-calendar";
```

The calendar now spans the full width of the two-column grid. Update the grid wrapper to make the attendance calendar full-width:

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="md:col-span-2">
    <AttendanceCalendar childId={id} />
  </div>
  <Card>
    <CardHeader>
      <CardTitle className="text-gray-400">Subsidy Info</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-gray-400">Coming in Phase 4</p>
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 3: Verify calendar renders on child profile**

Run: `pnpm --filter @pebbledesk/web dev` and navigate to `/children/:id`. Verify the attendance calendar replaces the placeholder.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/attendance-calendar.tsx apps/web/src/routes/_auth/children/\$id.tsx
git commit -m "feat(web): add attendance calendar to child profile, replacing Phase 3 placeholder"
```

---

## Task 11: Typecheck and lint

**Files:** All modified files

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. Fix any type errors.

- [ ] **Step 2: Run linter**

Run: `pnpm lint`
Expected: PASS. Fix any lint errors with `pnpm lint:fix`.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS across all packages.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "chore: fix typecheck and lint issues"
```

---

## Task Dependencies

```
Task 1 (shared types/validators) — no dependencies
Task 2 (ratio service) — depends on Task 1
Task 3 (check-in routes) — depends on Task 1, Task 2
Task 4 (staff check-in routes) — depends on Task 1, Task 2
Task 5 (ratio routes) — depends on Task 1
Task 6 (frontend hooks) — depends on Task 1
Task 7 (attendance page) — depends on Task 6
Task 8 (ratio dashboard) — depends on Task 6
Task 9 (ratio history) — depends on Task 6
Task 10 (attendance calendar) — depends on Task 6
Task 11 (typecheck/lint) — depends on all

Parallelizable groups:
- Group 1: Task 1
- Group 2: Task 2, Task 5, Task 6 (after Task 1)
- Group 3: Task 3, Task 4, Task 7, Task 8, Task 9, Task 10 (after their dependencies)
- Group 4: Task 11 (after all)
```
