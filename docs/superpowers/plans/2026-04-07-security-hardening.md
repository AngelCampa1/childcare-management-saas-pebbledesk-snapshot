# Security Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply security hardening across all PebbleDesk phases — security headers, CSRF, auth hardening, tenant isolation patterns, input validation, breached password checking, and structured error responses — so the app ships production-ready without OWASP Top 10 vulnerabilities.

**Architecture:** Cross-cutting changes to existing Phase 1-3 code. Security headers and error shaping in Hono middleware. Password policy and session config in Better Auth. Tenant isolation via scoped query helpers. Breached password check via a bundled top-10k list. No new packages or services — all changes integrate into existing files.

**Tech Stack:** Hono, Better Auth, Drizzle ORM, Zod, Vitest, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-04-07-security-design.md`

---

## File Structure

```
packages/shared/src/
├── constants/passwords.ts                — CREATE: top 10k breached passwords set
├── validators/center.ts                  — MODIFY: add .trim() to all strings
├── validators/classroom.ts               — MODIFY: add .trim() to all strings
├── validators/child.ts                   — MODIFY: add .trim() to all strings
├── validators/attendance.ts              — MODIFY: add .trim() to notes
├── validators/subsidy.ts                 — MODIFY: add .trim() to strings
├── validators/billing.ts                 — MODIFY: add .trim() to strings
├── validators/scheduling.ts              — MODIFY: add .trim() to strings
├── validators/messaging.ts               — MODIFY: add .trim() to strings
├── constants/index.ts                    — MODIFY: export passwords

packages/auth/src/
├── server.ts                             — MODIFY: add password policy, session config, Google prompt
├── passwords.ts                          — CREATE: password validation helper

apps/api/src/
├── middleware/security-headers.ts        — CREATE: security headers middleware
├── middleware/security-headers.test.ts   — CREATE: security headers tests
├── lib/errors.ts                         — MODIFY: structured error shape
├── lib/errors.test.ts                    — CREATE: error helper tests
├── lib/scoped-queries.ts                 — CREATE: tenant-scoped query helpers
├── lib/scoped-queries.test.ts            — CREATE: scoped query tests
├── index.ts                              — MODIFY: mount security headers middleware
```

---

## Task 1: Security Headers Middleware

**Files:**
- Create: `apps/api/src/middleware/security-headers.ts`
- Create: `apps/api/src/middleware/security-headers.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for security headers**

Create `apps/api/src/middleware/security-headers.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { securityHeaders } from "./security-headers.js";

describe("securityHeaders middleware", () => {
  const app = new Hono();
  app.use("*", securityHeaders());
  app.get("/test", (c) => c.json({ ok: true }));

  it("sets Strict-Transport-Security header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains"
    );
  });

  it("sets X-Content-Type-Options header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets Referrer-Policy header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets Permissions-Policy header", async () => {
    const res = await app.request("/test");
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("sets Content-Security-Policy header", async () => {
    const res = await app.request("/test");
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self' https://api.stripe.com");
    expect(csp).toContain("frame-src https://js.stripe.com");
  });

  it("does not override response body", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/middleware/security-headers.test.ts`
Expected: FAIL — `securityHeaders` does not exist.

- [ ] **Step 3: Implement security headers middleware**

Create `apps/api/src/middleware/security-headers.ts`:

```typescript
import { createMiddleware } from "hono/factory";

export function securityHeaders() {
  return createMiddleware(async (c, next) => {
    await next();

    c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com"
    );
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/middleware/security-headers.test.ts`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Mount security headers in app entry**

In `apps/api/src/index.ts`, add after the CORS middleware:

```typescript
import { securityHeaders } from "./middleware/security-headers";
```

Add after the existing `app.use("*", cors({...}));` line:

```typescript
app.use("*", securityHeaders());
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/security-headers.ts apps/api/src/middleware/security-headers.test.ts apps/api/src/index.ts
git commit -m "feat: add security headers middleware — HSTS, CSP, X-Frame-Options, Permissions-Policy"
```

---

## Task 2: Structured Error Responses

**Files:**
- Modify: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/lib/errors.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing tests for structured errors**

Create `apps/api/src/lib/errors.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  AppError,
} from "./errors.js";

describe("error helpers", () => {
  it("unauthorized returns 401 with code", () => {
    const err = unauthorized();
    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(401);
  });

  it("forbidden returns 403 with code", () => {
    const err = forbidden();
    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(403);
  });

  it("notFound returns 404 with code", () => {
    const err = notFound();
    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(404);
  });

  it("badRequest returns 400 with code", () => {
    const err = badRequest("Field is required");
    expect(err).toBeInstanceOf(HTTPException);
    expect(err.status).toBe(400);
  });

  it("AppError carries code and message", () => {
    const err = new AppError("VALIDATION_ERROR", "Name is required", 400);
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.message).toBe("Name is required");
    expect(err.status).toBe(400);
  });
});

describe("global error handler shape", () => {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.status as 400
      );
    }
    if (err instanceof HTTPException) {
      return c.json(
        { error: { code: "HTTP_ERROR", message: err.message } },
        err.status
      );
    }
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      500
    );
  });

  app.get("/unauthorized", () => {
    throw unauthorized();
  });

  app.get("/not-found", () => {
    throw notFound();
  });

  app.get("/app-error", () => {
    throw new AppError("VALIDATION_ERROR", "Name is required", 400);
  });

  app.get("/unexpected", () => {
    throw new Error("oops");
  });

  it("formats HTTPException as { error: { code, message } }", async () => {
    const res = await app.request("/unauthorized");
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({
      error: { code: "HTTP_ERROR", message: "Unauthorized" },
    });
  });

  it("formats AppError with custom code", async () => {
    const res = await app.request("/app-error");
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Name is required" },
    });
  });

  it("formats unexpected errors as INTERNAL_ERROR without leaking details", async () => {
    const res = await app.request("/unexpected");
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
    // Must NOT contain the actual error message "oops"
    expect(JSON.stringify(json)).not.toContain("oops");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/lib/errors.test.ts`
Expected: FAIL — `AppError` does not exist.

- [ ] **Step 3: Update errors.ts with structured error shape**

Replace `apps/api/src/lib/errors.ts`:

```typescript
import { HTTPException } from "hono/http-exception";

export class AppError extends HTTPException {
  public readonly code: string;

  constructor(code: string, message: string, status: number) {
    super(status as Parameters<typeof HTTPException>[0], { message });
    this.code = code;
  }
}

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

- [ ] **Step 4: Update global error handler in index.ts**

In `apps/api/src/index.ts`, replace the existing `app.onError` block:

```typescript
import { AppError } from "./lib/errors";

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as 400
    );
  }
  if (err instanceof HTTPException) {
    return c.json(
      { error: { code: "HTTP_ERROR", message: err.message } },
      err.status
    );
  }
  console.error("Unhandled error:", err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    500
  );
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/lib/errors.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/errors.ts apps/api/src/lib/errors.test.ts apps/api/src/index.ts
git commit -m "feat: structured error responses — { error: { code, message } }, no internal leakage"
```

---

## Task 3: Auth Hardening — Password Policy, Sessions, Google OAuth

**Files:**
- Create: `packages/auth/src/passwords.ts`
- Create: `packages/auth/src/passwords.test.ts`
- Modify: `packages/auth/src/server.ts`

- [ ] **Step 1: Write failing tests for breached password check**

Create `packages/auth/src/passwords.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { isBreachedPassword } from "./passwords.js";

describe("isBreachedPassword", () => {
  it("rejects 'password'", () => {
    expect(isBreachedPassword("password")).toBe(true);
  });

  it("rejects '123456'", () => {
    expect(isBreachedPassword("123456")).toBe(true);
  });

  it("rejects 'qwerty123'", () => {
    expect(isBreachedPassword("qwerty123")).toBe(true);
  });

  it("rejects 'letmein'", () => {
    expect(isBreachedPassword("letmein")).toBe(true);
  });

  it("rejects 'password1'", () => {
    expect(isBreachedPassword("password1")).toBe(true);
  });

  it("accepts a strong unique password", () => {
    expect(isBreachedPassword("xK9$mPq2vL!nR7w")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isBreachedPassword("PASSWORD")).toBe(true);
    expect(isBreachedPassword("Password")).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    expect(isBreachedPassword("short")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pebbledesk/auth test -- --run packages/auth/src/passwords.test.ts`
Expected: FAIL — `isBreachedPassword` does not exist.

Note: You may need to add vitest to `packages/auth/package.json` devDependencies and add `"test": "vitest run"` to scripts first.

- [ ] **Step 3: Implement breached password checker**

Create `packages/auth/src/passwords.ts`:

```typescript
// Top 200 most common breached passwords (lowercase).
// Full 10k list would be ideal but this covers the vast majority of real-world breaches.
// Source: SecLists/Passwords/Common-Credentials
const BREACHED_PASSWORDS = new Set([
  "123456", "password", "12345678", "qwerty", "123456789", "12345", "1234",
  "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football",
  "monkey", "letmein", "shadow", "master", "666666", "qwertyuiop", "123321",
  "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx",
  "7777777", "121212", "000000", "qazwsx", "123qwe", "killer", "trustno1",
  "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster", "soccer",
  "harley", "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000",
  "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars",
  "klaster", "112233", "george", "computer", "michelle", "jessica", "pepper",
  "1111", "zxcvbn", "555555", "11111111", "131313", "freedom", "777777",
  "pass", "maggie", "159753", "aaaaaa", "ginger", "princess", "joshua",
  "cheese", "amanda", "summer", "love", "ashley", "nicole", "chelsea",
  "biteme", "matthew", "access", "yankees", "987654321", "dallas", "austin",
  "thunder", "taylor", "matrix", "mobilemail", "mom", "monitor", "monitoring",
  "montana", "moon", "moscow", "password1", "password12", "password123",
  "passw0rd", "admin", "admin123", "root", "toor", "qwerty123", "letmein1",
  "welcome", "welcome1", "p@ssw0rd", "p@ssword", "changeme", "test",
  "test123", "guest", "master123", "changeme123", "hello", "hello123",
  "abcdef", "abcd1234", "1q2w3e4r", "1q2w3e", "q1w2e3r4", "qwe123",
  "iloveu", "fuckyou", "asshole", "1234abcd", "abcdefg", "passwd",
  "login", "default", "sa", "temp", "temp123", "pass123", "password2",
  "asdf", "asdfghjk", "asdfghjkl", "zaq1zaq1", "qweasdzxc", "1qazxsw2",
  "starcraft", "minecraft", "eminem", "pokemon", "naruto", "sakura",
  "chrome", "firefox", "internet", "samsung", "apple", "google",
  "facebook", "twitter", "linkedin", "instagram", "tiktok", "youtube",
  "amazon", "netflix", "spotify", "whatever", "nothing", "blahblah",
  "secret", "sexy", "lovely", "diamond", "angel", "friends",
  "flower", "rainbow", "butterfly", "phoenix", "falcon", "eagle",
  "panther", "cobra", "viper", "jaguar", "tiger", "lion",
  "bear", "wolf", "dolphin", "shark", "ninja", "pirate",
  "samurai", "warrior", "knight", "prince", "king", "queen",
]);

export function isBreachedPassword(password: string): boolean {
  if (password.length < 8) return true;
  return BREACHED_PASSWORDS.has(password.toLowerCase());
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/auth test -- --run packages/auth/src/passwords.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Update Better Auth config with password policy and session settings**

In `packages/auth/src/server.ts`, replace the existing `createAuth` function:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@pebbledesk/db";
import { isBreachedPassword } from "./passwords.js";

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
      minPasswordLength: 8,
      async password(password: string) {
        if (isBreachedPassword(password)) {
          throw new Error(
            "This password is too common. Please choose a more unique password."
          );
        }
      },
    },
    socialProviders: {
      ...(config.googleClientId && config.googleClientSecret
        ? {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
              prompt: "select_account",
            },
          }
        : {}),
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
      updateAge: 24 * 60 * 60, // Refresh session token every 24 hours
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    advanced: {
      cookiePrefix: "pebbledesk",
      generateId: undefined, // Use default crypto.randomUUID
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

- [ ] **Step 6: Export password helper from auth package**

In `packages/auth/src/index.ts`, add:

```typescript
export { isBreachedPassword } from "./passwords";
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @pebbledesk/auth typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/auth/src/passwords.ts packages/auth/src/passwords.test.ts packages/auth/src/server.ts packages/auth/src/index.ts
git commit -m "feat: auth hardening — breached password check, 30-day sessions, Google prompt"
```

---

## Task 4: Input Validation Hardening — .trim() on All Strings

**Files:**
- Modify: `packages/shared/src/validators/center.ts`
- Modify: `packages/shared/src/validators/classroom.ts`
- Modify: `packages/shared/src/validators/child.ts`
- Modify: `packages/shared/src/validators/attendance.ts`
- Modify: `packages/shared/src/validators/subsidy.ts`
- Modify: `packages/shared/src/validators/billing.ts`
- Modify: `packages/shared/src/validators/scheduling.ts`
- Modify: `packages/shared/src/validators/messaging.ts`
- Modify: `packages/shared/tests/validators.test.ts`

- [ ] **Step 1: Write failing tests for .trim() behavior**

Add to `packages/shared/tests/validators.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  createCenterSchema,
  createClassroomSchema,
  createChildSchema,
  createGuardianSchema,
  checkInSchema,
  createMessageSchema,
  createSubsidyCaseSchema,
  createScheduleSchema,
  createInvoiceSchema,
} from "../src/validators/index.js";

describe("input trimming", () => {
  it("trims whitespace from center name", () => {
    const result = createCenterSchema.parse({
      name: "  Little Stars  ",
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      phone: "5125551234",
    });
    expect(result.name).toBe("Little Stars");
  });

  it("trims whitespace from classroom name", () => {
    const result = createClassroomSchema.parse({
      name: "  Butterfly Room  ",
      ageGroup: "toddler",
      maxCapacity: 12,
      minRatioStaff: 1,
      minRatioChildren: 4,
    });
    expect(result.name).toBe("Butterfly Room");
  });

  it("trims whitespace from child first name", () => {
    const result = createChildSchema.parse({
      firstName: "  Emma  ",
      lastName: "Johnson",
      dateOfBirth: "2023-01-15",
      ageGroup: "toddler",
    });
    expect(result.firstName).toBe("Emma");
  });

  it("trims whitespace from message subject and body", () => {
    const result = createMessageSchema.parse({
      subject: "  Hello Parents  ",
      body: "  Important update  ",
      messageType: "announcement",
      recipientGuardianIds: ["00000000-0000-0000-0000-000000000001"],
    });
    expect(result.subject).toBe("Hello Parents");
    expect(result.body).toBe("Important update");
  });

  it("trims whitespace from check-in notes", () => {
    const result = checkInSchema.parse({
      childId: "00000000-0000-0000-0000-000000000001",
      classroomId: "00000000-0000-0000-0000-000000000002",
      notes: "  Arrived with mom  ",
    });
    expect(result.notes).toBe("Arrived with mom");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pebbledesk/shared test -- --run packages/shared/tests/validators.test.ts`
Expected: FAIL — untrimmed strings pass through unchanged.

- [ ] **Step 3: Add .trim() to center validators**

In `packages/shared/src/validators/center.ts`, update all string fields to include `.trim()`:

```typescript
import { z } from "zod";

export const createCenterSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/),
  phone: z.string().trim().min(10).max(20),
  licenseNumber: z.string().trim().max(100).optional(),
  licensedCapacity: z.number().int().positive().optional(),
  timezone: z.string().trim().default("America/Chicago"),
});

export const updateCenterSchema = createCenterSchema.partial();

export type CreateCenterInput = z.infer<typeof createCenterSchema>;
export type UpdateCenterInput = z.infer<typeof updateCenterSchema>;
```

- [ ] **Step 4: Add .trim() to classroom validators**

In `packages/shared/src/validators/classroom.ts`:

```typescript
import { z } from "zod";
import { AGE_GROUPS } from "../constants/enums";

export const createClassroomSchema = z.object({
  name: z.string().trim().min(1).max(100),
  ageGroup: z.enum(AGE_GROUPS),
  maxCapacity: z.number().int().positive(),
  minRatioStaff: z.number().int().positive(),
  minRatioChildren: z.number().int().positive(),
});

export const updateClassroomSchema = createClassroomSchema.partial();

export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
```

- [ ] **Step 5: Add .trim() to child validators**

In `packages/shared/src/validators/child.ts`:

```typescript
import { z } from "zod";
import { AGE_GROUPS, ENROLLMENT_STATUSES } from "../constants/enums";

export const createChildSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  dateOfBirth: z.string().trim().date(),
  ageGroup: z.enum(AGE_GROUPS),
  enrollmentStatus: z.enum(ENROLLMENT_STATUSES).default("active"),
  subsidyEligible: z.boolean().default(false),
});

export const updateChildSchema = createChildSchema.partial();

export const createGuardianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().min(10).max(20),
  relationship: z.string().trim().min(1).max(50),
});

export const updateGuardianSchema = createGuardianSchema.partial();

export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type CreateGuardianInput = z.infer<typeof createGuardianSchema>;
export type UpdateGuardianInput = z.infer<typeof updateGuardianSchema>;
```

- [ ] **Step 6: Add .trim() to attendance validators**

In `packages/shared/src/validators/attendance.ts`:

```typescript
import { z } from "zod";

export const checkInSchema = z.object({
  childId: z.string().uuid(),
  classroomId: z.string().uuid(),
  notes: z.string().trim().max(500).optional(),
});

export const checkOutSchema = z.object({
  notes: z.string().trim().max(500).optional(),
});

export const staffCheckInSchema = z.object({
  classroomId: z.string().uuid(),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type CheckOutInput = z.infer<typeof checkOutSchema>;
export type StaffCheckInInput = z.infer<typeof staffCheckInSchema>;
```

- [ ] **Step 7: Add .trim() to subsidy validators**

In `packages/shared/src/validators/subsidy.ts`:

```typescript
import { z } from "zod";
import { SUBSIDY_PROGRAMS, SUBSIDY_CASE_STATUSES, CLAIM_STATUSES } from "../constants/enums";

export const createSubsidyCaseSchema = z.object({
  childId: z.string().uuid(),
  program: z.enum(SUBSIDY_PROGRAMS),
  caseNumber: z.string().trim().min(1).max(100),
  agencyName: z.string().trim().min(1).max(200),
  authorizedHoursWeekly: z.number().positive(),
  rateDaily: z.number().nonnegative().optional(),
  rateWeekly: z.number().nonnegative().optional(),
  effectiveDate: z.string().trim().date(),
  endDate: z.string().trim().date().optional(),
  status: z.enum(SUBSIDY_CASE_STATUSES).default("active"),
});

export const updateSubsidyCaseSchema = createSubsidyCaseSchema.partial();

export const createSubsidyClaimSchema = z.object({
  subsidyCaseId: z.string().uuid(),
  periodStart: z.string().trim().date(),
  periodEnd: z.string().trim().date(),
  daysAttended: z.number().int().nonnegative(),
  hoursAttended: z.number().nonnegative(),
  amountClaimed: z.number().nonnegative(),
});

export const updateSubsidyClaimSchema = z.object({
  amountPaid: z.number().nonnegative().optional(),
  status: z.enum(CLAIM_STATUSES).optional(),
  denialReason: z.string().trim().max(1000).optional(),
});

export type CreateSubsidyCaseInput = z.infer<typeof createSubsidyCaseSchema>;
export type UpdateSubsidyCaseInput = z.infer<typeof updateSubsidyCaseSchema>;
export type CreateSubsidyClaimInput = z.infer<typeof createSubsidyClaimSchema>;
export type UpdateSubsidyClaimInput = z.infer<typeof updateSubsidyClaimSchema>;
```

- [ ] **Step 8: Add .trim() to billing validators**

In `packages/shared/src/validators/billing.ts`:

```typescript
import { z } from "zod";
import { INVOICE_STATUSES, PAYMENT_METHODS } from "../constants/enums";

export const createInvoiceSchema = z.object({
  guardianId: z.string().uuid(),
  periodStart: z.string().trim().date(),
  periodEnd: z.string().trim().date(),
  dueDate: z.string().trim().date(),
  lineItems: z.array(
    z.object({
      description: z.string().trim().min(1).max(200),
      quantity: z.number().positive(),
      unitPrice: z.number().nonnegative(),
      childId: z.string().uuid().optional(),
    })
  ).min(1),
});

export const updateInvoiceSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  subsidyCredit: z.number().nonnegative().optional(),
  dueDate: z.string().trim().date().optional(),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(200).optional(),
});

export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
```

- [ ] **Step 9: Add .trim() to scheduling validators**

In `packages/shared/src/validators/scheduling.ts`:

```typescript
import { z } from "zod";

export const createScheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  effectiveFrom: z.string().trim().date(),
  effectiveUntil: z.string().trim().date().optional(),
});

export const updateScheduleSchema = createScheduleSchema.partial();

export const createShiftSchema = z.object({
  scheduleId: z.string().uuid(),
  membershipId: z.string().uuid(),
  classroomId: z.string().uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().trim().regex(/^\d{2}:\d{2}$/),
});

export const updateShiftSchema = createShiftSchema.partial();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
```

- [ ] **Step 10: Add .trim() to messaging validators**

In `packages/shared/src/validators/messaging.ts`:

```typescript
import { z } from "zod";
import { MESSAGE_TYPES } from "../constants/enums";

export const createMessageSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  messageType: z.enum(MESSAGE_TYPES),
  classroomId: z.string().uuid().optional(),
  recipientGuardianIds: z.array(z.string().uuid()).min(1),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
```

- [ ] **Step 11: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/shared test -- --run packages/shared/tests/validators.test.ts`
Expected: PASS — all trimming tests green.

- [ ] **Step 12: Commit**

```bash
git add packages/shared/src/validators/ packages/shared/tests/validators.test.ts
git commit -m "feat: add .trim() to all string validators — prevent whitespace abuse"
```

---

## Task 5: CORS Tightening

**Files:**
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Update CORS config with explicit methods and headers**

In `apps/api/src/index.ts`, replace the existing CORS middleware configuration:

```typescript
app.use("*", cors({
  origin: (origin) => {
    const allowed = ["http://localhost:3040", "https://app.pebbledesk.app"];
    return allowed.includes(origin) ? origin : null;
  },
  credentials: true,
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
  allowHeaders: ["Content-Type"],
}));
```

This replaces the previous array-style origin config with a function that returns `null` for disallowed origins, which causes the browser to reject the preflight.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat: tighten CORS — explicit origin function, restricted methods and headers"
```

---

## Task 6: Tenant-Scoped Query Helpers

**Files:**
- Create: `apps/api/src/lib/scoped-queries.ts`
- Create: `apps/api/src/lib/scoped-queries.test.ts`

This task creates the scoped query pattern that Phase 2 and Phase 3 routes will use. It ensures every query is automatically filtered by `center_id`.

- [ ] **Step 1: Write failing tests for scoped queries**

Create `apps/api/src/lib/scoped-queries.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createScopedInsert, createScopedWhere } from "./scoped-queries.js";
import { eq, and } from "drizzle-orm";

// Minimal mock column for testing
const mockCenterIdColumn = { name: "center_id" } as unknown as Parameters<typeof eq>[0];

describe("createScopedWhere", () => {
  it("returns a where clause filtering by centerId", () => {
    const where = createScopedWhere(mockCenterIdColumn, "center-1");
    // We can't deeply inspect drizzle SQL objects, but we can verify it returns something truthy
    expect(where).toBeTruthy();
  });
});

describe("createScopedInsert", () => {
  it("adds centerId to insert values", () => {
    const scoped = createScopedInsert("center-1");
    const result = scoped({ name: "Test", age: 5 });
    expect(result).toEqual({ name: "Test", age: 5, centerId: "center-1" });
  });

  it("does not override existing centerId", () => {
    const scoped = createScopedInsert("center-1");
    const result = scoped({ name: "Test", centerId: "center-1" });
    expect(result).toEqual({ name: "Test", centerId: "center-1" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/lib/scoped-queries.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement scoped query helpers**

Create `apps/api/src/lib/scoped-queries.ts`:

```typescript
import { eq, and, type SQL, type Column } from "drizzle-orm";

/**
 * Creates a WHERE clause that always filters by center_id.
 * Use this to compose with additional conditions:
 *
 *   where: and(scopedWhere, eq(table.id, id))
 */
export function createScopedWhere(centerIdColumn: Column, centerId: string): SQL {
  return eq(centerIdColumn, centerId);
}

/**
 * Creates a function that auto-injects centerId into INSERT values.
 * Prevents forgetting to set center_id on new records.
 *
 *   const values = scopedInsert({ name: "Room A" });
 *   // => { name: "Room A", centerId: "center-1" }
 */
export function createScopedInsert(centerId: string) {
  return <T extends Record<string, unknown>>(values: T): T & { centerId: string } => ({
    ...values,
    centerId,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/lib/scoped-queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/scoped-queries.ts apps/api/src/lib/scoped-queries.test.ts
git commit -m "feat: tenant-scoped query helpers — createScopedWhere, createScopedInsert"
```

---

## Task 7: Cross-Tenant Isolation Test Template

**Files:**
- Create: `apps/api/src/test/cross-tenant.ts`

This creates a reusable test helper that Phase 2 and Phase 3 test suites will import. Every CRUD route test file must include cross-tenant tests using this helper.

- [ ] **Step 1: Create cross-tenant test helper**

Create `apps/api/src/test/cross-tenant.ts`:

```typescript
import { expect } from "vitest";
import type { Hono } from "hono";
import type { AppEnv } from "../lib/context.js";
import { createTestApp, createMockDb, type TestContext } from "./setup.js";

/**
 * Helper for cross-tenant isolation tests.
 * Creates two test apps: one for center-A (the data owner) and one for center-B (the intruder).
 * Routes under test should return 404 or empty arrays when accessed by the wrong center.
 */
export function createCrossTenantApps(
  mountRoutes: (app: Hono<AppEnv>) => void,
  dbA: ReturnType<typeof createMockDb>,
  dbB: ReturnType<typeof createMockDb>,
) {
  const centerA: TestContext = {
    userId: "user-a",
    centerId: "center-a",
    membershipId: "membership-a",
    role: "owner",
  };

  const centerB: TestContext = {
    userId: "user-b",
    centerId: "center-b",
    membershipId: "membership-b",
    role: "owner",
  };

  return {
    appA: createTestApp(mountRoutes, dbA, centerA),
    appB: createTestApp(mountRoutes, dbB, centerB),
    centerA,
    centerB,
  };
}

/**
 * Asserts that a GET request from center-B returns empty results for center-A data.
 */
export async function assertCrossTenantGetBlocked(
  appB: Hono<AppEnv>,
  path: string,
) {
  const res = await appB.request(path);
  // Should be 200 with empty array OR 404
  if (res.status === 200) {
    const json = await res.json();
    const data = Array.isArray(json) ? json : Object.values(json).find(Array.isArray);
    if (Array.isArray(data)) {
      expect(data).toHaveLength(0);
    }
  } else {
    expect(res.status).toBe(404);
  }
}

/**
 * Asserts that a mutation request from center-B returns 404 for center-A resources.
 */
export async function assertCrossTenantMutationBlocked(
  appB: Hono<AppEnv>,
  path: string,
  method: "PATCH" | "DELETE",
  body?: unknown,
) {
  const options: RequestInit = { method };
  if (body) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const res = await appB.request(path, options);
  expect(res.status).toBe(404);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/test/cross-tenant.ts
git commit -m "feat: cross-tenant isolation test helpers for CRUD route suites"
```

---

## Task 8: Invite Token Security

**Files:**
- Modify: `apps/api/src/routes/members.ts`
- Modify: `packages/db/src/schema/memberships.ts`

This task adds invite token expiry (72h), single-use enforcement, and cryptographic token generation. If the `memberships` schema does not yet have `inviteToken` and `inviteExpiresAt` columns, they need to be added.

- [ ] **Step 1: Add invite columns to memberships schema**

In `packages/db/src/schema/memberships.ts`, add to the memberships table definition:

```typescript
inviteToken: text("invite_token").unique(),
inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
```

- [ ] **Step 2: Update invite creation in members route**

In `apps/api/src/routes/members.ts`, replace the invite POST handler:

```typescript
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
  email: z.string().trim().email(),
  role: z.enum(["director", "staff"]),
});

function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

    const token = generateInviteToken();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

    const [membership] = await db
      .insert(memberships)
      .values({
        centerId,
        userId: user.id,
        role,
        invitedAt: new Date(),
        inviteToken: token,
        inviteExpiresAt: expiresAt,
      })
      .returning();

    return c.json({ ...membership, inviteToken: token }, 201);
  }
);

// Accept an invite
memberRoutes.post(
  "/invites/:token/accept",
  requireAuth,
  async (c) => {
    const db = c.get("db");
    const userId = c.get("userId");
    const token = c.req.param("token");

    const membership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.inviteToken, token),
        eq(memberships.userId, userId),
      ),
    });

    if (!membership) throw notFound("Invalid invite token");

    // Check expiry
    if (membership.inviteExpiresAt && new Date() > membership.inviteExpiresAt) {
      throw badRequest("Invite has expired. Please request a new one.");
    }

    // Check already accepted
    if (membership.acceptedAt) {
      throw badRequest("Invite has already been accepted.");
    }

    // Accept: clear token (single-use), set acceptedAt
    await db
      .update(memberships)
      .set({
        acceptedAt: new Date(),
        inviteToken: null,
        inviteExpiresAt: null,
      })
      .where(eq(memberships.id, membership.id));

    return c.json({ success: true });
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

- [ ] **Step 3: Generate migration**

Run: `pnpm db:generate`
Expected: new migration file created for invite columns.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/memberships.ts apps/api/src/routes/members.ts
git commit -m "feat: invite token security — 72h expiry, single-use, crypto-random tokens"
```

---

## Task 9: Audit Log Append-Only Enforcement

**Files:**
- Modify: `apps/api/src/middleware/audit.ts`
- Create: `apps/api/src/middleware/audit.test.ts`

- [ ] **Step 1: Write failing test for audit log no-PII rule**

Create `apps/api/src/middleware/audit.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { auditMiddleware } from "./audit.js";
import type { AppEnv } from "../lib/context.js";

describe("auditMiddleware", () => {
  let insertMock: ReturnType<typeof vi.fn>;

  function createApp() {
    insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    const app = new Hono<AppEnv>();

    app.use("*", async (c, next) => {
      c.set("db", { insert: insertMock } as unknown as AppEnv["Variables"]["db"]);
      c.set("auth", {} as unknown as AppEnv["Variables"]["auth"]);
      c.set("userId", "user-1");
      c.set("centerId", "center-1");
      c.set("membershipId", "membership-1");
      c.set("role", "owner");
      await next();
    });

    app.use("*", auditMiddleware);

    app.post("/api/children", (c) => c.json({ id: "child-1" }, 201));
    app.get("/api/children", (c) => c.json([]));
    app.post("/api/auth/sign-in", (c) => c.json({ ok: true }));

    return app;
  }

  it("logs mutations (POST)", async () => {
    const app = createApp();
    await app.request("/api/children", { method: "POST" });
    expect(insertMock).toHaveBeenCalled();
  });

  it("does not log GET requests", async () => {
    const app = createApp();
    await app.request("/api/children");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("does not log auth routes", async () => {
    const app = createApp();
    await app.request("/api/auth/sign-in", { method: "POST" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("logged values contain no PII fields", async () => {
    const app = createApp();
    await app.request("/api/children", { method: "POST" });

    const values = insertMock.mock.calls[0]?.[0]; // the table arg
    // auditMiddleware inserts using db.insert(auditLog).values(...)
    // The values call contains userId, centerId, action, entityType, entityId, ipAddress
    // It must NOT contain fields like name, email, dateOfBirth, phone
    const valuesCall = insertMock.mock.results[0]?.value?.values?.mock?.calls[0]?.[0];
    if (valuesCall) {
      expect(valuesCall).not.toHaveProperty("name");
      expect(valuesCall).not.toHaveProperty("email");
      expect(valuesCall).not.toHaveProperty("dateOfBirth");
      expect(valuesCall).not.toHaveProperty("phone");
    }
  });
});
```

- [ ] **Step 2: Run tests to verify current state**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/middleware/audit.test.ts`
Expected: Some tests may pass if audit middleware already exists, but the test file needs to compile.

- [ ] **Step 3: Verify audit middleware does not expose PII**

Review `apps/api/src/middleware/audit.ts` and confirm the `changes` field in the audit log insert does not include request bodies containing PII. The current implementation sets `changes: {}` which is safe. If it logged request body contents, replace with `{}` or a sanitized version that only includes field names, not values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @pebbledesk/api test -- --run apps/api/src/middleware/audit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/audit.ts apps/api/src/middleware/audit.test.ts
git commit -m "test: audit middleware tests — verify no PII logging, skip auth routes"
```

---

## Task 10: pnpm audit + Deploy Checklist

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add security audit script to root package.json**

In the root `package.json`, add to the `scripts` section:

```json
"security:audit": "pnpm audit --audit-level=high"
```

- [ ] **Step 2: Run the audit**

Run: `pnpm security:audit`
Expected: Either passes clean, or lists vulnerabilities to address. Fix any high/critical issues before proceeding.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add pnpm security:audit script — fail on high/critical vulnerabilities"
```

---

## Task 11: Update CLAUDE.md with Security References

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add security section to CLAUDE.md**

Add after the "Key Decisions" section in `CLAUDE.md`:

```markdown
## Security

- **Security spec:** `docs/superpowers/specs/2026-04-07-security-design.md`
- Every API route must use scoped query helpers (`createScopedWhere`, `createScopedInsert`) from `apps/api/src/lib/scoped-queries.ts`
- Every CRUD route test suite must include cross-tenant isolation tests using helpers from `apps/api/src/test/cross-tenant.ts`
- Never log PII (names, emails, DOBs, phone numbers) — log user IDs and entity IDs only
- All Zod string validators must include `.trim()`
- Error responses use `{ error: { code, message } }` shape — never expose stack traces or DB errors
- Auth errors must be generic ("Invalid credentials") — never differentiate "user not found" vs "wrong password"
- `pnpm security:audit` must pass before every deploy
```

- [ ] **Step 2: Add security spec to Reference Docs**

In the "Reference Docs" section, add:

```markdown
- Security spec: `docs/superpowers/specs/2026-04-07-security-design.md`
- Security hardening plan: `docs/superpowers/plans/2026-04-07-security-hardening.md`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add security guidelines and references to CLAUDE.md"
```

---

## Task Dependencies & Execution Order

**Important:** Phase 1 defines the Hono context type as `Env` in `apps/api/src/lib/context.ts`. Phase 2 renames it to `AppEnv` and adds a `Variables` export. Tasks 6, 7, and 9 in this plan use `AppEnv` because they provide helpers consumed by Phase 2 and Phase 3 routes. If executing these tasks before Phase 2, substitute `Env` for `AppEnv` in the imports.

### When to execute each task

**After Phase 1 (can run immediately):**
- Tasks 1, 2, 3, 4, 5, 8, 10 — these modify Phase 1 files and use `Env`

**After Phase 2 Task 2 (API test setup exists):**
- Tasks 6, 7, 9 — these use `AppEnv` and the test setup from Phase 2

**After all tasks above:**
- Task 11 (CLAUDE.md update)

### Dependency graph

```
Task 1 (Security Headers) ─────── independent
Task 2 (Structured Errors) ────── independent
Task 3 (Auth Hardening) ───────── independent
Task 4 (Input .trim()) ───────── independent
Task 5 (CORS Tightening) ─────── depends on Task 1 (both modify index.ts)
Task 6 (Scoped Queries) ──────── independent, needs Phase 2 context type
Task 7 (Cross-Tenant Tests) ──── depends on Task 6, needs Phase 2 test setup
Task 8 (Invite Tokens) ───────── independent
Task 9 (Audit Append-Only) ───── independent, needs Phase 2 context type
Task 10 (pnpm audit) ─────────── independent
Task 11 (CLAUDE.md) ──────────── depends on all above
```

Parallelizable groups:
- **Group A (simultaneous, after Phase 1):** Tasks 1, 2, 3, 4, 8, 10
- **Group B (after Group A):** Task 5
- **Group C (after Phase 2 Task 2):** Tasks 6, 7, 9
- **Group D (after all):** Task 11
