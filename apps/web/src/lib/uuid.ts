export function generateId(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	// Fallback for non-HTTPS contexts or older tablet browsers
	const bytes = new Uint8Array(16);
	(crypto as Crypto).getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	return [...bytes]
		.map((b, i) => ([4, 6, 8, 10].includes(i) ? `-` : "") + b.toString(16).padStart(2, "0"))
		.join("");
}
