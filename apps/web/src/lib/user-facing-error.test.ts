import { describe, expect, it } from "vitest";
import { ApiError } from "../api";
import { formatUserFacingError } from "./user-facing-error";

describe("formatUserFacingError", () => {
	it("uses the fallback message for expected validation errors", () => {
		const error = new ApiError("Invalid payload", 400, {});

		expect(formatUserFacingError(error, "Check the form and try again.")).toBe(
			"Check the form and try again.",
		);
	});

	it("includes request IDs for support when API errors provide them", () => {
		const error = new ApiError("Server unavailable", 503, {}, "req_123");

		expect(formatUserFacingError(error, "Something went wrong. Please try again.")).toBe(
			"Something went wrong. Please try again. Reference ID: req_123",
		);
	});

	it("ignores blank request IDs", () => {
		const error = { requestId: "   " };

		expect(formatUserFacingError(error, "Something went wrong. Please try again.")).toBe(
			"Something went wrong. Please try again.",
		);
	});

	it("uses the fallback message for null errors", () => {
		expect(formatUserFacingError(null, "Something went wrong. Please try again.")).toBe(
			"Something went wrong. Please try again.",
		);
	});
});
