# Feature Gaps

Surfaced during the production-readiness audit (Apr 2026). These are scoped
v1 omissions or intentionally deferred UI surfaces, not active defects.

## Billing

- **QuickBooks in production.** Backend and UI are feature-gated correctly, but launch can proceed with QuickBooks disabled until Intuit production approval is complete.

## Non-gaps flagged during the audit

- `GET /api/centers` without an id returning `404` is intentional.
- Resend failures with placeholder dev keys are expected.
- The auth layout loading gate is intentional until a separate persisted-session design lands.
- Account deletion is support-mediated from `/account` so center records, audit history, and billing responsibilities can be reviewed before removal.
- Billing supports multi-select batch send for draft invoices and batch manual payment recording for payable invoices.
- Messages support inbound guardian replies through a verified Resend webhook, with an inbox and per-thread reply history.
- Active local port references are aligned to web `3040`, API `8790`, and site `4321`; regression coverage guards live docs and fixtures from drifting back to the old dev ports.
