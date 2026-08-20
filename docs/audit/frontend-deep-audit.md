# Frontend Deep Audit — PebbleDesk Web App

Audit Date: 2026-05-27
Scope: apps/web/src/routes/*, apps/web/src/components/*, apps/web/src/hooks/*

## SUMMARY
38 bugs found: 4 BLOCKER, 12 HIGH, 18 MEDIUM, 4 LOW

Issues include form error handling gaps, date/timezone mismatches, accessibility leaks, pagination/filter UI not passing params to queries, and null-reference issues.

## BLOCKER ISSUES (4)

1. apps/web/src/routes/_auth/children/enroll.tsx:928 - LinkExistingGuardianForm uses string-interpolated keys causing collisions if guardian names match

2. apps/web/src/routes/_auth/children/index.tsx:247 - Table rows key={child.id} but useChildren can reorder on filter change

3. apps/web/src/routes/_auth/attendance.tsx:90-92 - useAuthSession() undefined; session?.membership.role accessed without null-safe guards

4. apps/web/src/routes/_auth/billing/index.tsx - Invoice template dialog doesn't validate selected template ID exists

## HIGH ISSUES (12)

5. apps/web/src/routes/_auth/children/index.tsx:39-54 - formatDate() new Date(dateString) parses as UTC returning local time; DOB shifts by timezone offset

6. apps/web/src/routes/_auth/children/$id.tsx:64-75 - Same date parsing bug; calculateAge() computes incorrect ages for month boundaries

7. apps/web/src/routes/_auth/classrooms/$id.tsx:62-73 - formatLocalDate() doesn't pass timezone to toLocaleDateString()

8. apps/web/src/routes/_auth/attendance.tsx:79-85 - formatTime() new Date(isoString).toLocaleTimeString() without timezone

9. apps/web/src/components/help-tip.tsx:20-29 - HelpTip button icon-only with aria-label as popover title (not actionable)

10. apps/web/src/routes/_auth/settings.tsx:128 - useAuthSession() can return undefined; settings page doesn't check

11. apps/web/src/routes/_auth/children/enroll.tsx:1419 - enrollChild.mutateAsync() error caught but navigation failure leaves orphaned child

12. apps/web/src/routes/_auth/billing/payments.tsx:273-297 - Filter buttons (methodFilter, statusFilter) not wired to usePayments() params

13. apps/web/src/routes/_auth/scheduling/index.tsx:86-115 - endTime <= startTime uses string comparison not numeric

14. apps/web/src/routes/_auth/reports/index.tsx:61 - hasBothDates check doesn't validate both fields are non-empty ISO strings

15. apps/web/src/routes/_auth/billing/index.tsx - createInvoice.mutate() has no onError callback

16. apps/web/src/routes/_auth/attendance.tsx:60-77 - formatDateKey() throws if timezone produces undefined year/month/day

## MEDIUM ISSUES (18)

17. apps/web/src/components/attendance-roster.tsx:202 - Renders rows.map((row, index)) where rows can reorder

18. apps/web/src/routes/_auth/children/enroll.tsx:308-316 - ChildrenTableSkeleton hardcoded keys [row-a..row-e]

19. apps/web/src/routes/_auth/children/enroll.tsx:1220-1240 - Review step key={review-g-${firstName}-${lastName}-${email||phone||}} collisions

20. apps/web/src/routes/_auth/children/index.tsx:127 - Search input has aria-label but no explicit id

21. apps/web/src/routes/_auth/guardians/index.tsx:97-102 - Search input aria-label but no matching id

22. apps/web/src/routes/_auth/billing/index.tsx:629 - SelectTrigger id but no visible Label htmlFor

23. apps/web/src/routes/_auth/scheduling/index.tsx:152-163 - SelectTrigger and Label share same id

24. apps/web/src/routes/_auth/classrooms/$id.tsx:1071-1113 - classrooms.find() every render; crashes if undefined

25. apps/web/src/components/empty-state.tsx:115 - Checklist step key={step.title} identical titles fail

26. apps/web/src/routes/_auth/children/enroll.tsx:441 - AgeGroup Select casts as AgeGroup without validation

27. apps/web/src/routes/_auth/attendance.tsx:29 - Room search param not validated as UUID

28. apps/web/src/routes/_auth/children/enroll.tsx:382-386 - Empty dateOfBirth to suggestAgeGroup() unsafe

29. apps/web/src/routes/_auth/billing/index.tsx:97-98 - showCheckoutBanner never cleared after success

30. apps/web/src/routes/_auth/children/$id.tsx:29 - AttendanceCalendar imported but never rendered

31. apps/web/src/routes/_auth/children/enroll.tsx:923 - Guardian keys firstName-lastName-email-phone non-deterministic

32. apps/web/src/routes/_auth/children/enroll.tsx:100-115 - suggestAgeGroup() year ?? 0 defaults to 1900

33. apps/web/src/hooks/use-children.ts:161 - useLinkGuardian() returns res.json() without validation

34. apps/web/src/routes/_auth/children/enroll.tsx:1378 - navigate({ to: "/children" as string }) casts unnecessarily

35. apps/web/src/routes/_auth/attendance.tsx:101-114 - activeTab ignores invalid ?room param silently

36. apps/web/src/routes/_auth/billing/payments.tsx:488 - new Date(value).toLocaleDateString() without timezone

37. apps/web/src/routes/_auth/children/enroll.tsx:441-450 - Select disabled {...(condition ? {} : {})} verbose

38. apps/web/src/routes/_auth/children/index.tsx:251-270 - Child row both onClick and Link to same target

## CATEGORIES

Date/Timezone (6): 5,6,7,8,16,36
Accessibility (4): 9,20,21,22
List Keys (5): 1,2,17,19,25
Mutations/Forms (4): 11,15, patterns
Filters/Queries (2): 12,35
String vs Numeric (1): 13
Dead Code (2): 30,17
Unsafe Parsing (3): 26,28,32
Route Validation (1): 34

## RECOMMENDATIONS

1. Fix BLOCKER issues 1-4 before shipping
2. Fix date/timezone bugs; use lib/dates formatLocalDate() with center timezone
3. Add label htmlFor associations
4. Wire onError on mutations
5. Replace interpolated keys with stable IDs
6. Wire filters to query refetch
