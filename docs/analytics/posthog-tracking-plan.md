# PebbleDesk PostHog Tracking Plan

Last updated: 2026-06-09

## Configuration

Use PostHog project `414219`.

| Surface | Variables |
| --- | --- |
| Marketing site | `PUBLIC_POSTHOG_KEY`, `PUBLIC_POSTHOG_HOST` |
| Product app | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` |
| API Worker | `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` |

The project key is configuration only. Do not commit it to source.

The marketing site may load the PostHog browser SDK. The authenticated product app must not
inject a hosted third-party analytics script; it sends explicit allowlisted events directly to
PostHog's capture endpoint instead. App-side session replay and broad autocapture are disabled.

## Privacy Rules

Allowed properties are limited to plan, role, state, timezone, status, counts, booleans,
safe campaign fields, and stable internal `user_id` or `center_id` when needed.

Never send child, guardian, staff, billing, password, token, address, phone, license number,
free-text notes, message bodies, invoice tokens, raw Stripe IDs, raw emails, or raw names.
Browser and API wrappers drop sensitive property keys before capture.

## Events

The single source of truth for event names is `ANALYTICS_EVENTS` in
`packages/shared/src/constants/analytics.ts`. Every `track()` /
`trackEvent()` / `schedulePostHogEvent()` / `captureBillingLifecycle()` call site
must reference a constant from that object (enforced by
`packages/shared/src/constants/analytics-source.test.ts`). The tables below are
grouped by product area; "Safe properties" lists only allowlisted keys that pass
the browser/API sanitizers — anything else is dropped before capture.

### Acquisition & marketing site

| Event | Trigger | Safe properties |
| --- | --- | --- |
| `$pageview` | Route navigation (site + product) | `path`, `search_present` |
| `cta_clicked` | Marketing CTA click | `target`, `feature_name`, page/section context |
| `scroll_depth_reached` | Scroll-depth milestone on a page | `target`, `count` |
| `section_viewed` | Marketing section enters viewport | `target`, `feature_name` |
| `faq_expanded` | FAQ accordion item opened | `target` |
| `engaged_time_reached` | Engaged-time milestone | `count` |
| `exit_popup_shown` | Exit-intent popup displayed | none |
| `exit_popup_dismissed` | Exit-intent popup dismissed | none |
| `exit_popup_converted` | Exit-intent popup converts | none |
| `billing_toggle_switched` | Monthly/annual pricing toggle | `billing` |
| `cost_calculator_team_size_changed` | Pricing cost-calculator input | `count` |
| `pricebook_builder_inputs_changed` | Pricebook builder input change | `field_count` |
| `pricebook_pdf_requested` | Pricebook PDF export requested | `format` |
| `lead_magnet_submission` | Lead-magnet form submitted | `feature_name` |
| `enterprise_discovery_clicked` | Enterprise sales handoff opened | `source` |
| `referral_link_copied` | Referral link copied | none |
| `email_field_focused` | Email capture field focused | none |
| `email_field_abandoned` | Email capture field abandoned | none |

### Signup & onboarding

| Event | Trigger | Safe properties |
| --- | --- | --- |
| `signup_started` | Signup submit starts | `plan`, `billing` |
| `signup_submitted` | Signup payload submitted | `plan`, `billing` |
| `signup_completed` | Email account signup succeeds | `method`, `plan` |
| `signup_validation_failed` | Signup validation/auth failure | `reason`, `stage`, `field_count`, `plan` |
| `signup_duplicate` | Duplicate signup blocked | `reason` |
| `google_login_started` | Google auth redirect starts | none |
| `login_started` | Email login submit | `method`, `validation_status` |
| `login_completed` | Email login succeeds | `method` |
| `auth_redirect_failed` | Auth redirect recovery state | `target`, `source` |
| `onboarding_started` | Onboarding route opens | `plan`, `billing`, `self_serve` |
| `onboarding_completed` | Center setup completes | `plan`, `self_serve` |
| `public_signup_submission` | Public marketing signup submitted | `feature_name` |
| `public_survey_submission` | Public survey submitted | `feature_name` |
| `survey_completed` | Post-signup survey completed | `feature_name` |

### Activation & product adoption

| Event | Trigger | Safe properties |
| --- | --- | --- |
| `center_created` | Center setup succeeds | `plan`, `state`, `timezone`, `self_serve` |
| `center_settings_updated` | Center settings saved | `field_count` |
| `center_switched` | Active center switched | none |
| `child_created` | Child record created | `age_group` |
| `child_updated` | Child record edited | `field_count` |
| `child_withdrawn` | Child withdrawn | none |
| `child_reactivated` | Withdrawn child reactivated | none |
| `enrollment_started` | Enrollment wizard opened | none |
| `enrollment_completed` | Enrollment completed | `result` |
| `guardian_created` | Guardian created | none |
| `guardian_updated` | Guardian edited | `field_count` |
| `guardian_deleted` | Guardian deleted | none |
| `guardian_linked` | Guardian linked to child | none |
| `guardian_unlinked` | Guardian unlinked from child | none |
| `guardian_link_updated` | Guardian–child link edited | `field_count` |
| `classroom_created` | Classroom created | `age_group` |
| `classroom_updated` | Classroom edited | `field_count` |
| `classroom_archived` | Classroom archived | none |
| `classroom_restored` | Classroom restored | none |
| `classroom_child_assigned` | Child assigned to classroom | none |
| `classroom_child_unassigned` | Child unassigned from classroom | none |
| `classroom_staff_assigned` | Staff assigned to classroom | none |
| `classroom_staff_unassigned` | Staff unassigned from classroom | none |
| `attendance_checkin_completed` | Child/staff check-in succeeds | `subject_type` |
| `attendance_checkin_failed` | Check-in fails | `reason` |
| `attendance_checkout_completed` | Check-out succeeds | `subject_type` |
| `attendance_checkout_failed` | Check-out fails | `reason` |
| `schedule_created` | Schedule created | none |
| `schedule_updated` | Schedule edited | `field_count` |
| `shift_created` | Shift created | none |
| `shift_updated` | Shift edited | `field_count` |
| `team_member_invited` | Team member invited | `role` |
| `team_member_removed` | Team member removed | none |
| `message_send_completed` | Message sent | `message_type`, `recipient_count` |
| `message_send_failed` | Message send fails | `reason` |
| `message_thread_opened` | Message thread opened | `message_type`, `recipient_count` |
| `message_replies_read` | Thread replies marked read | none |
| `message_redelivered` | Message redelivered | none |
| `report_generated` | Report generation succeeds | `report_type` |
| `report_downloaded` | Report file downloaded | `format` |
| `ratio_violation_notes_updated` | Ratio violation notes saved | none |
| `audit_log_filtered` | Audit log filters applied | `has_filters`, `entity_type` |
| `list_filtered` | List/table filters applied (reserved) | `has_filters`, `entity_type` |

### Revenue & trial health

| Event | Trigger | Safe properties |
| --- | --- | --- |
| `checkout_started` | Checkout started | `plan`, `cadence` |
| `checkout_completed` | Checkout completed | `plan`, `cadence` |
| `billing_checkout_started` | Checkout session starts | `plan`, `cadence`, `promo_present`, `subscription_status` |
| `billing_checkout_redirect_opened` | Stripe checkout redirect opened | `plan`, `cadence` |
| `billing_checkout_failed` | Checkout session fails | `reason`, `subscription_status` |
| `billing_portal_opened` | Billing portal opened | `subscription_status` |
| `billing_portal_failed` | Billing portal open fails | `reason` |
| `subscription_started` | Subscription begins | `center_id`, `plan`, `subscription_status` |
| `subscription_checkout_completed` | Stripe checkout confirmed | `center_id`, `plan`, `subscription_status` |
| `subscription_status_changed` | Stripe status webhook | `center_id`, `plan`, `subscription_status` |
| `trial_started` | Trialing subscription begins | `center_id`, `plan`, `subscription_status` |
| `trial_expired` | Scheduled trial expirer cancels trial | `center_id`, `subscription_status` |
| `payment_failed` | Invoice payment failure webhook | `center_id`, `subscription_status` |

### Integrations & finance

| Event | Trigger | Safe properties |
| --- | --- | --- |
| `finance_action_completed` | Finance mutation succeeds | `action` |
| `finance_action_failed` | Finance mutation fails | `action`, `reason` |
| `quickbooks_action_completed` | QuickBooks action succeeds | `action` |
| `quickbooks_action_failed` | QuickBooks action fails | `action`, `reason` |
| `import_completed` | Data import succeeds | `entity_type`, `count` |
| `import_failed` | Data import fails | `entity_type`, `reason` |
| `stripe_connect_onboarding_started` | Stripe Connect onboarding starts | none |
| `stripe_connect_onboarding_failed` | Stripe Connect onboarding fails | `reason` |

## Dashboards

Seven dashboards live in project `414219`, numbered for reading order. Each is
populated with tiles covering every event in its theme; many product events are
new and will only show data once production traffic flows.

| # | Dashboard | ID | Coverage |
| --- | --- | --- | --- |
| 1 | Founder Overview | 1688579 | North-star KPIs: visitors, signups, centers created, the full visitor→center funnel |
| 2 | Acquisition & Marketing Site | 1688581 | Pageviews, CTA clicks, scroll/section/FAQ engagement, exit-intent funnel, pricing tools, lead capture |
| 3 | Signup & Onboarding Funnel | 1688582 | Signup → submit → complete → onboarding → first center; validation failures, duplicates, Google vs email |
| 4 | Activation & Product Adoption | 1688584 | Children/enrollment, guardians, classrooms, attendance, scheduling, messaging, reports, team, feature-adoption breadth |
| 5 | Engagement & Retention | 1688585 | DAU/WAU/MAU, lifecycle, returning users, core feature usage over time |
| 6 | Revenue & Trial Health | 1688586 | Checkout funnels, trials started/expired, subscription status changes, payment/billing failures, finance actions |
| 7 | Reliability & Friction | 1688588 | JS exceptions, auth/validation failures, combined failure trends, import/integration failures |
