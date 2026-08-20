export function formatUserFacingError(error: unknown, fallbackMessage: string): string {
	if (typeof error === "object" && error !== null && "requestId" in error) {
		const requestId = (error as { requestId?: unknown }).requestId;
		if (typeof requestId === "string" && requestId.trim().length > 0) {
			return `${fallbackMessage} Reference ID: ${requestId}`;
		}
	}

	return fallbackMessage;
}
