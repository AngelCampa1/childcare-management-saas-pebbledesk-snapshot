import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { resolveDevApiProxyTarget } from "./src/lib/api-origin";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");

	return {
		plugins: [
			TanStackRouterVite({
				routesDirectory: "./src/routes",
				generatedRouteTree: "./src/routeTree.gen.ts",
				routeFileIgnorePattern: "\\.test\\.(ts|tsx)$",
			}),
			react(),
			tailwindcss(),
		],
		server: {
			port: 3040,
			strictPort: true,
			proxy: {
				"/api": {
					target: resolveDevApiProxyTarget(env),
					changeOrigin: true,
				},
			},
		},
	};
});
