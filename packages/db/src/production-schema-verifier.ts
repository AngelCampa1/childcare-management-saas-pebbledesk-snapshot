import type { Sql } from "postgres";

export type RequiredRelation = {
	name: string;
	schema: string;
};

export type RequiredType = {
	name: string;
	schema: string;
};

export type RequiredTypeLabels = RequiredType & {
	labels: readonly string[];
};

export type RequiredColumn = RequiredRelation & {
	column: string;
	dataType: string;
};

export type ExistingRelation = RequiredRelation;
export type ExistingType = RequiredType;
export type ExistingTypeLabels = RequiredTypeLabels;
export type ExistingColumn = RequiredColumn;

export type RelationLookup = (
	relations: readonly RequiredRelation[],
) => Promise<readonly ExistingRelation[]>;

export type TypeLookup = (types: readonly RequiredType[]) => Promise<readonly ExistingType[]>;
export type TypeLabelLookup = (
	types: readonly RequiredTypeLabels[],
) => Promise<readonly ExistingTypeLabels[]>;
export type ColumnLookup = (
	columns: readonly RequiredColumn[],
) => Promise<readonly ExistingColumn[]>;

export type ProductionSchemaVerification = {
	checkedRelations: number;
	checkedTypes: number;
	checkedTypeLabels: number;
	checkedColumns: number;
	missing: RequiredRelation[];
	missingTypes: RequiredType[];
	missingTypeLabels: RequiredTypeLabels[];
	missingColumns: RequiredColumn[];
};

type VerifyProductionSchemaOptions = {
	requiredRelations?: readonly RequiredRelation[];
	requiredTypes?: readonly RequiredType[];
	requiredTypeLabels?: readonly RequiredTypeLabels[];
	requiredColumns?: readonly RequiredColumn[];
};

export const REQUIRED_PRODUCTION_RELATIONS: readonly RequiredRelation[] = [
	{ schema: "drizzle", name: "__drizzle_migrations" },
	{ schema: "public", name: "accounts" },
	{ schema: "public", name: "audit_log" },
	{ schema: "public", name: "audit_reports" },
	{ schema: "public", name: "check_ins" },
	{ schema: "public", name: "centers" },
	{ schema: "public", name: "children" },
	{ schema: "public", name: "child_guardians" },
	{ schema: "public", name: "classroom_assignments" },
	{ schema: "public", name: "classrooms" },
	{ schema: "public", name: "feedback" },
	{ schema: "public", name: "guardians" },
	{ schema: "public", name: "guidance_progress" },
	{ schema: "public", name: "invoice_line_items" },
	{ schema: "public", name: "invoice_template_line_items" },
	{ schema: "public", name: "invoice_templates" },
	{ schema: "public", name: "invoices" },
	{ schema: "public", name: "lead_magnet_downloads" },
	{ schema: "public", name: "leads" },
	{ schema: "public", name: "memberships" },
	{ schema: "public", name: "message_recipients" },
	{ schema: "public", name: "messages" },
	{ schema: "public", name: "payments" },
	{ schema: "public", name: "quickbooks_connections" },
	{ schema: "public", name: "quickbooks_entity_links" },
	{ schema: "public", name: "quickbooks_reconciliation_items" },
	{ schema: "public", name: "quickbooks_sync_log" },
	{ schema: "public", name: "ratio_snapshots" },
	{ schema: "public", name: "ratio_violations" },
	{ schema: "public", name: "schedules" },
	{ schema: "public", name: "sessions" },
	{ schema: "public", name: "shifts" },
	{ schema: "public", name: "staff_assignments" },
	{ schema: "public", name: "staff_check_ins" },
	{ schema: "public", name: "subscription_notifications" },
	{ schema: "public", name: "subsidy_cases" },
	{ schema: "public", name: "subsidy_claims" },
	{ schema: "public", name: "time_entries" },
	{ schema: "public", name: "trial_feature_usage" },
	{ schema: "public", name: "users" },
	{ schema: "public", name: "verifications" },
	{ schema: "public", name: "webhook_events" },
];

export const REQUIRED_PRODUCTION_TYPES: readonly RequiredType[] = [
	{ schema: "public", name: "subscription_notification_kind" },
	{ schema: "public", name: "subscription_notification_status" },
	{ schema: "public", name: "subscription_plan" },
];

export const REQUIRED_PRODUCTION_TYPE_LABELS: readonly RequiredTypeLabels[] = [
	{
		schema: "public",
		name: "subscription_plan",
		labels: ["trial", "home", "center_starter", "center_pro", "group", "enterprise"],
	},
];

export const REQUIRED_PRODUCTION_COLUMNS: readonly RequiredColumn[] = [
	{
		schema: "public",
		name: "centers",
		column: "licensed_capacity",
		dataType: "integer",
	},
	{
		schema: "public",
		name: "child_guardians",
		column: "center_id",
		dataType: "uuid",
	},
	{
		schema: "public",
		name: "memberships",
		column: "invite_email",
		dataType: "character varying",
	},
	{
		schema: "public",
		name: "memberships",
		column: "invite_token_hash",
		dataType: "character varying",
	},
	{
		schema: "public",
		name: "memberships",
		column: "invite_expires_at",
		dataType: "timestamp with time zone",
	},
	{
		schema: "public",
		name: "memberships",
		column: "deactivated_at",
		dataType: "timestamp with time zone",
	},
];

export async function verifyProductionSchema(
	lookup: RelationLookup,
	typeLookup: TypeLookup,
	typeLabelLookup: TypeLabelLookup,
	columnLookup: ColumnLookup,
	options: VerifyProductionSchemaOptions = {},
): Promise<ProductionSchemaVerification> {
	const requiredRelations = options.requiredRelations ?? REQUIRED_PRODUCTION_RELATIONS;
	const requiredTypes = options.requiredTypes ?? REQUIRED_PRODUCTION_TYPES;
	const requiredTypeLabels = options.requiredTypeLabels ?? REQUIRED_PRODUCTION_TYPE_LABELS;
	const requiredColumns = options.requiredColumns ?? REQUIRED_PRODUCTION_COLUMNS;
	const existingRelations = await lookup(requiredRelations);
	const existingKeys = new Set(existingRelations.map(relationKey));
	const missing = requiredRelations.filter((relation) => !existingKeys.has(relationKey(relation)));
	const existingTypes = await typeLookup(requiredTypes);
	const existingTypeKeys = new Set(existingTypes.map(typeKey));
	const missingTypes = requiredTypes.filter((type) => !existingTypeKeys.has(typeKey(type)));
	const existingTypeLabels = await typeLabelLookup(requiredTypeLabels);
	const existingTypeLabelMap = new Map(
		existingTypeLabels.map((type) => [typeKey(type), new Set(type.labels)]),
	);
	const missingTypeLabels = requiredTypeLabels
		.map((type) => ({
			...type,
			labels: type.labels.filter((label) => !existingTypeLabelMap.get(typeKey(type))?.has(label)),
		}))
		.filter((type) => type.labels.length > 0);
	const existingColumns = await columnLookup(requiredColumns);
	const existingColumnKeys = new Set(existingColumns.map(columnKey));
	const missingColumns = requiredColumns.filter(
		(column) => !existingColumnKeys.has(columnKey(column)),
	);

	if (
		missing.length > 0 ||
		missingTypes.length > 0 ||
		missingTypeLabels.length > 0 ||
		missingColumns.length > 0
	) {
		const parts: string[] = [];
		if (missing.length > 0) {
			parts.push(`missing required relations: ${formatRelations(missing)}`);
		}
		if (missingTypes.length > 0) {
			parts.push(`missing required types: ${formatTypes(missingTypes)}`);
		}
		if (missingTypeLabels.length > 0) {
			parts.push(`missing required enum labels: ${formatTypeLabels(missingTypeLabels)}`);
		}
		if (missingColumns.length > 0) {
			parts.push(`missing required columns: ${formatColumns(missingColumns)}`);
		}
		throw new Error(`Production database schema is ${parts.join("; ")}`);
	}

	return {
		checkedRelations: requiredRelations.length,
		checkedTypes: requiredTypes.length,
		checkedTypeLabels: requiredTypeLabels.length,
		checkedColumns: requiredColumns.length,
		missing,
		missingTypes,
		missingTypeLabels,
		missingColumns,
	};
}

export async function lookupProductionRelations(
	sql: Sql,
	relations: readonly RequiredRelation[],
): Promise<ExistingRelation[]> {
	if (relations.length === 0) {
		return [];
	}

	const schemas = [...new Set(relations.map((relation) => relation.schema))];
	const names = [...new Set(relations.map((relation) => relation.name))];
	const rows = await sql<ExistingRelation[]>`
		SELECT
			n.nspname AS "schema",
			c.relname AS "name"
		FROM pg_class c
		INNER JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE
			n.nspname = ANY(${schemas})
			AND c.relname = ANY(${names})
			AND c.relkind IN ('r', 'p', 'v', 'm')
	`;

	return rows.filter((row) =>
		relations.some((relation) => relation.schema === row.schema && relation.name === row.name),
	);
}

export async function lookupProductionTypes(
	sql: Sql,
	types: readonly RequiredType[],
): Promise<ExistingType[]> {
	if (types.length === 0) {
		return [];
	}

	const schemas = [...new Set(types.map((type) => type.schema))];
	const names = [...new Set(types.map((type) => type.name))];
	const rows = await sql<ExistingType[]>`
		SELECT
			n.nspname AS "schema",
			t.typname AS "name"
		FROM pg_type t
		INNER JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE
			n.nspname = ANY(${schemas})
			AND t.typname = ANY(${names})
			AND t.typtype IN ('e', 'd')
	`;

	return rows.filter((row) =>
		types.some((type) => type.schema === row.schema && type.name === row.name),
	);
}

export async function lookupProductionTypeLabels(
	sql: Sql,
	types: readonly RequiredTypeLabels[],
): Promise<ExistingTypeLabels[]> {
	if (types.length === 0) {
		return [];
	}

	const schemas = [...new Set(types.map((type) => type.schema))];
	const names = [...new Set(types.map((type) => type.name))];
	const labels = [...new Set(types.flatMap((type) => type.labels))];
	const rows = await sql<Array<RequiredType & { label: string }>>`
		SELECT
			n.nspname AS "schema",
			t.typname AS "name",
			e.enumlabel AS "label"
		FROM pg_type t
		INNER JOIN pg_namespace n ON n.oid = t.typnamespace
		INNER JOIN pg_enum e ON e.enumtypid = t.oid
		WHERE
			n.nspname = ANY(${schemas})
			AND t.typname = ANY(${names})
			AND e.enumlabel = ANY(${labels})
		ORDER BY e.enumsortorder
	`;

	return types.map((type) => {
		const requiredLabels = new Set(type.labels);
		return {
			schema: type.schema,
			name: type.name,
			labels: rows
				.filter(
					(row) =>
						row.schema === type.schema && row.name === type.name && requiredLabels.has(row.label),
				)
				.map((row) => row.label),
		};
	});
}

export async function lookupProductionColumns(
	sql: Sql,
	columns: readonly RequiredColumn[],
): Promise<ExistingColumn[]> {
	if (columns.length === 0) {
		return [];
	}

	const schemas = [...new Set(columns.map((column) => column.schema))];
	const names = [...new Set(columns.map((column) => column.name))];
	const columnNames = [...new Set(columns.map((column) => column.column))];
	const rows = await sql<ExistingColumn[]>`
		SELECT
			table_schema AS "schema",
			table_name AS "name",
			column_name AS "column",
			data_type AS "dataType"
		FROM information_schema.columns
		WHERE
			table_schema = ANY(${schemas})
			AND table_name = ANY(${names})
			AND column_name = ANY(${columnNames})
	`;

	return rows.filter((row) =>
		columns.some(
			(column) =>
				column.schema === row.schema &&
				column.name === row.name &&
				column.column === row.column &&
				column.dataType === row.dataType,
		),
	);
}

function relationKey(relation: RequiredRelation): string {
	return `${relation.schema}.${relation.name}`;
}

function formatRelations(relations: readonly RequiredRelation[]): string {
	return relations.map(relationKey).join(", ");
}

function typeKey(type: RequiredType): string {
	return `${type.schema}.${type.name}`;
}

function formatTypes(types: readonly RequiredType[]): string {
	return types.map(typeKey).join(", ");
}

function formatTypeLabels(types: readonly RequiredTypeLabels[]): string {
	return types.map((type) => `${typeKey(type)}(${type.labels.join(", ")})`).join(", ");
}

function columnKey(column: RequiredColumn): string {
	return `${relationKey(column)}.${column.column}:${column.dataType}`;
}

function formatColumns(columns: readonly RequiredColumn[]): string {
	return columns
		.map((column) => `${relationKey(column)}.${column.column} ${column.dataType}`)
		.join(", ");
}
