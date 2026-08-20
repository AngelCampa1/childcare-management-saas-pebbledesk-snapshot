import { describe, expect, it } from "vitest";
import {
	childDetailResponseSchema,
	childListResponseSchema,
	childMutationResponseSchema,
	enrollChildResponseSchema,
	linkGuardianResponseSchema,
	unlinkGuardianResponseSchema,
	updateGuardianLinkResponseSchema,
} from "./child-responses.js";

const CHILD_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("childListResponseSchema", () => {
	it("accepts a children array and preserves unknown fields", () => {
		const parsed = childListResponseSchema.parse({
			children: [{ id: CHILD_ID, firstName: "Mia", extra: true }],
		});
		expect(parsed.children[0]?.id).toBe(CHILD_ID);
		// passthrough preserves unknown fields
		expect((parsed.children[0] as { extra?: boolean }).extra).toBe(true);
	});

	it("rejects a payload missing the children array", () => {
		expect(childListResponseSchema.safeParse({ notChildren: [] }).success).toBe(false);
	});

	it("rejects a child entry without an id", () => {
		expect(childListResponseSchema.safeParse({ children: [{ firstName: "Mia" }] }).success).toBe(
			false,
		);
	});
});

describe("childDetailResponseSchema", () => {
	it("accepts a full child detail payload", () => {
		const parsed = childDetailResponseSchema.parse({
			child: { id: CHILD_ID },
			currentClassroom: null,
			guardians: [],
			primaryGuardianName: null,
		});
		expect(parsed.child.id).toBe(CHILD_ID);
		expect(parsed.primaryGuardianName).toBeNull();
	});

	it("rejects a payload missing the child", () => {
		expect(
			childDetailResponseSchema.safeParse({
				currentClassroom: null,
				guardians: [],
				primaryGuardianName: null,
			}).success,
		).toBe(false);
	});
});

describe("childMutationResponseSchema", () => {
	it("accepts a wrapped child", () => {
		expect(childMutationResponseSchema.parse({ child: { id: CHILD_ID } }).child.id).toBe(CHILD_ID);
	});

	it("rejects a missing child", () => {
		expect(childMutationResponseSchema.safeParse({ notChild: true }).success).toBe(false);
	});
});

describe("enrollChildResponseSchema", () => {
	it("accepts an enrollment result with a child id", () => {
		expect(enrollChildResponseSchema.parse({ child: { id: CHILD_ID } }).child.id).toBe(CHILD_ID);
	});

	it("rejects a result without a child", () => {
		expect(enrollChildResponseSchema.safeParse({ guardians: [] }).success).toBe(false);
	});
});

describe("linkGuardianResponseSchema", () => {
	it("accepts the API's { linked: true } shape", () => {
		expect(linkGuardianResponseSchema.parse({ linked: true }).linked).toBe(true);
	});

	it("rejects a payload that omits the linked flag", () => {
		expect(linkGuardianResponseSchema.safeParse({ success: true }).success).toBe(false);
	});
});

describe("updateGuardianLinkResponseSchema", () => {
	it("accepts the API's { link } shape", () => {
		expect(
			updateGuardianLinkResponseSchema.parse({ link: { guardianId: "g", childId: "c" } }).link,
		).toBeDefined();
	});

	it("rejects a non-object response", () => {
		expect(updateGuardianLinkResponseSchema.safeParse(null).success).toBe(false);
	});
});

describe("unlinkGuardianResponseSchema", () => {
	it("accepts the API's { unlinked: true } shape", () => {
		expect(unlinkGuardianResponseSchema.parse({ unlinked: true }).unlinked).toBe(true);
	});

	it("rejects a non-object response", () => {
		expect(unlinkGuardianResponseSchema.safeParse(null).success).toBe(false);
	});
});
