import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "./theme-toggle";

function renderServerMarkup() {
	const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value: undefined,
	});

	try {
		return renderToString(<ThemeToggle />);
	} finally {
		if (windowDescriptor) {
			Object.defineProperty(globalThis, "window", windowDescriptor);
		}
	}
}

beforeEach(() => {
	vi.restoreAllMocks();
	document.documentElement.classList.remove("light", "dark");
	localStorage.clear();
});

describe("ThemeToggle", () => {
	it("renders a button with 'System theme' aria-label by default", () => {
		render(<ThemeToggle />);
		expect(screen.getByRole("button", { name: "System theme" })).toBeDefined();
	});

	it("clicking cycles through system -> light -> dark -> system", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");

		expect(button.getAttribute("aria-label")).toBe("System theme");

		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("Light theme");

		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("Dark theme");

		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("System theme");
	});

	it("system state shows monitor icon (rect SVG)", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button", { name: "System theme" });
		const svg = button.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.querySelector("rect")).toBeTruthy();
	});

	it("light state shows sun icon (circle SVG)", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("Light theme");
		const svg = button.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.querySelector("circle")).toBeTruthy();
	});

	it("dark state shows moon icon (path SVG)", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		fireEvent.click(button);
		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("Dark theme");
		const svg = button.querySelector("svg");
		expect(svg).toBeTruthy();
		expect(svg?.querySelector("path")).toBeTruthy();
		// Moon has only a path element, no circle or rect
		expect(svg?.querySelector("circle")).toBeNull();
		expect(svg?.querySelector("rect")).toBeNull();
	});

	it("light state adds 'light' class to documentElement", () => {
		render(<ThemeToggle />);
		fireEvent.click(screen.getByRole("button"));
		expect(document.documentElement.classList.contains("light")).toBe(true);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("dark state adds 'dark' class to documentElement", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		fireEvent.click(button);
		fireEvent.click(button);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("system state removes both 'light' and 'dark' classes from documentElement", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		// Go to light
		fireEvent.click(button);
		expect(document.documentElement.classList.contains("light")).toBe(true);
		// Go to dark
		fireEvent.click(button);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		// Go to system
		fireEvent.click(button);
		expect(document.documentElement.classList.contains("light")).toBe(false);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("light state saves 'light' to localStorage", () => {
		render(<ThemeToggle />);
		fireEvent.click(screen.getByRole("button"));
		expect(localStorage.getItem("theme")).toBe("light");
	});

	it("dark state saves 'dark' to localStorage", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		fireEvent.click(button);
		fireEvent.click(button);
		expect(localStorage.getItem("theme")).toBe("dark");
	});

	it("system state removes 'theme' from localStorage", () => {
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		// Go to light (sets localStorage)
		fireEvent.click(button);
		expect(localStorage.getItem("theme")).toBe("light");
		// Go to dark
		fireEvent.click(button);
		// Go back to system
		fireEvent.click(button);
		expect(localStorage.getItem("theme")).toBeNull();
	});

	it("reads initial state from localStorage on mount", () => {
		localStorage.setItem("theme", "dark");
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		expect(button.getAttribute("aria-label")).toBe("Dark theme");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("falls back to 'system' when localStorage contains an invalid theme value", () => {
		localStorage.setItem("theme", "hacked-value");
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		expect(button.getAttribute("aria-label")).toBe("System theme");
		// Invalid value should not be added as a CSS class
		expect(document.documentElement.classList.contains("hacked-value")).toBe(false);
	});

	it("falls back to 'system' when localStorage.getItem throws SecurityError", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("Access is denied", "SecurityError");
		});
		render(<ThemeToggle />);
		expect(screen.getByRole("button", { name: "System theme" })).toBeDefined();
	});

	it("handles localStorage.setItem throwing in useEffect without crashing", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("Access is denied", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
			throw new DOMException("Access is denied", "SecurityError");
		});
		render(<ThemeToggle />);
		const button = screen.getByRole("button");
		// Should cycle without throwing
		fireEvent.click(button);
		expect(button.getAttribute("aria-label")).toBe("Light theme");
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});

	it("hydrates without mismatch when a stored theme exists", async () => {
		localStorage.setItem("theme", "dark");

		const serverMarkup = renderServerMarkup();
		const container = document.createElement("div");
		container.innerHTML = serverMarkup;
		document.body.appendChild(container);

		const previousActEnvironment = Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT");
		Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
		let root: { unmount: () => void } | null = null;

		try {
			await act(async () => {
				root = hydrateRoot(container, <ThemeToggle />);
			});

			await waitFor(() => {
				expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Dark theme");
			});

			expect(consoleError).not.toHaveBeenCalled();
		} finally {
			const typedRoot = root as { unmount: () => void } | null;
			typedRoot?.unmount();
			container.remove();
			Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousActEnvironment);
		}
	});
});
