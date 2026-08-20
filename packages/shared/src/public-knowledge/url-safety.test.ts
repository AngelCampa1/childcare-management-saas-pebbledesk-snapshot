import { describe, expect, it } from "vitest";
import {
	getSensitivePublicKnowledgeQueryKey,
	isFilesystemLikePublicKnowledgePath,
	isPublicKnowledgeHost,
	isSafePublicKnowledgeRelativeUrl,
} from "./url-safety.js";

describe("public knowledge URL safety", () => {
	it("rejects query strings and fragments when configured for path-only values", () => {
		expect(
			isSafePublicKnowledgeRelativeUrl("/compare/pricing/brightwheel?ref=ai", {
				allowQueryAndFragment: false,
			}),
		).toBe(false);
		expect(
			isSafePublicKnowledgeRelativeUrl("/compare/pricing/brightwheel#faq", {
				allowQueryAndFragment: false,
			}),
		).toBe(false);
		expect(
			isSafePublicKnowledgeRelativeUrl("/compare/pricing/brightwheel", {
				allowQueryAndFragment: false,
			}),
		).toBe(true);
	});

	it("detects filesystem-like public knowledge paths", () => {
		expect(isFilesystemLikePublicKnowledgePath("/")).toBe(false);
		expect(isFilesystemLikePublicKnowledgePath("/c:/Users/dev/file.txt")).toBe(true);
		expect(isFilesystemLikePublicKnowledgePath("/project/users/file.txt")).toBe(true);
	});

	it("rejects private mapped IPv4 and link-local IPv6 hosts", () => {
		expect(isPublicKnowledgeHost("::ffff:0a00:0001")).toBe(false);
		expect(isPublicKnowledgeHost("::ffff:c0a8:0001")).toBe(false);
		expect(isPublicKnowledgeHost("::ffff:ac10:0001")).toBe(false);
		expect(isPublicKnowledgeHost("fe80::1")).toBe(false);
		expect(isPublicKnowledgeHost("2606:4700:4700::1111")).toBe(true);
	});

	it("identifies sensitive query keys case-insensitively", () => {
		expect(getSensitivePublicKnowledgeQueryKey("https://example.com/?apiKey=abc")).toBe("apiKey");
		expect(getSensitivePublicKnowledgeQueryKey("https://example.com/?page=pricing")).toBeNull();
	});
});
