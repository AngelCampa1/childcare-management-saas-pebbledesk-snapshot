// Augments ImportMeta with Vite/Astro's env object so import.meta.env.MODE
// is available in .ts files compiled with plain tsc (no Vite transform).
interface ImportMetaEnv {
	readonly MODE: string;
	readonly PROD: boolean;
	readonly PUBLIC_APP_URL?: string;
	readonly PUBLIC_POSTHOG_HOST?: string;
	readonly PUBLIC_POSTHOG_KEY?: string;
	readonly PUBLIC_SENTRY_DSN?: string;
	readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
