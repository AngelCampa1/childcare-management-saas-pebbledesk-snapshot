# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the PebbleDesk monorepo with all packages, full database schema, auth, core API middleware, and a working web shell — so a user can sign up, create a center, and see the authenticated dashboard.

**Architecture:** Apps + Packages monorepo. `apps/api` (Hono on Workers) serves the API with Better Auth. `apps/web` (React + Vite + TanStack Router) is the SPA. Shared packages: `packages/db` (Drizzle + Neon), `packages/auth` (Better Auth config), `packages/shared` (types, Zod schemas), `packages/ui` (Shadcn + Tailwind). Row-level tenancy via `center_id`.

**Tech Stack:** Turborepo, pnpm, TypeScript, Hono, Better Auth, Drizzle ORM, Neon (Postgres), React 19, Vite, TanStack Router, TanStack Query, Shadcn/UI, Tailwind CSS 4, Biome, Vitest, Wrangler, Cloudflare Workers/Pages, Hyperdrive.

**Spec:** `docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md`

---

## File Structure

```
pebbledesk/
├── package.json                          # Root workspace scripts
├── pnpm-workspace.yaml                   # Workspace config
├── turbo.json                            # Turborepo pipeline config
├── biome.json                            # Linting + formatting
├── tsconfig.json                         # Root tsconfig (references)
├── .gitignore
├── .env.example                          # Required env vars documentation
│
├── packages/
│   ├── shared/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                  # Re-exports
│   │   │   ├── types/
│   │   │   │   ├── index.ts
│   │   │   │   ├── center.ts             # Center, Membership types
│   │   │   │   ├── classroom.ts          # Classroom, Assignment types
│   │   │   │   ├── child.ts              # Child, Guardian types
│   │   │   │   ├── attendance.ts         # CheckIn, StaffCheckIn, RatioSnapshot types
│   │   │   │   ├── subsidy.ts            # SubsidyCase, SubsidyClaim types
│   │   │   │   ├── billing.ts            # Invoice, Payment types
│   │   │   │   ├── scheduling.ts         # Schedule, Shift, TimeEntry types
│   │   │   │   ├── messaging.ts          # Message, MessageRecipient types
│   │   │   │   ├── audit.ts              # AuditReport, AuditLog types
│   │   │   │   └── quickbooks.ts         # QB connection, sync log types
│   │   │   ├── validators/
│   │   │   │   ├── index.ts
│   │   │   │   ├── center.ts             # Center create/update schemas
│   │   │   │   ├── classroom.ts
│   │   │   │   ├── child.ts
│   │   │   │   ├── attendance.ts
│   │   │   │   ├── subsidy.ts
│   │   │   │   ├── billing.ts
│   │   │   │   ├── scheduling.ts
│   │   │   │   └── messaging.ts
│   │   │   └── constants/
│   │   │       ├── index.ts
│   │   │       ├── roles.ts              # Role enum, permission map
│   │   │       └── enums.ts              # AgeGroup, EnrollmentStatus, etc.
│   │   └── tests/
│   │       ├── validators.test.ts
│   │       └── constants.test.ts
│   │
│   ├── db/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                  # Re-exports client + schema
│   │   │   ├── client.ts                 # Neon + Drizzle client factory
│   │   │   └── schema/
│   │   │       ├── index.ts              # Re-exports all tables
│   │   │       ├── centers.ts
│   │   │       ├── auth.ts               # users, sessions, accounts (Better Auth)
│   │   │       ├── memberships.ts
│   │   │       ├── classrooms.ts
│   │   │       ├── children.ts
│   │   │       ├── guardians.ts
│   │   │       ├── attendance.ts         # check_ins, staff_check_ins
│   │   │       ├── ratios.ts             # ratio_snapshots, ratio_violations
│   │   │       ├── subsidies.ts          # subsidy_cases, subsidy_claims
│   │   │       ├── billing.ts            # invoices, invoice_line_items, payments
│   │   │       ├── scheduling.ts         # schedules, shifts, time_entries
│   │   │       ├── messaging.ts          # messages, message_recipients
│   │   │       ├── audit.ts              # audit_reports, audit_log
│   │   │       └── quickbooks.ts         # quickbooks_connections, quickbooks_sync_log
│   │   └── drizzle/                      # Generated migrations go here
│   │
│   ├── auth/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # Re-exports
│   │       ├── server.ts                 # Better Auth server instance factory
│   │       └── client.ts                 # Better Auth client (for React)
│   │
│   └── ui/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── globals.css               # Tailwind + Shadcn theme
│       │   ├── lib/
│       │   │   └── utils.ts              # cn() helper
│       │   └── components/
│       │       └── button.tsx            # First Shadcn component
│       └── components.json               # Shadcn config
│
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── wrangler.jsonc                # Workers config + Hyperdrive binding
│   │   └── src/
│   │       ├── index.ts                  # Hono app entry, mounts routes
│   │       ├── middleware/
│   │       │   ├── auth.ts               # Session → user → membership → context
│   │       │   └── audit.ts              # Mutation logging to audit_log
│   │       ├── routes/
│   │       │   ├── auth.ts               # Better Auth mount
│   │       │   ├── centers.ts            # POST/GET/PATCH centers
│   │       │   └── members.ts            # GET members, POST invites, DELETE member
│   │       └── lib/
│   │           ├── context.ts            # Hono context types (center_id, role, user)
│   │           └── errors.ts             # Error response helpers
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.tsx                  # React entry
│           ├── router.tsx                # TanStack Router config
│           ├── api.ts                    # Hono RPC client (hc)
│           ├── routes/
│           │   ├── __root.tsx            # Root layout (QueryProvider, auth check)
│           │   ├── _auth.tsx             # Authenticated layout (sidebar + header)
│           │   ├── _auth/
│           │   │   └── dashboard.tsx     # Dashboard page (placeholder)
│           │   ├── login.tsx
│           │   ├── signup.tsx
│           │   └── onboarding.tsx        # Create center flow
│           └── components/
│               ├── sidebar.tsx
│               └── header.tsx
```

---

## Task 1: Monorepo Root Setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `biome.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize git repo**

```bash
cd <local-path>
git init
```

- [ ] **Step 2: Create root package.json**

```json
{
  "name": "pebbledesk",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:watch": "turbo test:watch",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "db:generate": "pnpm --filter @pebbledesk/db db:generate",
    "db:migrate": "pnpm --filter @pebbledesk/db db:migrate",
    "db:studio": "pnpm --filter @pebbledesk/db db:studio"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4",
    "turbo": "^2.9",
    "typescript": "^5.8"
  },
  "packageManager": "pnpm@10.11.0",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:watch": {
      "cache": false,
      "persistent": true
    },
    "lint": {}
  }
}
```

- [ ] **Step 5: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.10/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "files": {
    "ignore": ["node_modules", "dist", ".wrangler", "drizzle"]
  }
}
```

- [ ] **Step 6: Create root tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true
  },
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
dist/
.wrangler/
.turbo/
.env
.env.local
*.tsbuildinfo
.superpowers/
```

- [ ] **Step 8: Create .env.example**

```bash
# Neon Database
DATABASE_URL=REPLACE_WITH_DATABASE_URL

# Better Auth
BETTER_AUTH_SECRET=generate-a-random-secret-here
BETTER_AUTH_URL=http://localhost:8790

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Cloudflare Hyperdrive (set in wrangler.jsonc, not here)
# HYPERDRIVE_ID=your-hyperdrive-id
```

- [ ] **Step 9: Install dependencies and verify**

```bash
pnpm install
```

Expected: lockfile generated, no errors.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: initialize monorepo with turborepo, pnpm, biome, typescript"
```

---

## Task 2: packages/shared — Types, Validators, Constants

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/constants/index.ts`
- Create: `packages/shared/src/constants/roles.ts`
- Create: `packages/shared/src/constants/enums.ts`
- Create: `packages/shared/src/types/index.ts`
- Create: `packages/shared/src/types/center.ts`
- Create: `packages/shared/src/types/classroom.ts`
- Create: `packages/shared/src/types/child.ts`
- Create: `packages/shared/src/types/attendance.ts`
- Create: `packages/shared/src/types/subsidy.ts`
- Create: `packages/shared/src/types/billing.ts`
- Create: `packages/shared/src/types/scheduling.ts`
- Create: `packages/shared/src/types/messaging.ts`
- Create: `packages/shared/src/types/audit.ts`
- Create: `packages/shared/src/types/quickbooks.ts`
- Create: `packages/shared/src/validators/index.ts`
- Create: `packages/shared/src/validators/center.ts`
- Create: `packages/shared/src/validators/classroom.ts`
- Create: `packages/shared/src/validators/child.ts`
- Create: `packages/shared/src/validators/attendance.ts`
- Create: `packages/shared/src/validators/subsidy.ts`
- Create: `packages/shared/src/validators/billing.ts`
- Create: `packages/shared/src/validators/scheduling.ts`
- Create: `packages/shared/src/validators/messaging.ts`
- Create: `packages/shared/tests/validators.test.ts`
- Create: `packages/shared/tests/constants.test.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./validators": "./src/validators/index.ts",
    "./constants": "./src/constants/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch"
  },
  "dependencies": {
    "zod": "^3.25"
  },
  "devDependencies": {
    "typescript": "^5.8",
    "vitest": "^4.1"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create constants — roles.ts**

```typescript
// packages/shared/src/constants/roles.ts

export const ROLES = ["owner", "director", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = {
  // Attendance & Ratios
  "check-in:create": ["owner", "director", "staff"],
  "check-in:read-own-room": ["owner", "director", "staff"],
  "ratios:read-own-room": ["owner", "director", "staff"],
  "ratios:read-all": ["owner", "director"],

  // People
  "children:manage": ["owner", "director"],
  "guardians:manage": ["owner", "director"],
  "classrooms:manage": ["owner", "director"],

  // Messaging
  "messages:send-own-room": ["owner", "director", "staff"],
  "messages:send-all": ["owner", "director"],

  // Scheduling
  "schedules:manage": ["owner", "director"],

  // Subsidies & Reports
  "subsidies:read": ["owner", "director"],
  "subsidies:manage": ["owner"],
  "reports:generate": ["owner", "director"],
  "audit-log:read": ["owner", "director"],

  // Billing
  "invoices:manage": ["owner"],
  "payments:manage": ["owner"],

  // Center admin
  "members:invite": ["owner"],
  "members:remove": ["owner"],
  "center:settings": ["owner"],
  "quickbooks:manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
```

- [ ] **Step 4: Create constants — enums.ts**

```typescript
// packages/shared/src/constants/enums.ts

export const AGE_GROUPS = ["infant", "toddler", "preschool", "school_age"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const ENROLLMENT_STATUSES = ["active", "inactive", "waitlist"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const SUBSIDY_PROGRAMS = ["ccdf", "state_voucher", "head_start", "other"] as const;
export type SubsidyProgram = (typeof SUBSIDY_PROGRAMS)[number];

export const SUBSIDY_CASE_STATUSES = ["active", "pending", "expired", "denied"] as const;
export type SubsidyCaseStatus = (typeof SUBSIDY_CASE_STATUSES)[number];

export const CLAIM_STATUSES = ["draft", "submitted", "paid", "denied", "appealed"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ["card", "ach", "check", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MESSAGE_TYPES = ["announcement", "direct", "alert"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const REPORT_TYPES = ["attendance", "ratio", "subsidy", "licensing"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const AUDIT_ACTIONS = ["create", "update", "delete"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const TIME_ENTRY_STATUSES = ["auto", "manual", "approved"] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

export const QB_SYNC_DIRECTIONS = ["push", "pull"] as const;
export type QbSyncDirection = (typeof QB_SYNC_DIRECTIONS)[number];

export const QB_SYNC_STATUSES = ["success", "error"] as const;
export type QbSyncStatus = (typeof QB_SYNC_STATUSES)[number];

export const QB_ENTITY_TYPES = ["invoice", "payment"] as const;
export type QbEntityType = (typeof QB_ENTITY_TYPES)[number];
```

- [ ] **Step 5: Create constants/index.ts**

```typescript
// packages/shared/src/constants/index.ts
export * from "./roles";
export * from "./enums";
```

- [ ] **Step 6: Create validators — center.ts**

```typescript
// packages/shared/src/validators/center.ts
import { z } from "zod";

export const createCenterSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  phone: z.string().min(10).max(20),
  licenseNumber: z.string().max(100).optional(),
  licensedCapacity: z.number().int().positive().optional(),
  timezone: z.string().default("America/Chicago"),
});

export const updateCenterSchema = createCenterSchema.partial();

export type CreateCenterInput = z.infer<typeof createCenterSchema>;
export type UpdateCenterInput = z.infer<typeof updateCenterSchema>;
```

- [ ] **Step 7: Create validators — classroom.ts**

```typescript
// packages/shared/src/validators/classroom.ts
import { z } from "zod";
import { AGE_GROUPS } from "../constants/enums";

export const createClassroomSchema = z.object({
  name: z.string().min(1).max(100),
  ageGroup: z.enum(AGE_GROUPS),
  maxCapacity: z.number().int().positive(),
  minRatioStaff: z.number().int().positive(),
  minRatioChildren: z.number().int().positive(),
});

export const updateClassroomSchema = createClassroomSchema.partial();

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
```

- [ ] **Step 8: Create validators — child.ts**

```typescript
// packages/shared/src/validators/child.ts
import { z } from "zod";
import { AGE_GROUPS, ENROLLMENT_STATUSES } from "../constants/enums";

export const createChildSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  dateOfBirth: z.string().date(),
  ageGroup: z.enum(AGE_GROUPS),
  enrollmentStatus: z.enum(ENROLLMENT_STATUSES).default("active"),
  subsidyEligible: z.boolean().default(false),
});

export const updateChildSchema = createChildSchema.partial();

export const createGuardianSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(20),
  relationship: z.string().min(1).max(50),
});

export const updateGuardianSchema = createGuardianSchema.partial();

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
```

- [ ] **Step 9: Create validators — attendance.ts**

```typescript
// packages/shared/src/validators/attendance.ts
import { z } from "zod";

export const checkInSchema = z.object({
  childId: z.string().uuid(),
  classroomId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export const checkOutSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const staffCheckInSchema = z.object({
  classroomId: z.string().uuid(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type StaffCheckInInput = z.infer<typeof staffCheckInSchema>;
```

- [ ] **Step 10: Create validators — subsidy.ts**

```typescript
// packages/shared/src/validators/subsidy.ts
import { z } from "zod";
import { SUBSIDY_PROGRAMS, SUBSIDY_CASE_STATUSES, CLAIM_STATUSES } from "../constants/enums";

export const createSubsidyCaseSchema = z.object({
  childId: z.string().uuid(),
  program: z.enum(SUBSIDY_PROGRAMS),
  caseNumber: z.string().min(1).max(100),
  agencyName: z.string().min(1).max(200),
  authorizedHoursWeekly: z.number().positive(),
  rateDaily: z.number().nonnegative().optional(),
  rateWeekly: z.number().nonnegative().optional(),
  effectiveDate: z.string().date(),
  endDate: z.string().date().optional(),
  status: z.enum(SUBSIDY_CASE_STATUSES).default("active"),
});

export const updateSubsidyCaseSchema = createSubsidyCaseSchema.partial();

export const createSubsidyClaimSchema = z.object({
  subsidyCaseId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  daysAttended: z.number().int().nonnegative(),
  hoursAttended: z.number().nonnegative(),
  amountClaimed: z.number().nonnegative(),
});

export const updateSubsidyClaimSchema = z.object({
  amountPaid: z.number().nonnegative().optional(),
  status: z.enum(CLAIM_STATUSES).optional(),
  denialReason: z.string().max(1000).optional(),
});

export type CreateSubsidyCaseInput = z.infer<typeof createSubsidyCaseSchema>;
export type UpdateSubsidyCaseInput = z.infer<typeof updateSubsidyCaseSchema>;
export type CreateSubsidyClaimInput = z.infer<typeof createSubsidyClaimSchema>;
export type UpdateSubsidyClaimInput = z.infer<typeof updateSubsidyClaimSchema>;
```

- [ ] **Step 11: Create validators — billing.ts**

```typescript
// packages/shared/src/validators/billing.ts
import { z } from "zod";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "../constants/enums";

export const createInvoiceSchema = z.object({
  guardianId: z.string().uuid(),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  dueDate: z.string().date(),
  lineItems: z.array(
    z.object({
      description: z.string().min(1).max(200),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      childId: z.string().uuid().optional(),
    })
  ).min(1),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  subsidyCredit: z.number().nonnegative().optional(),
  dueDate: z.string().date().optional(),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(200).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
```

- [ ] **Step 12: Create validators — scheduling.ts**

```typescript
// packages/shared/src/validators/scheduling.ts
import { z } from "zod";

export const createScheduleSchema = z.object({
  name: z.string().min(1).max(100),
  effectiveFrom: z.string().date(),
  effectiveUntil: z.string().date().optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export const createShiftSchema = z.object({
  scheduleId: z.string().uuid(),
  membershipId: z.string().uuid(),
  classroomId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const updateShiftSchema = createShiftSchema.partial();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
```

- [ ] **Step 13: Create validators — messaging.ts**

```typescript
// packages/shared/src/validators/messaging.ts
import { z } from "zod";
import { MESSAGE_TYPES } from "../constants/enums";

export const createMessageSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  messageType: z.enum(MESSAGE_TYPES),
  classroomId: z.string().uuid().optional(),
  recipientGuardianIds: z.array(z.string().uuid()).min(1),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
```

- [ ] **Step 14: Create validators/index.ts**

```typescript
// packages/shared/src/validators/index.ts
export * from "./center";
export * from "./classroom";
export * from "./child";
export * from "./attendance";
export * from "./subsidy";
export * from "./billing";
export * from "./scheduling";
export * from "./messaging";
```

- [ ] **Step 15: Create type files**

Create each type file in `packages/shared/src/types/`. These are inferred from Drizzle schema (created in Task 3), but we define standalone interfaces here for use in the frontend and validators. Each file exports the core type:

```typescript
// packages/shared/src/types/center.ts
import type { Role } from "../constants/roles";

export interface Center {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  licenseNumber: string | null;
  licensedCapacity: number | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  centerId: string;
  userId: string;
  role: Role;
  invitedAt: string | null;
  acceptedAt: string | null;
  createdAt: string;
}
```

```typescript
// packages/shared/src/types/classroom.ts
import type { AgeGroup } from "../constants/enums";

export interface Classroom {
  id: string;
  centerId: string;
  name: string;
  ageGroup: AgeGroup;
  maxCapacity: number;
  minRatioStaff: number;
  minRatioChildren: number;
  createdAt: string;
}

export interface ClassroomAssignment {
  id: string;
  centerId: string;
  childId: string;
  classroomId: string;
  effectiveDate: string;
  endDate: string | null;
}

export interface StaffAssignment {
  id: string;
  centerId: string;
  membershipId: string;
  classroomId: string;
  effectiveDate: string;
  endDate: string | null;
}
```

```typescript
// packages/shared/src/types/child.ts
import type { AgeGroup, EnrollmentStatus } from "../constants/enums";

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

export interface Guardian {
  id: string;
  centerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  relationship: string;
  createdAt: string;
}

export interface ChildGuardian {
  childId: string;
  guardianId: string;
  isPrimary: boolean;
  authorizedPickup: boolean;
}
```

```typescript
// packages/shared/src/types/attendance.ts
export interface CheckIn {
  id: string;
  centerId: string;
  childId: string;
  classroomId: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  checkedInBy: string;
  checkedOutBy: string | null;
  notes: string | null;
}

export interface StaffCheckIn {
  id: string;
  centerId: string;
  membershipId: string;
  classroomId: string;
  clockedInAt: string;
  clockedOutAt: string | null;
}

export interface RatioSnapshot {
  id: string;
  centerId: string;
  classroomId: string;
  recordedAt: string;
  childrenCount: number;
  staffCount: number;
  ratioRequired: number;
  ratioActual: number;
  inCompliance: boolean;
}

export interface RatioViolation {
  id: string;
  centerId: string;
  classroomId: string;
  startedAt: string;
  resolvedAt: string | null;
  childrenCount: number;
  staffCount: number;
  ratioRequired: number;
  ratioActual: number;
  resolvedBy: string | null;
  resolutionNotes: string | null;
}
```

```typescript
// packages/shared/src/types/subsidy.ts
import type { SubsidyProgram, SubsidyCaseStatus, ClaimStatus } from "../constants/enums";

export interface SubsidyCase {
  id: string;
  centerId: string;
  childId: string;
  program: SubsidyProgram;
  caseNumber: string;
  agencyName: string;
  authorizedHoursWeekly: number;
  rateDaily: number | null;
  rateWeekly: number | null;
  effectiveDate: string;
  endDate: string | null;
  status: SubsidyCaseStatus;
}

export interface SubsidyClaim {
  id: string;
  centerId: string;
  subsidyCaseId: string;
  periodStart: string;
  periodEnd: string;
  daysAttended: number;
  hoursAttended: number;
  amountClaimed: number;
  amountPaid: number | null;
  status: ClaimStatus;
  submittedAt: string | null;
  paidAt: string | null;
  denialReason: string | null;
}
```

```typescript
// packages/shared/src/types/billing.ts
import type { InvoiceStatus, PaymentMethod } from "../constants/enums";

export interface Invoice {
  id: string;
  centerId: string;
  guardianId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: number;
  subsidyCredit: number;
  amountDue: number;
  status: InvoiceStatus;
  dueDate: string;
  paidAt: string | null;
  createdAt: string;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  childId: string | null;
}

export interface Payment {
  id: string;
  centerId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
}
```

```typescript
// packages/shared/src/types/scheduling.ts
import type { TimeEntryStatus } from "../constants/enums";

export interface Schedule {
  id: string;
  centerId: string;
  name: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
}

export interface Shift {
  id: string;
  centerId: string;
  scheduleId: string;
  membershipId: string;
  classroomId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface TimeEntry {
  id: string;
  centerId: string;
  membershipId: string;
  date: string;
  hoursWorked: number;
  hoursScheduled: number;
  overtimeHours: number;
  status: TimeEntryStatus;
}
```

```typescript
// packages/shared/src/types/messaging.ts
import type { MessageType } from "../constants/enums";

export interface Message {
  id: string;
  centerId: string;
  senderId: string;
  subject: string;
  body: string;
  messageType: MessageType;
  classroomId: string | null;
  createdAt: string;
}

export interface MessageRecipient {
  id: string;
  messageId: string;
  guardianId: string;
  readAt: string | null;
  deliveredAt: string | null;
}
```

```typescript
// packages/shared/src/types/audit.ts
import type { ReportType, AuditAction } from "../constants/enums";

export interface AuditReport {
  id: string;
  centerId: string;
  reportType: ReportType;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  fileUrl: string;
  generatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  centerId: string;
  userId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}
```

```typescript
// packages/shared/src/types/quickbooks.ts
import type { QbSyncDirection, QbSyncStatus, QbEntityType } from "../constants/enums";

export interface QuickbooksConnection {
  id: string;
  centerId: string;
  realmId: string;
  tokenExpiresAt: string;
  connectedAt: string;
  lastSyncAt: string | null;
}

export interface QuickbooksSyncLog {
  id: string;
  centerId: string;
  connectionId: string;
  entityType: QbEntityType;
  entityId: string;
  qbId: string;
  direction: QbSyncDirection;
  status: QbSyncStatus;
  errorMessage: string | null;
  syncedAt: string;
}
```

```typescript
// packages/shared/src/types/index.ts
export * from "./center";
export * from "./classroom";
export * from "./child";
export * from "./attendance";
export * from "./subsidy";
export * from "./billing";
export * from "./scheduling";
export * from "./messaging";
export * from "./audit";
export * from "./quickbooks";
```

- [ ] **Step 16: Create src/index.ts**

```typescript
// packages/shared/src/index.ts
export * from "./types/index";
export * from "./validators/index";
export * from "./constants/index";
```

- [ ] **Step 17: Write tests — validators.test.ts**

```typescript
// packages/shared/tests/validators.test.ts
import { describe, expect, it } from "vitest";
import {
  createCenterSchema,
  updateCenterSchema,
  createClassroomSchema,
  createChildSchema,
  checkInSchema,
  createSubsidyCaseSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createScheduleSchema,
  createShiftSchema,
  createMessageSchema,
} from "../src/validators/index";

describe("createCenterSchema", () => {
  it("accepts valid center data", () => {
    const result = createCenterSchema.safeParse({
      name: "Sunshine Kids",
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      phone: "5125551234",
      timezone: "America/Chicago",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = createCenterSchema.safeParse({
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      phone: "5125551234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid state code", () => {
    const result = createCenterSchema.safeParse({
      name: "Sunshine Kids",
      address: "123 Main St",
      city: "Austin",
      state: "Texas",
      zip: "78701",
      phone: "5125551234",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid zip", () => {
    const result = createCenterSchema.safeParse({
      name: "Sunshine Kids",
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "abc",
      phone: "5125551234",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateCenterSchema", () => {
  it("accepts partial data", () => {
    const result = updateCenterSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = updateCenterSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createClassroomSchema", () => {
  it("accepts valid classroom data", () => {
    const result = createClassroomSchema.safeParse({
      name: "Butterfly Room",
      ageGroup: "toddler",
      maxCapacity: 12,
      minRatioStaff: 1,
      minRatioChildren: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid age group", () => {
    const result = createClassroomSchema.safeParse({
      name: "Room A",
      ageGroup: "teenager",
      maxCapacity: 12,
      minRatioStaff: 1,
      minRatioChildren: 4,
    });
    expect(result.success).toBe(false);
  });
});

describe("createChildSchema", () => {
  it("accepts valid child data", () => {
    const result = createChildSchema.safeParse({
      firstName: "Emma",
      lastName: "Johnson",
      dateOfBirth: "2023-03-15",
      ageGroup: "toddler",
    });
    expect(result.success).toBe(true);
  });

  it("defaults enrollmentStatus to active", () => {
    const result = createChildSchema.parse({
      firstName: "Emma",
      lastName: "Johnson",
      dateOfBirth: "2023-03-15",
      ageGroup: "toddler",
    });
    expect(result.enrollmentStatus).toBe("active");
  });
});

describe("checkInSchema", () => {
  it("accepts valid check-in", () => {
    const result = checkInSchema.safeParse({
      childId: "550e8400-e29b-41d4-a716-446655440000",
      classroomId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid childId", () => {
    const result = checkInSchema.safeParse({
      childId: "not-a-uuid",
      classroomId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(false);
  });
});

describe("createSubsidyCaseSchema", () => {
  it("accepts valid subsidy case", () => {
    const result = createSubsidyCaseSchema.safeParse({
      childId: "550e8400-e29b-41d4-a716-446655440000",
      program: "ccdf",
      caseNumber: "CCDF-2026-12345",
      agencyName: "Texas Workforce Commission",
      authorizedHoursWeekly: 40,
      rateDaily: 35.5,
      effectiveDate: "2026-01-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("createInvoiceSchema", () => {
  it("requires at least one line item", () => {
    const result = createInvoiceSchema.safeParse({
      guardianId: "550e8400-e29b-41d4-a716-446655440000",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      dueDate: "2026-04-15",
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid invoice with line items", () => {
    const result = createInvoiceSchema.safeParse({
      guardianId: "550e8400-e29b-41d4-a716-446655440000",
      periodStart: "2026-03-01",
      periodEnd: "2026-03-31",
      dueDate: "2026-04-15",
      lineItems: [
        { description: "Weekly tuition", quantity: 4, unitPrice: 250 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("createPaymentSchema", () => {
  it("accepts valid payment", () => {
    const result = createPaymentSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 1000,
      method: "ach",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid payment method", () => {
    const result = createPaymentSchema.safeParse({
      invoiceId: "550e8400-e29b-41d4-a716-446655440000",
      amount: 1000,
      method: "bitcoin",
    });
    expect(result.success).toBe(false);
  });
});

describe("createScheduleSchema", () => {
  it("accepts valid schedule", () => {
    const result = createScheduleSchema.safeParse({
      name: "Spring 2026",
      effectiveFrom: "2026-03-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("createShiftSchema", () => {
  it("accepts valid shift", () => {
    const result = createShiftSchema.safeParse({
      scheduleId: "550e8400-e29b-41d4-a716-446655440000",
      membershipId: "550e8400-e29b-41d4-a716-446655440001",
      classroomId: "550e8400-e29b-41d4-a716-446655440002",
      dayOfWeek: 1,
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid day of week", () => {
    const result = createShiftSchema.safeParse({
      scheduleId: "550e8400-e29b-41d4-a716-446655440000",
      membershipId: "550e8400-e29b-41d4-a716-446655440001",
      classroomId: "550e8400-e29b-41d4-a716-446655440002",
      dayOfWeek: 7,
      startTime: "08:00",
      endTime: "16:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("createMessageSchema", () => {
  it("accepts valid message", () => {
    const result = createMessageSchema.safeParse({
      subject: "Snow day closure",
      body: "The center will be closed tomorrow due to weather.",
      messageType: "announcement",
      recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one recipient", () => {
    const result = createMessageSchema.safeParse({
      subject: "Test",
      body: "Test body",
      messageType: "direct",
      recipientGuardianIds: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 18: Write tests — constants.test.ts**

```typescript
// packages/shared/tests/constants.test.ts
import { describe, expect, it } from "vitest";
import { ROLES, PERMISSIONS, hasPermission } from "../src/constants/roles";
import { AGE_GROUPS, ENROLLMENT_STATUSES, SUBSIDY_PROGRAMS } from "../src/constants/enums";

describe("ROLES", () => {
  it("contains exactly 3 roles", () => {
    expect(ROLES).toEqual(["owner", "director", "staff"]);
  });
});

describe("hasPermission", () => {
  it("owner can manage invoices", () => {
    expect(hasPermission("owner", "invoices:manage")).toBe(true);
  });

  it("director cannot manage invoices", () => {
    expect(hasPermission("director", "invoices:manage")).toBe(false);
  });

  it("staff can create check-ins", () => {
    expect(hasPermission("staff", "check-in:create")).toBe(true);
  });

  it("staff cannot manage children", () => {
    expect(hasPermission("staff", "children:manage")).toBe(false);
  });

  it("director can manage schedules", () => {
    expect(hasPermission("director", "schedules:manage")).toBe(true);
  });

  it("director can generate reports", () => {
    expect(hasPermission("director", "reports:generate")).toBe(true);
  });

  it("staff cannot invite members", () => {
    expect(hasPermission("staff", "members:invite")).toBe(false);
  });
});

describe("enums", () => {
  it("AGE_GROUPS has 4 entries", () => {
    expect(AGE_GROUPS).toHaveLength(4);
  });

  it("ENROLLMENT_STATUSES has 3 entries", () => {
    expect(ENROLLMENT_STATUSES).toHaveLength(3);
  });

  it("SUBSIDY_PROGRAMS has 4 entries", () => {
    expect(SUBSIDY_PROGRAMS).toHaveLength(4);
  });
});
```

- [ ] **Step 19: Run tests**

```bash
pnpm --filter @pebbledesk/shared test
```

Expected: all tests pass.

- [ ] **Step 20: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package — types, zod validators, role constants"
```

---

## Task 3: packages/db — Drizzle Schema + Neon Client

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/centers.ts`
- Create: `packages/db/src/schema/auth.ts`
- Create: `packages/db/src/schema/memberships.ts`
- Create: `packages/db/src/schema/classrooms.ts`
- Create: `packages/db/src/schema/children.ts`
- Create: `packages/db/src/schema/guardians.ts`
- Create: `packages/db/src/schema/attendance.ts`
- Create: `packages/db/src/schema/ratios.ts`
- Create: `packages/db/src/schema/subsidies.ts`
- Create: `packages/db/src/schema/billing.ts`
- Create: `packages/db/src/schema/scheduling.ts`
- Create: `packages/db/src/schema/messaging.ts`
- Create: `packages/db/src/schema/audit.ts`
- Create: `packages/db/src/schema/quickbooks.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "drizzle-orm": "^0.45",
    "@neondatabase/serverless": "^1.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31",
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create drizzle.config.ts**

```typescript
// packages/db/drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: Create client.ts**

```typescript
// packages/db/src/client.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof createDb>;
```

- [ ] **Step 5: Create schema/centers.ts**

```typescript
// packages/db/src/schema/centers.ts
import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const centers = pgTable("centers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number"),
  licensedCapacity: integer("licensed_capacity"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 6: Create schema/auth.ts**

These tables follow the Better Auth schema. Better Auth with Drizzle adapter expects these exact table/column names.

```typescript
// packages/db/src/schema/auth.ts
import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 7: Create schema/memberships.ts**

```typescript
// packages/db/src/schema/memberships.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { users } from "./auth";

export const memberships = pgTable("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["owner", "director", "staff"] }).notNull(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 8: Create schema/classrooms.ts**

```typescript
// packages/db/src/schema/classrooms.ts
import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";

export const classrooms = pgTable("classrooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ageGroup: text("age_group", { enum: ["infant", "toddler", "preschool", "school_age"] }).notNull(),
  maxCapacity: integer("max_capacity").notNull(),
  minRatioStaff: integer("min_ratio_staff").notNull(),
  minRatioChildren: integer("min_ratio_children").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classroomAssignments = pgTable("classroom_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull(),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  effectiveDate: text("effective_date").notNull(),
  endDate: text("end_date"),
});

export const staffAssignments = pgTable("staff_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  membershipId: uuid("membership_id").notNull(),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  effectiveDate: text("effective_date").notNull(),
  endDate: text("end_date"),
});
```

- [ ] **Step 9: Create schema/children.ts**

```typescript
// packages/db/src/schema/children.ts
import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";

export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  ageGroup: text("age_group", { enum: ["infant", "toddler", "preschool", "school_age"] }).notNull(),
  enrollmentStatus: text("enrollment_status", { enum: ["active", "inactive", "waitlist"] }).notNull().default("active"),
  subsidyEligible: boolean("subsidy_eligible").notNull().default(false),
  enrolledAt: timestamp("enrolled_at", { withTimezone: true }),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 10: Create schema/guardians.ts**

```typescript
// packages/db/src/schema/guardians.ts
import { pgTable, text, boolean, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { children } from "./children";

export const guardians = pgTable("guardians", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  relationship: text("relationship").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const childGuardians = pgTable("child_guardians", {
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  guardianId: uuid("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  authorizedPickup: boolean("authorized_pickup").notNull().default(true),
}, (table) => [
  primaryKey({ columns: [table.childId, table.guardianId] }),
]);
```

- [ ] **Step 11: Create schema/attendance.ts**

```typescript
// packages/db/src/schema/attendance.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { children } from "./children";
import { classrooms } from "./classrooms";
import { memberships } from "./memberships";

export const checkIns = pgTable("check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
  checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
  checkedInBy: uuid("checked_in_by").notNull().references(() => memberships.id),
  checkedOutBy: uuid("checked_out_by").references(() => memberships.id),
  notes: text("notes"),
});

export const staffCheckIns = pgTable("staff_check_ins", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  clockedInAt: timestamp("clocked_in_at", { withTimezone: true }).notNull().defaultNow(),
  clockedOutAt: timestamp("clocked_out_at", { withTimezone: true }),
});
```

- [ ] **Step 12: Create schema/ratios.ts**

```typescript
// packages/db/src/schema/ratios.ts
import { pgTable, text, integer, boolean, timestamp, uuid, real } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { classrooms } from "./classrooms";
import { memberships } from "./memberships";

export const ratioSnapshots = pgTable("ratio_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  childrenCount: integer("children_count").notNull(),
  staffCount: integer("staff_count").notNull(),
  ratioRequired: real("ratio_required").notNull(),
  ratioActual: real("ratio_actual").notNull(),
  inCompliance: boolean("in_compliance").notNull(),
});

export const ratioViolations = pgTable("ratio_violations", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  childrenCount: integer("children_count").notNull(),
  staffCount: integer("staff_count").notNull(),
  ratioRequired: real("ratio_required").notNull(),
  ratioActual: real("ratio_actual").notNull(),
  resolvedBy: uuid("resolved_by").references(() => memberships.id),
  resolutionNotes: text("resolution_notes"),
});
```

- [ ] **Step 13: Create schema/subsidies.ts**

```typescript
// packages/db/src/schema/subsidies.ts
import { pgTable, text, integer, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { children } from "./children";

export const subsidyCases = pgTable("subsidy_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  childId: uuid("child_id").notNull().references(() => children.id, { onDelete: "cascade" }),
  program: text("program", { enum: ["ccdf", "state_voucher", "head_start", "other"] }).notNull(),
  caseNumber: text("case_number").notNull(),
  agencyName: text("agency_name").notNull(),
  authorizedHoursWeekly: real("authorized_hours_weekly").notNull(),
  rateDaily: real("rate_daily"),
  rateWeekly: real("rate_weekly"),
  effectiveDate: text("effective_date").notNull(),
  endDate: text("end_date"),
  status: text("status", { enum: ["active", "pending", "expired", "denied"] }).notNull().default("active"),
});

export const subsidyClaims = pgTable("subsidy_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  subsidyCaseId: uuid("subsidy_case_id").notNull().references(() => subsidyCases.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  daysAttended: integer("days_attended").notNull(),
  hoursAttended: real("hours_attended").notNull(),
  amountClaimed: real("amount_claimed").notNull(),
  amountPaid: real("amount_paid"),
  status: text("status", { enum: ["draft", "submitted", "paid", "denied", "appealed"] }).notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  denialReason: text("denial_reason"),
});
```

- [ ] **Step 14: Create schema/billing.ts**

```typescript
// packages/db/src/schema/billing.ts
import { pgTable, text, real, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { guardians } from "./guardians";
import { children } from "./children";

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  guardianId: uuid("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  subtotal: real("subtotal").notNull().default(0),
  subsidyCredit: real("subsidy_credit").notNull().default(0),
  amountDue: real("amount_due").notNull().default(0),
  status: text("status", { enum: ["draft", "sent", "paid", "overdue", "void"] }).notNull().default("draft"),
  dueDate: text("due_date").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  amount: real("amount").notNull(),
  childId: uuid("child_id").references(() => children.id),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amount: real("amount").notNull(),
  method: text("method", { enum: ["card", "ach", "check", "cash"] }).notNull(),
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 15: Create schema/scheduling.ts**

```typescript
// packages/db/src/schema/scheduling.ts
import { pgTable, text, integer, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { classrooms } from "./classrooms";
import { memberships } from "./memberships";

export const schedules = pgTable("schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  effectiveFrom: text("effective_from").notNull(),
  effectiveUntil: text("effective_until"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  scheduleId: uuid("schedule_id").notNull().references(() => schedules.id, { onDelete: "cascade" }),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
  classroomId: uuid("classroom_id").notNull().references(() => classrooms.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
});

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  membershipId: uuid("membership_id").notNull().references(() => memberships.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  hoursWorked: real("hours_worked").notNull(),
  hoursScheduled: real("hours_scheduled").notNull(),
  overtimeHours: real("overtime_hours").notNull().default(0),
  status: text("status", { enum: ["auto", "manual", "approved"] }).notNull().default("auto"),
});
```

- [ ] **Step 16: Create schema/messaging.ts**

```typescript
// packages/db/src/schema/messaging.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { users } from "./auth";
import { classrooms } from "./classrooms";
import { guardians } from "./guardians";

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  messageType: text("message_type", { enum: ["announcement", "direct", "alert"] }).notNull(),
  classroomId: uuid("classroom_id").references(() => classrooms.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageRecipients = pgTable("message_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  guardianId: uuid("guardian_id").notNull().references(() => guardians.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});
```

- [ ] **Step 17: Create schema/audit.ts**

```typescript
// packages/db/src/schema/audit.ts
import { pgTable, text, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";
import { users } from "./auth";
import { memberships } from "./memberships";

export const auditReports = pgTable("audit_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  reportType: text("report_type", { enum: ["attendance", "ratio", "subsidy", "licensing"] }).notNull(),
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  generatedBy: uuid("generated_by").notNull().references(() => memberships.id),
  fileUrl: text("file_url").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 18: Create schema/quickbooks.ts**

```typescript
// packages/db/src/schema/quickbooks.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { centers } from "./centers";

export const quickbooksConnections = pgTable("quickbooks_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  realmId: text("realm_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
});

export const quickbooksSyncLog = pgTable("quickbooks_sync_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  centerId: uuid("center_id").notNull().references(() => centers.id, { onDelete: "cascade" }),
  connectionId: uuid("connection_id").notNull().references(() => quickbooksConnections.id, { onDelete: "cascade" }),
  entityType: text("entity_type", { enum: ["invoice", "payment"] }).notNull(),
  entityId: text("entity_id").notNull(),
  qbId: text("qb_id").notNull(),
  direction: text("direction", { enum: ["push", "pull"] }).notNull(),
  status: text("status", { enum: ["success", "error"] }).notNull(),
  errorMessage: text("error_message"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 19: Create schema/index.ts**

```typescript
// packages/db/src/schema/index.ts
export * from "./centers";
export * from "./auth";
export * from "./memberships";
export * from "./classrooms";
export * from "./children";
export * from "./guardians";
export * from "./attendance";
export * from "./ratios";
export * from "./subsidies";
export * from "./billing";
export * from "./scheduling";
export * from "./messaging";
export * from "./audit";
export * from "./quickbooks";
```

- [ ] **Step 20: Create src/index.ts**

```typescript
// packages/db/src/index.ts
export * from "./schema/index";
export { createDb, type Database } from "./client";
```

- [ ] **Step 21: Run typecheck**

```bash
pnpm --filter @pebbledesk/db typecheck
```

Expected: no type errors.

- [ ] **Step 22: Generate initial migration**

Requires `DATABASE_URL` in `.env` at monorepo root pointing to a Neon database. Create the Neon project first if it doesn't exist.

```bash
cd packages/db && pnpm db:generate
```

Expected: migration SQL files generated in `packages/db/drizzle/`.

- [ ] **Step 23: Commit**

```bash
git add packages/db/
git commit -m "feat: add db package — full drizzle schema (23 tables), neon client"
```

---

## Task 4: packages/auth — Better Auth Config

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/tsconfig.json`
- Create: `packages/auth/src/index.ts`
- Create: `packages/auth/src/server.ts`
- Create: `packages/auth/src/client.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/auth",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/server.ts",
    "./client": "./src/client.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-auth": "^1.6",
    "drizzle-orm": "^0.45",
    "@neondatabase/serverless": "^1.0"
  },
  "devDependencies": {
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create server.ts**

```typescript
// packages/auth/src/server.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@pebbledesk/db";

export interface AuthConfig {
  db: Database;
  secret: string;
  baseURL: string;
  googleClientId?: string;
  googleClientSecret?: string;
}

export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, { provider: "pg" }),
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      ...(config.googleClientId && config.googleClientSecret
        ? {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
            },
          }
        : {}),
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 4: Create client.ts**

```typescript
// packages/auth/src/client.ts
import { createAuthClient } from "better-auth/react";

export function createBetterAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
  });
}

export type AuthClient = ReturnType<typeof createBetterAuthClient>;
```

- [ ] **Step 5: Create index.ts**

```typescript
// packages/auth/src/index.ts
export { createAuth, type Auth, type AuthConfig } from "./server";
export { createBetterAuthClient, type AuthClient } from "./client";
```

- [ ] **Step 6: Run typecheck**

```bash
pnpm --filter @pebbledesk/auth typecheck
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/auth/
git commit -m "feat: add auth package — better auth server + client config"
```

---

## Task 5: packages/ui — Shadcn + Tailwind Setup

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/globals.css`
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/components/button.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./globals.css": "./src/globals.css",
    "./lib/utils": "./src/lib/utils.ts",
    "./components/*": "./src/components/*.tsx"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "class-variance-authority": "^0.7",
    "clsx": "^2.1",
    "tailwind-merge": "^3.0",
    "lucide-react": "^0.475",
    "@radix-ui/react-slot": "^1.1"
  },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19",
    "tailwindcss": "^4"
  },
  "devDependencies": {
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create globals.css**

```css
/* packages/ui/src/globals.css */
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

@theme {
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-card: #ffffff;
  --color-card-foreground: #0f172a;
  --color-popover: #ffffff;
  --color-popover-foreground: #0f172a;
  --color-primary: #4f46e5;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f1f5f9;
  --color-secondary-foreground: #0f172a;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-accent: #f59e0b;
  --color-accent-foreground: #0f172a;
  --color-destructive: #ef4444;
  --color-destructive-foreground: #ffffff;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #4f46e5;
  --color-sidebar-background: #0f172a;
  --color-sidebar-foreground: #e2e8f0;
  --color-sidebar-primary: #4f46e5;
  --color-sidebar-primary-foreground: #ffffff;
  --color-sidebar-accent: #1e293b;
  --color-sidebar-accent-foreground: #e2e8f0;
  --color-sidebar-border: #1e293b;
  --radius: 0.5rem;
  --font-sans: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-family: var(--font-sans);
  }
}
```

- [ ] **Step 4: Create lib/utils.ts**

```typescript
// packages/ui/src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 5: Create components/button.tsx**

```tsx
// packages/ui/src/components/button.tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
```

- [ ] **Step 6: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "src/components",
    "utils": "src/lib/utils",
    "ui": "src/components",
    "lib": "src/lib"
  }
}
```

- [ ] **Step 7: Create index.ts**

```typescript
// packages/ui/src/index.ts
export { Button, buttonVariants, type ButtonProps } from "./components/button";
export { cn } from "./lib/utils";
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm --filter @pebbledesk/ui typecheck
```

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/ui/
git commit -m "feat: add ui package — shadcn button, tailwind theme, pebbledesk design tokens"
```

---

## Task 6: apps/api — Hono + Auth + Core Routes

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/wrangler.jsonc`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/src/lib/context.ts`
- Create: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/middleware/audit.ts`
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/src/routes/centers.ts`
- Create: `apps/api/src/routes/members.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/api",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "build": "wrangler deploy --dry-run --outdir dist",
    "deploy": "wrangler deploy",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest watch"
  },
  "dependencies": {
    "hono": "^4.12",
    "@hono/zod-validator": "^0.7",
    "@pebbledesk/db": "workspace:*",
    "@pebbledesk/auth": "workspace:*",
    "@pebbledesk/shared": "workspace:*",
    "drizzle-orm": "^0.45",
    "@neondatabase/serverless": "^1.0",
    "better-auth": "^1.6",
    "zod": "^3.25"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4",
    "typescript": "^5.8",
    "vitest": "^4.1",
    "wrangler": "^4"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["@cloudflare/workers-types"],
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create wrangler.jsonc**

```jsonc
{
  "name": "pebbledesk-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "compatibility_flags": ["nodejs_compat"],

  // Hyperdrive binding — connect to Neon
  "hyperdrive": [
    {
      "binding": "HYPERDRIVE",
      "id": "YOUR_HYPERDRIVE_ID"
    }
  ],

  // Environment variables (non-secret)
  "vars": {
    "BETTER_AUTH_URL": "http://localhost:8790"
  }

  // Secrets (set via `wrangler secret put`):
  // BETTER_AUTH_SECRET
  // DATABASE_URL (fallback for local dev without Hyperdrive)
  // GOOGLE_CLIENT_ID
  // GOOGLE_CLIENT_SECRET
}
```

- [ ] **Step 4: Create lib/context.ts**

```typescript
// apps/api/src/lib/context.ts
import type { Context } from "hono";
import type { Role } from "@pebbledesk/shared";
import type { Database } from "@pebbledesk/db";
import type { Auth } from "@pebbledesk/auth";

export interface Env {
  Bindings: {
    HYPERDRIVE: Hyperdrive;
    DATABASE_URL?: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
  };
  Variables: {
    db: Database;
    auth: Auth;
    userId: string;
    centerId: string;
    membershipId: string;
    role: Role;
  };
}

export type AppContext = Context<Env>;
```

- [ ] **Step 5: Create lib/errors.ts**

```typescript
// apps/api/src/lib/errors.ts
import { HTTPException } from "hono/http-exception";

export function unauthorized(message = "Unauthorized") {
  return new HTTPException(401, { message });
}

export function forbidden(message = "Forbidden") {
  return new HTTPException(403, { message });
}

export function notFound(message = "Not found") {
  return new HTTPException(404, { message });
}

export function badRequest(message = "Bad request") {
  return new HTTPException(400, { message });
}
```

- [ ] **Step 6: Create middleware/auth.ts**

```typescript
// apps/api/src/middleware/auth.ts
import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { createDb } from "@pebbledesk/db";
import { memberships } from "@pebbledesk/db/schema";
import { createAuth } from "@pebbledesk/auth/server";
import { unauthorized } from "../lib/errors";
import type { Env } from "../lib/context";
import type { Role } from "@pebbledesk/shared";

/**
 * Initializes db and auth on the context.
 * Does NOT require authentication — use `requireAuth` for protected routes.
 */
export const initMiddleware = createMiddleware<Env>(async (c, next) => {
  const dbUrl = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
  if (!dbUrl) throw new Error("No database connection string available");

  const db = createDb(dbUrl);
  c.set("db", db);

  const auth = createAuth({
    db,
    secret: c.env.BETTER_AUTH_SECRET,
    baseURL: c.env.BETTER_AUTH_URL,
    googleClientId: c.env.GOOGLE_CLIENT_ID,
    googleClientSecret: c.env.GOOGLE_CLIENT_SECRET,
  });
  c.set("auth", auth);

  await next();
});

/**
 * Requires a valid session. Resolves user → membership → center_id + role.
 */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw unauthorized();
  }

  const db = c.get("db");
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, session.user.id),
      // For now, pick the first membership. Multi-center support can add a header later.
    ),
  });

  if (!membership) {
    // User exists but has no center yet — allow through with no center context.
    // Routes that need a center should check for centerId.
    c.set("userId", session.user.id);
    await next();
    return;
  }

  c.set("userId", session.user.id);
  c.set("centerId", membership.centerId);
  c.set("membershipId", membership.id);
  c.set("role", membership.role as Role);
  await next();
});

/**
 * Requires a specific role or higher.
 */
export function requireRole(...allowedRoles: Role[]) {
  return createMiddleware<Env>(async (c, next) => {
    const role = c.get("role");
    if (!role || !allowedRoles.includes(role)) {
      throw new HTTPException(403, { message: "Insufficient permissions" });
    }
    await next();
  });
}
```

Note: add `import { HTTPException } from "hono/http-exception";` at the top of the requireRole function file.

- [ ] **Step 7: Create middleware/audit.ts**

```typescript
// apps/api/src/middleware/audit.ts
import { createMiddleware } from "hono/factory";
import { auditLog } from "@pebbledesk/db/schema";
import type { Env } from "../lib/context";

export const auditMiddleware = createMiddleware<Env>(async (c, next) => {
  await next();

  // Only log mutations
  const method = c.req.method;
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return;

  // Skip auth routes
  if (c.req.path.startsWith("/api/auth/")) return;

  const userId = c.get("userId");
  const centerId = c.get("centerId");
  if (!userId || !centerId) return;

  const db = c.get("db");

  try {
    await db.insert(auditLog).values({
      centerId,
      userId,
      action: method === "DELETE" ? "delete" : method === "POST" ? "create" : "update",
      entityType: c.req.path.split("/")[2] ?? "unknown",
      entityId: c.req.param("id") ?? "unknown",
      changes: {},
      ipAddress: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? null,
    });
  } catch {
    // Audit logging should never break the request
    console.error("Failed to write audit log");
  }
});
```

- [ ] **Step 8: Create routes/auth.ts**

```typescript
// apps/api/src/routes/auth.ts
import { Hono } from "hono";
import type { Env } from "../lib/context";

const authRoutes = new Hono<Env>();

authRoutes.all("/auth/*", async (c) => {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
});

export { authRoutes };
```

- [ ] **Step 9: Create routes/centers.ts**

```typescript
// apps/api/src/routes/centers.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { centers, memberships } from "@pebbledesk/db/schema";
import { createCenterSchema, updateCenterSchema } from "@pebbledesk/shared/validators";
import { requireAuth, requireRole } from "../middleware/auth";
import { notFound } from "../lib/errors";
import type { Env } from "../lib/context";

const centerRoutes = new Hono<Env>();

// Create a center — any authenticated user (becomes owner)
centerRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createCenterSchema),
  async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const data = c.req.valid("json");

    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const [center] = await db
      .insert(centers)
      .values({ ...data, slug })
      .returning();

    // Make the creator the owner
    await db.insert(memberships).values({
      centerId: center.id,
      userId,
      role: "owner",
      acceptedAt: new Date(),
    });

    return c.json(center, 201);
  }
);

// Get center by ID
centerRoutes.get(
  "/:id",
  requireAuth,
  async (c) => {
    const db = c.get("db");
    const centerId = c.get("centerId");
    const id = c.req.param("id");

    // Users can only access their own center
    if (id !== centerId) throw notFound();

    const center = await db.query.centers.findFirst({
      where: eq(centers.id, id),
    });

    if (!center) throw notFound();
    return c.json(center);
  }
);

// Update center — owner only
centerRoutes.patch(
  "/:id",
  requireAuth,
  requireRole("owner"),
  zValidator("json", updateCenterSchema),
  async (c) => {
    const db = c.get("db");
    const centerId = c.get("centerId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    if (id !== centerId) throw notFound();

    const [updated] = await db
      .update(centers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(centers.id, id))
      .returning();

    if (!updated) throw notFound();
    return c.json(updated);
  }
);

export { centerRoutes };
```

- [ ] **Step 10: Create routes/members.ts**

```typescript
// apps/api/src/routes/members.ts
import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { memberships, users } from "@pebbledesk/db/schema";
import { requireAuth, requireRole } from "../middleware/auth";
import { notFound, badRequest } from "../lib/errors";
import type { Env } from "../lib/context";

const memberRoutes = new Hono<Env>();

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["director", "staff"]),
});

// List members of the center
memberRoutes.get(
  "/",
  requireAuth,
  async (c) => {
    const db = c.get("db");
    const centerId = c.get("centerId");

    if (!centerId) throw badRequest("No center context");

    const members = await db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        invitedAt: memberships.invitedAt,
        acceptedAt: memberships.acceptedAt,
        createdAt: memberships.createdAt,
        userName: users.name,
        userEmail: users.email,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.centerId, centerId));

    return c.json(members);
  }
);

// Invite a member — owner only
memberRoutes.post(
  "/invites",
  requireAuth,
  requireRole("owner"),
  zValidator("json", inviteSchema),
  async (c) => {
    const db = c.get("db");
    const centerId = c.get("centerId");
    const { email, role } = c.req.valid("json");

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw badRequest("No user found with that email. They must sign up first.");
    }

    // Check if already a member
    const existing = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.centerId, centerId),
        eq(memberships.userId, user.id),
      ),
    });

    if (existing) {
      throw badRequest("User is already a member of this center.");
    }

    const [membership] = await db
      .insert(memberships)
      .values({
        centerId,
        userId: user.id,
        role,
        invitedAt: new Date(),
      })
      .returning();

    return c.json(membership, 201);
  }
);

// Remove a member — owner only
memberRoutes.delete(
  "/:memberId",
  requireAuth,
  requireRole("owner"),
  async (c) => {
    const db = c.get("db");
    const centerId = c.get("centerId");
    const memberId = c.req.param("memberId");

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.id, memberId),
        eq(memberships.centerId, centerId),
      ),
    });

    if (!membership) throw notFound();
    if (membership.role === "owner") {
      throw badRequest("Cannot remove the owner.");
    }

    await db.delete(memberships).where(eq(memberships.id, memberId));
    return c.json({ success: true });
  }
);

export { memberRoutes };
```

- [ ] **Step 11: Create index.ts — main app entry**

```typescript
// apps/api/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { initMiddleware } from "./middleware/auth";
import { auditMiddleware } from "./middleware/audit";
import { authRoutes } from "./routes/auth";
import { centerRoutes } from "./routes/centers";
import { memberRoutes } from "./routes/members";
import type { Env } from "./lib/context";

const app = new Hono<Env>();

// Global middleware
app.use("*", cors({
  origin: ["http://localhost:3040", "https://app.pebbledesk.app"],
  credentials: true,
}));
app.use("*", initMiddleware);
app.use("*", auditMiddleware);

// Routes
app.route("/api", authRoutes);
app.route("/api/centers", centerRoutes);
app.route("/api/members", memberRoutes);

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Global error handler
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
```

- [ ] **Step 12: Run typecheck**

```bash
pnpm --filter @pebbledesk/api typecheck
```

Expected: no type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/api/
git commit -m "feat: add api app — hono, better auth, center + member routes, auth middleware"
```

---

## Task 7: apps/web — React + Vite + TanStack Router Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/router.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/routes/__root.tsx`
- Create: `apps/web/src/routes/_auth.tsx`
- Create: `apps/web/src/routes/_auth/dashboard.tsx`
- Create: `apps/web/src/routes/login.tsx`
- Create: `apps/web/src/routes/signup.tsx`
- Create: `apps/web/src/routes/onboarding.tsx`
- Create: `apps/web/src/components/sidebar.tsx`
- Create: `apps/web/src/components/header.tsx`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@pebbledesk/web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "vite build && wrangler pages deploy dist --project-name pebbledesk-web",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19",
    "react-dom": "^19",
    "@tanstack/react-router": "^1.168",
    "@tanstack/react-query": "^5.96",
    "hono": "^4.12",
    "@pebbledesk/ui": "workspace:*",
    "@pebbledesk/auth": "workspace:*",
    "@pebbledesk/shared": "workspace:*",
    "lucide-react": "^0.475"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4",
    "@tanstack/router-plugin": "^1",
    "@tailwindcss/vite": "^4",
    "tailwindcss": "^4",
    "vite": "^8",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^5.8"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
// apps/web/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3040,
    proxy: {
      "/api": {
        target: "http://localhost:8790",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PebbleDesk</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/api.ts**

```typescript
// apps/web/src/api.ts
import { hc } from "hono/client";
import type app from "@pebbledesk/api/src/index";

const API_URL = import.meta.env.VITE_API_URL ?? "";

export const api = hc<typeof app>(API_URL, {
  init: {
    credentials: "include",
  },
});
```

Note: this relies on the Hono app type being exported from the API. The proxy in vite.config.ts handles routing `/api` requests to the Workers dev server during development.

- [ ] **Step 6: Create src/main.tsx**

```tsx
// apps/web/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import "@pebbledesk/ui/globals.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
```

- [ ] **Step 7: Create src/router.tsx**

```tsx
// apps/web/src/router.tsx
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
```

- [ ] **Step 8: Create src/routes/__root.tsx**

```tsx
// apps/web/src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => <Outlet />,
});
```

- [ ] **Step 9: Create src/routes/login.tsx**

```tsx
// apps/web/src/routes/login.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui";

const authClient = createBetterAuthClient("");

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await authClient.signIn.email({ email, password });
    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "Sign in failed");
      return;
    }

    navigate({ to: "/dashboard" });
  }

  async function handleGoogleSignIn() {
    await authClient.signIn.social({ provider: "google" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in to PebbleDesk</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            The audit-ready childcare platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="border-border w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background text-muted-foreground px-2">or</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogleSignIn}>
          Continue with Google
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Don't have an account?{" "}
          <a href="/signup" className="text-primary underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create src/routes/signup.tsx**

```tsx
// apps/web/src/routes/signup.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui";

const authClient = createBetterAuthClient("");

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await authClient.signUp.email({ name, email, password });
    setLoading(false);

    if (result.error) {
      setError(result.error.message ?? "Sign up failed");
      return;
    }

    // After signup, go to onboarding to create a center
    navigate({ to: "/onboarding" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Start managing your center in minutes
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="text-sm font-medium">
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm"
              minLength={8}
              required
            />
          </div>

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <a href="/login" className="text-primary underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Create src/routes/onboarding.tsx**

```tsx
// apps/web/src/routes/onboarding.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@pebbledesk/ui";
import { api } from "../api";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    timezone: "America/Chicago",
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await api.api.centers.$post({ json: form });

    if (!res.ok) {
      const body = await res.json();
      setError((body as { error?: string }).error ?? "Failed to create center");
      setLoading(false);
      return;
    }

    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Set up your center</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Tell us about your childcare program
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="text-sm font-medium">Center name</label>
            <input id="name" type="text" value={form.name} onChange={(e) => updateField("name", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" required />
          </div>
          <div>
            <label htmlFor="address" className="text-sm font-medium">Street address</label>
            <input id="address" type="text" value={form.address} onChange={(e) => updateField("address", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="city" className="text-sm font-medium">City</label>
              <input id="city" type="text" value={form.city} onChange={(e) => updateField("city", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label htmlFor="state" className="text-sm font-medium">State</label>
              <input id="state" type="text" value={form.state} onChange={(e) => updateField("state", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" maxLength={2} placeholder="TX" required />
            </div>
            <div>
              <label htmlFor="zip" className="text-sm font-medium">ZIP</label>
              <input id="zip" type="text" value={form.zip} onChange={(e) => updateField("zip", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" placeholder="78701" required />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className="text-sm font-medium">Phone</label>
            <input id="phone" type="tel" value={form.phone} onChange={(e) => updateField("phone", e.target.value)} className="border-input bg-background mt-1 block w-full rounded-md border px-3 py-2 text-sm" required />
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating center..." : "Create center"}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Create src/components/sidebar.tsx**

```tsx
// apps/web/src/components/sidebar.tsx
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  UserCheck,
  Ratio,
  Users,
  Contact,
  DoorOpen,
  Calendar,
  FileText,
  Receipt,
  ClipboardList,
  Clock,
  MessageSquare,
  Settings,
} from "lucide-react";
import type { Role } from "@pebbledesk/shared";
import { cn } from "@pebbledesk/ui";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["owner", "director", "staff"] },
      { label: "Attendance", href: "/attendance", icon: UserCheck, roles: ["owner", "director", "staff"] },
      { label: "Ratios", href: "/ratios", icon: Ratio, roles: ["owner", "director"] },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Children", href: "/children", icon: Users, roles: ["owner", "director"] },
      { label: "Guardians", href: "/guardians", icon: Contact, roles: ["owner", "director"] },
      { label: "Classrooms", href: "/classrooms", icon: DoorOpen, roles: ["owner", "director"] },
      { label: "Scheduling", href: "/scheduling", icon: Calendar, roles: ["owner", "director"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Subsidies", href: "/subsidies", icon: FileText, roles: ["owner", "director"] },
      { label: "Billing", href: "/billing", icon: Receipt, roles: ["owner"] },
    ],
  },
  {
    label: "Compliance",
    items: [
      { label: "Reports", href: "/reports", icon: ClipboardList, roles: ["owner", "director"] },
      { label: "Messages", href: "/messages", icon: MessageSquare, roles: ["owner", "director", "staff"] },
    ],
  },
];

interface SidebarProps {
  role: Role;
}

export function Sidebar({ role }: SidebarProps) {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <aside className="flex h-screen w-56 flex-col bg-sidebar-background text-sidebar-foreground">
      <div className="p-4">
        <span className="text-lg font-bold text-white">PebbleDesk</span>
      </div>

      <nav className="flex-1 space-y-4 px-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) =>
            item.roles.includes(role)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
                {group.label}
              </p>
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    currentPath === item.href
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <div className="border-sidebar-border border-t p-3">
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent/50"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
```

- [ ] **Step 13: Create src/components/header.tsx**

```tsx
// apps/web/src/components/header.tsx
interface HeaderProps {
  centerName: string;
  centerState: string;
  userName: string;
}

export function Header({ centerName, centerState, userName }: HeaderProps) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="border-border flex h-14 items-center justify-between border-b px-6">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{centerName}</span>
        <span className="text-muted-foreground text-xs">{centerState}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
          All Ratios OK
        </div>
        <div className="bg-primary text-primary-foreground flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold">
          {initials}
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 14: Create src/routes/_auth.tsx — authenticated layout**

```tsx
// apps/web/src/routes/_auth.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Sidebar } from "../components/sidebar";
import { Header } from "../components/header";

export const Route = createFileRoute("/_auth")({
  // TODO: Add auth check via loader once session query is wired up.
  // For now, this layout renders the shell unconditionally.
  component: AuthLayout,
});

function AuthLayout() {
  // Placeholder values — will be replaced with real data from session/center queries
  const role = "owner" as const;
  const centerName = "My Center";
  const centerState = "TX";
  const userName = "User";

  return (
    <div className="flex h-screen">
      <Sidebar role={role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          centerName={centerName}
          centerState={centerState}
          userName={userName}
        />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 15: Create src/routes/_auth/dashboard.tsx**

```tsx
// apps/web/src/routes/_auth/dashboard.tsx
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        Today's attendance, ratio status, and alerts will appear here.
      </p>
    </div>
  );
}
```

- [ ] **Step 16: Install all dependencies**

```bash
pnpm install
```

- [ ] **Step 17: Generate route tree**

```bash
pnpm --filter @pebbledesk/web dev
```

This starts the Vite dev server. TanStack Router plugin auto-generates `src/routeTree.gen.ts`. Stop the server after confirming it starts without errors.

- [ ] **Step 18: Run typecheck**

```bash
pnpm --filter @pebbledesk/web typecheck
```

Expected: no type errors (or only minor ones to fix).

- [ ] **Step 19: Commit**

```bash
git add apps/web/
git commit -m "feat: add web app — react + vite + tanstack router, auth pages, dashboard shell"
```

---

## Task 8: End-to-End Smoke Test

**Files:** No new files. Verifies the full stack works together.

- [ ] **Step 1: Install all workspace dependencies**

```bash
pnpm install
```

- [ ] **Step 2: Run full typecheck**

```bash
pnpm typecheck
```

Expected: all packages and apps pass.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: `packages/shared` tests pass.

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: no errors (fix any formatting issues with `pnpm lint:fix`).

- [ ] **Step 5: Start API dev server**

```bash
pnpm --filter @pebbledesk/api dev
```

Expected: Wrangler starts on port 8790. Health check at `http://localhost:8790/api/health` returns `{"status":"ok"}`.

- [ ] **Step 6: Start web dev server (in another terminal)**

```bash
pnpm --filter @pebbledesk/web dev
```

Expected: Vite starts on port 3040. Opening `http://localhost:3040/login` shows the login page. Opening `http://localhost:3040/dashboard` shows the sidebar + header shell.

- [ ] **Step 7: Commit final state**

```bash
git add .
git commit -m "chore: verify full stack — typecheck, tests, lint all passing"
```

---

## Task 9: CLAUDE.md + Quality Gates

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CLAUDE.md with quality gates and workflow rules**

Use the ideas-validation `CLAUDE.md` as a reference for structure and standards. The CLAUDE.md must include:

- Project overview (PebbleDesk, monorepo structure, packages)
- Common commands (dev, build, typecheck, test, db, deploy)
- Environment variables table
- **Execution expectations:** work end-to-end, no progress check-ins
- **Required workflow:** worktree isolation (all work in git worktrees), sub-agent driven development, review before merge
- **Quality gates:** no placeholder code, no TODO/FIXME/HACK, no `any` type, no `eslint-disable`
- **TDD — mandatory:** write failing test first, confirm fail, implement, confirm pass, refactor
- **95% code coverage minimum on every file you touch** — not repo average, each individual file
- **Biome** for linting/formatting (not ESLint+Prettier like ideas-validation)
- **Design system:** use `teach-impeccable` skill for initial setup, `extract` for component consolidation, `normalize` for auditing consistency
- Reference to spec and plan docs

```markdown
# CLAUDE.md — PebbleDesk

This file provides guidance to Claude Code when working in this repository.

## Project Overview

PebbleDesk is a childcare center administration SaaS — "The Audit-Ready Childcare Platform." Monorepo with Turborepo + pnpm workspaces.

### Structure

\`\`\`
pebbledesk/
├── apps/
│   ├── web/          — React + Vite SPA (Cloudflare Pages)
│   └── api/          — Hono on Cloudflare Workers
├── packages/
│   ├── db/           — Drizzle schema, Neon client
│   ├── auth/         — Better Auth config
│   ├── shared/       — Types, Zod validators, constants
│   └── ui/           — Shadcn/UI, Tailwind, design tokens
\`\`\`

## Common Commands

\`\`\`bash
pnpm dev                        # all apps concurrently
pnpm --filter @pebbledesk/web dev   # web only
pnpm --filter @pebbledesk/api dev   # api only
pnpm build                      # turbo build
pnpm typecheck                  # turbo typecheck
pnpm test                       # turbo test
pnpm test:watch                 # vitest watch
pnpm lint                       # biome check
pnpm lint:fix                   # biome check --write
pnpm db:generate                # drizzle-kit generate
pnpm db:migrate                 # drizzle-kit migrate
pnpm db:studio                  # drizzle-kit studio
\`\`\`

## Execution Expectations

Work end-to-end without pausing for progress check-ins. Do not stop after completing a batch to ask "ready for feedback?" or "should I continue?". Execute the full plan autonomously. Asking clarifying questions about requirements is still expected.

### Required Workflow

- **Worktree isolation.** All feature/fix work MUST happen inside a git worktree. Use the \`using-git-worktrees\` skill to create one before writing any code.
- **Sub-agent driven development.** Use the \`subagent-driven-development\` skill to parallelize independent tasks.
- **Review before merge.** When implementation is complete: (1) spin up a review agent using \`requesting-code-review\`, (2) fix every issue the reviewer flags, (3) only then merge the worktree back to master using \`finishing-a-development-branch\`.

## Quality Gates

- **No placeholder code.** Every function must be fully implemented.
- **No TODO/FIXME/HACK comments.** If it needs doing, do it now.
- **No \`any\` type in TypeScript.** Use proper types or \`unknown\` with narrowing.
- **No \`biome-ignore\` without explanation.** Fix the lint error instead.

### Test-Driven Development (TDD) — MANDATORY

Every task follows this cycle. No exceptions:
1. **Write the failing test first.** The test must define expected behavior before any implementation exists.
2. **Run the test. Confirm it fails.** If it passes, your test is wrong.
3. **Write the minimal implementation** to make the test pass.
4. **Run the test. Confirm it passes.**
5. **Refactor** if needed, re-run tests to confirm still green.

### Coverage Requirements

- **95% code coverage minimum on every file you touch.** Not the repo average — each individual file.
- If a file drops below 95%, you are not done. Write more tests.
- Run coverage: \`pnpm test -- --coverage\`

## Design System

- Use \`teach-impeccable\` skill for initial design system setup (run once per project).
- Use \`extract\` skill to consolidate reusable components and design tokens into \`packages/ui\`.
- Use \`normalize\` skill to audit UI against design system standards.
- Design tokens (colors, fonts, spacing, radii) live in \`packages/ui/src/globals.css\`.
- All Shadcn components use new-york style.

## Key Decisions

- Row-level tenancy via \`center_id\` on every table
- Fixed roles: Owner, Director, Staff (no custom permissions)
- Better Auth (raw) for auth — email+password + Google OAuth
- Polling (15s) for ratio dashboard, not WebSockets
- Online-only for V1

## Reference Docs

- Design spec: \`docs/superpowers/specs/2026-04-07-pebbledesk-scaffold-design.md\`
- Implementation plan: \`docs/superpowers/plans/2026-04-07-phase1-foundation.md\`
\`\`\`

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md with quality gates, workflow rules, and design system setup"
```

---

## What's Next (Future Plans)

This plan delivers the foundation. Subsequent plans will cover:

1. **Phase 1.5: Design System** — Run `teach-impeccable` skill to establish persistent design guidelines, then build out initial component library in `packages/ui`
2. **Phase 2: Core Features** — Classrooms, Children, Guardians CRUD routes + UI pages
2. **Phase 3: Attendance & Ratios** — Check-in/out flow, ratio dashboard with polling, ratio snapshots
3. **Phase 4: Subsidies & Billing** — Subsidy cases, claims, reconciliation view, invoices, payments
4. **Phase 5: Scheduling & Messaging** — Staff schedules, shift management, parent messaging
5. **Phase 6: Reports & Audit** — Audit report generation, audit log viewer, compliance exports
6. **Phase 7: QuickBooks Integration** — OAuth connection, invoice/payment sync
7. **Phase 8: Polish** — Auth guards, role-based route protection, error boundaries, loading states
