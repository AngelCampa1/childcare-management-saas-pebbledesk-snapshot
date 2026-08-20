import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, "../..");
const baseRef = process.env.PEBBLEDESK_COVERAGE_BASE_REF ?? "origin/master";
const lcovPath = resolve(appRoot, "coverage/lcov.info");

function runGit(args) {
	const result = spawnSync("git", args, {
		cwd: repoRoot,
		encoding: "utf8",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		return null;
	}
	return result.stdout;
}

function changedLineMap() {
	let diff = runGit(["diff", "--unified=0", `${baseRef}...HEAD`, "--", "apps/web/src"]);
	if (diff === null) {
		diff = runGit(["diff", "--unified=0", "HEAD^...HEAD", "--", "apps/web/src"]);
	}
	if (diff === null) {
		throw new Error("Unable to read changed web source lines from git diff.");
	}

	const files = new Map();
	addChangedLines(files, diff);

	const stagedDiff = runGit(["diff", "--cached", "--unified=0", "--", "apps/web/src"]);
	if (stagedDiff !== null) addChangedLines(files, stagedDiff);

	const workingTreeDiff = runGit(["diff", "--unified=0", "--", "apps/web/src"]);
	if (workingTreeDiff !== null) addChangedLines(files, workingTreeDiff);

	return files;
}

function addChangedLines(files, diff) {
	let currentFile = null;
	for (const line of diff.split(/\r?\n/)) {
		if (line.startsWith("+++ b/")) {
			const repoPath = line.slice("+++ b/".length);
			currentFile =
				repoPath.startsWith("apps/web/src/") &&
				/\.(ts|tsx)$/.test(repoPath) &&
				!/\.test\.(ts|tsx)$/.test(repoPath) &&
				!repoPath.startsWith("apps/web/src/test/") &&
				repoPath !== "apps/web/src/routeTree.gen.ts"
					? repoPath.slice("apps/web/".length)
					: null;
			if (currentFile && !files.has(currentFile)) files.set(currentFile, new Set());
			continue;
		}
		if (!currentFile || !line.startsWith("@@")) continue;
		const match = line.match(/\+(\d+)(?:,(\d+))?/);
		if (!match) continue;
		const start = Number(match[1]);
		const count = match[2] ? Number(match[2]) : 1;
		for (let offset = 0; offset < count; offset += 1) {
			files.get(currentFile).add(start + offset);
		}
	}
}

function parseLcov() {
	if (!existsSync(lcovPath)) {
		throw new Error(`Missing coverage report: ${lcovPath}`);
	}
	const records = new Map();
	let currentFile = null;
	for (const line of readFileSync(lcovPath, "utf8").split(/\r?\n/)) {
		if (line.startsWith("SF:")) {
			const raw = line.slice(3);
			const normalized = raw.replaceAll("\\", "/");
			const marker = "/apps/web/";
			const index = normalized.lastIndexOf(marker);
			currentFile = index >= 0 ? normalized.slice(index + marker.length) : normalized;
			records.set(currentFile, new Map());
			continue;
		}
		if (currentFile && line.startsWith("DA:")) {
			const [lineNumber, hits] = line.slice(3).split(",");
			records.get(currentFile).set(Number(lineNumber), Number(hits));
		}
	}
	return records;
}

const changedFiles = changedLineMap();
const coverage = parseLcov();
const failures = [];
let checkedLines = 0;

for (const [file, lines] of changedFiles) {
	if (lines.size === 0) continue;
	const coveredLines = coverage.get(file.replaceAll(sep, "/"));
	if (!coveredLines) {
		failures.push(`${file}: missing from lcov report`);
		continue;
	}
	for (const line of lines) {
		if (!coveredLines.has(line)) continue;
		checkedLines += 1;
		if ((coveredLines.get(line) ?? 0) <= 0) {
			failures.push(`${file}:${line} was not covered`);
		}
	}
}

if (failures.length > 0) {
	console.error("Changed-line coverage failed:");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Changed-line coverage passed for ${checkedLines} instrumented web source lines.`);
