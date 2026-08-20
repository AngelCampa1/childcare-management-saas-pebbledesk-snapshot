import { describe, expect, it, vi } from "vitest";
import {
	type ColumnLookup,
	lookupProductionColumns,
	lookupProductionRelations,
	lookupProductionTypes,
	REQUIRED_PRODUCTION_COLUMNS,
	REQUIRED_PRODUCTION_RELATIONS,
	REQUIRED_PRODUCTION_TYPE_LABELS,
	REQUIRED_PRODUCTION_TYPES,
	type RelationLookup,
	type TypeLabelLookup,
	type TypeLookup,
	verifyProductionSchema,
} from "../src/production-schema-verifier.js";

describe("production schema verifier", () => {
	it("covers every current application table plus Drizzle migration metadata", () => {
		const requiredRelationKeys = REQUIRED_PRODUCTION_RELATIONS.map(
			(relation) => `${relation.schema}.${relation.name}`,
		);

		expect(requiredRelationKeys).toEqual([
			"drizzle.__drizzle_migrations",
			"public.accounts",
			"public.audit_log",
			"public.audit_reports",
			"public.check_ins",
			"public.centers",
			"public.children",
			"public.child_guardians",
			"public.classroom_assignments",
			"public.classrooms",
			"public.feedback",
			"public.guardians",
			"public.guidance_progress",
			"public.invoice_line_items",
			"public.invoice_template_line_items",
			"public.invoice_templates",
			"public.invoices",
			"public.lead_magnet_downloads",
			"public.leads",
			"public.memberships",
			"public.message_recipients",
			"public.messages",
			"public.payments",
			"public.quickbooks_connections",
			"public.quickbooks_entity_links",
			"public.quickbooks_reconciliation_items",
			"public.quickbooks_sync_log",
			"public.ratio_snapshots",
			"public.ratio_violations",
			"public.schedules",
			"public.sessions",
			"public.shifts",
			"public.staff_assignments",
			"public.staff_check_ins",
			"public.subscription_notifications",
			"public.subsidy_cases",
			"public.subsidy_claims",
			"public.time_entries",
			"public.trial_feature_usage",
			"public.users",
			"public.verifications",
			"public.webhook_events",
		]);
		expect(new Set(requiredRelationKeys).size).toBe(requiredRelationKeys.length);
	});

	it("covers enum types used by repaired production relations", () => {
		const requiredTypeKeys = REQUIRED_PRODUCTION_TYPES.map((type) => `${type.schema}.${type.name}`);

		expect(requiredTypeKeys).toEqual([
			"public.subscription_notification_kind",
			"public.subscription_notification_status",
			"public.subscription_plan",
		]);
		expect(new Set(requiredTypeKeys).size).toBe(requiredTypeKeys.length);
	});

	it("covers app-critical labels for subscription_plan", () => {
		expect(REQUIRED_PRODUCTION_TYPE_LABELS).toEqual([
			{
				schema: "public",
				name: "subscription_plan",
				labels: ["trial", "home", "center_starter", "center_pro", "group", "enterprise"],
			},
		]);
	});

	it("covers app-critical column data types", () => {
		expect(REQUIRED_PRODUCTION_COLUMNS).toEqual([
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
		]);
	});

	it("passes when every required production relation exists", async () => {
		const lookup: RelationLookup = vi.fn(async (relations) =>
			relations.map((relation) => ({ schema: relation.schema, name: relation.name })),
		);
		const typeLookup: TypeLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name })),
		);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name, labels: [...type.labels] })),
		);
		const columnLookup: ColumnLookup = vi.fn(async (columns) =>
			columns.map((column) => ({ ...column })),
		);

		const result = await verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup);

		expect(result.checkedRelations).toBe(REQUIRED_PRODUCTION_RELATIONS.length);
		expect(result.checkedTypes).toBe(REQUIRED_PRODUCTION_TYPES.length);
		expect(result.checkedTypeLabels).toBe(REQUIRED_PRODUCTION_TYPE_LABELS.length);
		expect(result.checkedColumns).toBe(REQUIRED_PRODUCTION_COLUMNS.length);
		expect(result.missing).toEqual([]);
		expect(result.missingTypes).toEqual([]);
		expect(result.missingTypeLabels).toEqual([]);
		expect(result.missingColumns).toEqual([]);
		expect(lookup).toHaveBeenCalledWith(REQUIRED_PRODUCTION_RELATIONS);
		expect(typeLookup).toHaveBeenCalledWith(REQUIRED_PRODUCTION_TYPES);
		expect(typeLabelLookup).toHaveBeenCalledWith(REQUIRED_PRODUCTION_TYPE_LABELS);
		expect(columnLookup).toHaveBeenCalledWith(REQUIRED_PRODUCTION_COLUMNS);
	});

	it("fails with a clear missing relation message", async () => {
		const lookup: RelationLookup = vi.fn(async (relations) =>
			relations
				.filter(
					(relation) => relation.name !== "leads" && relation.name !== "subscription_notifications",
				)
				.map((relation) => ({ schema: relation.schema, name: relation.name })),
		);
		const typeLookup: TypeLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name })),
		);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name, labels: [...type.labels] })),
		);
		const columnLookup: ColumnLookup = vi.fn(async (columns) =>
			columns.map((column) => ({ ...column })),
		);

		await expect(
			verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup),
		).rejects.toThrow(
			"Production database schema is missing required relations: public.leads, public.subscription_notifications",
		);
	});

	it("fails with a clear missing type message", async () => {
		const lookup: RelationLookup = vi.fn(async (relations) =>
			relations.map((relation) => ({ schema: relation.schema, name: relation.name })),
		);
		const typeLookup: TypeLookup = vi.fn(async (types) =>
			types
				.filter((type) => type.name !== "subscription_notification_kind")
				.map((type) => ({ schema: type.schema, name: type.name })),
		);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name, labels: [...type.labels] })),
		);
		const columnLookup: ColumnLookup = vi.fn(async (columns) =>
			columns.map((column) => ({ ...column })),
		);

		await expect(
			verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup),
		).rejects.toThrow(
			"Production database schema is missing required types: public.subscription_notification_kind",
		);
	});

	it("fails with a clear missing enum label message", async () => {
		const lookup: RelationLookup = vi.fn(async (relations) =>
			relations.map((relation) => ({ schema: relation.schema, name: relation.name })),
		);
		const typeLookup: TypeLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name })),
		);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async (types) =>
			types.map((type) => ({
				schema: type.schema,
				name: type.name,
				labels: type.labels.filter((label) => label !== "trial"),
			})),
		);
		const columnLookup: ColumnLookup = vi.fn(async (columns) =>
			columns.map((column) => ({ ...column })),
		);

		await expect(
			verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup),
		).rejects.toThrow(
			"Production database schema is missing required enum labels: public.subscription_plan(trial)",
		);
	});

	it("fails with a clear missing column type message", async () => {
		const lookup: RelationLookup = vi.fn(async (relations) =>
			relations.map((relation) => ({ schema: relation.schema, name: relation.name })),
		);
		const typeLookup: TypeLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name })),
		);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async (types) =>
			types.map((type) => ({ schema: type.schema, name: type.name, labels: [...type.labels] })),
		);
		const columnLookup: ColumnLookup = vi.fn(async (columns) =>
			columns.map((column) => ({
				...column,
				dataType: column.column === "licensed_capacity" ? "boolean" : column.dataType,
			})),
		);

		await expect(
			verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup),
		).rejects.toThrow(
			"Production database schema is missing required columns: public.centers.licensed_capacity integer",
		);
	});

	it("does not include database URLs in failure messages", async () => {
		const lookup: RelationLookup = vi.fn(async () => []);
		const typeLookup: TypeLookup = vi.fn(async () => []);
		const typeLabelLookup: TypeLabelLookup = vi.fn(async () => []);
		const columnLookup: ColumnLookup = vi.fn(async () => []);

		await expect(
			verifyProductionSchema(lookup, typeLookup, typeLabelLookup, columnLookup),
		).rejects.not.toThrow("postgres://");
	});

	it("looks up required relations and filters unrelated matches", async () => {
		const sql = vi.fn(async () => [
			{ schema: "public", name: "leads" },
			{ schema: "public", name: "subscription_notifications" },
			{ schema: "public", name: "unrelated" },
		]);

		const rows = await lookupProductionRelations(sql as never, [
			{ schema: "public", name: "leads" },
			{ schema: "public", name: "subscription_notifications" },
		]);

		expect(rows).toEqual([
			{ schema: "public", name: "leads" },
			{ schema: "public", name: "subscription_notifications" },
		]);
		expect(sql).toHaveBeenCalledOnce();
	});

	it("looks up required types and filters unrelated matches", async () => {
		const sql = vi.fn(async () => [
			{ schema: "public", name: "subscription_notification_kind" },
			{ schema: "public", name: "subscription_notification_status" },
			{ schema: "public", name: "unrelated" },
		]);

		const rows = await lookupProductionTypes(sql as never, [
			{ schema: "public", name: "subscription_notification_kind" },
			{ schema: "public", name: "subscription_notification_status" },
		]);

		expect(rows).toEqual([
			{ schema: "public", name: "subscription_notification_kind" },
			{ schema: "public", name: "subscription_notification_status" },
		]);
		expect(sql).toHaveBeenCalledOnce();
	});

	it("looks up required enum labels and filters unrelated labels", async () => {
		const { lookupProductionTypeLabels } = await import("../src/production-schema-verifier.js");
		const sql = vi.fn(async () => [
			{ schema: "public", name: "subscription_plan", label: "home" },
			{ schema: "public", name: "subscription_plan", label: "center_starter" },
			{ schema: "public", name: "subscription_plan", label: "unrelated" },
		]);

		const rows = await lookupProductionTypeLabels(sql as never, [
			{ schema: "public", name: "subscription_plan", labels: ["home", "center_starter"] },
		]);

		expect(rows).toEqual([
			{ schema: "public", name: "subscription_plan", labels: ["home", "center_starter"] },
		]);
		expect(sql).toHaveBeenCalledOnce();
	});

	it("looks up required columns and filters wrong column types", async () => {
		const sql = vi.fn(async () => [
			{ schema: "public", name: "centers", column: "licensed_capacity", dataType: "integer" },
			{ schema: "public", name: "centers", column: "licensed_capacity", dataType: "boolean" },
			{ schema: "public", name: "centers", column: "unrelated", dataType: "integer" },
		]);

		const rows = await lookupProductionColumns(sql as never, [
			{ schema: "public", name: "centers", column: "licensed_capacity", dataType: "integer" },
		]);

		expect(rows).toEqual([
			{ schema: "public", name: "centers", column: "licensed_capacity", dataType: "integer" },
		]);
		expect(sql).toHaveBeenCalledOnce();
	});

	it("does not query Postgres when no relations are required", async () => {
		const sql = vi.fn();

		await expect(lookupProductionRelations(sql as never, [])).resolves.toEqual([]);

		expect(sql).not.toHaveBeenCalled();
	});

	it("does not query Postgres when no types are required", async () => {
		const sql = vi.fn();

		await expect(lookupProductionTypes(sql as never, [])).resolves.toEqual([]);

		expect(sql).not.toHaveBeenCalled();
	});

	it("does not query Postgres when no enum labels are required", async () => {
		const { lookupProductionTypeLabels } = await import("../src/production-schema-verifier.js");
		const sql = vi.fn();

		await expect(lookupProductionTypeLabels(sql as never, [])).resolves.toEqual([]);

		expect(sql).not.toHaveBeenCalled();
	});

	it("does not query Postgres when no columns are required", async () => {
		const sql = vi.fn();

		await expect(lookupProductionColumns(sql as never, [])).resolves.toEqual([]);

		expect(sql).not.toHaveBeenCalled();
	});
});
