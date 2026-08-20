import { describe, expect, it } from "vitest";
import { DEFAULT_CENTER_TIMEZONE } from "../src/constants/timezones.js";
import {
	auditLogQuerySchema,
	checkInSchema,
	checkOutSchema,
	createCenterSchema,
	createChildSchema,
	createClassroomSchema,
	createGuardianSchema,
	createInvoiceSchema,
	createInvoiceTemplateSchema,
	createMessageSchema,
	createPaymentSchema,
	createScheduleSchema,
	createShiftSchema,
	createSubsidyCaseSchema,
	createSubsidyClaimSchema,
	createTimeEntryAdjustmentSchema,
	enrollChildSchema,
	generateReportSchema,
	listReportsQuerySchema,
	staffCheckInSchema,
	timeEntryQuerySchema,
	updateCenterSchema,
	updateChildSchema,
	updateClassroomSchema,
	updateGuardianSchema,
	updateInvoiceSchema,
	updateInvoiceTemplateSchema,
	updateScheduleSchema,
	updateShiftSchema,
	updateSubsidyCaseSchema,
	updateSubsidyClaimSchema,
} from "../src/validators/index.js";

// ─── Center ────────────────────────────────────────────────────────────────

describe("createCenterSchema", () => {
	const valid = {
		name: "Sunny Childcare",
		address: "123 Main St",
		city: "Austin",
		state: "TX",
		zip: "78701",
		phone: "5125550100",
	};

	it("accepts valid center data", () => {
		expect(createCenterSchema.safeParse(valid).success).toBe(true);
	});

	it("applies default timezone", () => {
		const result = createCenterSchema.safeParse(valid);
		expect(result.success && result.data.timezone).toBe(DEFAULT_CENTER_TIMEZONE);
	});

	it("rejects unsupported timezones", () => {
		expect(
			createCenterSchema.safeParse({
				...valid,
				timezone: "Europe/Paris",
			}).success,
		).toBe(false);
	});

	it("accepts optional licenseNumber and licensedCapacity", () => {
		const result = createCenterSchema.safeParse({
			...valid,
			licenseNumber: "LIC-001",
			licensedCapacity: 50,
		});
		expect(result.success).toBe(true);
	});

	it("preserves selected self-serve subscription plan intent", () => {
		const result = createCenterSchema.safeParse({
			...valid,
			subscriptionPlan: "home",
		});

		expect(result.success).toBe(true);
		expect(result.success && result.data.subscriptionPlan).toBe("home");
	});

	it("rejects state that is not 2 characters", () => {
		expect(createCenterSchema.safeParse({ ...valid, state: "Texas" }).success).toBe(false);
	});

	it("rejects invalid ZIP code", () => {
		expect(createCenterSchema.safeParse({ ...valid, zip: "1234" }).success).toBe(false);
	});

	it("accepts ZIP+4 format", () => {
		expect(createCenterSchema.safeParse({ ...valid, zip: "78701-1234" }).success).toBe(true);
	});

	it("rejects empty name", () => {
		expect(createCenterSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
	});
});

describe("updateCenterSchema", () => {
	it("allows partial updates", () => {
		expect(updateCenterSchema.safeParse({ name: "New Name" }).success).toBe(true);
	});

	it("allows empty object", () => {
		expect(updateCenterSchema.safeParse({}).success).toBe(true);
	});

	it("does not apply create defaults to partial updates", () => {
		const result = updateCenterSchema.safeParse({});
		expect(result.success).toBe(true);
		expect(result.success && Object.hasOwn(result.data, "timezone")).toBe(false);
	});
});

// ─── Classroom ─────────────────────────────────────────────────────────────

describe("createClassroomSchema", () => {
	const valid = {
		name: "Butterflies",
		ageGroup: "toddler" as const,
		maxCapacity: 12,
		minRatioStaff: 1,
		minRatioChildren: 4,
	};

	it("accepts valid classroom data", () => {
		expect(createClassroomSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects invalid ageGroup", () => {
		expect(createClassroomSchema.safeParse({ ...valid, ageGroup: "baby" }).success).toBe(false);
	});

	it("rejects zero capacity", () => {
		expect(createClassroomSchema.safeParse({ ...valid, maxCapacity: 0 }).success).toBe(false);
	});

	it("rejects negative ratio", () => {
		expect(createClassroomSchema.safeParse({ ...valid, minRatioStaff: -1 }).success).toBe(false);
	});
});

describe("updateClassroomSchema", () => {
	it("allows partial update", () => {
		expect(updateClassroomSchema.safeParse({ maxCapacity: 15 }).success).toBe(true);
	});
});

// ─── Child ─────────────────────────────────────────────────────────────────

describe("createChildSchema", () => {
	const valid = {
		firstName: "Emma",
		lastName: "Smith",
		dateOfBirth: "2022-03-15",
		ageGroup: "toddler" as const,
	};

	it("accepts valid child data", () => {
		expect(createChildSchema.safeParse(valid).success).toBe(true);
	});

	it("defaults enrollmentStatus to active", () => {
		const result = createChildSchema.safeParse(valid);
		expect(result.success && result.data.enrollmentStatus).toBe("active");
	});

	it("defaults subsidyEligible to false", () => {
		const result = createChildSchema.safeParse(valid);
		expect(result.success && result.data.subsidyEligible).toBe(false);
	});

	it("rejects invalid date format", () => {
		expect(createChildSchema.safeParse({ ...valid, dateOfBirth: "15-03-2022" }).success).toBe(
			false,
		);
	});

	it("rejects empty firstName", () => {
		expect(createChildSchema.safeParse({ ...valid, firstName: "" }).success).toBe(false);
	});
});

describe("updateChildSchema", () => {
	it("allows partial update", () => {
		expect(updateChildSchema.safeParse({ firstName: "Ella" }).success).toBe(true);
	});

	it("does not apply create defaults to partial updates", () => {
		const result = updateChildSchema.safeParse({ firstName: "Ella" });
		expect(result.success).toBe(true);
		expect(result.success && Object.hasOwn(result.data, "enrollmentStatus")).toBe(false);
		expect(result.success && Object.hasOwn(result.data, "subsidyEligible")).toBe(false);
	});
});

describe("enrollChildSchema", () => {
	const valid = {
		child: {
			firstName: "Emma",
			lastName: "Smith",
			dateOfBirth: "2022-03-15",
			ageGroup: "toddler" as const,
		},
		guardians: [
			{
				type: "new" as const,
				firstName: "John",
				lastName: "Smith",
				email: "john@example.com",
				isPrimary: true,
				authorizedPickup: true,
			},
		],
	};

	it("accepts classroom placement for active children", () => {
		expect(
			enrollChildSchema.safeParse({
				...valid,
				classroom: {
					classroomId: "550e8400-e29b-41d4-a716-446655440010",
					effectiveDate: "2026-04-07",
				},
			}).success,
		).toBe(true);
	});

	it("rejects classroom placement for waitlisted children", () => {
		expect(
			enrollChildSchema.safeParse({
				...valid,
				child: {
					...valid.child,
					enrollmentStatus: "waitlist" as const,
				},
				classroom: {
					classroomId: "550e8400-e29b-41d4-a716-446655440010",
					effectiveDate: "2026-04-07",
				},
			}).success,
		).toBe(false);
	});

	it("rejects enrollment payloads with more than one primary guardian", () => {
		const result = enrollChildSchema.safeParse({
			...valid,
			guardians: [
				valid.guardians[0],
				{
					type: "existing" as const,
					guardianId: "550e8400-e29b-41d4-a716-446655440011",
					isPrimary: true,
					authorizedPickup: true,
				},
			],
		});

		expect(result.success).toBe(false);
		expect(!result.success && result.error.issues[0]?.message).toBe(
			"Only one guardian can be marked primary",
		);
	});
});

// ─── Validator invariant tests ─────────────────────────────────────────────
// These tests verify ordering and phone-format refines added as bug fixes.
// They should FAIL before the refines are added and pass after.

describe("createGuardianSchema — phone pattern", () => {
	it("rejects non-numeric phone values like 'abcdefg'", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Jane", lastName: "Doe", phone: "abcdefg" })
				.success,
		).toBe(false);
	});

	it("rejects phone with letters mixed in", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Jane", lastName: "Doe", phone: "512-555-abc" })
				.success,
		).toBe(false);
	});

	it("accepts a valid 10-digit US phone number", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Jane", lastName: "Doe", phone: "5125550100" })
				.success,
		).toBe(true);
	});

	it("accepts a phone with common separators", () => {
		expect(
			createGuardianSchema.safeParse({ firstName: "Jane", lastName: "Doe", phone: "512-555-0100" })
				.success,
		).toBe(true);
	});
});

describe("createInvoiceSchema — date ordering", () => {
	const lineItem = { description: "Tuition", quantity: 1, unitPrice: 500, amount: 500 };
	const base = {
		guardianId: "550e8400-e29b-41d4-a716-446655440000",
		lineItems: [lineItem],
		subtotal: 500,
		amountDue: 500,
	};

	it("rejects periodStart after periodEnd", () => {
		expect(
			createInvoiceSchema.safeParse({ ...base, periodStart: "2024-03-01", periodEnd: "2024-02-01" })
				.success,
		).toBe(false);
	});

	it("accepts periodStart equal to periodEnd (same-day period)", () => {
		expect(
			createInvoiceSchema.safeParse({ ...base, periodStart: "2024-02-01", periodEnd: "2024-02-01" })
				.success,
		).toBe(true);
	});
});

describe("createShiftSchema — time ordering", () => {
	const base = {
		scheduleId: "550e8400-e29b-41d4-a716-446655440009",
		membershipId: "550e8400-e29b-41d4-a716-446655440000",
		classroomId: "550e8400-e29b-41d4-a716-446655440001",
		dayOfWeek: 1,
	};

	it("rejects startTime equal to endTime", () => {
		expect(
			createShiftSchema.safeParse({ ...base, startTime: "08:00", endTime: "08:00" }).success,
		).toBe(false);
	});

	it("rejects startTime after endTime", () => {
		expect(
			createShiftSchema.safeParse({ ...base, startTime: "17:00", endTime: "09:00" }).success,
		).toBe(false);
	});

	it("accepts startTime before endTime", () => {
		expect(
			createShiftSchema.safeParse({ ...base, startTime: "08:00", endTime: "16:00" }).success,
		).toBe(true);
	});
});

describe("createScheduleSchema — date ordering", () => {
	it("rejects effectiveFrom after effectiveUntil", () => {
		expect(
			createScheduleSchema.safeParse({
				name: "Winter plan",
				effectiveFrom: "2024-12-31",
				effectiveUntil: "2024-01-01",
			}).success,
		).toBe(false);
	});

	it("accepts effectiveFrom equal to effectiveUntil (single-day schedule)", () => {
		expect(
			createScheduleSchema.safeParse({
				name: "Single day",
				effectiveFrom: "2024-06-01",
				effectiveUntil: "2024-06-01",
			}).success,
		).toBe(true);
	});
});

describe("createSubsidyCaseSchema — date ordering", () => {
	const base = {
		childId: "550e8400-e29b-41d4-a716-446655440000",
		program: "ccdf" as const,
		caseNumber: "CASE-001",
		agencyName: "Texas HHS",
		effectiveDate: "2024-01-01",
	};

	it("rejects effectiveDate after expirationDate", () => {
		expect(
			createSubsidyCaseSchema.safeParse({ ...base, expirationDate: "2023-12-31" }).success,
		).toBe(false);
	});

	it("accepts effectiveDate equal to expirationDate", () => {
		expect(
			createSubsidyCaseSchema.safeParse({ ...base, expirationDate: "2024-01-01" }).success,
		).toBe(true);
	});
});

describe("createSubsidyClaimSchema — date and amount ordering", () => {
	const base = {
		subsidyCaseId: "550e8400-e29b-41d4-a716-446655440000",
		daysAttended: 20,
		hoursAttended: 160,
		amountClaimed: 500,
	};

	it("rejects periodStart after periodEnd", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...base,
				periodStart: "2024-03-31",
				periodEnd: "2024-03-01",
			}).success,
		).toBe(false);
	});

	it("accepts valid claim with correct period order", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...base,
				periodStart: "2024-03-01",
				periodEnd: "2024-03-31",
			}).success,
		).toBe(true);
	});
});

// ─── End invariant tests ────────────────────────────────────────────────────

describe("createGuardianSchema", () => {
	const valid = {
		firstName: "John",
		lastName: "Smith",
	};

	it("accepts valid guardian data", () => {
		expect(createGuardianSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts optional email and phone", () => {
		const result = createGuardianSchema.safeParse({
			...valid,
			email: "john@example.com",
			phone: "5125550101",
		});
		expect(result.success).toBe(true);
	});

	it("rejects invalid email", () => {
		expect(createGuardianSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
	});
});

describe("updateGuardianSchema", () => {
	it("allows partial update", () => {
		expect(updateGuardianSchema.safeParse({ email: "new@example.com" }).success).toBe(true);
	});
});

// ─── Attendance ────────────────────────────────────────────────────────────

describe("checkInSchema", () => {
	const valid = {
		childId: "550e8400-e29b-41d4-a716-446655440000",
		classroomId: "550e8400-e29b-41d4-a716-446655440001",
	};

	it("accepts valid check-in data", () => {
		expect(checkInSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts optional notes", () => {
		expect(checkInSchema.safeParse({ ...valid, notes: "Dropped off late" }).success).toBe(true);
	});

	it("rejects non-UUID childId", () => {
		expect(checkInSchema.safeParse({ ...valid, childId: "not-a-uuid" }).success).toBe(false);
	});

	it("rejects non-UUID classroomId", () => {
		expect(checkInSchema.safeParse({ ...valid, classroomId: "123" }).success).toBe(false);
	});
});

describe("checkOutSchema", () => {
	it("accepts empty object", () => {
		expect(checkOutSchema.safeParse({}).success).toBe(true);
	});

	it("accepts optional notes", () => {
		expect(checkOutSchema.safeParse({ notes: "Early pickup" }).success).toBe(true);
	});
});

describe("staffCheckInSchema", () => {
	it("accepts valid classroomId", () => {
		expect(
			staffCheckInSchema.safeParse({ classroomId: "550e8400-e29b-41d4-a716-446655440001" }).success,
		).toBe(true);
	});

	it("rejects missing classroomId", () => {
		expect(staffCheckInSchema.safeParse({}).success).toBe(false);
	});
});

// ─── Subsidy ───────────────────────────────────────────────────────────────

describe("createSubsidyCaseSchema", () => {
	const valid = {
		childId: "550e8400-e29b-41d4-a716-446655440000",
		program: "head_start" as const,
		caseNumber: "CCDF-2024-001",
		agencyName: "County Office of Early Learning",
		authorizedHoursWeekly: 40,
		rateDaily: 48,
		rateWeekly: 240,
		effectiveDate: "2024-01-01",
	};

	it("accepts valid subsidy case", () => {
		expect(createSubsidyCaseSchema.safeParse(valid).success).toBe(true);
	});

	it("defaults status to active", () => {
		const result = createSubsidyCaseSchema.safeParse(valid);
		expect(result.success && result.data.status).toBe("active");
	});

	it("rejects invalid program", () => {
		expect(createSubsidyCaseSchema.safeParse({ ...valid, program: "unknown" }).success).toBe(false);
	});

	it("rejects negative weekly rate", () => {
		expect(createSubsidyCaseSchema.safeParse({ ...valid, rateWeekly: -100 }).success).toBe(false);
	});

	it("rejects client-supplied centerId", () => {
		expect(
			createSubsidyCaseSchema.safeParse({
				...valid,
				centerId: "550e8400-e29b-41d4-a716-446655440010",
			}).success,
		).toBe(false);
	});
});

describe("updateSubsidyCaseSchema", () => {
	it("allows partial update", () => {
		expect(updateSubsidyCaseSchema.safeParse({ rateWeekly: 900 }).success).toBe(true);
	});

	it("does not apply create defaults to partial updates", () => {
		const result = updateSubsidyCaseSchema.safeParse({ rateWeekly: 900 });
		expect(result.success).toBe(true);
		expect(result.success && Object.hasOwn(result.data, "status")).toBe(false);
	});

	it("rejects effectiveDate after expirationDate on partial update", () => {
		expect(
			updateSubsidyCaseSchema.safeParse({
				effectiveDate: "2024-12-01",
				expirationDate: "2024-01-01",
			}).success,
		).toBe(false);
	});
});

describe("createSubsidyClaimSchema", () => {
	const valid = {
		subsidyCaseId: "550e8400-e29b-41d4-a716-446655440000",
		periodStart: "2024-01-01",
		periodEnd: "2024-01-31",
		daysAttended: 20,
		hoursAttended: 80,
		amountClaimed: 800,
	};

	it("accepts valid claim", () => {
		expect(createSubsidyClaimSchema.safeParse(valid).success).toBe(true);
	});

	it("defaults status to draft", () => {
		const result = createSubsidyClaimSchema.safeParse(valid);
		expect(result.success && result.data.status).toBe("draft");
	});

	it("rejects negative hours attended", () => {
		expect(createSubsidyClaimSchema.safeParse({ ...valid, hoursAttended: -1 }).success).toBe(false);
	});

	it("rejects client-supplied centerId", () => {
		expect(
			createSubsidyClaimSchema.safeParse({
				...valid,
				centerId: "550e8400-e29b-41d4-a716-446655440011",
			}).success,
		).toBe(false);
	});
});

describe("updateSubsidyClaimSchema", () => {
	it("allows partial claim update", () => {
		expect(updateSubsidyClaimSchema.safeParse({ amountApproved: 700 }).success).toBe(true);
	});

	it("does not apply create defaults to partial claim updates", () => {
		const result = updateSubsidyClaimSchema.safeParse({ amountApproved: 700 });
		expect(result.success).toBe(true);
		expect(result.success && Object.hasOwn(result.data, "status")).toBe(false);
	});

	it("rejects periodStart after periodEnd on partial update", () => {
		expect(
			updateSubsidyClaimSchema.safeParse({
				periodStart: "2024-03-31",
				periodEnd: "2024-03-01",
			}).success,
		).toBe(false);
	});
});

// ─── Billing ───────────────────────────────────────────────────────────────

describe("createInvoiceSchema", () => {
	const valid = {
		guardianId: "550e8400-e29b-41d4-a716-446655440000",
		periodStart: "2024-02-01",
		periodEnd: "2024-02-29",
		lineItems: [{ description: "Weekly tuition", quantity: 4, unitPrice: 200, amount: 800 }],
		subtotal: 800,
		amountDue: 800,
	};

	it("accepts valid invoice", () => {
		expect(createInvoiceSchema.safeParse(valid).success).toBe(true);
	});

	it("defaults status to draft", () => {
		const result = createInvoiceSchema.safeParse(valid);
		expect(result.success && result.data.status).toBe("draft");
	});

	it("defaults subsidyCredit to 0", () => {
		const result = createInvoiceSchema.safeParse(valid);
		expect(result.success && result.data.subsidyCredit).toBe(0);
	});

	it("does not allow clients to control public link fields", () => {
		expect(
			createInvoiceSchema.safeParse({
				...valid,
				publicLinkToken: "manual-token",
				publicLinkVersion: 2,
				publicLinkRotatedAt: "2024-02-01T10:00:00Z",
			}).success,
		).toBe(false);
	});

	it("rejects empty lineItems array", () => {
		expect(createInvoiceSchema.safeParse({ ...valid, lineItems: [] }).success).toBe(false);
	});

	it("rejects client-supplied centerId", () => {
		expect(
			createInvoiceSchema.safeParse({
				...valid,
				centerId: "550e8400-e29b-41d4-a716-446655440012",
			}).success,
		).toBe(false);
	});
});

describe("updateInvoiceSchema", () => {
	it("allows partial update", () => {
		const result = updateInvoiceSchema.safeParse({ status: "sent" });
		expect(result.success).toBe(true);
		expect(result.success && result.data).toEqual({ status: "sent" });
	});

	it("rejects public link overrides from clients", () => {
		expect(updateInvoiceSchema.safeParse({ publicLinkVersion: 2 }).success).toBe(false);
	});

	it("rejects periodStart after periodEnd on partial update", () => {
		expect(
			updateInvoiceSchema.safeParse({
				periodStart: "2024-03-01",
				periodEnd: "2024-02-01",
			}).success,
		).toBe(false);
	});
});

describe("createPaymentSchema", () => {
	const valid = {
		invoiceId: "550e8400-e29b-41d4-a716-446655440000",
		amount: 800,
		method: "check" as const,
		paidAt: "2024-02-01T10:00:00Z",
	};

	it("accepts valid payment", () => {
		expect(createPaymentSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects zero amount", () => {
		expect(createPaymentSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
	});

	it("rejects invalid payment method", () => {
		expect(createPaymentSchema.safeParse({ ...valid, method: "bitcoin" }).success).toBe(false);
	});

	it("defaults provider to manual", () => {
		const result = createPaymentSchema.safeParse(valid);
		expect(result.success && result.data.provider).toBe("manual");
	});

	it("accepts provider reference fields", () => {
		expect(
			createPaymentSchema.safeParse({
				...valid,
				provider: "stripe",
				providerReferenceId: "pi_123",
				providerTransactionId: "txn_123",
			}).success,
		).toBe(true);
	});

	it("rejects client-supplied centerId", () => {
		expect(
			createPaymentSchema.safeParse({
				...valid,
				centerId: "550e8400-e29b-41d4-a716-446655440012",
			}).success,
		).toBe(false);
	});
});

describe("createInvoiceTemplateSchema", () => {
	const valid = {
		name: "Standard Tuition",
		description: "Recurring weekly tuition template",
		lineItems: [{ description: "Weekly tuition", quantity: 4, unitPrice: 200, amount: 800 }],
	};

	it("accepts valid invoice template", () => {
		expect(createInvoiceTemplateSchema.safeParse(valid).success).toBe(true);
	});

	it("defaults isDefault to false", () => {
		const result = createInvoiceTemplateSchema.safeParse(valid);
		expect(result.success && result.data.isDefault).toBe(false);
	});

	it("rejects empty lineItems array", () => {
		expect(createInvoiceTemplateSchema.safeParse({ ...valid, lineItems: [] }).success).toBe(false);
	});

	it("rejects client-supplied centerId", () => {
		expect(
			createInvoiceTemplateSchema.safeParse({
				...valid,
				centerId: "550e8400-e29b-41d4-a716-446655440012",
			}).success,
		).toBe(false);
	});
});

// ─── Scheduling ────────────────────────────────────────────────────────────

describe("updateInvoiceTemplateSchema", () => {
	it("does not apply create defaults to partial updates", () => {
		const result = updateInvoiceTemplateSchema.safeParse({ name: "Updated Tuition" });
		expect(result.success).toBe(true);
		expect(result.success && Object.hasOwn(result.data, "dueDays")).toBe(false);
		expect(result.success && Object.hasOwn(result.data, "isDefault")).toBe(false);
	});
});

describe("createScheduleSchema", () => {
	const valid = {
		name: "Spring staffing plan",
		effectiveFrom: "2024-01-01",
	};

	it("accepts valid schedule", () => {
		expect(createScheduleSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts optional effectiveUntil", () => {
		expect(createScheduleSchema.safeParse({ ...valid, effectiveUntil: "2024-12-31" }).success).toBe(
			true,
		);
	});
});

describe("updateScheduleSchema", () => {
	it("allows partial schedule updates", () => {
		expect(updateScheduleSchema.safeParse({ name: "Updated plan" }).success).toBe(true);
	});

	it("rejects effectiveFrom after effectiveUntil on partial update", () => {
		expect(
			updateScheduleSchema.safeParse({
				effectiveFrom: "2024-12-31",
				effectiveUntil: "2024-01-01",
			}).success,
		).toBe(false);
	});
});

describe("createShiftSchema", () => {
	const valid = {
		scheduleId: "550e8400-e29b-41d4-a716-446655440009",
		membershipId: "550e8400-e29b-41d4-a716-446655440000",
		classroomId: "550e8400-e29b-41d4-a716-446655440001",
		dayOfWeek: 1,
		startTime: "08:00",
		endTime: "16:00",
	};

	it("accepts valid shift", () => {
		expect(createShiftSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts dayOfWeek 0 (Sunday)", () => {
		expect(createShiftSchema.safeParse({ ...valid, dayOfWeek: 0 }).success).toBe(true);
	});

	it("accepts dayOfWeek 6 (Saturday)", () => {
		expect(createShiftSchema.safeParse({ ...valid, dayOfWeek: 6 }).success).toBe(true);
	});

	it("rejects dayOfWeek 7", () => {
		expect(createShiftSchema.safeParse({ ...valid, dayOfWeek: 7 }).success).toBe(false);
	});

	it("rejects invalid time format", () => {
		expect(createShiftSchema.safeParse({ ...valid, startTime: "8:00" }).success).toBe(false);
		expect(createShiftSchema.safeParse({ ...valid, startTime: "25:00" }).success).toBe(false);
	});
});

describe("updateShiftSchema", () => {
	it("allows partial update", () => {
		expect(updateShiftSchema.safeParse({ startTime: "09:00" }).success).toBe(true);
	});

	it("rejects startTime after endTime on partial update", () => {
		expect(updateShiftSchema.safeParse({ startTime: "17:00", endTime: "09:00" }).success).toBe(
			false,
		);
	});
});

describe("createTimeEntryAdjustmentSchema", () => {
	const valid = {
		hoursWorked: 8,
		hoursScheduled: 7.5,
		overtimeHours: 0.5,
		status: "approved" as const,
	};

	it("accepts a valid time entry adjustment", () => {
		expect(createTimeEntryAdjustmentSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects negative hours", () => {
		expect(createTimeEntryAdjustmentSchema.safeParse({ ...valid, hoursWorked: -1 }).success).toBe(
			false,
		);
	});

	it("rejects unsupported statuses", () => {
		expect(
			createTimeEntryAdjustmentSchema.safeParse({ ...valid, status: "submitted" }).success,
		).toBe(false);
	});
});

describe("timeEntryQuerySchema", () => {
	it("accepts a valid date range", () => {
		expect(
			timeEntryQuerySchema.safeParse({
				from: "2026-04-01",
				to: "2026-04-07",
				status: "manual",
			}).success,
		).toBe(true);
	});

	it("rejects a reversed date range", () => {
		expect(
			timeEntryQuerySchema.safeParse({
				from: "2026-04-08",
				to: "2026-04-07",
			}).success,
		).toBe(false);
	});
});

// ─── Messaging ─────────────────────────────────────────────────────────────

describe("createMessageSchema", () => {
	const valid = {
		subject: "Ratio reminder",
		body: "Hello families, ...",
		messageType: "announcement" as const,
		recipientMode: "guardian_ids" as const,
		recipientGuardianIds: ["550e8400-e29b-41d4-a716-446655440000"],
	};

	it("accepts valid message", () => {
		expect(createMessageSchema.safeParse(valid).success).toBe(true);
	});

	it("accepts classroom audience targeting", () => {
		expect(
			createMessageSchema.safeParse({
				...valid,
				recipientMode: "classroom" as const,
				classroomId: "550e8400-e29b-41d4-a716-446655440001",
				recipientGuardianIds: undefined,
			}).success,
		).toBe(true);
	});

	it("accepts child audience targeting", () => {
		expect(
			createMessageSchema.safeParse({
				...valid,
				recipientMode: "child_ids" as const,
				recipientGuardianIds: undefined,
				recipientChildIds: ["550e8400-e29b-41d4-a716-446655440123"],
			}).success,
		).toBe(true);
	});

	it("rejects empty guardian recipient lists", () => {
		expect(createMessageSchema.safeParse({ ...valid, recipientGuardianIds: [] }).success).toBe(
			false,
		);
	});

	it("rejects classroom mode without classroomId", () => {
		expect(
			createMessageSchema.safeParse({
				...valid,
				recipientMode: "classroom" as const,
				recipientGuardianIds: undefined,
				classroomId: undefined,
			}).success,
		).toBe(false);
	});

	it("rejects invalid messageType", () => {
		expect(createMessageSchema.safeParse({ ...valid, messageType: "newsletter" }).success).toBe(
			false,
		);
	});

	it("rejects empty subject", () => {
		expect(createMessageSchema.safeParse({ ...valid, subject: "" }).success).toBe(false);
	});
});

describe("generateReportSchema", () => {
	it("accepts a valid compliance report request", () => {
		expect(
			generateReportSchema.safeParse({
				reportType: "attendance",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}).success,
		).toBe(true);
	});

	it("accepts a requested report export format", () => {
		const result = generateReportSchema.safeParse({
			reportType: "attendance",
			periodStart: "2026-04-01",
			periodEnd: "2026-04-07",
			format: "pdf",
		});

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.format).toBe("pdf");
		}
	});

	it("rejects unsupported report types", () => {
		expect(
			generateReportSchema.safeParse({
				reportType: "billing",
				periodStart: "2026-04-01",
				periodEnd: "2026-04-07",
			}).success,
		).toBe(false);
	});

	it("rejects reversed date ranges", () => {
		expect(
			generateReportSchema.safeParse({
				reportType: "ratio",
				periodStart: "2026-04-10",
				periodEnd: "2026-04-01",
			}).success,
		).toBe(false);
	});
});

describe("listReportsQuerySchema", () => {
	it("accepts report history filters", () => {
		expect(
			listReportsQuerySchema.safeParse({
				reportType: "subsidy",
				periodStartFrom: "2026-04-01",
				periodEndTo: "2026-04-30",
			}).success,
		).toBe(true);
	});

	it("accepts generatedFrom and generatedTo when in order", () => {
		expect(
			listReportsQuerySchema.safeParse({
				generatedFrom: "2026-04-01",
				generatedTo: "2026-04-30",
			}).success,
		).toBe(true);
	});

	it("rejects reversed generatedFrom / generatedTo range", () => {
		expect(
			listReportsQuerySchema.safeParse({
				generatedFrom: "2026-04-30",
				generatedTo: "2026-04-01",
			}).success,
		).toBe(false);
	});
});

describe("auditLogQuerySchema", () => {
	it("accepts audit-log filters", () => {
		expect(
			auditLogQuerySchema.safeParse({
				action: "export",
				entityType: "reports",
				from: "2026-04-01",
				to: "2026-04-30",
			}).success,
		).toBe(true);
	});

	it("accepts partial audit-log action filters", () => {
		expect(
			auditLogQuerySchema.safeParse({
				action: "crea",
				entityType: "classroom",
			}).success,
		).toBe(true);
	});

	it("rejects reversed audit-log date ranges", () => {
		expect(
			auditLogQuerySchema.safeParse({
				from: "2026-04-30",
				to: "2026-04-01",
			}).success,
		).toBe(false);
	});

	it("accepts cursor at the upper bound of 1_000_000", () => {
		expect(
			auditLogQuerySchema.safeParse({
				cursor: 1_000_000,
			}).success,
		).toBe(true);
	});

	it("rejects cursor above 1_000_000", () => {
		expect(
			auditLogQuerySchema.safeParse({
				cursor: 1_000_001,
			}).success,
		).toBe(false);
	});
});
