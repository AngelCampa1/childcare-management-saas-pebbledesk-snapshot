import { resolveOfferingTokens } from "./offering-tokens.js";

// Remark plugin; resolves {{offering-token}} placeholders in markdown text nodes.
// Runs at Astro build time; types come from the host Astro project's node_modules.
export function remarkOfferingTokens() {
	return function transform(tree: {
		type: string;
		children?: unknown[];
		[key: string]: unknown;
	}): void {
		visitText(tree);
	};
}

function visitText(node: {
	type: string;
	value?: string;
	children?: unknown[];
	[key: string]: unknown;
}): void {
	if (node.type === "text" && typeof node.value === "string" && node.value.includes("{{")) {
		node.value = resolveOfferingTokens(node.value);
	}
	if (Array.isArray(node.children)) {
		for (const child of node.children) {
			visitText(
				child as { type: string; value?: string; children?: unknown[]; [key: string]: unknown },
			);
		}
	}
}
