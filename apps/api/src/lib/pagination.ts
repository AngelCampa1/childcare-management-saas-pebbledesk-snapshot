import { z } from "zod";

export const PAGE_DEFAULT = 50;
export const PAGE_MAX = 200;

export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(PAGE_MAX).optional(),
	cursor: z.coerce.number().int().min(0).optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export function resolvePagination(query: PaginationQuery): { limit: number; offset: number } {
	return {
		limit: Math.min(query.limit ?? PAGE_DEFAULT, PAGE_MAX),
		// cursor maps to SQL OFFSET — simple but can skip rows under concurrent inserts (V1 tradeoff)
		offset: query.cursor ?? 0,
	};
}
