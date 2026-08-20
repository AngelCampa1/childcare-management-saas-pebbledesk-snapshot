export function resolveMarketingApiUrl(
	publicApiUrl: string | undefined,
	currentOrigin: string,
): string {
	const trimmed = publicApiUrl?.trim();
	if (!trimmed) {
		return currentOrigin.replace(/\/$/, "");
	}
	return trimmed.replace(/\/$/, "");
}
