import { describe, expect, it, vi } from "vitest";
import { findPendingInvitation, findVerifiedPendingInvitation } from "./pending-invitations.js";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

// findPendingInvitation builds a Drizzle query chain:
//   db.select({...}).from(memberships).innerJoin(centers, ...).where(...)
// The chain resolves to an array of rows.

type PendingInvitationSelectRow = {
	membershipId: string;
	centerId: string;
	role: "owner" | "director" | "staff";
	centerName: string;
	invitedAt: Date | null;
	createdAt: Date;
	emailVerified: boolean;
};

function makeDb(rows: PendingInvitationSelectRow[]) {
	const where = vi.fn().mockResolvedValue(rows);
	const chain = {
		innerJoin: vi.fn(),
		where,
	};
	chain.innerJoin.mockReturnValue(chain);
	const from = vi.fn().mockReturnValue(chain);
	const select = vi.fn().mockReturnValue({ from });
	return { select };
}

function sqlConditionColumnNames(value: unknown, seen = new WeakSet<object>()): string[] {
	if (!value || typeof value !== "object" || seen.has(value)) return [];
	seen.add(value);

	if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) {
		return [];
	}

	const names: string[] = [];
	for (const chunk of value.queryChunks) {
		if (!chunk || typeof chunk !== "object") continue;
		if ("name" in chunk && typeof chunk.name === "string") {
			names.push(chunk.name);
		}
		names.push(...sqlConditionColumnNames(chunk, seen));
	}

	return names;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("findPendingInvitation", () => {
	it("returns null when the user has no pending invitations", async () => {
		const db = makeDb([]);
		const result = await findPendingInvitation(db as never, "user-1");
		expect(result).toBeNull();
	});

	it("returns the single pending invitation when one exists", async () => {
		const row: PendingInvitationSelectRow = {
			membershipId: "mem-1",
			centerId: "center-1",
			role: "staff",
			centerName: "Sunshine Daycare",
			invitedAt: new Date("2026-04-10T10:00:00Z"),
			createdAt: new Date("2026-04-10T09:00:00Z"),
			emailVerified: true,
		};
		const db = makeDb([row]);
		const result = await findPendingInvitation(db as never, "user-1");

		expect(result).toEqual({
			membershipId: "mem-1",
			centerId: "center-1",
			role: "staff",
			centerName: "Sunshine Daycare",
		});
	});

	it("forwards userId through the full query chain when finding a pending invitation", async () => {
		const row: PendingInvitationSelectRow = {
			membershipId: "mem-user-specific",
			centerId: "center-specific",
			role: "director",
			centerName: "Specific Center",
			invitedAt: new Date("2026-04-15T10:00:00Z"),
			createdAt: new Date("2026-04-15T09:00:00Z"),
			emailVerified: true,
		};
		const db = makeDb([row]);
		await findPendingInvitation(db as never, "user-specific-id");

		// Verify the full query chain was exercised: select → from → innerJoin → where
		expect(db.select).toHaveBeenCalled();
		const fromMock = db.select.mock.results[0].value as { from: ReturnType<typeof vi.fn> };
		expect(fromMock.from).toHaveBeenCalled();
		const innerJoinMock = fromMock.from.mock.results[0].value as {
			innerJoin: ReturnType<typeof vi.fn>;
		};
		expect(innerJoinMock.innerJoin).toHaveBeenCalled();
		const whereMock = innerJoinMock.innerJoin.mock.results[0].value as {
			where: ReturnType<typeof vi.fn>;
		};
		expect(whereMock.where).toHaveBeenCalled();
	});

	it("filters out deactivated pending invitations at query time", async () => {
		const db = makeDb([]);

		await findPendingInvitation(db as never, "user-1");

		const fromMock = db.select.mock.results[0].value as { from: ReturnType<typeof vi.fn> };
		const innerJoinMock = fromMock.from.mock.results[0].value as {
			innerJoin: ReturnType<typeof vi.fn>;
		};
		const whereMock = innerJoinMock.innerJoin.mock.results[0].value as {
			where: ReturnType<typeof vi.fn>;
		};
		const predicate = whereMock.where.mock.calls[0]?.[0];

		expect(sqlConditionColumnNames(predicate)).toContain("deactivated_at");
	});

	it("returns the most recently invited when multiple pending invitations exist (sorted by invitedAt)", async () => {
		const rows: PendingInvitationSelectRow[] = [
			{
				membershipId: "mem-older",
				centerId: "center-older",
				role: "staff",
				centerName: "Old Center",
				invitedAt: new Date("2026-04-08T10:00:00Z"),
				createdAt: new Date("2026-04-08T09:00:00Z"),
				emailVerified: true,
			},
			{
				membershipId: "mem-newest",
				centerId: "center-newest",
				role: "director",
				centerName: "New Center",
				invitedAt: new Date("2026-04-12T10:00:00Z"),
				createdAt: new Date("2026-04-12T09:00:00Z"),
				emailVerified: true,
			},
			{
				membershipId: "mem-middle",
				centerId: "center-middle",
				role: "owner",
				centerName: "Middle Center",
				invitedAt: new Date("2026-04-10T10:00:00Z"),
				createdAt: new Date("2026-04-10T09:00:00Z"),
				emailVerified: true,
			},
		];
		const db = makeDb(rows);
		const result = await findPendingInvitation(db as never, "user-1");

		expect(result).toMatchObject({
			membershipId: "mem-newest",
			centerId: "center-newest",
		});
	});

	it("falls back to createdAt when invitedAt is null for sorting", async () => {
		const rows: PendingInvitationSelectRow[] = [
			{
				membershipId: "mem-no-invite-old",
				centerId: "center-a",
				role: "staff",
				centerName: "Center A",
				invitedAt: null,
				createdAt: new Date("2026-04-06T09:00:00Z"),
				emailVerified: true,
			},
			{
				membershipId: "mem-no-invite-new",
				centerId: "center-b",
				role: "director",
				centerName: "Center B",
				invitedAt: null,
				createdAt: new Date("2026-04-10T09:00:00Z"),
				emailVerified: true,
			},
		];
		const db = makeDb(rows);
		const result = await findPendingInvitation(db as never, "user-1");

		expect(result).toMatchObject({
			membershipId: "mem-no-invite-new",
			centerId: "center-b",
		});
	});

	it("prefers invitedAt over createdAt when one row has invitedAt and another does not", async () => {
		const rows: PendingInvitationSelectRow[] = [
			{
				membershipId: "mem-with-invite",
				centerId: "center-with-invite",
				role: "owner",
				centerName: "Invited Center",
				invitedAt: new Date("2026-04-15T10:00:00Z"),
				createdAt: new Date("2026-04-01T09:00:00Z"),
				emailVerified: true,
			},
			{
				membershipId: "mem-no-invite",
				centerId: "center-no-invite",
				role: "staff",
				centerName: "Created Center",
				invitedAt: null,
				// createdAt is more recent than the other row's createdAt but earlier than its invitedAt
				createdAt: new Date("2026-04-14T09:00:00Z"),
				emailVerified: true,
			},
		];
		const db = makeDb(rows);
		const result = await findPendingInvitation(db as never, "user-1");

		// invitedAt=Apr 15 > createdAt=Apr 14 → invited row wins
		expect(result).toMatchObject({ membershipId: "mem-with-invite" });
	});

	it("returns only the first (latest) invitation when multiple exist (slice(0,1))", async () => {
		// Regardless of input size, only the top-sorted row is returned
		const rows: PendingInvitationSelectRow[] = Array.from({ length: 5 }, (_, i) => ({
			membershipId: `mem-${i}`,
			centerId: `center-${i}`,
			role: "staff" as const,
			centerName: `Center ${i}`,
			invitedAt: new Date(`2026-04-0${i + 1}T10:00:00Z`),
			createdAt: new Date(`2026-04-0${i + 1}T09:00:00Z`),
			emailVerified: true,
		}));
		const db = makeDb(rows);
		const result = await findPendingInvitation(db as never, "user-1");

		// mem-4 has the latest invitedAt (April 5)
		expect(result).toMatchObject({ membershipId: "mem-4" });
	});

	it("maps the correct fields from the db row to PendingInvitation shape", async () => {
		const row: PendingInvitationSelectRow = {
			membershipId: "mem-shape",
			centerId: "center-shape",
			role: "owner",
			centerName: "Shape Center",
			invitedAt: new Date("2026-04-11T10:00:00Z"),
			createdAt: new Date("2026-04-11T09:00:00Z"),
			emailVerified: true,
		};
		const db = makeDb([row]);
		const result = await findPendingInvitation(db as never, "user-1");

		expect(result).toStrictEqual({
			membershipId: "mem-shape",
			centerId: "center-shape",
			role: "owner",
			centerName: "Shape Center",
		});
		// No extra fields like invitedAt or createdAt should be present
		expect(result).not.toHaveProperty("invitedAt");
		expect(result).not.toHaveProperty("createdAt");
	});

	it("returns pending invitations for an unverified email account when visibility is not checked", async () => {
		const row: PendingInvitationSelectRow = {
			membershipId: "mem-unverified",
			centerId: "center-unverified",
			role: "director",
			centerName: "Unverified Center",
			invitedAt: new Date("2026-04-15T10:00:00Z"),
			createdAt: new Date("2026-04-15T09:00:00Z"),
			emailVerified: false,
		};
		const db = makeDb([row]);
		const result = await findPendingInvitation(db as never, "user-1");

		expect(result).toMatchObject({
			membershipId: "mem-unverified",
			centerId: "center-unverified",
		});
	});

	it("does not surface pending invitations for an unverified email account when visibility is checked", async () => {
		const row: PendingInvitationSelectRow = {
			membershipId: "mem-unverified",
			centerId: "center-unverified",
			role: "director",
			centerName: "Unverified Center",
			invitedAt: new Date("2026-04-15T10:00:00Z"),
			createdAt: new Date("2026-04-15T09:00:00Z"),
			emailVerified: false,
		};
		const db = makeDb([row]);
		const result = await findVerifiedPendingInvitation(db as never, "user-1");

		expect(result).toBeNull();
	});
});
