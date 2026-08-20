import type { ZodTypeAny, z } from "zod";

/**
 * Parses a fetch `Response` JSON body against a Zod schema. If the response is
 * not OK, attempts to extract a server-provided `error` string and throws an
 * Error with that message (falling back to `errorMessage`). If parsing fails,
 * a Zod-shaped error propagates so callers see structural drift surfaced
 * immediately instead of silent `undefined`s downstream.
 */
export async function parseJsonResponse<Schema extends ZodTypeAny>(
	res: Response,
	schema: Schema,
	errorMessage: string,
): Promise<z.infer<Schema>> {
	if (!res.ok) {
		let serverMessage: string | undefined;
		try {
			const payload = (await res.json()) as unknown;
			if (
				typeof payload === "object" &&
				payload !== null &&
				"error" in payload &&
				typeof (payload as { error: unknown }).error === "string"
			) {
				serverMessage = (payload as { error: string }).error;
			}
		} catch {
			serverMessage = undefined;
		}
		throw new Error(serverMessage ?? errorMessage);
	}
	const raw: unknown = await res.json();
	return schema.parse(raw);
}
