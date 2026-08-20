export interface RateLimitConfig {
	/** Maximum burst — bucket capacity in tokens. */
	limit: number;
	/** Time, in ms, over which a full `limit` worth of tokens refills. */
	windowMs: number;
}

const INSERT_SQL =
	"INSERT OR IGNORE INTO marketing_rate_limits (key, tokens, updated_at) VALUES (?, ?, ?)";
const CONSUME_SQL =
	"UPDATE marketing_rate_limits " +
	"SET tokens = MIN(?, tokens + ((MAX(0, ? - updated_at) * 1.0 / ?) * ?)) - 1, updated_at = ? " +
	"WHERE key = ? AND MIN(?, tokens + ((MAX(0, ? - updated_at) * 1.0 / ?) * ?)) >= 1";
const REFILL_SQL =
	"UPDATE marketing_rate_limits " +
	"SET tokens = MIN(?, tokens + ((MAX(0, ? - updated_at) * 1.0 / ?) * ?)), updated_at = ? " +
	"WHERE key = ?";

/**
 * Token-bucket rate limiter backed by D1. Returns `true` when a token was
 * available and consumed (request allowed) and `false` when the bucket is
 * exhausted (request should be rejected with 429).
 *
 * The bucket refills continuously at `limit / windowMs` tokens per ms, capped at
 * `limit`. Both the allowed and the rejected path persist the refilled state so
 * the window advances correctly across requests and an attacker cannot reset the
 * clock by hammering the endpoint.
 */
export async function consumeRateLimit(
	db: D1Database,
	key: string,
	config: RateLimitConfig,
	now: number = Date.now(),
): Promise<boolean> {
	const inserted = await db
		.prepare(INSERT_SQL)
		.bind(key, config.limit - 1, now)
		.run<D1Result>();
	if (inserted.meta.changes > 0) return true;

	const consumed = await db
		.prepare(CONSUME_SQL)
		.bind(
			config.limit,
			now,
			config.windowMs,
			config.limit,
			now,
			key,
			config.limit,
			now,
			config.windowMs,
			config.limit,
		)
		.run<D1Result>();
	if (consumed.meta.changes > 0) return true;

	await db
		.prepare(REFILL_SQL)
		.bind(config.limit, now, config.windowMs, config.limit, now, key)
		.run<D1Result>();
	return false;
}
