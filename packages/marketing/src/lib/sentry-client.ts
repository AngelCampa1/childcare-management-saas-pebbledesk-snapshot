import * as Sentry from "@sentry/browser";

type SentryTagValue = string | number | boolean | undefined;

export type CaptureExceptionOptions = {
	tags?: Record<string, SentryTagValue>;
	extra?: Record<string, unknown>;
};

export function getSentryDsn(): string | undefined {
	return import.meta.env.PUBLIC_SENTRY_DSN || undefined;
}

export const IGNORED_ERRORS: Array<string | RegExp> = [
	/Failed to fetch dynamically imported module/,
	"ChunkLoadError",
	/Loading chunk \d+ failed/,
	/^Load failed$/,
	/^Failed to fetch$/,
	/(?:jsxDEV|jsx|jsxs) is not a function/,
	/evaluating '.*\.pluginConfig'/,
	/Invalid call to runtime\.sendMessage\(\)/,
	/^options is not defined$/,
];

export const DENY_URLS: Array<string | RegExp> = [
	/webkit-masked-url:\/\/hidden/,
	/extensions\//,
	/^chrome-extension:\/\//,
	/^moz-extension:\/\//,
	/^safari-extension:\/\//,
];

export function initSentry(siteName: string): void {
	if (!import.meta.env.PROD) return;
	const dsn = getSentryDsn();
	if (!dsn) return;

	Sentry.init({
		dsn,
		environment: import.meta.env.MODE,
		ignoreErrors: IGNORED_ERRORS,
		denyUrls: DENY_URLS,
		initialScope: {
			tags: { site: siteName, surface: "marketing" },
		},
	});
}

export function captureException(error: unknown, options: CaptureExceptionOptions = {}): void {
	if (!options.tags && !options.extra) {
		Sentry.captureException(error);
		return;
	}

	Sentry.withScope((scope) => {
		for (const [key, value] of Object.entries(options.tags ?? {})) {
			if (value !== undefined) {
				scope.setTag(key, value);
			}
		}

		for (const [key, value] of Object.entries(options.extra ?? {})) {
			scope.setExtra(key, value);
		}

		Sentry.captureException(error);
	});
}
