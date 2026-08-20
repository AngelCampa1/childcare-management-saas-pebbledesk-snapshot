import type { Child } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { LogIn, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { useChildren } from "../hooks/use-children";

interface AttendanceSearchProps {
	onCheckIn: (childId: string, classroomId: string) => Promise<void> | void;
	/** Default classroom to check in to when clicking a search result */
	defaultClassroomId?: string;
	isCheckInPending?: boolean;
	checkInError?: Error | null;
}

const LISTBOX_ID = "attendance-search-listbox";
const MAX_RESULTS = 8;

function optionIdFor(index: number): string {
	return `${LISTBOX_ID}-option-${index}`;
}

export function AttendanceSearch({
	onCheckIn,
	defaultClassroomId,
	isCheckInPending = false,
	checkInError,
}: AttendanceSearchProps) {
	const [search, setSearch] = useState("");
	const [focused, setFocused] = useState(false);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const [failedChild, setFailedChild] = useState<Child | null>(null);
	const [dismissedParentError, setDismissedParentError] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const { data: children, isLoading } = useChildren({
		search: search.trim() || undefined,
		classroomId: defaultClassroomId,
	});

	const showDropdown = focused && search.trim().length > 0;
	const visibleChildren = (children ?? []).slice(0, MAX_RESULTS);

	function handleClear() {
		setSearch("");
		setActiveIndex(null);
		setFailedChild(null);
		setDismissedParentError(true);
		inputRef.current?.focus();
	}

	async function handleSelect(child: Child) {
		if (!defaultClassroomId || isCheckInPending) return;
		setFailedChild(null);
		setDismissedParentError(false);
		try {
			await onCheckIn(child.id, defaultClassroomId);
			setSearch("");
			setFocused(false);
			setActiveIndex(null);
		} catch {
			setFailedChild(child);
			setFocused(true);
			inputRef.current?.focus();
		}
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (!focused) setFocused(true);
			if (visibleChildren.length === 0) return;
			setActiveIndex((prev) => {
				if (prev === null) return 0;
				return Math.min(prev + 1, visibleChildren.length - 1);
			});
			return;
		}
		if (e.key === "ArrowUp") {
			e.preventDefault();
			if (visibleChildren.length === 0) return;
			setActiveIndex((prev) => {
				if (prev === null) return visibleChildren.length - 1;
				return Math.max(prev - 1, 0);
			});
			return;
		}
		if (e.key === "Enter") {
			if (activeIndex !== null && visibleChildren[activeIndex]) {
				e.preventDefault();
				handleSelect(visibleChildren[activeIndex]);
			}
			return;
		}
		if (e.key === "Escape") {
			e.preventDefault();
			setFocused(false);
			setActiveIndex(null);
		}
	}

	const activeDescendant =
		activeIndex !== null && showDropdown ? optionIdFor(activeIndex) : undefined;

	return (
		<div className="relative w-full sm:w-auto">
			<div
				className={`flex items-center gap-2 border rounded-lg bg-background transition-colors w-full sm:w-64 ${
					focused ? "shadow-sm border-ring ring-1 ring-ring/20" : "border-border"
				}`}
			>
				<Search className="w-4 h-4 text-muted-foreground shrink-0 ml-3" />
				<Input
					ref={inputRef}
					value={search}
					onChange={(e) => {
						setSearch(e.target.value);
						setActiveIndex(null);
						setFailedChild(null);
						setDismissedParentError(true);
					}}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						// Delay to allow click on dropdown items
						setTimeout(() => setFocused(false), 150);
					}}
					onKeyDown={handleKeyDown}
					placeholder="Search child..."
					className="border-0 shadow-none focus-visible:ring-0 px-0 py-2 h-auto text-sm bg-transparent"
					role="combobox"
					aria-label="Search children for attendance"
					aria-expanded={showDropdown}
					aria-controls={LISTBOX_ID}
					aria-autocomplete="list"
					aria-activedescendant={activeDescendant}
				/>
				{search && (
					<button
						type="button"
						onClick={handleClear}
						aria-label="Clear attendance search"
						className="mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-muted-foreground"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{showDropdown && (
				<div className="absolute top-full mt-1 left-0 w-full bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden sm:w-64">
					{(failedChild || (checkInError && !dismissedParentError)) && (
						<div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-3">
							<p className="text-sm font-medium text-destructive">
								Check-in did not go through. Try again.
							</p>
							{failedChild && defaultClassroomId && (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="mt-2 h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
									disabled={isCheckInPending}
									aria-label={`Retry check-in for ${failedChild.firstName} ${failedChild.lastName}`}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => handleSelect(failedChild)}
								>
									Retry check-in
								</Button>
							)}
						</div>
					)}
					{isLoading ? (
						<div className="px-4 py-3 text-sm text-muted-foreground">Searching...</div>
					) : visibleChildren.length === 0 ? (
						<div className="px-4 py-3 text-sm text-muted-foreground">No children found</div>
					) : (
						<ul
							// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox listbox idiom requires role="listbox" on the popup container
							role="listbox"
							id={LISTBOX_ID}
						>
							{visibleChildren.map((child, index) => (
								<SearchResultItem
									key={child.id}
									child={child}
									index={index}
									isActive={index === activeIndex}
									canCheckIn={!!defaultClassroomId}
									isCheckInPending={isCheckInPending}
									onSelect={handleSelect}
								/>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}

interface SearchResultItemProps {
	child: Child;
	index: number;
	isActive: boolean;
	canCheckIn: boolean;
	isCheckInPending: boolean;
	onSelect: (child: Child) => void;
}

function SearchResultItem({
	child,
	index,
	isActive,
	canCheckIn,
	isCheckInPending,
	onSelect,
}: SearchResultItemProps) {
	const childName = `${child.firstName} ${child.lastName}`;

	return (
		<li
			id={optionIdFor(index)}
			// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox requires role="option" on each listbox item
			role="option"
			tabIndex={-1}
			aria-selected={isActive}
			className={`flex items-center justify-between px-4 py-2.5 transition-colors ${
				isActive ? "bg-muted" : "hover:bg-muted"
			}`}
		>
			<div>
				<p className="text-sm font-medium text-foreground">
					{child.firstName} {child.lastName}
				</p>
				<p className="text-xs text-muted-foreground capitalize">
					{child.ageGroup.replace(/_/g, " ")}
				</p>
			</div>
			{canCheckIn && (
				<Button
					size="sm"
					variant="outline"
					className="h-7 text-xs border-primary/50 text-primary hover:bg-primary/10 motion-safe:active:scale-[0.97] transition-transform"
					disabled={isCheckInPending}
					aria-label={isCheckInPending ? `Checking in ${childName}` : undefined}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => onSelect(child)}
				>
					<LogIn className="w-3 h-3 mr-1" />
					{isCheckInPending ? "Checking in..." : "Check In"}
				</Button>
			)}
		</li>
	);
}
