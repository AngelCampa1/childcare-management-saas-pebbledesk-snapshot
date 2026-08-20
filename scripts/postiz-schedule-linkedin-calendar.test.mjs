import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const scriptPath = "scripts/postiz-schedule-linkedin-calendar.mjs";

test("PebbleDesk Postiz scheduler is retired and cannot schedule old calendar posts", () => {
	const source = readFileSync(scriptPath, "utf8");
	const agents = readFileSync("AGENTS.md", "utf8");
	const claude = readFileSync("CLAUDE.md", "utf8");

	assert.match(source, /PebbleDesk has been decommissioned/);
	assert.doesNotMatch(source, /cmorpckmz03sbqi0yay2i3ds6/);
	assert.doesNotMatch(source, /postiz posts:create/);

	const result = spawnSync(process.execPath, [scriptPath], {
		encoding: "utf8",
	});

	assert.notEqual(result.status, 0);
	assert.match(result.stderr, /PebbleDesk has been decommissioned/);
	assert.equal(result.stdout, "");

	for (const instructions of [agents, claude]) {
		assert.match(instructions, /LinkedIn\/Postiz Shutdown Gate/);
		assert.doesNotMatch(instructions, /Before creating, uploading, or scheduling LinkedIn posts/);
	}
});
