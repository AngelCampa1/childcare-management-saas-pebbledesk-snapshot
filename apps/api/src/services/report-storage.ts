import type { AppEnv } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";

export function sanitizeFilename(name: string): string {
	const sanitized = name
		.replace(/["\\\n\r\0/;,]/g, "-") // replace header-breaking chars
		.replace(/[^\x20-\x7E]/g, "-") // strip non-ASCII
		.replace(/-{2,}/g, "-") // collapse multiple dashes
		.replace(/^-+|-+$/g, "") // trim leading/trailing dashes
		.trim()
		.slice(0, 100);
	return sanitized || "report";
}

interface StoredArtifact {
	body: string | Uint8Array | ReadableStream<Uint8Array>;
	contentType: string;
	fileName: string;
}

interface StoredArtifactRef {
	fileUrl: string;
	fileSizeBytes: number;
	storageKey: string;
}

function getReportsBucket(env: AppEnv["Bindings"]) {
	const bucket = env.REPORTS_BUCKET;
	if (!bucket) {
		badRequest("Reports storage is not configured");
	}
	return bucket;
}

export async function storeReportArtifact(
	context: { centerId: string; reportType: string },
	artifact: StoredArtifact,
	env: AppEnv["Bindings"],
): Promise<StoredArtifactRef> {
	const bucket = getReportsBucket(env);
	const storageKey = `${context.centerId}/${context.reportType}/${Date.now()}-${artifact.fileName}`;
	const httpMetadata = {
		contentType: artifact.contentType,
		contentDisposition: `attachment; filename="${sanitizeFilename(artifact.fileName)}"`,
	};

	let fileSizeBytes: number;

	if (artifact.body instanceof ReadableStream) {
		const r2Object = await bucket.put(storageKey, artifact.body, { httpMetadata });
		fileSizeBytes = r2Object?.size ?? 0;
	} else {
		const body = artifact.body;
		await bucket.put(storageKey, body, { httpMetadata });
		fileSizeBytes =
			typeof body === "string" ? new TextEncoder().encode(body).byteLength : body.byteLength;
	}

	return {
		storageKey,
		fileUrl: `r2://${storageKey}`,
		fileSizeBytes,
	};
}

export async function readReportArtifact(fileUrl: string, env: AppEnv["Bindings"]) {
	const bucket = getReportsBucket(env);
	const storageKey = fileUrl.replace(/^r2:\/\//, "");
	const object = await bucket.get(storageKey);
	if (!object) {
		notFound("Stored report artifact not found");
	}

	return {
		body: new Uint8Array(await object.arrayBuffer()),
		contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
		fileName:
			object.httpMetadata?.contentDisposition?.match(/filename="(.+?)"/)?.[1] ?? "report-export",
	};
}
