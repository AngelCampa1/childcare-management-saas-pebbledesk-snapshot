# PebbleDesk Security Design Spec

**Date:** 2026-04-07
**Status:** Approved
**Context:** Cross-cutting security layer for PebbleDesk V1, applied across all implementation phases. Covers API security, tenant isolation, auth hardening, Stripe Connect payments, and data privacy.

---

## 1. API Security Layer

### Rate Limiting

Implemented via Cloudflare Rate Limiting Rules (dashboard configuration, not app code):

| Endpoint group | Limit | Scope |
|---|---|---|
| Auth (`/api/auth/*`) | 10 req/min | Per IP |
| Mutations (POST/PATCH/DELETE) | 60 req/min | Per user |
| Reads (GET) | 300 req/min | Per user |

Configured once before go-live, not tied to a specific implementation phase.

### CSRF Protection

- Better Auth includes CSRF protection via `Origin` header validation on state-changing requests
- Cookies use `sameSite=lax` (already specified in auth config)
- API rejects requests without valid `Origin`/`Referer` matching allowed origins

### Input Validation Hardening

On top of existing Zod schema validation:

- String length limits on all text fields (e.g., `name: z.string().min(1).max(255)`)
- Explicit `.trim()` on all string inputs
- No raw SQL or template literals — Drizzle ORM only, enforced by convention and code review

### Error Response Shape

All API errors follow a consistent structure:

```typescript
{ error: { code: "NOT_FOUND", message: "Resource not found" } }
```

Rules:
- Never expose stack traces, database errors, or internal identifiers in production
- Auth errors always return generic "Invalid credentials" — no differentiation between "user not found" and "wrong password"
- Validation errors return field-level messages from Zod but no internal schema details

---

## 2. Security Headers & CORS

### Security Headers

Applied via Hono middleware on all responses:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.stripe.com; frame-src https://js.stripe.com
```

### CORS

Tightened configuration — no wildcards:

- `origin`: Explicit allowlist — production domain + `localhost:3040` in dev only
- `credentials: true` (required for cookie-based auth)
- `allowMethods: ['GET', 'POST', 'PATCH', 'DELETE']`
- `allowHeaders: ['Content-Type']`

---

## 3. Tenant Isolation Enforcement

Highest-risk area — a missed `center_id` filter leaks data between centers.

### Scoped Query Pattern

All database queries go through scoped helpers that bind `center_id` from middleware context:

```typescript
const scopedQuery = (db, centerId) => ({
  children: () => db.select().from(children).where(eq(children.centerId, centerId)),
  classrooms: () => db.select().from(classrooms).where(eq(classrooms.centerId, centerId)),
  // ... all tenant-scoped tables
});
```

Rules:
- Route handlers receive `centerId` from middleware context, never from request params or body
- All INSERT operations auto-set `center_id` from context
- All SELECT/UPDATE/DELETE operations filter by `center_id` from context
- URL param `center_id` (e.g., `/api/centers/:id`) is validated against the session's membership

### Mandatory Cross-Tenant Tests

Every API route test suite includes:

1. Create resources under Center A
2. Authenticate as Center B user
3. Verify GET returns empty / 404
4. Verify PATCH/DELETE returns 404

Required on every CRUD route across all phases.

---

## 4. Authentication & Session Security

### Password Policy

- Minimum 8 characters (configured via Better Auth)
- No complexity requirements (per NIST 800-63B — length over complexity)
- Reject passwords found in the top 10k breached passwords list at signup

### Session Management

- 30-day session expiry (appropriate for non-technical daily users)
- Session token rotation on sensitive actions (password change, role change)
- On password change: invalidate all other sessions for that user
- `ip_address` and `user_agent` stored on sessions (already in schema) for audit

### Invite Tokens

- 72-hour expiry
- Single-use — token deleted on acceptance
- Cryptographically random (32 bytes, base64url encoded)
- Invite records sender and offered role — cannot be tampered to escalate privileges

### Google OAuth

- Enforce `prompt: 'select_account'` for explicit account selection
- Verify email is verified on Google's side before creating an account

---

## 5. Stripe Connect & Payment Security

### Integration Model

Stripe Connect — Standard mode. Each center connects their own Stripe account. PebbleDesk never touches card numbers, bank accounts, or sensitive payment data.

### Data Boundaries

**Stored in PebbleDesk:**
- `stripe_account_id` on `centers` table (connected account ID, e.g., `acct_xxx`)
- Invoice/payment records — amounts, status, timestamps
- No card numbers, bank routing numbers, or payment tokens — ever

**Handled by Stripe:**
- Payment form via Stripe Elements (embedded iframe — card data never hits PebbleDesk servers)
- PCI DSS compliance — entirely Stripe's scope
- ACH/bank transfer collection
- Refunds, disputes, payouts

### Webhook Security

- Verify Stripe webhook signatures on every event via `stripe.webhooks.constructEvent`
- Webhook endpoint has no cookie auth — signature verification is the authentication
- Idempotent event processing — store processed event IDs to prevent replay attacks

### Secret Management

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` stored as Cloudflare Workers secrets
- `STRIPE_PUBLISHABLE_KEY` is the only Stripe value exposed to the frontend
- Never committed to code or environment files

---

## 6. Data Privacy & Audit

### Encryption

- **At rest:** Neon encrypts all data at rest by default (AES-256)
- **In transit:** TLS on all connections — Neon, Cloudflare edge, Stripe API
- **QuickBooks tokens:** Encrypted at the application level before storage using AES-256-GCM with `BETTER_AUTH_SECRET` as the key. Decrypted only when making QB API calls.

### Audit Trail

- `audit_log` table captures all mutations (create/update/delete) with JSONB diffs
- Includes `user_id`, `ip_address`, `entity_type`, `entity_id`
- Retention: indefinite (directors need audit history for licensing inspections — often 2+ years)
- Append-only — no UPDATE or DELETE on `audit_log` rows, enforced at the application layer

### PII Handling

- Sensitive columns: children's names, DOB, subsidy info; guardian email and phone
- Access gated by role: Staff sees only their assigned classroom's children. Directors/Owners see all.
- No PII in application logs — log user IDs and entity IDs only, never names/emails/DOBs
- Soft-delete on withdrawal (status → `inactive`). Hard deletion available as a future admin action for CCPA/state "right to delete" compliance.

### Dependency Security

- `pnpm audit` run before every deploy — fail on high/critical vulnerabilities
- Automated dependency updates (Renovate/Dependabot) deferred to post-V1

---

## 7. Phase Mapping

### Phase 1 — Foundation (additions)

- Security headers middleware (Hono)
- CORS tightened to explicit origin allowlist
- Password policy (min 8 chars, breached password check)
- Invite token security (72h expiry, single-use, crypto-random)
- Session config (30-day expiry, token rotation on sensitive actions)
- Error response shape (generic auth errors, no stack traces)
- Input validation hardening (string length limits, `.trim()`)
- `pnpm audit` in deploy checklist
- No-PII-in-logs rule established

### Phase 2 — Core Features (additions)

- Tenant isolation scoped query pattern
- Cross-tenant isolation tests on every CRUD route (classrooms, children, guardians)
- Audit log middleware wired to all mutation routes
- Soft-delete pattern for children/guardians

### Phase 3 — Attendance & Ratios (additions)

- Cross-tenant isolation tests on check-in, staff-check-in, ratio routes
- Audit logging on attendance mutations (compliance-sensitive)

### Phase 4 — Billing & Payments (new)

- Stripe Connect integration (Standard mode)
- `stripe_account_id` on centers table
- Stripe Elements for payment collection (frontend)
- Webhook endpoint with signature verification
- Stripe secrets as Workers secrets
- QuickBooks token encryption (AES-256-GCM)

### Pre-Launch (Cloudflare dashboard)

- Rate limiting rules configured per the table in Section 1

---

## 8. Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Rate limiting | Cloudflare Rules, not app code | Workers stays lean, Cloudflare handles at edge |
| CSRF | Better Auth Origin check + sameSite=lax | Built-in, no extra tokens needed |
| Tenant isolation | Scoped query helpers + mandatory tests | Prevents the highest-risk bug class (data leaks) |
| Password policy | 8 char min, breached list check, no complexity | NIST 800-63B recommendation |
| Session expiry | 30 days | Non-technical users, daily-use app |
| Payment processing | Stripe Connect Standard | Never touch card data, PCI is Stripe's problem |
| PII protection | Role-based access, no PII in logs, soft-delete | Privacy-by-design without formal COPPA |
| COPPA | Not pursued | App targets operators, not children directly |
| Compliance level | Production-ready pragmatic | SOC 2 deferred to post-V1 growth phase |
| Encryption (tokens) | AES-256-GCM with BETTER_AUTH_SECRET | QB tokens encrypted at rest, simple key management |
