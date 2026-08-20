import { buttonVariants } from "@pebbledesk/ui/components/button";
import { describe, expect, it } from "vitest";

describe("button variants", () => {
	it("uses pill radius for every shared button size", () => {
		expect(buttonVariants({ variant: "default" })).toContain("rounded-full");
		expect(buttonVariants({ variant: "default" })).not.toContain("rounded-md");
		expect(buttonVariants({ size: "sm" })).toContain("rounded-full");
		expect(buttonVariants({ size: "sm" })).not.toContain("rounded-md");
		expect(buttonVariants({ size: "lg" })).toContain("rounded-full");
		expect(buttonVariants({ size: "lg" })).not.toContain("rounded-md");
	});

	it("uses neutral disabled styles for primary actions", () => {
		expect(buttonVariants({ variant: "default" })).toContain("disabled:bg-muted");
		expect(buttonVariants({ variant: "default" })).toContain("disabled:text-muted-foreground");
		expect(buttonVariants({ variant: "default" })).toContain("disabled:shadow-none");
		expect(buttonVariants({ variant: "default" })).not.toContain("disabled:opacity-50");
	});

	it("uses neutral disabled styles for outline actions", () => {
		expect(buttonVariants({ variant: "outline" })).toContain("disabled:border-muted");
		expect(buttonVariants({ variant: "outline" })).toContain("disabled:bg-muted/40");
		expect(buttonVariants({ variant: "outline" })).toContain("disabled:text-muted-foreground");
		expect(buttonVariants({ variant: "outline" })).toContain("disabled:shadow-none");
	});
});
