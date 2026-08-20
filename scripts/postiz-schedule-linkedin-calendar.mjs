#!/usr/bin/env node

process.stderr.write(
	[
		"PebbleDesk has been decommissioned.",
		"Refusing to create, upload, or schedule PebbleDesk LinkedIn posts through Postiz.",
		"See docs/decommissioning/2026-06-11-pebbledesk-shutdown.md for the shutdown record.",
		"",
	].join("\n"),
);

process.exit(1);
