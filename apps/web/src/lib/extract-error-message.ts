/**
 * Safely extracts a human-readable message from an unknown error value.
 * Returns the `.message` string if the value is an Error instance,
 * the fallback otherwise.
 */
export function extractErrorMessage(
	err: unknown,
	fallback = "Something went wrong. Please try again.",
): string {
	if (err instanceof Error) {
		return err.message || fallback;
	}
	return fallback;
}
