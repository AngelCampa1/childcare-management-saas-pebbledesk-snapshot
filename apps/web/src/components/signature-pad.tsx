import { Button } from "@pebbledesk/ui/components/button";
import { useCallback, useEffect, useRef } from "react";

interface SignaturePadProps {
	label: string;
	onChange: (dataUrl: string | null) => void;
}

const PAD_WIDTH = 320;
const PAD_HEIGHT = 120;

export function SignaturePad({ label, onChange }: SignaturePadProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isDrawingRef = useRef(false);
	const hasStrokesRef = useRef(false);

	const getContext = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.strokeStyle = "#0f172a";
		ctx.lineWidth = 2;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		return ctx;
	}, []);

	const getPoint = useCallback((e: PointerEvent): { x: number; y: number } | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const scaleX = PAD_WIDTH / rect.width;
		const scaleY = PAD_HEIGHT / rect.height;
		return {
			x: (e.clientX - rect.left) * scaleX,
			y: (e.clientY - rect.top) * scaleY,
		};
	}, []);

	const handlePointerDown = useCallback(
		(e: PointerEvent) => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			canvas.setPointerCapture(e.pointerId);
			isDrawingRef.current = true;
			const ctx = getContext();
			const point = getPoint(e);
			if (!ctx || !point) return;
			ctx.beginPath();
			ctx.moveTo(point.x, point.y);
		},
		[getContext, getPoint],
	);

	const handlePointerMove = useCallback(
		(e: PointerEvent) => {
			if (!isDrawingRef.current) return;
			const ctx = getContext();
			const point = getPoint(e);
			if (!ctx || !point) return;
			ctx.lineTo(point.x, point.y);
			ctx.stroke();
			hasStrokesRef.current = true;
		},
		[getContext, getPoint],
	);

	const handlePointerUp = useCallback(() => {
		if (!isDrawingRef.current) return;
		isDrawingRef.current = false;
		const canvas = canvasRef.current;
		if (!canvas || !hasStrokesRef.current) return;
		onChange(canvas.toDataURL("image/png"));
	}, [onChange]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		canvas.addEventListener("pointerdown", handlePointerDown);
		canvas.addEventListener("pointermove", handlePointerMove);
		canvas.addEventListener("pointerup", handlePointerUp);
		canvas.addEventListener("pointercancel", handlePointerUp);

		return () => {
			canvas.removeEventListener("pointerdown", handlePointerDown);
			canvas.removeEventListener("pointermove", handlePointerMove);
			canvas.removeEventListener("pointerup", handlePointerUp);
			canvas.removeEventListener("pointercancel", handlePointerUp);
		};
	}, [handlePointerDown, handlePointerMove, handlePointerUp]);

	const handleClear = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
		hasStrokesRef.current = false;
		onChange(null);
	}, [onChange]);

	return (
		<div className="space-y-1.5">
			<label className="block text-sm font-medium text-foreground" htmlFor="signature-canvas">
				{label}
			</label>
			<canvas
				id="signature-canvas"
				ref={canvasRef}
				width={PAD_WIDTH}
				height={PAD_HEIGHT}
				className="touch-none w-full rounded-lg border border-border bg-background cursor-crosshair"
				style={{ maxWidth: PAD_WIDTH, height: PAD_HEIGHT }}
				aria-label={label}
			/>
			<Button type="button" variant="outline" size="sm" onClick={handleClear}>
				Clear
			</Button>
		</div>
	);
}
