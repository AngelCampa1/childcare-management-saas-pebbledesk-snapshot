import { zValidator } from "@hono/zod-validator";
import { centers, memberships } from "@pebbledesk/db";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { z } from "zod";
import type { AppEnv } from "../lib/context.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { idSchema } from "../lib/id-schema.js";
import { CENTER_COOKIE } from "../lib/membership-context.js";
import { requireAuth } from "../middleware/auth.js";

const membershipsRoutes = new Hono<AppEnv>();

const switchSchema = z.object({
	centerId: idSchema,
});

// GET /mine — all accepted memberships for the current user with center names
membershipsRoutes.get("/mine", requireAuth, async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const db = c.get("db");

	const rows = await db
		.select({
			id: memberships.id,
			centerId: memberships.centerId,
			centerName: centers.name,
			role: memberships.role,
			acceptedAt: memberships.acceptedAt,
		})
		.from(memberships)
		.innerJoin(centers, eq(memberships.centerId, centers.id))
		.where(
			and(
				eq(memberships.userId, userId),
				isNotNull(memberships.acceptedAt),
				isNull(memberships.deactivatedAt),
			),
		)
		.orderBy(desc(memberships.acceptedAt));

	return c.json({
		memberships: rows.map((row) => ({
			id: row.id,
			centerId: row.centerId,
			centerName: row.centerName,
			role: row.role,
			acceptedAt: row.acceptedAt?.toISOString() ?? "",
		})),
	});
});

// POST /switch — switch active center via cookie
membershipsRoutes.post("/switch", requireAuth, zValidator("json", switchSchema), async (c) => {
	const userId = c.get("userId");
	if (!userId) unauthorized();

	const { centerId } = c.req.valid("json");
	const db = c.get("db");

	const [membership] = await db
		.select()
		.from(memberships)
		.where(
			and(
				eq(memberships.userId, userId),
				eq(memberships.centerId, centerId),
				isNull(memberships.deactivatedAt),
			),
		)
		.limit(1);

	if (!membership?.acceptedAt) {
		forbidden("Not a member of this center");
	}

	const isProduction = c.env.APP_URL.startsWith("https://");

	setCookie(c, CENTER_COOKIE, centerId, {
		httpOnly: true,
		sameSite: "Lax",
		path: "/",
		maxAge: 60 * 60 * 24 * 30, // 30 days
		secure: isProduction,
	});

	return c.json({ success: true });
});

export { membershipsRoutes };
