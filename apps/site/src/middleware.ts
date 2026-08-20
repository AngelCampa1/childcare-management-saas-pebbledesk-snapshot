export const onRequest = (
	context: {
		url: URL;
		redirect: (path: string, status?: number) => Response;
	},
	next: () => Response | Promise<Response>,
) => {
	if (shouldAppendTrailingSlash(context.url.pathname)) {
		const redirectUrl = new URL(context.url);
		redirectUrl.pathname = `${context.url.pathname}/`;

		return context.redirect(redirectUrl.toString(), 308);
	}

	return next();
};

function shouldAppendTrailingSlash(pathname: string) {
	if (pathname === "/" || pathname.endsWith("/")) {
		return false;
	}

	const lastSegment = pathname.split("/").pop() ?? "";

	return !lastSegment.includes(".");
}
