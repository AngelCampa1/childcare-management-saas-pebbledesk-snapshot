export type ImportType = "children" | "guardians" | "invoices" | "enroll";

export type MigrationPreset = {
	sourceName: string;
	entity: ImportType;
	/** Maps source CSV column header → PebbleDesk field name */
	columnMap: Record<string, string>;
	/** Optional value transform functions per PebbleDesk field name */
	valueTransforms?: Record<string, (value: string) => string>;
};
