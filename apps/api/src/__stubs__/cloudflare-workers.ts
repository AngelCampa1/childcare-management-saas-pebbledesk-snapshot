// Stub for "cloudflare:workers" used in Vitest (Node) environments.
// The real module is only available inside the Cloudflare Workers runtime.
// DO subclasses use this base class only for its ctx/env type declarations;
// all actual DO behaviour in tests is exercised via the in-memory mock namespace.

export class DurableObject {
	// biome-ignore lint/suspicious/noExplicitAny: stub only — real types come from CF runtime
	ctx: any;
	// biome-ignore lint/suspicious/noExplicitAny: stub only — real types come from CF runtime
	env: any;

	// biome-ignore lint/suspicious/noExplicitAny: stub only — real types come from CF runtime
	constructor(ctx: any, env: any) {
		this.ctx = ctx;
		this.env = env;
	}
}
