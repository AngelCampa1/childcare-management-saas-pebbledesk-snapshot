import { Input } from "@pebbledesk/ui/components/input";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

type InputProps = ComponentPropsWithoutRef<typeof Input>;
type DateInputProps = Omit<InputProps, "type"> & {
	/** ISO date string (YYYY-MM-DD) used as the native `max` attribute. */
	maxDate?: string;
	/** ISO date string (YYYY-MM-DD) used as the native `min` attribute. */
	minDate?: string;
};

/**
 * Thin wrapper around `<Input type="date">` that marks intent for a US locale
 * on every date input site in the app. Note: `lang="en-US"` does NOT force
 * MM/DD/YYYY rendering in Chrome or Firefox — those browsers defer the
 * visible format of native date pickers to the OS locale. The attribute is
 * still useful as an explicit signal to assistive tech and future tooling.
 *
 * Add a Shadcn-based date picker in a future pass for deterministic US
 * format rendering independent of the visitor's OS locale.
 */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
	{ lang, maxDate, minDate, ...props },
	ref,
) {
	return (
		<Input ref={ref} type="date" lang={lang ?? "en-US"} max={maxDate} min={minDate} {...props} />
	);
});
