# Phase 2: Core Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CRUD API routes and UI pages for classrooms, children, and guardians — plus a multi-step enrollment wizard — so directors can manage their center's roster end-to-end.

**Architecture:** Three API route files (classrooms, children, guardians) following the existing Hono pattern in `apps/api`. TanStack Router file-based routes in `apps/web` with TanStack Query hooks for data fetching. Shared Zod validators handle input validation on both API and client. Shadcn components for all UI controls.

**Tech Stack:** Hono, Drizzle ORM, Neon (neon-http), Zod, React 19, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Vitest, Biome.

**Spec:** `docs/superpowers/specs/2026-04-07-phase2-core-features-design.md`

---

## File Structure

```
packages/shared/src/
├── constants/enums.ts                   — MODIFY: align age groups to 6 DB values
├── types/child.ts                       — MODIFY: fix Child type, remove Guardian (moved)
├── types/guardian.ts                    — CREATE: standalone Guardian type
├── types/classroom.ts                   — MODIFY: fix Classroom type, add archivedAt
├── types/index.ts                       — MODIFY: export guardian type
├── validators/child.ts                  — MODIFY: update age group refs, fix guardian validator
├── validators/guardian.ts               — CREATE: standalone guardian validators
├── validators/classroom.ts              — MODIFY: update age group refs
├── validators/enrollment.ts             — CREATE: enrollment transaction validator
├── validators/index.ts                  — MODIFY: export new validators

packages/db/src/schema/
├── classrooms.ts                        — MODIFY: add archivedAt column
├── guardians.ts                         — MODIFY: add relationship to child_guardians

apps/api/src/
├── routes/classrooms.ts                 — CREATE: classrooms CRUD + assignment routes
├── routes/children.ts                   — CREATE: children CRUD + guardian link + enroll
├── routes/guardians.ts                  — CREATE: guardians CRUD
├── index.ts                             — MODIFY: mount new routes
├── routes/classrooms.test.ts            — CREATE: classrooms route tests
├── routes/children.test.ts              — CREATE: children route tests
├── routes/guardians.test.ts             — CREATE: guardians route tests
├── test/setup.ts                        — CREATE: shared test helpers (db, auth mock)

packages/ui/src/components/
├── input.tsx                            — CREATE: Shadcn Input
├── label.tsx                            — CREATE: Shadcn Label
├── select.tsx                           — CREATE: Shadcn Select
├── dialog.tsx                           — CREATE: Shadcn Dialog
├── card.tsx                             — CREATE: Shadcn Card
├── badge.tsx                            — CREATE: Shadcn Badge
├── table.tsx                            — CREATE: Shadcn Table
├── tabs.tsx                             — CREATE: Shadcn Tabs
├── skeleton.tsx                         — CREATE: Shadcn Skeleton
├── separator.tsx                        — CREATE: Shadcn Separator
├── popover.tsx                          — CREATE: Shadcn Popover
├── calendar.tsx                         — CREATE: Shadcn Calendar
├── command.tsx                          — CREATE: Shadcn Command
├── checkbox.tsx                         — CREATE: Shadcn Checkbox
├── index.ts                             — MODIFY: export new components

apps/web/src/
├── hooks/use-classrooms.ts              — CREATE: TanStack Query hooks for classrooms
├── hooks/use-children.ts                — CREATE: TanStack Query hooks for children
├── hooks/use-guardians.ts               — CREATE: TanStack Query hooks for guardians
├── components/status-badge.tsx           — CREATE: reusable status pill badge
├── components/empty-state.tsx            — CREATE: reusable empty state
├── components/capacity-bar.tsx           — CREATE: reusable capacity progress bar
├── routes/_auth/classrooms/index.tsx     — CREATE: classrooms list page
├── routes/_auth/classrooms/$id.tsx       — CREATE: classroom detail page
├── routes/_auth/children/index.tsx       — CREATE: children list page
├── routes/_auth/children/$id.tsx         — CREATE: child profile page
├── routes/_auth/children/enroll.tsx      — CREATE: enrollment wizard
├── routes/_auth/guardians/index.tsx      — CREATE: guardians list page
├── routes/_auth/guardians/$id.tsx        — CREATE: guardian detail page
```

---

## Task 1: Schema Changes + Migration

**Files:**
- Modify: `packages/db/src/schema/classrooms.ts`
- Modify: `packages/db/src/schema/guardians.ts`
- Modify: `packages/shared/src/constants/enums.ts`
- Modify: `packages/shared/src/types/child.ts`
- Create: `packages/shared/src/types/guardian.ts`
- Modify: `packages/shared/src/types/classroom.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/validators/child.ts`
- Create: `packages/shared/src/validators/guardian.ts`
- Modify: `packages/shared/src/validators/classroom.ts`
- Create: `packages/shared/src/validators/enrollment.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Add `archivedAt` to classrooms schema**

In `packages/db/src/schema/classrooms.ts`, add to the `classrooms` table definition:

```typescript
archivedAt: timestamp("archived_at", { withTimezone: true }),
```

Add it after the `createdAt` field.

- [ ] **Step 2: Add `relationship` to child_guardians schema**

In `packages/db/src/schema/guardians.ts`, add to the `child_guardians` table definition, inside the first argument object (before the composite primary key function):

```typescript
relationship: text("relationship"),
```

Add it after the `authorizedPickup` field.

- [ ] **Step 3: Align age group enum in shared constants**

Replace the contents of `packages/shared/src/constants/enums.ts` `AGE_GROUPS` constant:

```typescript
export const AGE_GROUPS = ["infant", "young_toddler", "toddler", "preschool", "pre_k", "school_age"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];
```

- [ ] **Step 4: Fix Child type**

Replace `packages/shared/src/types/child.ts` with:

```typescript
import type { AgeGroup, EnrollmentStatus } from "../constants/enums.js";

export interface Child {
  id: string;
  centerId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  ageGroup: AgeGroup;
  enrollmentStatus: EnrollmentStatus;
  subsidyEligible: boolean;
  enrolledAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
}

export interface ChildWithDetails extends Child {
  currentClassroom: {
    id: string;
    name: string;
    ageGroup: AgeGroup;
    assignmentId: string;
    effectiveDate: string;
  } | null;
  guardians: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    isPrimary: boolean;
    authorizedPickup: boolean;
    relationship: string | null;
  }>;
  primaryGuardianName: string | null;
}
```

- [ ] **Step 5: Create standalone Guardian type**

Create `packages/shared/src/types/guardian.ts`:

```typescript
export interface Guardian {
  id: string;
  centerId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianWithChildren extends Guardian {
  children: Array<{
    id: string;
    firstName: string;
    lastName: string;
    enrollmentStatus: string;
    classroomName: string | null;
    isPrimary: boolean;
    authorizedPickup: boolean;
    relationship: string | null;
  }>;
}
```

- [ ] **Step 6: Fix Classroom type**

Replace `packages/shared/src/types/classroom.ts` with:

```typescript
import type { AgeGroup } from "../constants/enums.js";

export interface Classroom {
  id: string;
  centerId: string;
  name: string;
  ageGroup: AgeGroup;
  maxCapacity: number;
  minRatioStaff: number;
  minRatioChildren: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface ClassroomWithCounts extends Classroom {
  childCount: number;
  staffCount: number;
}
```

- [ ] **Step 7: Update shared type index**

In `packages/shared/src/types/index.ts`, add the export:

```typescript
export * from "./guardian.js";
```

- [ ] **Step 8: Update child validators**

Replace `packages/shared/src/validators/child.ts` with:

```typescript
import { z } from "zod";
import { AGE_GROUPS, ENROLLMENT_STATUSES } from "../constants/enums.js";

export const createChildSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().date(),
  ageGroup: z.enum(AGE_GROUPS),
  enrollmentStatus: z.enum(ENROLLMENT_STATUSES).default("active"),
  subsidyEligible: z.boolean().default(false),
});

export const updateChildSchema = createChildSchema.partial();

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
```

- [ ] **Step 9: Create standalone guardian validators**

Create `packages/shared/src/validators/guardian.ts`:

```typescript
import { z } from "zod";

export const createGuardianSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(20).optional(),
});

export const updateGuardianSchema = createGuardianSchema.partial();

export const linkGuardianSchema = z.object({
  guardianId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  authorizedPickup: z.boolean().default(true),
  relationship: z.string().max(100).optional(),
});

export const updateGuardianLinkSchema = z.object({
  isPrimary: z.boolean().optional(),
  authorizedPickup: z.boolean().optional(),
  relationship: z.string().max(100).optional(),
});

export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
export type LinkGuardianInput = z.infer<typeof linkGuardianSchema>;
export type UpdateGuardianLinkInput = z.infer<typeof updateGuardianLinkSchema>;
```

- [ ] **Step 10: Update classroom validators**

The existing `packages/shared/src/validators/classroom.ts` already references `AGE_GROUPS` which we updated in Step 3. No code change needed — just verify it still compiles after the enum update.

- [ ] **Step 11: Create enrollment validator**

Create `packages/shared/src/validators/enrollment.ts`:

```typescript
import { z } from "zod";
import { AGE_GROUPS, ENROLLMENT_STATUSES } from "../constants/enums.js";

const newGuardianSchema = z.object({
  type: z.literal("new"),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(7).max(20).optional(),
  isPrimary: z.boolean().default(false),
  authorizedPickup: z.boolean().default(true),
  relationship: z.string().max(100).optional(),
});

const existingGuardianSchema = z.object({
  type: z.literal("existing"),
  guardianId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  authorizedPickup: z.boolean().default(true),
  relationship: z.string().max(100).optional(),
});

export const enrollChildSchema = z.object({
  child: z.object({
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    dateOfBirth: z.string().date(),
    ageGroup: z.enum(AGE_GROUPS),
    enrollmentStatus: z.enum(ENROLLMENT_STATUSES).default("active"),
    subsidyEligible: z.boolean().default(false),
  }),
  guardians: z.array(z.discriminatedUnion("type", [newGuardianSchema, existingGuardianSchema])).min(1),
  classroom: z.object({
    classroomId: z.string().uuid(),
    effectiveDate: z.string().date(),
  }).optional(),
});

export type EnrollChildInput = z.infer<typeof enrollChildSchema>;
```

- [ ] **Step 12: Update validator index**

In `packages/shared/src/validators/index.ts`, add:

```typescript
export * from "./guardian.js";
export * from "./enrollment.js";
```

- [ ] **Step 13: Generate migration**

Run:

```bash
pnpm db:generate
```

This will generate a migration for the `archived_at` column on classrooms and `relationship` column on child_guardians.

- [ ] **Step 14: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: All packages pass. If there are errors from other packages referencing the old `Guardian` type from `child.ts`, fix those imports.

- [ ] **Step 15: Run lint**

Run:

```bash
pnpm lint
```

Fix any issues.

- [ ] **Step 16: Commit**

```bash
git add packages/db/src/schema/classrooms.ts packages/db/src/schema/guardians.ts packages/shared/src/ drizzle/
git commit -m "feat: schema changes for Phase 2 — archivedAt, relationship, type fixes"
```

---

## Task 2: API Test Setup

**Files:**
- Create: `apps/api/src/test/setup.ts`

The API currently has no tests. We need a test helper that creates an in-memory-ish test app so route tests can make real HTTP requests against Hono without needing a live database. We'll use Vitest with Hono's `app.request()` for fast handler testing, and mock the DB layer.

- [ ] **Step 1: Create test setup helper**

Create `apps/api/src/test/setup.ts`:

```typescript
import { Hono } from "hono";
import type { AppEnv, Variables } from "../lib/context.js";

type MockDb = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

function createMockChain(terminal: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler = (): typeof proxy => proxy;
  const proxy: Record<string, unknown> = new Proxy(chain, {
    get(target, prop: string) {
      if (prop === "then") return undefined;
      if (!target[prop]) {
        target[prop] = vi.fn().mockImplementation((..._args: unknown[]) => {
          if (prop === "returning" || prop === "limit" || prop === "execute") {
            return Promise.resolve(terminal);
          }
          return proxy;
        });
      }
      return target[prop];
    },
  });
  return proxy;
}

export function createMockDb(overrides?: Partial<MockDb>): MockDb {
  return {
    select: vi.fn().mockReturnValue(createMockChain([])),
    insert: vi.fn().mockReturnValue(createMockChain([])),
    update: vi.fn().mockReturnValue(createMockChain([])),
    delete: vi.fn().mockReturnValue(createMockChain([])),
    transaction: vi.fn().mockImplementation(async (fn: (tx: MockDb) => Promise<unknown>) => {
      const txDb = createMockDb();
      return fn(txDb as unknown as MockDb);
    }),
    ...overrides,
  } as MockDb;
}

export interface TestContext {
  userId: string;
  centerId: string;
  membershipId: string;
  role: Variables["role"];
}

const defaultContext: TestContext = {
  userId: "user-1",
  centerId: "center-1",
  membershipId: "membership-1",
  role: "owner",
};

export function createTestApp(
  mountRoutes: (app: Hono<AppEnv>) => void,
  db: MockDb,
  ctx?: Partial<TestContext>,
) {
  const context = { ...defaultContext, ...ctx };
  const app = new Hono<AppEnv>();

  // Inject mock db + auth context
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as Variables["db"]);
    c.set("auth", {} as unknown as Variables["auth"]);
    c.set("userId", context.userId);
    c.set("centerId", context.centerId);
    c.set("membershipId", context.membershipId);
    c.set("role", context.role);
    await next();
  });

  mountRoutes(app);
  return app;
}

export function jsonBody(data: unknown) {
  return {
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export function patchBody(data: unknown) {
  return {
    method: "PATCH" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}
```

- [ ] **Step 2: Verify test setup compiles**

Run:

```bash
pnpm --filter @pebbledesk/api typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test/setup.ts
git commit -m "feat: add API test setup helpers"
```

---

## Task 3: Classrooms API Routes

**Files:**
- Create: `apps/api/src/routes/classrooms.ts`
- Create: `apps/api/src/routes/classrooms.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for classrooms CRUD**

Create `apps/api/src/routes/classrooms.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb, createTestApp, jsonBody, patchBody, type TestContext } from "../test/setup.js";
import { classroomsRoutes } from "./classrooms.js";
import type { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";

function mountClassrooms(app: Hono<AppEnv>) {
  app.route("/api/classrooms", classroomsRoutes);
}

describe("classrooms routes", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("GET /api/classrooms", () => {
    it("returns list of classrooms", async () => {
      const mockClassrooms = [
        { id: "room-1", centerId: "center-1", name: "Butterfly Room", ageGroup: "toddler", maxCapacity: 12, minRatioStaff: 1, minRatioChildren: 4, createdAt: new Date(), archivedAt: null, childCount: 8, staffCount: 2 },
      ];
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                groupBy: vi.fn().mockResolvedValue(mockClassrooms),
              }),
            }),
          }),
        }),
      });

      const app = createTestApp(mountClassrooms, db);
      const res = await app.request("/api/classrooms");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.classrooms).toBeDefined();
    });
  });

  describe("POST /api/classrooms", () => {
    it("creates a classroom with valid input", async () => {
      const newRoom = { id: "room-new", centerId: "center-1", name: "Sunshine Room", ageGroup: "preschool", maxCapacity: 20, minRatioStaff: 1, minRatioChildren: 10, createdAt: new Date(), archivedAt: null };
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newRoom]),
        }),
      });

      const app = createTestApp(mountClassrooms, db);
      const res = await app.request("/api/classrooms", jsonBody({
        name: "Sunshine Room",
        ageGroup: "preschool",
        maxCapacity: 20,
        minRatioStaff: 1,
        minRatioChildren: 10,
      }));

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.classroom.name).toBe("Sunshine Room");
    });

    it("rejects staff role", async () => {
      const app = createTestApp(mountClassrooms, db, { role: "staff" });
      const res = await app.request("/api/classrooms", jsonBody({
        name: "Test", ageGroup: "toddler", maxCapacity: 12, minRatioStaff: 1, minRatioChildren: 4,
      }));

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/classrooms/:id/archive", () => {
    it("sets archivedAt on the classroom", async () => {
      const archived = { id: "room-1", archivedAt: new Date() };
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([archived]),
          }),
        }),
      });

      const app = createTestApp(mountClassrooms, db);
      const res = await app.request("/api/classrooms/room-1/archive", { method: "POST" });

      expect(res.status).toBe(200);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/classrooms.test.ts
```

Expected: FAIL — module `./classrooms.js` not found.

- [ ] **Step 3: Implement classrooms routes**

Create `apps/api/src/routes/classrooms.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import {
  classrooms,
  classroomAssignments,
  staffAssignments,
  children,
  memberships,
  users,
} from "@pebbledesk/db";
import { createClassroomSchema, updateClassroomSchema } from "@pebbledesk/shared";
import { and, eq, isNull, sql, count } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const classroomsRoutes = new Hono<AppEnv>();

// GET / — list classrooms with child/staff counts
classroomsRoutes.get("/", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const ageGroup = c.req.query("ageGroup");
  const includeArchived = c.req.query("includeArchived") === "true";

  const conditions = [eq(classrooms.centerId, centerId)];
  if (!includeArchived) {
    conditions.push(isNull(classrooms.archivedAt));
  }
  if (ageGroup) {
    conditions.push(eq(classrooms.ageGroup, ageGroup as typeof classrooms.ageGroup.enumValues[number]));
  }

  const results = await db
    .select({
      id: classrooms.id,
      centerId: classrooms.centerId,
      name: classrooms.name,
      ageGroup: classrooms.ageGroup,
      maxCapacity: classrooms.maxCapacity,
      minRatioStaff: classrooms.minRatioStaff,
      minRatioChildren: classrooms.minRatioChildren,
      createdAt: classrooms.createdAt,
      archivedAt: classrooms.archivedAt,
      childCount: sql<number>`count(distinct ${classroomAssignments.childId})`.as("child_count"),
      staffCount: sql<number>`count(distinct ${staffAssignments.membershipId})`.as("staff_count"),
    })
    .from(classrooms)
    .leftJoin(
      classroomAssignments,
      and(
        eq(classroomAssignments.classroomId, classrooms.id),
        isNull(classroomAssignments.endDate),
      ),
    )
    .leftJoin(
      staffAssignments,
      and(
        eq(staffAssignments.classroomId, classrooms.id),
        isNull(staffAssignments.endDate),
      ),
    )
    .where(and(...conditions))
    .groupBy(classrooms.id);

  return c.json({ classrooms: results });
});

// GET /:id — get single classroom with counts
classroomsRoutes.get("/:id", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [classroom] = await db
    .select({
      id: classrooms.id,
      centerId: classrooms.centerId,
      name: classrooms.name,
      ageGroup: classrooms.ageGroup,
      maxCapacity: classrooms.maxCapacity,
      minRatioStaff: classrooms.minRatioStaff,
      minRatioChildren: classrooms.minRatioChildren,
      createdAt: classrooms.createdAt,
      archivedAt: classrooms.archivedAt,
      childCount: sql<number>`count(distinct ${classroomAssignments.childId})`.as("child_count"),
      staffCount: sql<number>`count(distinct ${staffAssignments.membershipId})`.as("staff_count"),
    })
    .from(classrooms)
    .leftJoin(
      classroomAssignments,
      and(
        eq(classroomAssignments.classroomId, classrooms.id),
        isNull(classroomAssignments.endDate),
      ),
    )
    .leftJoin(
      staffAssignments,
      and(
        eq(staffAssignments.classroomId, classrooms.id),
        isNull(staffAssignments.endDate),
      ),
    )
    .where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
    .groupBy(classrooms.id)
    .limit(1);

  if (!classroom) notFound("Classroom not found");

  return c.json({ classroom });
});

// POST / — create classroom
classroomsRoutes.post(
  "/",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", createClassroomSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const data = c.req.valid("json");

    const [classroom] = await db
      .insert(classrooms)
      .values({
        centerId,
        name: data.name,
        ageGroup: data.ageGroup,
        maxCapacity: data.maxCapacity,
        minRatioStaff: data.minRatioStaff,
        minRatioChildren: data.minRatioChildren,
      })
      .returning();

    if (!classroom) throw new Error("Failed to create classroom");

    return c.json({ classroom }, 201);
  },
);

// PATCH /:id — update classroom
classroomsRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", updateClassroomSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const [updated] = await db
      .update(classrooms)
      .set(data)
      .where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
      .returning();

    if (!updated) notFound("Classroom not found");

    return c.json({ classroom: updated });
  },
);

// POST /:id/archive
classroomsRoutes.post("/:id/archive", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [updated] = await db
    .update(classrooms)
    .set({ archivedAt: new Date() })
    .where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
    .returning();

  if (!updated) notFound("Classroom not found");

  return c.json({ classroom: updated });
});

// POST /:id/unarchive
classroomsRoutes.post("/:id/unarchive", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [updated] = await db
    .update(classrooms)
    .set({ archivedAt: null })
    .where(and(eq(classrooms.id, id), eq(classrooms.centerId, centerId)))
    .returning();

  if (!updated) notFound("Classroom not found");

  return c.json({ classroom: updated });
});

// GET /:id/children — list children assigned to classroom
classroomsRoutes.get("/:id/children", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const classroomId = c.req.param("id");

  const results = await db
    .select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      dateOfBirth: children.dateOfBirth,
      ageGroup: children.ageGroup,
      enrollmentStatus: children.enrollmentStatus,
      assignmentId: classroomAssignments.id,
      effectiveDate: classroomAssignments.effectiveDate,
    })
    .from(classroomAssignments)
    .innerJoin(children, eq(children.id, classroomAssignments.childId))
    .where(
      and(
        eq(classroomAssignments.classroomId, classroomId),
        eq(classroomAssignments.centerId, centerId),
        isNull(classroomAssignments.endDate),
      ),
    );

  return c.json({ children: results });
});

// GET /:id/staff — list staff assigned to classroom
classroomsRoutes.get("/:id/staff", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const classroomId = c.req.param("id");

  const results = await db
    .select({
      membershipId: staffAssignments.membershipId,
      assignmentId: staffAssignments.id,
      effectiveDate: staffAssignments.effectiveDate,
      role: memberships.role,
      userName: users.name,
      userEmail: users.email,
    })
    .from(staffAssignments)
    .innerJoin(memberships, eq(memberships.id, staffAssignments.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(staffAssignments.classroomId, classroomId),
        eq(staffAssignments.centerId, centerId),
        isNull(staffAssignments.endDate),
      ),
    );

  return c.json({ staff: results });
});

// POST /:id/children — assign child to classroom
const assignChildSchema = z.object({
  childId: z.string().uuid(),
  effectiveDate: z.string().date(),
});

classroomsRoutes.post(
  "/:id/children",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", assignChildSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const classroomId = c.req.param("id");
    const { childId, effectiveDate } = c.req.valid("json");

    // End any existing assignment for this child
    await db
      .update(classroomAssignments)
      .set({ endDate: effectiveDate })
      .where(
        and(
          eq(classroomAssignments.childId, childId),
          eq(classroomAssignments.centerId, centerId),
          isNull(classroomAssignments.endDate),
        ),
      );

    const [assignment] = await db
      .insert(classroomAssignments)
      .values({
        centerId,
        childId,
        classroomId,
        effectiveDate,
      })
      .returning();

    return c.json({ assignment }, 201);
  },
);

// DELETE /:id/children/:childId — end child assignment
classroomsRoutes.delete("/:id/children/:childId", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const classroomId = c.req.param("id");
  const childId = c.req.param("childId");
  const today = new Date().toISOString().split("T")[0];

  const [updated] = await db
    .update(classroomAssignments)
    .set({ endDate: today })
    .where(
      and(
        eq(classroomAssignments.classroomId, classroomId),
        eq(classroomAssignments.childId, childId),
        eq(classroomAssignments.centerId, centerId),
        isNull(classroomAssignments.endDate),
      ),
    )
    .returning();

  if (!updated) notFound("Assignment not found");

  return c.json({ success: true });
});

// POST /:id/staff — assign staff to classroom
const assignStaffSchema = z.object({
  membershipId: z.string().uuid(),
  effectiveDate: z.string().date(),
});

classroomsRoutes.post(
  "/:id/staff",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", assignStaffSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const classroomId = c.req.param("id");
    const { membershipId, effectiveDate } = c.req.valid("json");

    const [assignment] = await db
      .insert(staffAssignments)
      .values({
        centerId,
        membershipId,
        classroomId,
        effectiveDate,
      })
      .returning();

    return c.json({ assignment }, 201);
  },
);

// DELETE /:id/staff/:membershipId — end staff assignment
classroomsRoutes.delete("/:id/staff/:membershipId", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const classroomId = c.req.param("id");
  const membershipId = c.req.param("membershipId");
  const today = new Date().toISOString().split("T")[0];

  const [updated] = await db
    .update(staffAssignments)
    .set({ endDate: today })
    .where(
      and(
        eq(staffAssignments.classroomId, classroomId),
        eq(staffAssignments.membershipId, membershipId),
        eq(staffAssignments.centerId, centerId),
        isNull(staffAssignments.endDate),
      ),
    )
    .returning();

  if (!updated) notFound("Assignment not found");

  return c.json({ success: true });
});

export { classroomsRoutes };
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/classrooms.test.ts
```

Expected: Tests pass. If mock chain doesn't match the actual query structure, adjust the mock setup in the test.

- [ ] **Step 5: Mount classrooms routes**

In `apps/api/src/index.ts`, add the import and route:

```typescript
import { classroomsRoutes } from "./routes/classrooms.js";
```

And in the routes section:

```typescript
app.route("/api/classrooms", classroomsRoutes);
```

- [ ] **Step 6: Typecheck**

Run:

```bash
pnpm --filter @pebbledesk/api typecheck
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/classrooms.ts apps/api/src/routes/classrooms.test.ts apps/api/src/index.ts
git commit -m "feat: classrooms CRUD + assignment API routes with tests"
```

---

## Task 4: Children API Routes

**Files:**
- Create: `apps/api/src/routes/children.ts`
- Create: `apps/api/src/routes/children.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for children CRUD**

Create `apps/api/src/routes/children.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";
import { childrenRoutes } from "./children.js";
import type { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";

function mountChildren(app: Hono<AppEnv>) {
  app.route("/api/children", childrenRoutes);
}

describe("children routes", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("POST /api/children", () => {
    it("creates a child with valid input", async () => {
      const newChild = {
        id: "child-1", centerId: "center-1", firstName: "Sophia", lastName: "Martinez",
        dateOfBirth: "2023-03-15", ageGroup: "toddler", enrollmentStatus: "active",
        subsidyEligible: false, enrolledAt: new Date(), withdrawnAt: null, createdAt: new Date(),
      };
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newChild]),
        }),
      });

      const app = createTestApp(mountChildren, db);
      const res = await app.request("/api/children", jsonBody({
        firstName: "Sophia", lastName: "Martinez", dateOfBirth: "2023-03-15",
        ageGroup: "toddler", enrollmentStatus: "active", subsidyEligible: false,
      }));

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.child.firstName).toBe("Sophia");
    });

    it("rejects staff role", async () => {
      const app = createTestApp(mountChildren, db, { role: "staff" });
      const res = await app.request("/api/children", jsonBody({
        firstName: "Test", lastName: "Child", dateOfBirth: "2023-01-01", ageGroup: "toddler",
      }));

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/children/:id/withdraw", () => {
    it("sets status to withdrawn", async () => {
      const withdrawn = { id: "child-1", enrollmentStatus: "withdrawn", withdrawnAt: new Date() };
      db.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([withdrawn]),
          }),
        }),
      });

      const app = createTestApp(mountChildren, db);
      const res = await app.request("/api/children/child-1/withdraw", { method: "POST" });

      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/children/enroll", () => {
    it("creates child + guardian + assignment in transaction", async () => {
      const mockChild = { id: "child-new", firstName: "Sophia" };
      const mockGuardian = { id: "guardian-new", firstName: "Maria" };
      const mockAssignment = { id: "assign-new" };

      db.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const txDb = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn()
                .mockResolvedValueOnce([mockChild])
                .mockResolvedValueOnce([mockGuardian])
                .mockResolvedValueOnce([{}]) // child_guardian link
                .mockResolvedValueOnce([mockAssignment]),
            }),
          }),
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: "guardian-existing" }]),
              }),
            }),
          }),
        };
        return fn(txDb);
      });

      const app = createTestApp(mountChildren, db);
      const res = await app.request("/api/children/enroll", jsonBody({
        child: {
          firstName: "Sophia", lastName: "Martinez", dateOfBirth: "2023-03-15",
          ageGroup: "toddler", enrollmentStatus: "active", subsidyEligible: false,
        },
        guardians: [
          { type: "new", firstName: "Maria", lastName: "Martinez", email: "maria@test.com", phone: "5551234567", isPrimary: true, authorizedPickup: true },
        ],
        classroom: { classroomId: "room-1", effectiveDate: "2026-04-07" },
      }));

      expect(res.status).toBe(201);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/children.test.ts
```

Expected: FAIL — module `./children.js` not found.

- [ ] **Step 3: Implement children routes**

Create `apps/api/src/routes/children.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import {
  children,
  classrooms,
  classroomAssignments,
  guardians,
  childGuardians,
  staffAssignments,
} from "@pebbledesk/db";
import {
  createChildSchema,
  updateChildSchema,
  enrollChildSchema,
  linkGuardianSchema,
  updateGuardianLinkSchema,
} from "@pebbledesk/shared";
import { and, eq, isNull, or, ilike, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const childrenRoutes = new Hono<AppEnv>();

// GET / — list children
childrenRoutes.get("/", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  const role = c.get("role");
  const membershipId = c.get("membershipId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const search = c.req.query("search");
  const status = c.req.query("status");
  const ageGroup = c.req.query("ageGroup");
  const classroomId = c.req.query("classroomId");

  const conditions = [eq(children.centerId, centerId)];

  if (status) {
    conditions.push(eq(children.enrollmentStatus, status as typeof children.enrollmentStatus.enumValues[number]));
  } else {
    // Default: hide withdrawn
    conditions.push(
      or(
        eq(children.enrollmentStatus, "active"),
        eq(children.enrollmentStatus, "waitlist"),
      )!,
    );
  }

  if (ageGroup) {
    conditions.push(eq(children.ageGroup, ageGroup as typeof children.ageGroup.enumValues[number]));
  }

  if (search) {
    conditions.push(
      or(
        ilike(children.firstName, `%${search}%`),
        ilike(children.lastName, `%${search}%`),
      )!,
    );
  }

  // Staff: filter to their assigned classroom
  if (role === "staff") {
    const staffRooms = await db
      .select({ classroomId: staffAssignments.classroomId })
      .from(staffAssignments)
      .where(
        and(
          eq(staffAssignments.membershipId, membershipId),
          eq(staffAssignments.centerId, centerId),
          isNull(staffAssignments.endDate),
        ),
      );

    const roomIds = staffRooms.map((r) => r.classroomId);
    if (roomIds.length === 0) {
      return c.json({ children: [] });
    }

    // Get children assigned to staff's rooms
    const childIds = await db
      .select({ childId: classroomAssignments.childId })
      .from(classroomAssignments)
      .where(
        and(
          sql`${classroomAssignments.classroomId} IN ${roomIds}`,
          eq(classroomAssignments.centerId, centerId),
          isNull(classroomAssignments.endDate),
        ),
      );

    if (childIds.length === 0) {
      return c.json({ children: [] });
    }

    conditions.push(sql`${children.id} IN ${childIds.map((c) => c.childId)}`);
  }

  if (classroomId) {
    const assigned = await db
      .select({ childId: classroomAssignments.childId })
      .from(classroomAssignments)
      .where(
        and(
          eq(classroomAssignments.classroomId, classroomId),
          eq(classroomAssignments.centerId, centerId),
          isNull(classroomAssignments.endDate),
        ),
      );
    const ids = assigned.map((a) => a.childId);
    if (ids.length === 0) {
      return c.json({ children: [] });
    }
    conditions.push(sql`${children.id} IN ${ids}`);
  }

  const results = await db
    .select()
    .from(children)
    .where(and(...conditions));

  return c.json({ children: results });
});

// GET /:id — get child with guardians + classroom
childrenRoutes.get("/:id", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [child] = await db
    .select()
    .from(children)
    .where(and(eq(children.id, id), eq(children.centerId, centerId)))
    .limit(1);

  if (!child) notFound("Child not found");

  // Get current classroom assignment
  const [assignment] = await db
    .select({
      assignmentId: classroomAssignments.id,
      classroomId: classroomAssignments.classroomId,
      effectiveDate: classroomAssignments.effectiveDate,
      classroomName: classrooms.name,
      classroomAgeGroup: classrooms.ageGroup,
    })
    .from(classroomAssignments)
    .innerJoin(classrooms, eq(classrooms.id, classroomAssignments.classroomId))
    .where(
      and(
        eq(classroomAssignments.childId, id),
        eq(classroomAssignments.centerId, centerId),
        isNull(classroomAssignments.endDate),
      ),
    )
    .limit(1);

  // Get guardians
  const guardianLinks = await db
    .select({
      id: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      email: guardians.email,
      phone: guardians.phone,
      isPrimary: childGuardians.isPrimary,
      authorizedPickup: childGuardians.authorizedPickup,
      relationship: childGuardians.relationship,
    })
    .from(childGuardians)
    .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
    .where(eq(childGuardians.childId, id));

  const primaryGuardian = guardianLinks.find((g) => g.isPrimary);

  return c.json({
    child,
    currentClassroom: assignment
      ? {
          id: assignment.classroomId,
          name: assignment.classroomName,
          ageGroup: assignment.classroomAgeGroup,
          assignmentId: assignment.assignmentId,
          effectiveDate: assignment.effectiveDate,
        }
      : null,
    guardians: guardianLinks,
    primaryGuardianName: primaryGuardian
      ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}`
      : null,
  });
});

// POST / — create child
childrenRoutes.post(
  "/",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", createChildSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const data = c.req.valid("json");

    const [child] = await db
      .insert(children)
      .values({
        centerId,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        ageGroup: data.ageGroup,
        enrollmentStatus: data.enrollmentStatus,
        subsidyEligible: data.subsidyEligible,
        enrolledAt: data.enrollmentStatus === "active" ? new Date() : null,
      })
      .returning();

    if (!child) throw new Error("Failed to create child");

    return c.json({ child }, 201);
  },
);

// PATCH /:id — update child
childrenRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", updateChildSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const [updated] = await db
      .update(children)
      .set(data)
      .where(and(eq(children.id, id), eq(children.centerId, centerId)))
      .returning();

    if (!updated) notFound("Child not found");

    return c.json({ child: updated });
  },
);

// POST /:id/withdraw
childrenRoutes.post("/:id/withdraw", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");
  const today = new Date().toISOString().split("T")[0];

  const [updated] = await db
    .update(children)
    .set({ enrollmentStatus: "withdrawn", withdrawnAt: new Date() })
    .where(and(eq(children.id, id), eq(children.centerId, centerId)))
    .returning();

  if (!updated) notFound("Child not found");

  // End classroom assignment
  await db
    .update(classroomAssignments)
    .set({ endDate: today })
    .where(
      and(
        eq(classroomAssignments.childId, id),
        eq(classroomAssignments.centerId, centerId),
        isNull(classroomAssignments.endDate),
      ),
    );

  return c.json({ child: updated });
});

// POST /:id/reactivate
childrenRoutes.post("/:id/reactivate", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [updated] = await db
    .update(children)
    .set({ enrollmentStatus: "active", withdrawnAt: null, enrolledAt: new Date() })
    .where(and(eq(children.id, id), eq(children.centerId, centerId)))
    .returning();

  if (!updated) notFound("Child not found");

  return c.json({ child: updated });
});

// GET /:id/guardians — list guardians for child
childrenRoutes.get("/:id/guardians", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const childId = c.req.param("id");

  const results = await db
    .select({
      id: guardians.id,
      firstName: guardians.firstName,
      lastName: guardians.lastName,
      email: guardians.email,
      phone: guardians.phone,
      isPrimary: childGuardians.isPrimary,
      authorizedPickup: childGuardians.authorizedPickup,
      relationship: childGuardians.relationship,
    })
    .from(childGuardians)
    .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
    .where(eq(childGuardians.childId, childId));

  return c.json({ guardians: results });
});

// POST /:id/guardians — link guardian to child
childrenRoutes.post(
  "/:id/guardians",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", linkGuardianSchema),
  async (c) => {
    const db = c.get("db");
    const childId = c.req.param("id");
    const data = c.req.valid("json");

    await db.insert(childGuardians).values({
      childId,
      guardianId: data.guardianId,
      isPrimary: data.isPrimary,
      authorizedPickup: data.authorizedPickup,
      relationship: data.relationship ?? null,
    });

    return c.json({ success: true }, 201);
  },
);

// PATCH /:id/guardians/:guardianId — update link
childrenRoutes.patch(
  "/:id/guardians/:guardianId",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", updateGuardianLinkSchema),
  async (c) => {
    const db = c.get("db");
    const childId = c.req.param("id");
    const guardianId = c.req.param("guardianId");
    const data = c.req.valid("json");

    await db
      .update(childGuardians)
      .set(data)
      .where(
        and(
          eq(childGuardians.childId, childId),
          eq(childGuardians.guardianId, guardianId),
        ),
      );

    return c.json({ success: true });
  },
);

// DELETE /:id/guardians/:guardianId — unlink guardian
childrenRoutes.delete("/:id/guardians/:guardianId", requireAuth, requireRole("owner", "director"), async (c) => {
  const db = c.get("db");
  const childId = c.req.param("id");
  const guardianId = c.req.param("guardianId");

  await db
    .delete(childGuardians)
    .where(
      and(
        eq(childGuardians.childId, childId),
        eq(childGuardians.guardianId, guardianId),
      ),
    );

  return c.json({ success: true });
});

// POST /enroll — enrollment transaction
childrenRoutes.post(
  "/enroll",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", enrollChildSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const data = c.req.valid("json");

    const result = await db.transaction(async (tx) => {
      // 1. Create child
      const [child] = await tx
        .insert(children)
        .values({
          centerId,
          firstName: data.child.firstName,
          lastName: data.child.lastName,
          dateOfBirth: data.child.dateOfBirth,
          ageGroup: data.child.ageGroup,
          enrollmentStatus: data.child.enrollmentStatus,
          subsidyEligible: data.child.subsidyEligible,
          enrolledAt: data.child.enrollmentStatus === "active" ? new Date() : null,
        })
        .returning();

      if (!child) throw new Error("Failed to create child");

      // 2. Process guardians
      const guardianResults = [];
      for (const g of data.guardians) {
        let guardianId: string;

        if (g.type === "new") {
          const [newGuardian] = await tx
            .insert(guardians)
            .values({
              centerId,
              firstName: g.firstName,
              lastName: g.lastName,
              email: g.email ?? null,
              phone: g.phone ?? null,
            })
            .returning();

          if (!newGuardian) throw new Error("Failed to create guardian");
          guardianId = newGuardian.id;
          guardianResults.push(newGuardian);
        } else {
          // Verify guardian exists and belongs to center
          const [existing] = await tx
            .select()
            .from(guardians)
            .where(
              and(
                eq(guardians.id, g.guardianId),
                eq(guardians.centerId, centerId),
              ),
            )
            .limit(1);

          if (!existing) badRequest(`Guardian ${g.guardianId} not found`);
          guardianId = existing.id;
          guardianResults.push(existing);
        }

        // Link guardian to child
        await tx.insert(childGuardians).values({
          childId: child.id,
          guardianId,
          isPrimary: g.isPrimary,
          authorizedPickup: g.authorizedPickup,
          relationship: g.relationship ?? null,
        });
      }

      // 3. Classroom assignment (optional)
      let classroomAssignment = null;
      if (data.classroom) {
        const [assignment] = await tx
          .insert(classroomAssignments)
          .values({
            centerId,
            childId: child.id,
            classroomId: data.classroom.classroomId,
            effectiveDate: data.classroom.effectiveDate,
          })
          .returning();

        classroomAssignment = assignment;
      }

      return { child, guardians: guardianResults, classroomAssignment };
    });

    return c.json(result, 201);
  },
);

export { childrenRoutes };
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/children.test.ts
```

Expected: Tests pass.

- [ ] **Step 5: Mount children routes**

In `apps/api/src/index.ts`, add the import:

```typescript
import { childrenRoutes } from "./routes/children.js";
```

And mount:

```typescript
app.route("/api/children", childrenRoutes);
```

- [ ] **Step 6: Typecheck + lint**

Run:

```bash
pnpm --filter @pebbledesk/api typecheck && pnpm lint
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/children.ts apps/api/src/routes/children.test.ts apps/api/src/index.ts
git commit -m "feat: children CRUD + enrollment transaction API routes with tests"
```

---

## Task 5: Guardians API Routes

**Files:**
- Create: `apps/api/src/routes/guardians.ts`
- Create: `apps/api/src/routes/guardians.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/routes/guardians.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createMockDb, createTestApp, jsonBody, patchBody } from "../test/setup.js";
import { guardiansRoutes } from "./guardians.js";
import type { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";

function mountGuardians(app: Hono<AppEnv>) {
  app.route("/api/guardians", guardiansRoutes);
}

describe("guardians routes", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("GET /api/guardians", () => {
    it("returns list of guardians for owner", async () => {
      db.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "g-1", firstName: "Maria", lastName: "Martinez", email: "maria@test.com", phone: "5551234567" },
          ]),
        }),
      });

      const app = createTestApp(mountGuardians, db);
      const res = await app.request("/api/guardians");

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.guardians).toBeDefined();
    });

    it("rejects staff role", async () => {
      const app = createTestApp(mountGuardians, db, { role: "staff" });
      const res = await app.request("/api/guardians");

      expect(res.status).toBe(403);
    });
  });

  describe("POST /api/guardians", () => {
    it("creates a guardian", async () => {
      const newGuardian = { id: "g-new", centerId: "center-1", firstName: "Maria", lastName: "Martinez", email: "maria@test.com", phone: "5551234567", createdAt: new Date(), updatedAt: new Date() };
      db.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newGuardian]),
        }),
      });

      const app = createTestApp(mountGuardians, db);
      const res = await app.request("/api/guardians", jsonBody({
        firstName: "Maria", lastName: "Martinez", email: "maria@test.com", phone: "5551234567",
      }));

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.guardian.firstName).toBe("Maria");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/guardians.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement guardians routes**

Create `apps/api/src/routes/guardians.ts`:

```typescript
import { zValidator } from "@hono/zod-validator";
import {
  guardians,
  childGuardians,
  children,
  classrooms,
  classroomAssignments,
} from "@pebbledesk/db";
import { createGuardianSchema, updateGuardianSchema } from "@pebbledesk/shared";
import { and, eq, or, ilike, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const guardiansRoutes = new Hono<AppEnv>();

// GET / — list guardians (owner/director only)
guardiansRoutes.get("/", requireAuth, requireRole("owner", "director"), async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const search = c.req.query("search");

  const conditions = [eq(guardians.centerId, centerId)];

  if (search) {
    conditions.push(
      or(
        ilike(guardians.firstName, `%${search}%`),
        ilike(guardians.lastName, `%${search}%`),
        ilike(guardians.email, `%${search}%`),
        ilike(guardians.phone, `%${search}%`),
      )!,
    );
  }

  const results = await db
    .select()
    .from(guardians)
    .where(and(...conditions));

  return c.json({ guardians: results });
});

// GET /:id — get guardian with linked children
guardiansRoutes.get("/:id", requireAuth, async (c) => {
  const centerId = c.get("centerId");
  if (!centerId) forbidden("No center membership found");

  const db = c.get("db");
  const id = c.req.param("id");

  const [guardian] = await db
    .select()
    .from(guardians)
    .where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
    .limit(1);

  if (!guardian) notFound("Guardian not found");

  // Get linked children with classroom info
  const linkedChildren = await db
    .select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      enrollmentStatus: children.enrollmentStatus,
      isPrimary: childGuardians.isPrimary,
      authorizedPickup: childGuardians.authorizedPickup,
      relationship: childGuardians.relationship,
    })
    .from(childGuardians)
    .innerJoin(children, eq(children.id, childGuardians.childId))
    .where(eq(childGuardians.guardianId, id));

  return c.json({ guardian, children: linkedChildren });
});

// POST / — create guardian
guardiansRoutes.post(
  "/",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", createGuardianSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const data = c.req.valid("json");

    const [guardian] = await db
      .insert(guardians)
      .values({
        centerId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email ?? null,
        phone: data.phone ?? null,
      })
      .returning();

    if (!guardian) throw new Error("Failed to create guardian");

    return c.json({ guardian }, 201);
  },
);

// PATCH /:id — update guardian
guardiansRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "director"),
  zValidator("json", updateGuardianSchema),
  async (c) => {
    const centerId = c.get("centerId");
    if (!centerId) forbidden("No center membership found");

    const db = c.get("db");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const [updated] = await db
      .update(guardians)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(guardians.id, id), eq(guardians.centerId, centerId)))
      .returning();

    if (!updated) notFound("Guardian not found");

    return c.json({ guardian: updated });
  },
);

// GET /:id/children — list children linked to guardian
guardiansRoutes.get("/:id/children", requireAuth, async (c) => {
  const db = c.get("db");
  const guardianId = c.req.param("id");

  const results = await db
    .select({
      id: children.id,
      firstName: children.firstName,
      lastName: children.lastName,
      enrollmentStatus: children.enrollmentStatus,
      ageGroup: children.ageGroup,
      isPrimary: childGuardians.isPrimary,
      authorizedPickup: childGuardians.authorizedPickup,
      relationship: childGuardians.relationship,
    })
    .from(childGuardians)
    .innerJoin(children, eq(children.id, childGuardians.childId))
    .where(eq(childGuardians.guardianId, guardianId));

  return c.json({ children: results });
});

export { guardiansRoutes };
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @pebbledesk/api test -- --run apps/api/src/routes/guardians.test.ts
```

Expected: PASS

- [ ] **Step 5: Mount guardians routes**

In `apps/api/src/index.ts`, add:

```typescript
import { guardiansRoutes } from "./routes/guardians.js";
```

And mount:

```typescript
app.route("/api/guardians", guardiansRoutes);
```

- [ ] **Step 6: Run all API tests + typecheck**

Run:

```bash
pnpm --filter @pebbledesk/api test && pnpm --filter @pebbledesk/api typecheck
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/guardians.ts apps/api/src/routes/guardians.test.ts apps/api/src/index.ts
git commit -m "feat: guardians CRUD API routes with tests"
```

---

## Task 6: Install Shadcn Components

**Files:**
- Create: multiple component files in `packages/ui/src/components/`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/package.json`

- [ ] **Step 1: Install required Radix dependencies**

Run from the `packages/ui` directory:

```bash
cd packages/ui && pnpm add @radix-ui/react-select @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tabs @radix-ui/react-separator @radix-ui/react-checkbox @radix-ui/react-label cmdk date-fns react-day-picker
```

- [ ] **Step 2: Create Shadcn components**

Create each of these files in `packages/ui/src/components/` following the Shadcn new-york style. Each component should follow the same pattern as the existing `button.tsx` — import from Radix, use `cn()` for class merging, export named components.

The components to create are: `input.tsx`, `label.tsx`, `select.tsx`, `dialog.tsx`, `card.tsx`, `badge.tsx`, `table.tsx`, `tabs.tsx`, `skeleton.tsx`, `separator.tsx`, `popover.tsx`, `calendar.tsx`, `command.tsx`, `checkbox.tsx`.

Use the Shadcn/UI docs or `npx shadcn@latest add <component>` as reference for each component's implementation. Each should be a direct port of the Shadcn new-york variant.

- [ ] **Step 3: Update UI package exports**

In `packages/ui/src/index.ts`, add exports for all new components:

```typescript
export { Button, type ButtonProps, buttonVariants } from "./components/button";
export { Input } from "./components/input";
export { Label } from "./components/label";
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "./components/select";
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "./components/dialog";
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./components/card";
export { Badge, badgeVariants } from "./components/badge";
export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./components/table";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/tabs";
export { Skeleton } from "./components/skeleton";
export { Separator } from "./components/separator";
export { Popover, PopoverContent, PopoverTrigger } from "./components/popover";
export { Calendar } from "./components/calendar";
export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "./components/command";
export { Checkbox } from "./components/checkbox";
export { cn } from "./lib/utils";
```

- [ ] **Step 4: Typecheck**

Run:

```bash
pnpm --filter @pebbledesk/ui typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/
git commit -m "feat: add Shadcn UI components for Phase 2"
```

---

## Task 7: TanStack Query Hooks

**Files:**
- Create: `apps/web/src/hooks/use-classrooms.ts`
- Create: `apps/web/src/hooks/use-children.ts`
- Create: `apps/web/src/hooks/use-guardians.ts`

- [ ] **Step 1: Create classrooms hooks**

Create `apps/web/src/hooks/use-classrooms.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type { ClassroomWithCounts } from "@pebbledesk/shared";

export function useClassrooms(filters?: { ageGroup?: string; includeArchived?: boolean }) {
  const params = new URLSearchParams();
  if (filters?.ageGroup) params.set("ageGroup", filters.ageGroup);
  if (filters?.includeArchived) params.set("includeArchived", "true");
  const qs = params.toString();

  return useQuery({
    queryKey: ["classrooms", filters],
    queryFn: async () => {
      const res = await apiFetch(`/api/classrooms${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch classrooms");
      const data = await res.json();
      return data.classrooms as ClassroomWithCounts[];
    },
  });
}

export function useClassroom(id: string) {
  return useQuery({
    queryKey: ["classrooms", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/classrooms/${id}`);
      if (!res.ok) throw new Error("Failed to fetch classroom");
      const data = await res.json();
      return data.classroom as ClassroomWithCounts;
    },
    enabled: !!id,
  });
}

export function useClassroomChildren(classroomId: string) {
  return useQuery({
    queryKey: ["classrooms", classroomId, "children"],
    queryFn: async () => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/children`);
      if (!res.ok) throw new Error("Failed to fetch classroom children");
      const data = await res.json();
      return data.children;
    },
    enabled: !!classroomId,
  });
}

export function useClassroomStaff(classroomId: string) {
  return useQuery({
    queryKey: ["classrooms", classroomId, "staff"],
    queryFn: async () => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/staff`);
      if (!res.ok) throw new Error("Failed to fetch classroom staff");
      const data = await res.json();
      return data.staff;
    },
    enabled: !!classroomId,
  });
}

export function useCreateClassroom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; ageGroup: string; maxCapacity: number; minRatioStaff: number; minRatioChildren: number }) => {
      const res = await apiFetch("/api/classrooms", { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create classroom");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["classrooms"] }),
  });
}

export function useUpdateClassroom(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiFetch(`/api/classrooms/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update classroom");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", id] });
    },
  });
}

export function useArchiveClassroom(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/classrooms/${id}/archive`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to archive classroom");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", id] });
    },
  });
}

export function useAssignChild(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { childId: string; effectiveDate: string }) => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/children`, { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to assign child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", classroomId] });
      qc.invalidateQueries({ queryKey: ["children"] });
    },
  });
}

export function useUnassignChild(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (childId: string) => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/children/${childId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unassign child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", classroomId] });
      qc.invalidateQueries({ queryKey: ["children"] });
    },
  });
}

export function useAssignStaff(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { membershipId: string; effectiveDate: string }) => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/staff`, { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to assign staff");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", classroomId] });
    },
  });
}

export function useUnassignStaff(classroomId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const res = await apiFetch(`/api/classrooms/${classroomId}/staff/${membershipId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unassign staff");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["classrooms", classroomId] });
    },
  });
}
```

- [ ] **Step 2: Create children hooks**

Create `apps/web/src/hooks/use-children.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type { EnrollChildInput } from "@pebbledesk/shared";

export function useChildren(filters?: { search?: string; status?: string; ageGroup?: string; classroomId?: string }) {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.ageGroup) params.set("ageGroup", filters.ageGroup);
  if (filters?.classroomId) params.set("classroomId", filters.classroomId);
  const qs = params.toString();

  return useQuery({
    queryKey: ["children", filters],
    queryFn: async () => {
      const res = await apiFetch(`/api/children${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch children");
      const data = await res.json();
      return data.children;
    },
  });
}

export function useChild(id: string) {
  return useQuery({
    queryKey: ["children", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/children/${id}`);
      if (!res.ok) throw new Error("Failed to fetch child");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiFetch("/api/children", { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create child");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["children"] }),
  });
}

export function useUpdateChild(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiFetch(`/api/children/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["children", id] });
    },
  });
}

export function useWithdrawChild(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/children/${id}/withdraw`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to withdraw child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["children", id] });
      qc.invalidateQueries({ queryKey: ["classrooms"] });
    },
  });
}

export function useReactivateChild(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/children/${id}/reactivate`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to reactivate child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["children", id] });
    },
  });
}

export function useLinkGuardian(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { guardianId: string; isPrimary: boolean; authorizedPickup: boolean; relationship?: string }) => {
      const res = await apiFetch(`/api/children/${childId}/guardians`, { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to link guardian");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["children", childId] }),
  });
}

export function useUnlinkGuardian(childId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (guardianId: string) => {
      const res = await apiFetch(`/api/children/${childId}/guardians/${guardianId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unlink guardian");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["children", childId] }),
  });
}

export function useEnrollChild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: EnrollChildInput) => {
      const res = await apiFetch("/api/children/enroll", { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to enroll child");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["children"] });
      qc.invalidateQueries({ queryKey: ["classrooms"] });
      qc.invalidateQueries({ queryKey: ["guardians"] });
    },
  });
}
```

- [ ] **Step 3: Create guardians hooks**

Create `apps/web/src/hooks/use-guardians.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type { Guardian, GuardianWithChildren } from "@pebbledesk/shared";

export function useGuardians(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const qs = params.toString();

  return useQuery({
    queryKey: ["guardians", search],
    queryFn: async () => {
      const res = await apiFetch(`/api/guardians${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch guardians");
      const data = await res.json();
      return data.guardians as Guardian[];
    },
  });
}

export function useGuardian(id: string) {
  return useQuery({
    queryKey: ["guardians", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/guardians/${id}`);
      if (!res.ok) throw new Error("Failed to fetch guardian");
      return res.json() as Promise<{ guardian: Guardian; children: GuardianWithChildren["children"] }>;
    },
    enabled: !!id,
  });
}

export function useCreateGuardian() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email?: string; phone?: string }) => {
      const res = await apiFetch("/api/guardians", { method: "POST", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to create guardian");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["guardians"] }),
  });
}

export function useUpdateGuardian(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiFetch(`/api/guardians/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!res.ok) throw new Error("Failed to update guardian");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["guardians"] });
      qc.invalidateQueries({ queryKey: ["guardians", id] });
    },
  });
}
```

- [ ] **Step 4: Typecheck**

Run:

```bash
pnpm --filter @pebbledesk/web typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/
git commit -m "feat: TanStack Query hooks for classrooms, children, guardians"
```

---

## Task 8: Shared UI Components

**Files:**
- Create: `apps/web/src/components/status-badge.tsx`
- Create: `apps/web/src/components/empty-state.tsx`
- Create: `apps/web/src/components/capacity-bar.tsx`

- [ ] **Step 1: Create StatusBadge component**

Create `apps/web/src/components/status-badge.tsx`:

```tsx
import { Badge } from "@pebbledesk/ui/components/badge";
import { cn } from "@pebbledesk/ui/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-800 hover:bg-green-100",
  compliant: "bg-green-100 text-green-800 hover:bg-green-100",
  waitlist: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  "near-capacity": "bg-amber-100 text-amber-800 hover:bg-amber-100",
  withdrawn: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  archived: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  empty: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  inactive: "bg-gray-100 text-gray-600 hover:bg-gray-100",
  authorized: "bg-green-100 text-green-800 hover:bg-green-100",
  "not-authorized": "bg-amber-100 text-amber-800 hover:bg-amber-100",
  primary: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  secondary: "bg-gray-100 text-gray-600 hover:bg-gray-100",
};

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.inactive;
  const displayLabel = label ?? status.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge variant="secondary" className={cn("font-medium capitalize", style, className)}>
      {displayLabel}
    </Badge>
  );
}
```

- [ ] **Step 2: Create EmptyState component**

Create `apps/web/src/components/empty-state.tsx`:

```tsx
import { Button } from "@pebbledesk/ui/components/button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 text-gray-400">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create CapacityBar component**

Create `apps/web/src/components/capacity-bar.tsx`:

```tsx
import { cn } from "@pebbledesk/ui/lib/utils";

interface CapacityBarProps {
  current: number;
  max: number;
  className?: string;
}

export function CapacityBar({ current, max, className }: CapacityBarProps) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-500" : "bg-blue-600";

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex justify-between text-xs text-gray-500">
        <span>Capacity</span>
        <span>
          {current} / {max} children
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run:

```bash
pnpm --filter @pebbledesk/web typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/status-badge.tsx apps/web/src/components/empty-state.tsx apps/web/src/components/capacity-bar.tsx
git commit -m "feat: shared UI components — StatusBadge, EmptyState, CapacityBar"
```

---

## Task 9: Classrooms Pages

**Files:**
- Create: `apps/web/src/routes/_auth/classrooms/index.tsx`
- Create: `apps/web/src/routes/_auth/classrooms/$id.tsx`

This task creates the classrooms list page (card grid) and classroom detail page (tabs for children and staff). Follow the design spec mockups. Use Shadcn components from `@pebbledesk/ui`. Use the hooks from Task 7. Use the shared components from Task 8. Reference the existing `_auth/dashboard.tsx` for the TanStack Router file-route pattern.

Key implementation details:
- Card grid layout with `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card shows: name, age group label, ratio, `StatusBadge` for compliance, `CapacityBar`, staff/child counts
- Amber border (`border-amber-300`) on cards where `childCount / maxCapacity >= 0.85`
- "Show archived" checkbox toggle in header
- "Add Classroom" button opens a `Dialog` with the create form
- Cards navigate to `/classrooms/$id` on click
- Detail page uses `Tabs` with "Children" and "Staff" tabs
- Assign child/staff uses `Command` typeahead in a `Dialog`
- Skeleton loading states for both pages
- Empty state when no classrooms exist

- [ ] **Step 1: Create classrooms list page**

Create `apps/web/src/routes/_auth/classrooms/index.tsx` implementing the classrooms card grid per the spec. Use `useClassrooms` hook, `StatusBadge`, `CapacityBar`, `EmptyState`, `Dialog` for create form, `Skeleton` for loading. Navigate to `/classrooms/${id}` on card click via `useNavigate`.

- [ ] **Step 2: Create classroom detail page**

Create `apps/web/src/routes/_auth/classrooms/$id.tsx` implementing the detail view with tabs per the spec. Use `useClassroom`, `useClassroomChildren`, `useClassroomStaff`, `useAssignChild`, `useUnassignChild`, `useAssignStaff`, `useUnassignStaff` hooks. Use `Tabs`, `Table`, `Dialog` with `Command` for typeahead search.

- [ ] **Step 3: Regenerate route tree**

Run:

```bash
pnpm --filter @pebbledesk/web dev
```

Let it start, then stop it (Ctrl+C). TanStack Router plugin auto-generates `routeTree.gen.ts` on dev start.

- [ ] **Step 4: Typecheck**

Run:

```bash
pnpm --filter @pebbledesk/web typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/_auth/classrooms/ apps/web/src/routeTree.gen.ts
git commit -m "feat: classrooms list and detail pages"
```

---

## Task 10: Children Pages

**Files:**
- Create: `apps/web/src/routes/_auth/children/index.tsx`
- Create: `apps/web/src/routes/_auth/children/$id.tsx`

This task creates the children list page (data table with filters) and child profile page. Follow the design spec mockups.

Key implementation details:
- Children list: `Table` with 5 columns (Name+DOB, Age Group, Classroom, Status badge, Primary Guardian)
- Filter bar: search `Input`, `Select` for status (default Active+Waitlist), age group, classroom
- Summary counts in header subtitle
- "Enroll Child" primary button navigates to `/children/enroll`
- Rows navigate to `/children/$id` on click
- Child profile: two-column card layout — details card (left) + classroom card (right)
- Guardians section with add/link/edit/remove actions
- "Edit" toggles inline edit mode on details card
- "Withdraw" opens confirmation `Dialog`
- "Reassign" opens classroom picker `Dialog` (radio-card selection filtered by age group)
- Placeholder cards for Attendance History and Subsidy Info

- [ ] **Step 1: Create children list page**

Create `apps/web/src/routes/_auth/children/index.tsx` per the spec.

- [ ] **Step 2: Create child profile page**

Create `apps/web/src/routes/_auth/children/$id.tsx` per the spec.

- [ ] **Step 3: Regenerate route tree, typecheck**

Run:

```bash
pnpm --filter @pebbledesk/web dev
```

Stop after route tree regenerates, then:

```bash
pnpm --filter @pebbledesk/web typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_auth/children/index.tsx apps/web/src/routes/_auth/children/\$id.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat: children list and profile pages"
```

---

## Task 11: Guardians Pages

**Files:**
- Create: `apps/web/src/routes/_auth/guardians/index.tsx`
- Create: `apps/web/src/routes/_auth/guardians/$id.tsx`

Key implementation details:
- Guardians list: `Table` with 4 columns (Name, Contact, Children links, Pickup badge)
- Search input for name/email/phone
- "Add Guardian" button opens `Dialog` with create form
- Rows navigate to `/guardians/$id` on click
- Guardian detail: contact card + children table with enrollment status, classroom, Primary badge, relationship
- "Edit" button for inline edit on contact card
- "Link to Child" button opens `Command` typeahead for children

- [ ] **Step 1: Create guardians list page**

Create `apps/web/src/routes/_auth/guardians/index.tsx` per the spec.

- [ ] **Step 2: Create guardian detail page**

Create `apps/web/src/routes/_auth/guardians/$id.tsx` per the spec.

- [ ] **Step 3: Regenerate route tree, typecheck**

```bash
pnpm --filter @pebbledesk/web dev
```

Stop after route tree regenerates, then typecheck.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_auth/guardians/ apps/web/src/routeTree.gen.ts
git commit -m "feat: guardians list and detail pages"
```

---

## Task 12: Enrollment Wizard

**Files:**
- Create: `apps/web/src/routes/_auth/children/enroll.tsx`

This is the most complex UI piece. A 4-step wizard at `/children/enroll` that creates a child, links guardians, and assigns a classroom in one flow.

Key implementation details:
- Wizard state held in a single `useState` with shape: `{ step, child, guardians, classroom }`
- Step 1 (Child): form with `Input`, Shadcn `Select` for age group/status, `Calendar` in `Popover` for DOB, `Checkbox` for subsidy
- Age group auto-suggested from DOB using a helper function: infant (<1), young_toddler (1-2), toddler (2-3), preschool (3-4), pre_k (4-5), school_age (5+)
- Step 2 (Guardians): guardian cards + "Add New" inline form + "Link Existing" `Command` typeahead using `useGuardians` hook. At least 1 guardian required validation.
- Step 3 (Classroom): radio-card selection using `useClassrooms({ ageGroup })`. `CapacityBar` on each card. Selected card has blue ring. `Calendar` for effective date. Optional — can skip.
- Step 4 (Review): summary cards with "Edit" links (set step back). Green "Enroll Child" button calls `useEnrollChild` mutation.
- Stepper bar: horizontal steps with numbered circles, progress lines, checkmarks for completed steps. Centered, max-width aligned with form body.
- On success: `useNavigate` to `/children/${newChildId}`
- Cancel: `useNavigate` to `/children`

- [ ] **Step 1: Create enrollment wizard route**

Create `apps/web/src/routes/_auth/children/enroll.tsx` implementing all 4 steps per the spec. This is a large file — organize with helper components defined within the file: `StepIndicator`, `ChildForm`, `GuardiansForm`, `ClassroomPicker`, `ReviewSummary`.

- [ ] **Step 2: Create age group helper**

Add a helper function at the top of the enroll file (or in a small util):

```typescript
function suggestAgeGroup(dateOfBirth: string): AgeGroup {
  const today = new Date();
  const dob = new Date(dateOfBirth);
  const ageInMonths = (today.getFullYear() - dob.getFullYear()) * 12 + (today.getMonth() - dob.getMonth());

  if (ageInMonths < 12) return "infant";
  if (ageInMonths < 24) return "young_toddler";
  if (ageInMonths < 36) return "toddler";
  if (ageInMonths < 48) return "preschool";
  if (ageInMonths < 60) return "pre_k";
  return "school_age";
}
```

- [ ] **Step 3: Regenerate route tree, typecheck**

```bash
pnpm --filter @pebbledesk/web dev
```

Stop, then typecheck.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/_auth/children/enroll.tsx apps/web/src/routeTree.gen.ts
git commit -m "feat: enrollment wizard — 4-step flow to enroll child with guardians and classroom"
```

---

## Task 13: Final Integration + Typecheck + Lint

**Files:**
- Verify all packages

- [ ] **Step 1: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: All packages pass.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Fix any issues.

- [ ] **Step 3: Run all tests**

Run:

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: lint and typecheck fixes for Phase 2"
```

---

## What's Next

After Phase 2, the next phases are:

1. **Phase 3: Attendance & Ratios** — Check-in/out flow, ratio dashboard with polling, ratio snapshots
2. **Phase 4: Subsidies & Billing** — Subsidy cases, claims, invoices, payments
