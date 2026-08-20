import {
	assertPublicKnowledgeArtifactSafe,
	getContentIndexPublicKnowledgeArtifact,
} from "@pebbledesk/shared/public-knowledge";

export const prerender = true;

export async function GET() {
	const artifact = getContentIndexPublicKnowledgeArtifact();
	assertPublicKnowledgeArtifactSafe("content-index.json", artifact);

	return new Response(JSON.stringify(artifact), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}
