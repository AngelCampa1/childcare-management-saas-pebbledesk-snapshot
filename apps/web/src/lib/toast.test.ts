import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSonnerToast = {
	success: vi.fn(),
	error: vi.fn(),
	info: vi.fn(),
};

vi.mock("sonner", () => ({
	toast: mockSonnerToast,
}));

// Import after mock is set up
const { toast } = await import("./toast");

describe("toast wrapper", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("delegates toast.success to sonner toast.success", () => {
		toast.success("Item saved");
		expect(mockSonnerToast.success).toHaveBeenCalledWith("Item saved");
	});

	it("delegates toast.error to sonner toast.error", () => {
		toast.error("Something went wrong");
		expect(mockSonnerToast.error).toHaveBeenCalledWith("Something went wrong");
	});

	it("delegates toast.info to sonner toast.info", () => {
		toast.info("Refreshing data");
		expect(mockSonnerToast.info).toHaveBeenCalledWith("Refreshing data");
	});
});
