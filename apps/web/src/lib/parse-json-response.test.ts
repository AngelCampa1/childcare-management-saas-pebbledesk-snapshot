import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonResponse } from "./parse-json-response";

function jsonResponse(payload: unknown, init?: { ok?: boolean; status?: number }): Response {
	return {
		ok: init?.ok ?? true,
		status: init?.status ?? 200,
		json: async () => payload,
	} as Response;
}

describe("parseJsonResponse", () => {
	const schema = z.object({ count: z.number(), label: z.string() });

	it("parses and returns the validated body on a successful response", async () => {
		const res = jsonResponse({ count: 3, label: "ok" });
		const data = await parseJsonResponse(res, schema, "fallback");
		expect(data).toEqual({ count: 3, label: "ok" });
	});

	it("throws when the response is not ok and surfaces the server error string", async () => {
		const res = jsonResponse({ error: "Server exploded" }, { ok: false, status: 500 });
		await expect(parseJsonResponse(res, schema, "fallback")).rejects.toThrow("Server exploded");
	});

	it("throws with the fallback message when the error body cannot be parsed", async () => {
		const res = {
			ok: false,
			status: 500,
			json: async () => {
				throw new Error("invalid json");
			},
		} as Response;
		await expect(parseJsonResponse(res, schema, "fallback")).rejects.toThrow("fallback");
	});

	it("throws with the fallback message when the error body has no error field", async () => {
		const res = jsonResponse({ message: "no error key here" }, { ok: false, status: 502 });
		await expect(parseJsonResponse(res, schema, "fallback message")).rejects.toThrow(
			"fallback message",
		);
	});

	it("throws a Zod parse error when the response body does not match the schema", async () => {
		const res = jsonResponse({ count: "not a number", label: 42 });
		await expect(parseJsonResponse(res, schema, "fallback")).rejects.toThrow();
	});

	it("throws with the fallback message when the error body has a non-string error", async () => {
		const res = jsonResponse({ error: 123 }, { ok: false, status: 400 });
		await expect(parseJsonResponse(res, schema, "fallback")).rejects.toThrow("fallback");
	});
});
