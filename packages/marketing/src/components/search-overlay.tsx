import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../lib/focus-trap";
import { sanitizeExcerpt } from "../lib/sanitize";
import { lockScroll, unlockScroll } from "../lib/scroll-lock";
import { withMarketingIslandErrorBoundary } from "./marketing-island-error-boundary";

interface SearchOverlayLabels {
	searching?: string;
	noResults?: string;
	emptyState?: string;
	errorMessage?: string;
}

const defaultSearchLabels: Required<SearchOverlayLabels> = {
	searching: "",
	noResults: "",
	emptyState: "",
	errorMessage: "Search failed. Please try again.",
};

interface SearchOverlayProps {
	siteName: string;
	placeholder?: string;
	labels?: SearchOverlayLabels;
	/** Maximum number of search results to display. Defaults to 8. */
	maxResults?: number;
	/** Override the pagefind loader; used in tests to inject a mock. */
	_loadPagefind?: () => Promise<PagefindUI | null>;
}

interface PagefindResult {
	url: string;
	meta: { title: string };
	excerpt: string;
}

interface PagefindUI {
	search: (query: string) => Promise<{ results: { data: () => Promise<PagefindResult> }[] }>;
	destroy?: () => void;
}

export async function loadPagefindModule(): Promise<PagefindUI | null> {
	try {
		const pagefindUrl = new URL("/pagefind/pagefind.js", window.location.origin).toString();
		return (await import(/* @vite-ignore */ pagefindUrl)) as PagefindUI;
	} catch {
		// Pagefind not available (dev mode or not yet built)
		return null;
	}
}

function SearchOverlayInner({
	siteName,
	placeholder = "Search...",
	labels: labelsProp,
	maxResults = 8,
	_loadPagefind = loadPagefindModule,
}: SearchOverlayProps) {
	const labels = { ...defaultSearchLabels, ...labelsProp };
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<PagefindResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [searchError, setSearchError] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const [pagefindReady, setPagefindReady] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const pagefindRef = useRef<PagefindUI | null>(null);
	const resultLinkRefsRef = useRef<(HTMLAnchorElement | null)[]>([]);
	const dialogRef = useRef<HTMLDivElement>(null);

	useFocusTrap(dialogRef, open);

	useEffect(() => {
		if (!open) return;
		lockScroll();
		return () => {
			unlockScroll();
		};
	}, [open]);

	const close = useCallback(() => {
		setOpen(false);
		setQuery("");
		setResults([]);
		setActiveIndex(-1);
	}, []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
			if (e.key === "Escape" && open) {
				close();
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [open, close]);

	useEffect(() => {
		if (open && inputRef.current) {
			inputRef.current.focus();
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;

		async function loadPagefind() {
			if (pagefindRef.current) return;
			const pf = await _loadPagefind();
			if (pf) {
				pagefindRef.current = pf;
				setPagefindReady(true);
			}
		}
		loadPagefind();
	}, [open, _loadPagefind]);

	useEffect(() => {
		return () => {
			pagefindRef.current?.destroy?.();
			pagefindRef.current = null;
		};
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: pagefindReady is an intentional trigger dep; it re-fires the search when pagefind becomes available after the query was typed
	useEffect(() => {
		if (!query.trim() || !pagefindRef.current) {
			setResults([]);
			setActiveIndex(-1);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setSearchError(false);

		async function doSearch() {
			const pf = pagefindRef.current;

			try {
				const search = (await pf?.search(query)) ?? { results: [] };
				const effectiveMaxResults = Math.max(1, maxResults);
				const settled = await Promise.allSettled(
					search.results.slice(0, effectiveMaxResults).map((r) => r.data()),
				);
				const data = settled
					.filter((r): r is PromiseFulfilledResult<PagefindResult> => r.status === "fulfilled")
					.map((r) => r.value);
				const hasRejections = settled.some((r) => r.status === "rejected");
				if (!cancelled) {
					setResults(data);
					setSearchError(hasRejections && data.length === 0);
					setActiveIndex(-1);
					setLoading(false);
				}
			} catch {
				if (!cancelled) {
					setResults([]);
					setSearchError(true);
					setLoading(false);
				}
			}
		}

		const timer = setTimeout(doSearch, 200);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [query, maxResults, pagefindReady]);

	const handleResultKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (results.length === 0) return;

			if (e.key === "ArrowDown") {
				e.preventDefault();
				setActiveIndex((prev) => {
					const next = prev < results.length - 1 ? prev + 1 : 0;
					resultLinkRefsRef.current[next]?.focus();
					return next;
				});
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setActiveIndex((prev) => {
					const next = prev > 0 ? prev - 1 : results.length - 1;
					resultLinkRefsRef.current[next]?.focus();
					return next;
				});
			}
		},
		[results],
	);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="rounded-full p-2 text-[var(--color-neutral-500)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-neutral-700)]"
				aria-label={`Search ${siteName}`}
				title="Search (Ctrl+K)"
			>
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
					<circle cx="11" cy="11" r="8" />
					<path d="m21 21-4.3-4.3" />
				</svg>
			</button>
		);
	}

	return (
		<div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]">
			{/* Backdrop */}
			<div
				className="absolute inset-0"
				style={{
					backgroundColor: "var(--surface-overlay)",
				}}
				onClick={close}
				aria-hidden="true"
			/>

			{/* Search panel */}
			<div
				ref={dialogRef}
				role="dialog"
				aria-label="Search"
				aria-modal="true"
				className="relative w-full max-w-lg mx-4 rounded-[var(--radius-lg)] border overflow-hidden"
				onKeyDown={handleResultKeyDown}
				style={{
					backgroundColor: "var(--surface-primary)",
					borderColor: "var(--color-neutral-200)",
					boxShadow: "var(--shadow-ambient)",
				}}
			>
				<div
					className="flex items-center gap-3 px-4 py-3 border-b"
					style={{ borderColor: "var(--color-neutral-200)" }}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-[var(--color-neutral-400)] shrink-0"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="8" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<input
						ref={inputRef}
						type="search"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={placeholder}
						className="flex-1 bg-transparent outline-none"
						style={{
							color: "var(--color-brand-text)",
							fontSize: "var(--text-body)",
						}}
						aria-label="Search query"
						aria-controls={results.length > 0 ? "search-results" : undefined}
					/>
					<kbd
						className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[length:var(--text-caption)] rounded-[var(--radius-sm)] border"
						style={{
							color: "var(--color-neutral-400)",
							borderColor: "var(--color-neutral-200)",
							backgroundColor: "var(--surface-secondary)",
						}}
					>
						Esc
					</kbd>
				</div>

				<div className="max-h-80 overflow-y-auto">
					{loading && labels.searching && (
						<div
							className="px-4 py-8 text-center text-[length:var(--text-caption)]"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{labels.searching}
						</div>
					)}

					{!loading && query.trim() && results.length === 0 && searchError && (
						<div
							className="px-4 py-8 text-center text-[length:var(--text-caption)]"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{labels.errorMessage}
						</div>
					)}

					{!loading && query.trim() && results.length === 0 && !searchError && (
						<div
							className="px-4 py-8 text-center text-[length:var(--text-caption)]"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{labels.noResults ? `${labels.noResults} ` : ""}&ldquo;{query}
							&rdquo;
						</div>
					)}

					{!loading && results.length > 0 && (
						<ul id="search-results" aria-label="Search results" className="py-2">
							{results.map((result, index) => {
								return (
									<li
										key={result.url}
										id={`search-result-${index}`}
										data-active={index === activeIndex ? "true" : undefined}
										className={`transition-colors ${index === activeIndex ? "bg-[var(--color-neutral-100)]" : "hover:bg-[var(--color-neutral-50)]"}`}
									>
										<a
											ref={(el) => {
												resultLinkRefsRef.current[index] = el;
											}}
											href={result.url}
											className="block rounded-[inherit] px-4 py-3"
											onFocus={() => setActiveIndex(index)}
											onMouseEnter={() => setActiveIndex(index)}
											onClick={() => close()}
										>
											<p
												className="text-[length:var(--text-caption)] font-medium"
												style={{ color: "var(--color-brand-text)" }}
											>
												{result.meta.title}
											</p>
											{result.excerpt && (
												<p
													className="mt-1 line-clamp-2"
													style={{
														color: "var(--color-neutral-500)",
														fontSize: "var(--text-caption)",
													}}
													// biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized via sanitizeExcerpt before rendering
													dangerouslySetInnerHTML={{
														__html: sanitizeExcerpt(result.excerpt),
													}}
												/>
											)}
										</a>
									</li>
								);
							})}
						</ul>
					)}

					{!loading && !query.trim() && labels.emptyState && (
						<div
							className="px-4 py-8 text-center text-[length:var(--text-caption)]"
							style={{ color: "var(--color-neutral-400)" }}
						>
							{labels.emptyState} {siteName}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export const SearchOverlay = withMarketingIslandErrorBoundary(SearchOverlayInner, {
	componentName: "SearchOverlay",
	mode: "silent",
});
