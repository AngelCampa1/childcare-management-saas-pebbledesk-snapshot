import type { Context, Next } from "hono";
import type { AppEnv } from "../lib/context.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requestId(c: Context<AppEnv>, next: Next) {
	const incoming = c.req.header("x-request-id");
	const id = incoming && UUID_RE.test(incoming) ? incoming : crypto.randomUUID();
	c.set("requestId", id);
	c.header("x-request-id", id);
	await next();
}
