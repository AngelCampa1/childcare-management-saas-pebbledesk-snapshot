import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrollAppSignupSequences } from "./app-signup-sequencer.js";

const env = {
	SEQUENCER_BASE_URL: "https://sequencer.ventoralabs.com/",
	SEQUENCER_CF_ACCESS_CLIENT_ID: "client-id",
	SEQUENCER_CF_ACCESS_CLIENT_SECRET: "client-secret",
};

function requestBodyAt(fetchMock: ReturnType<typeof vi.fn>, callIndex: number): unknown {
	const call = fetchMock.mock.calls[callIndex];
	expect(call).toBeDefined();
	const init = call?.[1] as RequestInit | undefined;
	expect(init?.body).toBeDefined();
	return JSON.parse(String(init?.body));
}

describe("enrollAppSignupSequences", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "owner@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "welcome-run" } }))
			.mockResolvedValueOnce(Response.json({ enrollment: { id: "sequencer-run" } }));
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("upserts the Sequencer contact and enrolls PebbleDesk signup sequences", async () => {
		const createdAt = new Date("2026-05-04T12:00:00.000Z");

		await enrollAppSignupSequences(env, {
			userId: "user-1",
			email: "Owner@Example.com",
			firstName: "Mia",
			createdAt,
		});

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(requestBodyAt(fetchMock, 0)).toMatchObject({
			product: "pebbledesk",
			email: "owner@example.com",
			first_name: "Mia",
			properties: {
				userId: "user-1",
				source: "app-signup",
				createdAt: "2026-05-04T12:00:00.000Z",
			},
		});
		expect(requestBodyAt(fetchMock, 1)).toMatchObject({
			product: "pebbledesk",
			email: "owner@example.com",
			sequence_slug: "pebbledesk-fulfillment-welcome",
			properties: { contactId: "contact-1", userId: "user-1" },
		});
		expect(requestBodyAt(fetchMock, 2)).toMatchObject({
			product: "pebbledesk",
			email: "owner@example.com",
			sequence_slug: "pebbledesk-nurture-value-1",
			properties: { contactId: "contact-1", userId: "user-1" },
		});
	});

	it("does not enroll when signup metadata or Sequencer config is incomplete", async () => {
		await enrollAppSignupSequences(env, { userId: "user-1", email: "" });
		await enrollAppSignupSequences(env, { userId: "", email: "owner@example.com" });
		await enrollAppSignupSequences(
			{ ...env, SEQUENCER_CF_ACCESS_CLIENT_SECRET: undefined },
			{ userId: "user-1", email: "owner@example.com" },
		);

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("throws when Sequencer rejects an enrollment", async () => {
		fetchMock
			.mockReset()
			.mockResolvedValueOnce(
				Response.json({ id: "contact-1", email: "owner@example.com", is_new: true }),
			)
			.mockResolvedValueOnce(new Response("bad", { status: 500 }));

		await expect(
			enrollAppSignupSequences(env, { userId: "user-1", email: "owner@example.com" }),
		).rejects.toThrow("Sequencer enrollment pebbledesk-fulfillment-welcome failed with 500: bad");
	});
});
