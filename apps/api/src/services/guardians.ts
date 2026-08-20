import type { Database } from "@pebbledesk/db";
import { childGuardians, children, guardians } from "@pebbledesk/db";
import type { CreateGuardianInput, LinkGuardianInput } from "@pebbledesk/shared";
import { and, eq, ne, sql } from "drizzle-orm";

type Guardian = typeof guardians.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const DUPLICATE_GUARDIAN_EMAIL_MESSAGE = "Guardian email already exists for this center";
export const DUPLICATE_GUARDIAN_LINK_MESSAGE = "Guardian is already linked to this child";

export async function createGuardian(
	db: Database | Tx,
	centerId: string,
	input: CreateGuardianInput,
): Promise<Guardian> {
	if (input.email) {
		const emailNorm = input.email.toLowerCase().trim();
		const [existingGuardian] = await db
			.select({ id: guardians.id })
			.from(guardians)
			.where(
				and(eq(guardians.centerId, centerId), sql`lower(trim(${guardians.email})) = ${emailNorm}`),
			)
			.limit(1);

		if (existingGuardian) {
			throw new Error(DUPLICATE_GUARDIAN_EMAIL_MESSAGE);
		}
	}

	const [guardian] = await db
		.insert(guardians)
		.values({
			centerId,
			firstName: input.firstName,
			lastName: input.lastName,
			email: input.email,
			phone: input.phone,
		})
		.returning();

	if (!guardian) {
		throw new Error("Failed to create guardian");
	}

	return guardian;
}

export async function linkGuardianToChild(
	db: Database | Tx,
	centerId: string,
	childId: string,
	input: LinkGuardianInput,
): Promise<void> {
	const [child] = await db
		.select({ id: children.id })
		.from(children)
		.where(and(eq(children.id, childId), eq(children.centerId, centerId)))
		.limit(1);

	if (!child) {
		throw new Error("Child not found");
	}

	const [guardian] = await db
		.select({ id: guardians.id })
		.from(guardians)
		.where(and(eq(guardians.id, input.guardianId), eq(guardians.centerId, centerId)))
		.limit(1);

	if (!guardian) {
		throw new Error("Guardian not found");
	}

	const [existingLink] = await db
		.select({ guardianId: childGuardians.guardianId })
		.from(childGuardians)
		.where(
			and(
				eq(childGuardians.centerId, centerId),
				eq(childGuardians.childId, childId),
				eq(childGuardians.guardianId, input.guardianId),
			),
		)
		.limit(1);

	if (existingLink?.guardianId === input.guardianId) {
		throw new Error(DUPLICATE_GUARDIAN_LINK_MESSAGE);
	}

	const runInsert = async (tx: Database | Tx) => {
		await tx.insert(childGuardians).values({
			centerId,
			childId,
			guardianId: input.guardianId,
			isPrimary: false,
			authorizedPickup: input.authorizedPickup,
			relationship: input.relationship,
		});

		if (input.isPrimary) {
			await tx
				.update(childGuardians)
				.set({ isPrimary: false })
				.where(
					and(
						eq(childGuardians.centerId, centerId),
						eq(childGuardians.childId, childId),
						ne(childGuardians.guardianId, input.guardianId),
					),
				);

			await tx
				.update(childGuardians)
				.set({ isPrimary: true })
				.where(
					and(
						eq(childGuardians.centerId, centerId),
						eq(childGuardians.childId, childId),
						eq(childGuardians.guardianId, input.guardianId),
					),
				);
		}
	};

	if ("transaction" in db && typeof db.transaction === "function") {
		await (db as Database).transaction((tx) => runInsert(tx));
	} else {
		await runInsert(db);
	}
}
