import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");

const messagingScopeFiles = [
	"apps/site/src/content/features/messaging-alerts.md",
	"docs/production-readiness.md",
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/days/day-16.json",
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.md",
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.csv",
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.postiz.jsonl",
];

const staleMessagingClaims = [
	"send-only",
	"send-first",
	"No full inbound parent reply inbox yet",
	"does not claim to be a full two-way parent inbox today",
	"does not yet offer a two-way reply inbox",
	"Not supported today",
	"not a full two-way parent inbox",
	"not yet wired",
	"Inbound parent reply inbox.",
];

const scheduledLinkedInFiles = [
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.md",
	"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.csv",
];

type LinkedInDayFile = {
	posts: Array<{ index_in_day: number; post_content: string; notes: string }>;
};

type PostizRecord = {
	index: number;
	post_content: string;
	notes: string;
	postiz: { value: Array<{ content: string }> };
};

function readRepoFile(path: string) {
	return readFileSync(resolve(repoRoot, path), "utf8");
}

function expectUpdatedMessagingScope(content: string, label: string) {
	expect(content, label).toContain("Inbound guardian replies");
	expect(content, label).toContain("operational reply inbox");
	expect(content, label).toContain("parent-social feed");
}

function expectUpdatedReminderScope(content: string, label: string) {
	expect(content, label).toContain("inbound guardian replies today");
	expect(content, label).toContain("outbound and reply workflows");
}

describe("messaging feature copy", () => {
	it("does not describe inbound guardian replies as unsupported", () => {
		const violations = messagingScopeFiles.flatMap((path) => {
			const source = readRepoFile(path);
			return staleMessagingClaims
				.filter((claim) => source.includes(claim))
				.map((claim) => ({ path, claim }));
		});

		expect(violations).toEqual([]);
	});

	it("describes the implemented operational reply inbox without broad parent-social claims", () => {
		const source = readRepoFile("apps/site/src/content/features/messaging-alerts.md");

		expect(source).toContain("inbound guardian replies");
		expect(source).toContain("operational reply inbox");
		expect(source).toContain("not a parent-social feed");
	});

	it("keeps future scheduled LinkedIn artifacts aligned to the implemented reply inbox", () => {
		for (const path of scheduledLinkedInFiles) {
			const source = readRepoFile(path);

			expect(source, path).toContain("Inbound guardian replies");
			expect(source, path).toContain("operational reply inbox");
			expect(source, path).toContain("parent-social feed");
			expect(source, path).toContain("inbound guardian replies today");
			expect(source, path).toContain("outbound and reply workflows");
		}
	});

	it("keeps the edited scheduled LinkedIn records internally aligned", () => {
		const day = JSON.parse(
			readRepoFile("docs/marketing/linkedin-2026-05-27-to-2026-06-14/days/day-16.json"),
		) as LinkedInDayFile;
		const messagingScopePost = day.posts.find((post) => post.index_in_day === 2);
		const policyReminderPost = day.posts.find((post) => post.index_in_day === 9);

		expect(messagingScopePost).toBeDefined();
		expect(policyReminderPost).toBeDefined();
		expectUpdatedMessagingScope(messagingScopePost?.post_content ?? "", "day-16 post 2");
		expect(messagingScopePost?.notes).toContain("operational guardian replies");
		expectUpdatedReminderScope(policyReminderPost?.post_content ?? "", "day-16 post 9");
		expect(policyReminderPost?.notes).toContain("operational reply workflows");

		const postizRecords = readRepoFile(
			"docs/marketing/linkedin-2026-05-27-to-2026-06-14/linkedin-2026-05-27-to-2026-06-14.postiz.jsonl",
		)
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as PostizRecord);
		const messagingScopeRecord = postizRecords.find((record) => record.index === 227);
		const policyReminderRecord = postizRecords.find((record) => record.index === 234);

		expect(messagingScopeRecord).toBeDefined();
		expect(policyReminderRecord).toBeDefined();
		expectUpdatedMessagingScope(messagingScopeRecord?.post_content ?? "", "postiz record 227");
		expect(messagingScopeRecord?.postiz.value[0]?.content).toBe(messagingScopeRecord?.post_content);
		expectUpdatedReminderScope(policyReminderRecord?.post_content ?? "", "postiz record 234");
		expect(policyReminderRecord?.postiz.value[0]?.content).toBe(policyReminderRecord?.post_content);
	});

	it("does not keep completed messaging work in the production gap list", () => {
		const source = readRepoFile("docs/production-readiness.md");

		expect(source).not.toContain("Inbound guardian reply inbox");
		expect(source).not.toContain("Inbound parent reply inbox");
	});
});
