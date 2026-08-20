import {
	assertPublicKnowledgeArtifactSafe,
	getLeadMagnetsPublicKnowledgeArtifact,
} from "@pebbledesk/shared/public-knowledge";

export const prerender = true;

export async function GET() {
	const artifact = getLeadMagnetsPublicKnowledgeArtifact();
	assertPublicKnowledgeArtifactSafe("lead-magnets.json", artifact);

	return new Response(JSON.stringify(artifact), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}
