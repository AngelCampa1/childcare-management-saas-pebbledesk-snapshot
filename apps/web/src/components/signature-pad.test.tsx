import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignaturePad } from "./signature-pad";

// Mock canvas methods not implemented in jsdom
const mockGetContext = vi.fn();
const mockBeginPath = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockStroke = vi.fn();
const mockClearRect = vi.fn();
const mockToDataURL = vi.fn(() => "data:image/png;base64,abc123");
const mockSetPointerCapture = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	const ctx = {
		strokeStyle: "",
		lineWidth: 0,
		lineCap: "",
		lineJoin: "",
		beginPath: mockBeginPath,
		moveTo: mockMoveTo,
		lineTo: mockLineTo,
		stroke: mockStroke,
		clearRect: mockClearRect,
	};
	mockGetContext.mockReturnValue(ctx);
	HTMLCanvasElement.prototype.getContext =
		mockGetContext as unknown as typeof HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.toDataURL = mockToDataURL;
	HTMLCanvasElement.prototype.setPointerCapture = mockSetPointerCapture;
});

describe("SignaturePad", () => {
	it("renders with the provided label", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Parent Signature" onChange={onChange} />);

		expect(screen.getByText("Parent Signature")).toBeInTheDocument();
	});

	it("renders a canvas element with correct dimensions", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Parent Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas");
		expect(canvas).toBeInTheDocument();
		expect(canvas).toHaveAttribute("width", "320");
		expect(canvas).toHaveAttribute("height", "120");
	});

	it("renders a Clear button", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
	});

	it("calls onChange with null when Clear is clicked with no strokes", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		fireEvent.click(screen.getByRole("button", { name: "Clear" }));

		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("emits a data URL after drawing a stroke", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		expect(canvas).not.toBeNull();

		fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
		fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
		fireEvent.pointerUp(canvas);

		expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\//));
	});

	it("calls onChange with null when Clear is clicked after drawing", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
		fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
		fireEvent.pointerUp(canvas);

		onChange.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Clear" }));

		expect(mockClearRect).toHaveBeenCalled();
		expect(onChange).toHaveBeenCalledWith(null);
	});

	it("does not emit onChange on pointerUp when no strokes have been drawn", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
		// no pointerMove — no strokes
		fireEvent.pointerUp(canvas);

		expect(onChange).not.toHaveBeenCalled();
	});

	it("does not draw on pointerMove when not in drawing state", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });

		expect(mockLineTo).not.toHaveBeenCalled();
	});

	it("handles pointerCancel like pointerUp", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas") as HTMLCanvasElement;
		fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
		fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
		fireEvent(canvas, new Event("pointercancel"));

		// Should have stopped drawing — a subsequent pointerMove should not draw
		onChange.mockClear();
		fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30 });
		// The stroke that was in progress calls onChange on cancel only if hasStrokes
		// (it does, since we moved), but subsequent moves should not re-fire
		expect(onChange).not.toHaveBeenCalled();
	});

	it("has aria-label on the canvas matching the label prop", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Guardian Approval" onChange={onChange} />);

		const canvas = document.querySelector("canvas");
		expect(canvas).toHaveAttribute("aria-label", "Guardian Approval");
	});

	it("applies touch-none class to prevent scroll interference", () => {
		const onChange = vi.fn();
		render(<SignaturePad label="Signature" onChange={onChange} />);

		const canvas = document.querySelector("canvas");
		expect(canvas?.className).toContain("touch-none");
	});
});
