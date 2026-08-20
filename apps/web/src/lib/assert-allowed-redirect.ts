const ALLOWED_ORIGINS = [
	"https://checkout.stripe.com",
	"https://billing.stripe.com",
	"https://connect.stripe.com",
];

export function assertAllowedRedirect(url: string): void {
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(url);
	} catch {
		throw new Error(`Redirect to disallowed origin blocked: ${url}`);
	}

	const isAllowed =
		ALLOWED_ORIGINS.includes(parsedUrl.origin) || parsedUrl.origin === window.location.origin;
	if (!isAllowed) {
		throw new Error(`Redirect to disallowed origin blocked: ${url}`);
	}
}
