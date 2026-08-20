import { existsSync } from "node:fs";
import { join } from "node:path";
import { leadMagnetCatalog } from "@pebbledesk/shared/public-knowledge/lead-magnets";
import { describe, expect, it } from "vitest";

describe("lead magnet public assets", () => {
	it("keeps every canonical lead magnet download and cover committed for static serving", () => {
		const assetRoot = join(process.cwd(), "public", "lead-magnets");

		for (const magnet of leadMagnetCatalog) {
			expect(existsSync(join(assetRoot, `${magnet.slug}.pdf`))).toBe(true);
			expect(existsSync(join(assetRoot, `${magnet.slug}-cover.png`))).toBe(true);
		}
	});
});
