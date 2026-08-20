import { buildPublicPricingMarkdown } from "@pebbledesk/shared/public-knowledge/marketing-surfaces";
import type { APIContext } from "astro";

export const prerender = true;

export function GET(_context: APIContext) {
	return new Response(buildPublicPricingMarkdown(), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
