import { useEffect, useState } from "react";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";

type Theme = "system" | "light" | "dark";

const VALID_THEMES: ReadonlySet<string> = new Set(["system", "light", "dark"]);

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "system";
	try {
		const stored = localStorage.getItem("theme");
		if (stored && VALID_THEMES.has(stored)) return stored as Theme;
		return "system";
	} catch {
		return "system";
	}
}

function applyTheme(theme: Theme) {
	const root = document.documentElement;
	root.classList.remove("light", "dark");
	if (theme !== "system") {
		root.classList.add(theme);
	}
}

function ThemeToggleInner() {
	const [theme, setTheme] = useState<Theme>("system");
	const [hasHydrated, setHasHydrated] = useState(false);

	useEffect(() => {
		setTheme(getStoredTheme());
		setHasHydrated(true);
	}, []);

	useEffect(() => {
		if (!hasHydrated) {
			return;
		}

		applyTheme(theme);
		try {
			if (theme === "system") {
				localStorage.removeItem("theme");
			} else {
				localStorage.setItem("theme", theme);
			}
		} catch {
			// localStorage unavailable (private browsing, restricted context)
		}
	}, [hasHydrated, theme]);

	function cycle() {
		setTheme((prev) => {
			const order: Theme[] = ["system", "light", "dark"];
			const next = order[(order.indexOf(prev) + 1) % order.length];
			return next;
		});
	}

	const label =
		theme === "system" ? "System theme" : theme === "light" ? "Light theme" : "Dark theme";

	return (
		<button
			type="button"
			onClick={cycle}
			aria-label={label}
			title={label}
			className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-neutral-500)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-brand-text)]"
		>
			{theme === "light" ? (
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="5" />
					<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
				</svg>
			) : theme === "dark" ? (
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			) : (
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
					<path d="M8 21h8M12 17v4" />
				</svg>
			)}
		</button>
	);
}

export const ThemeToggle = withMarketingIslandErrorBoundary(ThemeToggleInner, {
	componentName: "ThemeToggle",
	mode: "silent",
});
