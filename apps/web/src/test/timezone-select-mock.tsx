import { CENTER_TIMEZONE_OPTIONS } from "@pebbledesk/shared/constants";
import type { ReactNode } from "react";

export function createTimezoneSelectMock() {
	function Select({
		value,
		onValueChange,
	}: {
		value?: string;
		onValueChange?: (value: string) => void;
	}) {
		return (
			<select
				aria-label="Timezone"
				value={value ?? ""}
				onChange={(event) => onValueChange?.(event.target.value)}
			>
				{CENTER_TIMEZONE_OPTIONS.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		);
	}

	function SelectTrigger({ children }: { children: ReactNode }) {
		return <>{children}</>;
	}

	function SelectValue({ placeholder }: { placeholder?: string }) {
		return placeholder ? placeholder : null;
	}

	function SelectContent({ children }: { children: ReactNode }) {
		return <>{children}</>;
	}

	function SelectItem({ children }: { children: ReactNode }) {
		return <>{children}</>;
	}

	return {
		Select,
		SelectTrigger,
		SelectValue,
		SelectContent,
		SelectItem,
	};
}
