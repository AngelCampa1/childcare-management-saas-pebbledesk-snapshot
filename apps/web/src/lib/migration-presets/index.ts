import { brightwheelChildrenPreset, brightwheelGuardiansPreset } from "./brightwheel";
import { procareChildrenPreset, procareGuardiansPreset } from "./procare";
import type { ImportType, MigrationPreset } from "./types";

/** All presets, grouped by source vendor */
export const MIGRATION_PRESETS = {
	brightwheel: [brightwheelChildrenPreset, brightwheelGuardiansPreset],
	procare: [procareChildrenPreset, procareGuardiansPreset],
} satisfies Record<string, MigrationPreset[]>;

/** Find the preset for a given vendor + entity type, or null if none */
export function findPreset(vendor: string, entity: ImportType): MigrationPreset | null {
	const presets = MIGRATION_PRESETS[vendor as keyof typeof MIGRATION_PRESETS];
	return presets?.find((p) => p.entity === entity) ?? null;
}

/** Apply a preset's column map to a raw Papa.parse row */
export function applyPreset(
	row: Record<string, string>,
	preset: MigrationPreset,
): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [sourceCol, targetField] of Object.entries(preset.columnMap)) {
		const rawValue = row[sourceCol];
		if (rawValue === undefined) continue;
		const transform = preset.valueTransforms?.[targetField];
		result[targetField] = transform ? transform(rawValue) : rawValue;
	}
	return result;
}

export type { ImportType, MigrationPreset };
