import { describe, expect, it, vi } from "vitest";
import { resolveActiveMembershipContext } from "./membership-context.js";

function makeMockContext(cookieValue: string | null) {
	return {
		req: {
			raw: {
				headers: new Headers(cookieValue ? { cookie: `x-pebbledesk-center=${cookieValue}` } : {}),
			},
		},
	} as Parameters<typeof resolveActiveMembershipContext>[2];
}

describe("resolveActiveMembershipContext", () => {
	const baseRows = [
		{
			id: "membership-pending",
			centerId: "center-pending",
			role: "staff",
			acceptedAt: null,
			createdAt: new Date("2026-04-08T09:00:00.000Z"),
		},
		{
			id: "membership-recent",
			centerId: "center-recent",
			role: "director",
			acceptedAt: new Date("2026-04-10T09:00:00.000Z"),
			createdAt: new Date("2026-04-10T08:30:00.000Z"),
		},
		{
			id: "membership-older",
			centerId: "center-older",
			role: "owner",
			acceptedAt: new Date("2026-04-06T09:00:00.000Z"),
			createdAt: new Date("2026-04-06T08:30:00.000Z"),
		},
	];

	function makeDb(rows: typeof baseRows) {
		return {
			select: vi.fn().mockReturnValue({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue(rows),
				}),
			}),
		};
	}

	it("returns CENTER_SELECTION_REQUIRED when user has multiple accepted memberships and no cookie is set", async () => {
		const db = makeDb(baseRows);
		const c = makeMockContext(null);

		const result = await resolveActiveMembershipContext(db as never, "user-1", c);
		expect(result).toMatchObject({ error: "CENTER_SELECTION_REQUIRED" });
	});

	it("uses the cookie-selected center when the user has an accepted membership there", async () => {
		const db = makeDb(baseRows);
		const c = makeMockContext("center-older");

		await expect(resolveActiveMembershipContext(db as never, "user-1", c)).resolves.toEqual({
			centerId: "center-older",
			membershipId: "membership-older",
			role: "owner",
		});
	});

	it("returns CENTER_SELECTION_REQUIRED when the cookie points to an unknown center and multiple accepted memberships exist", async () => {
		const db = makeDb(baseRows);
		const c = makeMockContext("center-nonexistent");

		const result = await resolveActiveMembershipContext(db as never, "user-1", c);
		expect(result).toMatchObject({ error: "CENTER_SELECTION_REQUIRED" });
	});

	it("returns CENTER_SELECTION_REQUIRED when the cookie points to a pending membership and multiple accepted memberships exist", async () => {
		const db = makeDb(baseRows);
		const c = makeMockContext("center-pending");

		// center-pending has no acceptedAt so it should not be used via cookie
		const result = await resolveActiveMembershipContext(db as never, "user-1", c);
		expect(result).toMatchObject({ error: "CENTER_SELECTION_REQUIRED" });
	});

	it("returns null when the user only has pending invitations", async () => {
		const db = makeDb([
			{
				id: "membership-pending",
				centerId: "center-pending",
				role: "staff",
				acceptedAt: null,
				createdAt: new Date("2026-04-08T09:00:00.000Z"),
			},
		]);
		const c = makeMockContext(null);

		await expect(resolveActiveMembershipContext(db as never, "user-1", c)).resolves.toBeNull();
	});

	it("returns null when the user has no memberships at all", async () => {
		const db = makeDb([]);
		const c = makeMockContext(null);

		await expect(resolveActiveMembershipContext(db as never, "user-1", c)).resolves.toBeNull();
	});

	it("returns CENTER_SELECTION_REQUIRED when user has two accepted memberships with tied acceptedAt and no cookie", async () => {
		const tiedAcceptedAt = new Date("2026-04-10T09:00:00.000Z");
		const rows = [
			{
				id: "membership-older-created",
				centerId: "center-older-created",
				role: "staff",
				acceptedAt: tiedAcceptedAt,
				createdAt: new Date("2026-04-08T08:00:00.000Z"),
			},
			{
				id: "membership-newer-created",
				centerId: "center-newer-created",
				role: "director",
				acceptedAt: tiedAcceptedAt,
				createdAt: new Date("2026-04-09T08:00:00.000Z"),
			},
		];
		const db = makeDb(rows as typeof baseRows);
		const c = makeMockContext(null);

		const result = await resolveActiveMembershipContext(db as never, "user-1", c);
		expect(result).toMatchObject({ error: "CENTER_SELECTION_REQUIRED" });
	});

	it("uses cookie-selected center when user has exactly one matching accepted membership", async () => {
		const rows = [
			{
				id: "membership-only",
				centerId: "center-only",
				role: "owner" as const,
				acceptedAt: new Date("2026-04-10T09:00:00.000Z"),
				createdAt: new Date("2026-04-10T08:00:00.000Z"),
			},
		];
		const db = makeDb(rows as typeof baseRows);
		const c = makeMockContext("center-only");

		await expect(resolveActiveMembershipContext(db as never, "user-1", c)).resolves.toEqual({
			centerId: "center-only",
			membershipId: "membership-only",
			role: "owner",
		});
	});

	it("resolves single accepted membership without cookie", async () => {
		const rows = [
			{
				id: "membership-solo",
				centerId: "center-solo",
				role: "director" as const,
				acceptedAt: new Date("2026-04-10T09:00:00.000Z"),
				createdAt: new Date("2026-04-10T08:00:00.000Z"),
			},
		];
		const db = makeDb(rows as typeof baseRows);
		const c = makeMockContext(null);

		await expect(resolveActiveMembershipContext(db as never, "user-1", c)).resolves.toEqual({
			centerId: "center-solo",
			membershipId: "membership-solo",
			role: "director",
		});
	});
});
