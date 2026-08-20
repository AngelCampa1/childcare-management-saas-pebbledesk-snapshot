import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./extract-error-message";

describe("extractErrorMessage", () => {
	it("returns the message from an Error instance", () => {
		expect(extractErrorMessage(new Error("auth failed"))).toBe("auth failed");
	});

	it("returns the fallback for a plain string error", () => {
		expect(extractErrorMessage("unexpected string")).toBe(
			"Something went wrong. Please try again.",
		);
	});

	it("returns the fallback for null", () => {
		expect(extractErrorMessage(null)).toBe("Something went wrong. Please try again.");
	});

	it("returns the fallback for undefined", () => {
		expect(extractErrorMessage(undefined)).toBe("Something went wrong. Please try again.");
	});

	it("returns the fallback for a plain object", () => {
		expect(extractErrorMessage({ code: 500 })).toBe("Something went wrong. Please try again.");
	});

	it("accepts a custom fallback message", () => {
		expect(extractErrorMessage(42, "Custom fallback")).toBe("Custom fallback");
	});

	it("returns the custom fallback when given an Error with an empty message", () => {
		expect(extractErrorMessage(new Error(""), "Fallback")).toBe("Fallback");
	});

	it("returns the error message when given a subclass of Error", () => {
		class CustomError extends Error {
			constructor(msg: string) {
				super(msg);
				this.name = "CustomError";
			}
		}
		expect(extractErrorMessage(new CustomError("custom error message"))).toBe(
			"custom error message",
		);
	});
});
