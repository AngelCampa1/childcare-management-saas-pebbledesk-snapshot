const DEFAULT_DEV_API_TARGET = "http://127.0.0.1:8790";

type ApiRuntimeEnv = {
	DEV: boolean;
	VITE_API_URL?: string;
	VITE_DEV_USE_ABSOLUTE_API?: string;
};

type ApiProxyEnv = {
	VITE_API_URL?: string;
	VITE_DEV_API_TARGET?: string;
};

export function resolveApiBaseUrl(env: ApiRuntimeEnv): string {
	if (!env.DEV) {
		return env.VITE_API_URL ?? "";
	}

	return env.VITE_DEV_USE_ABSOLUTE_API === "true" ? (env.VITE_API_URL ?? "") : "";
}

export function resolveDevApiProxyTarget(env: ApiProxyEnv): string {
	return env.VITE_DEV_API_TARGET ?? DEFAULT_DEV_API_TARGET;
}
