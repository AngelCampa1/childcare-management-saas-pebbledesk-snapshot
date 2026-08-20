import { PUBLIC_BRAND_KNOWLEDGE } from "./brand.js";

const FILESYSTEM_ROOT_SEGMENTS = ["users", "home", "var", "etc", "private", "tmp", "opt", "root"];
const SENSITIVE_QUERY_KEY_PARTS = [
	"token",
	"key",
	"secret",
	"signature",
	"sig",
	"auth",
	"password",
];

export function isSafePublicKnowledgeRelativeUrl(
	value: string,
	options: { allowQueryAndFragment?: boolean } = { allowQueryAndFragment: true },
): boolean {
	if (!value.startsWith("/") || value.startsWith("//")) return false;
	if (value.includes("://") || value.includes("\\")) return false;
	if (!options.allowQueryAndFragment && (value.includes("?") || value.includes("#"))) return false;

	const pathOnly = value.split(/[?#]/, 1)[0];
	if (!pathOnly || pathOnly.split("/").includes("..")) return false;
	if (isFilesystemLikePublicKnowledgePath(pathOnly)) return false;
	return true;
}

export function isFilesystemLikePublicKnowledgePath(path: string): boolean {
	const [firstSegment = "", secondSegment = ""] = path.split("/").filter(Boolean);
	if (!firstSegment) return false;
	const normalizedFirst = firstSegment.toLowerCase();
	const normalizedSecond = secondSegment.toLowerCase();
	if (FILESYSTEM_ROOT_SEGMENTS.includes(normalizedFirst)) return true;
	return normalizedFirst === "c:" || normalizedFirst === "c|" || normalizedSecond === "users";
}

export function isPublicKnowledgeHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
	if (
		normalized === "localhost" ||
		normalized === "0.0.0.0" ||
		normalized === "::" ||
		normalized === "::1" ||
		normalized.endsWith(".local")
	) {
		return false;
	}
	if (
		normalized.includes("internal") ||
		normalized.includes("staging") ||
		normalized.includes("localhost")
	) {
		return false;
	}
	if (isPrivatePublicKnowledgeIpv4Host(normalized)) return false;
	const isIpv6Literal = normalized.includes(":");
	if (normalized.startsWith("::ffff:")) {
		const mapped = normalized.slice("::ffff:".length);
		if (isPrivatePublicKnowledgeIpv4Host(mapped) || isPrivatePublicKnowledgeIpv4HexHost(mapped)) {
			return false;
		}
	}
	if (!isIpv6Literal) return true;
	return !(
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		isPublicKnowledgeIpv6LinkLocalHost(normalized)
	);
}

export function getSensitivePublicKnowledgeQueryKey(value: string): string | null {
	const parsed = new URL(value, PUBLIC_BRAND_KNOWLEDGE.publicOrigin);
	for (const key of parsed.searchParams.keys()) {
		const normalized = key.toLowerCase();
		if (SENSITIVE_QUERY_KEY_PARTS.some((part) => normalized.includes(part))) return key;
	}
	return null;
}

function isPrivatePublicKnowledgeIpv4Host(hostname: string): boolean {
	const octets = hostname.split(".").map((part) => Number(part));
	if (
		octets.length !== 4 ||
		octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
	) {
		return false;
	}
	const [first, second] = octets;
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168)
	);
}

function isPrivatePublicKnowledgeIpv4HexHost(hostname: string): boolean {
	return (
		hostname === "0:0" ||
		hostname === "0000:0000" ||
		hostname.startsWith("7f") ||
		hostname.startsWith("00") ||
		hostname.startsWith("0a") ||
		hostname.startsWith("a9fe") ||
		hostname.startsWith("c0a8") ||
		/^ac(1[0-9a-f]|2[0-9a-f]|3[0-1])/.test(hostname)
	);
}

function isPublicKnowledgeIpv6LinkLocalHost(hostname: string): boolean {
	const firstSegment = hostname.split(":")[0];
	if (!firstSegment) return false;
	const value = Number.parseInt(firstSegment, 16);
	return Number.isInteger(value) && value >= 0xfe80 && value <= 0xfebf;
}
