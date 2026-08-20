import "@testing-library/jest-dom/vitest";

if (!HTMLElement.prototype.hasPointerCapture) {
	HTMLElement.prototype.hasPointerCapture = () => false;
}

if (!HTMLElement.prototype.setPointerCapture) {
	HTMLElement.prototype.setPointerCapture = () => {};
}

if (!HTMLElement.prototype.releasePointerCapture) {
	HTMLElement.prototype.releasePointerCapture = () => {};
}

if (typeof ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
