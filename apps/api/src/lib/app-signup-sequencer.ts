import type { Bindings } from "./context.js";

const PRODUCT_ID = "pebbledesk";
const SEQUENCE_SLUGS = ["pebbledesk-fulfillment-welcome", "pebbledesk-nurture-value-1"] as const;

function normalizeEmail(value: string | null | undefined): string | null {
	const normalized = value?.trim().toLowerCase();
	return normalized || null;
}

function resolveFirstName(input: {
	firstName?: string | null;
	name?: string | null;
}): string | null {
	const source = input.firstName ?? input.name;
	return source?.trim().split(/\s+/)[0] || null;
}

function hasSequencerConfig(
	env: Pick<
		Bindings,
		"SEQUENCER_BASE_URL" | "SEQUENCER_CF_ACCESS_CLIENT_ID" | "SEQUENCER_CF_ACCESS_CLIENT_SECRET"
	>,
): boolean {
	return Boolean(
		env.SEQUENCER_BASE_URL &&
			env.SEQUENCER_CF_ACCESS_CLIENT_ID &&
			env.SEQUENCER_CF_ACCESS_CLIENT_SECRET,
	);
}

async function sequencerFetch(
	env: Pick<
		Bindings,
		"SEQUENCER_BASE_URL" | "SEQUENCER_CF_ACCESS_CLIENT_ID" | "SEQUENCER_CF_ACCESS_CLIENT_SECRET"
	>,
	path: string,
	body: unknown,
): Promise<Response> {
	const baseUrl = env.SEQUENCER_BASE_URL?.replace(/\/+$/, "");
	if (!baseUrl) throw new Error("SEQUENCER_BASE_URL is required");

	return fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"CF-Access-Client-Id": env.SEQUENCER_CF_ACCESS_CLIENT_ID ?? "",
			"CF-Access-Client-Secret": env.SEQUENCER_CF_ACCESS_CLIENT_SECRET ?? "",
		},
		body: JSON.stringify(body),
	});
}

async function assertOk(response: Response, action: string): Promise<void> {
	if (response.ok) return;
	const body = await response.text().catch(() => "");
	throw new Error(`Sequencer ${action} failed with ${response.status}: ${body}`);
}

export async function enrollAppSignupSequences(
	env: Pick<
		Bindings,
		"SEQUENCER_BASE_URL" | "SEQUENCER_CF_ACCESS_CLIENT_ID" | "SEQUENCER_CF_ACCESS_CLIENT_SECRET"
	>,
	input: {
		userId: string | null | undefined;
		email?: string | null;
		firstName?: string | null;
		name?: string | null;
		createdAt?: Date;
	},
): Promise<void> {
	const userId = input.userId?.trim();
	const email = normalizeEmail(input.email);
	if (!userId || !email) return;
	if (!hasSequencerConfig(env)) {
		console.warn("Sequencer is not configured; skipping PebbleDesk signup sequence enrollment");
		return;
	}

	const firstName = resolveFirstName(input);
	const contactResponse = await sequencerFetch(env, "/api/v1/contacts", {
		product: PRODUCT_ID,
		email,
		first_name: firstName ?? undefined,
		properties: {
			userId,
			source: "app-signup",
			createdAt: (input.createdAt ?? new Date()).toISOString(),
		},
	});
	await assertOk(contactResponse, "contact upsert");

	const payload = (await contactResponse.json().catch(() => ({}))) as {
		id?: string;
		contact?: { id?: string };
	};
	const contactId = payload.id ?? payload.contact?.id;
	if (!contactId) throw new Error("Sequencer contact upsert did not return id");

	for (const sequenceSlug of SEQUENCE_SLUGS) {
		const enrollmentResponse = await sequencerFetch(env, "/api/v1/enrollments", {
			product: PRODUCT_ID,
			email,
			sequence_slug: sequenceSlug,
			source: "app-signup",
			properties: { contactId, userId },
		});
		await assertOk(enrollmentResponse, `enrollment ${sequenceSlug}`);
	}
}

export async function unsubscribeAppSignupSequences(
	env: Pick<
		Bindings,
		"SEQUENCER_BASE_URL" | "SEQUENCER_CF_ACCESS_CLIENT_ID" | "SEQUENCER_CF_ACCESS_CLIENT_SECRET"
	>,
	input: { email: string },
): Promise<void> {
	if (!hasSequencerConfig(env)) return;
	const email = input.email.trim().toLowerCase();
	if (!email) return;

	const response = await sequencerFetch(env, "/api/v1/unsubscribe", {
		product: PRODUCT_ID,
		email,
		scope: "product",
		reason: "unsubscribe_link",
	});
	await assertOk(response, "unsubscribe");
}
