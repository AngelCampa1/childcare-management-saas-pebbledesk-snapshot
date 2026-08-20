import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const args = process.argv.slice(2);
const wantsCoverage =
	args.includes("--coverage") || args.some((arg) => arg.startsWith("--coverage."));

const vitest = spawnSync("pnpm", ["exec", "vitest", "run", ...args], {
	cwd: appRoot,
	stdio: "inherit",
	shell: process.platform === "win32",
});

if (vitest.status !== 0) {
	process.exit(vitest.status ?? 1);
}

if (!wantsCoverage) {
	process.exit(0);
}

const coverageCheck = spawnSync("node", ["scripts/check-touched-coverage.mjs"], {
	cwd: appRoot,
	stdio: "inherit",
	shell: process.platform === "win32",
});

process.exit(coverageCheck.status ?? 1);
