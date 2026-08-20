import { z } from "zod";

export const idSchema = z
	.string()
	.regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Invalid ID format");
export const idParamsSchema = z.object({ id: idSchema });
