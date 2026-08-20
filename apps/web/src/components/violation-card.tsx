import type { RatioViolation } from "@pebbledesk/shared";
import { Button } from "@pebbledesk/ui/components/button";
import { cn } from "@pebbledesk/ui/lib/utils";
import { CheckCircle, Clock, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatDateTime, useCenterTimezone } from "../lib/format-date";

interface ViolationCardProps {
	violation: RatioViolation;
	classroomName?: string;
	ageGroup?: string;
	onAddNotes: (id: string, notes: string) => void;
	centerTimezone?: string;
}

function formatTimestamp(iso: string, centerTimezone: string | undefined): string {
	return formatDateTime(iso, { centerTimezone });
}

function formatDuration(startIso: string, endIso?: string): string {
	const start = new Date(startIso).getTime();
	const end = endIso ? new Date(endIso).getTime() : Date.now();
	const diffMs = end - start;

	if (diffMs < 60_000) return "< 1m";

	const totalMinutes = Math.floor(diffMs / 60_000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;

	if (hours === 0) return `${minutes}m`;
	if (minutes === 0) return `${hours}h`;
	return `${hours}h ${minutes}m`;
}

function useElapsedDuration(detectedAt: string, active: boolean): string {
	const [duration, setDuration] = useState(() => formatDuration(detectedAt));

	useEffect(() => {
		if (!active) return;
		const id = setInterval(() => {
			setDuration(formatDuration(detectedAt));
		}, 60_000);
		return () => clearInterval(id);
	}, [detectedAt, active]);

	return duration;
}

export function ViolationCard({
	violation,
	classroomName,
	ageGroup,
	onAddNotes,
	centerTimezone,
}: ViolationCardProps) {
	const isOpen = !violation.resolvedAt;
	const [notesOpen, setNotesOpen] = useState(false);
	const [notesDraft, setNotesDraft] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// Prefer an explicitly threaded zone (the parent route passes the center's
	// zone), falling back to the cached auth-session zone when rendered without
	// one. Either way timestamps render in the center's local clock.
	const fallbackTimezone = useCenterTimezone();
	const effectiveTimezone = centerTimezone ?? fallbackTimezone;

	const elapsed = useElapsedDuration(violation.detectedAt, isOpen);

	useEffect(() => {
		if (!notesOpen) return;
		const frame = requestAnimationFrame(() => {
			textareaRef.current?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [notesOpen]);

	function handleOpenNotes() {
		setNotesDraft("");
		setNotesOpen(true);
	}

	function handleEditNotes() {
		setNotesDraft(violation.resolutionNotes ?? "");
		setNotesOpen(true);
	}

	function handleSave() {
		if (!notesDraft.trim()) return;
		onAddNotes(violation.id, notesDraft.trim());
		setNotesOpen(false);
		setNotesDraft("");
	}

	return (
		<div
			className={cn(
				"rounded-lg border bg-background shadow-sm",
				"animate-fade-in opacity-0",
				isOpen ? "border-destructive/40 ring-1 ring-destructive/15" : "border-success/40",
			)}
			style={{ animationFillMode: "forwards" }}
		>
			<div className="p-4 space-y-3">
				{/* Header row */}
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							{isOpen ? (
								<Clock className="w-4 h-4 text-destructive shrink-0" />
							) : (
								<CheckCircle className="w-4 h-4 text-success shrink-0" />
							)}
							<span className="font-semibold text-foreground truncate">
								{classroomName ?? "Unknown Room"}
							</span>
							{ageGroup && (
								<span className="text-xs text-muted-foreground shrink-0">· {ageGroup}</span>
							)}
						</div>
					</div>
					<span
						className={cn(
							"shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
							isOpen ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success",
						)}
					>
						{isOpen ? "Open" : "Resolved"}
					</span>
				</div>

				{/* Timestamps */}
				{isOpen ? (
					<div className="space-y-1 text-sm text-muted-foreground">
						<p>
							<span className="font-medium text-muted-foreground">Detected:</span>{" "}
							{formatTimestamp(violation.detectedAt, effectiveTimezone)}
						</p>
						<p className="flex items-center gap-1.5">
							<span className="font-medium text-muted-foreground">Duration:</span>
							<span className="tabular-nums text-destructive font-semibold">{elapsed}</span>
							<span className="text-xs text-muted-foreground">(updating every minute)</span>
						</p>
					</div>
				) : (
					<div className="space-y-1 text-sm text-muted-foreground">
						<p>
							<span className="font-medium text-muted-foreground">Detected:</span>{" "}
							{formatTimestamp(violation.detectedAt, effectiveTimezone)}
						</p>
						<p>
							<span className="font-medium text-muted-foreground">Resolved:</span>{" "}
							{violation.resolvedAt
								? formatTimestamp(violation.resolvedAt, effectiveTimezone)
								: "—"}
						</p>
						<p>
							<span className="font-medium text-muted-foreground">Duration:</span>{" "}
							<span className="tabular-nums">
								{formatDuration(violation.detectedAt, violation.resolvedAt)}
							</span>
						</p>
					</div>
				)}

				{/* Resolution notes panel (resolved violations) */}
				{!isOpen && violation.resolutionNotes && (
					<div className="bg-success/10 rounded-md px-3 py-2">
						<div className="flex items-center justify-between gap-2 mb-1">
							<div className="flex items-center gap-1.5">
								<FileText className="w-3.5 h-3.5 text-success" />
								<span className="text-xs font-medium text-success-foreground">
									Resolution Notes
								</span>
							</div>
							{!notesOpen && (
								<Button
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
									onClick={handleEditNotes}
								>
									Edit
								</Button>
							)}
						</div>
						<p className="text-sm text-success-foreground">{violation.resolutionNotes}</p>
					</div>
				)}

				{/* Add notes action area */}
				{!notesOpen && (isOpen || !violation.resolutionNotes) && (
					<div className="flex items-center gap-3">
						<Button
							variant="outline"
							size="sm"
							className="text-xs hover:border-foreground/20 transition-colors duration-150"
							onClick={handleOpenNotes}
						>
							{isOpen ? "Add Note" : "Add Notes"}
						</Button>
						{!isOpen && !violation.resolutionNotes && (
							<span
								data-testid="violation-notes-empty"
								className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
							>
								No notes on this violation
							</span>
						)}
					</div>
				)}

				{/* Inline notes textarea */}
				<div
					className={cn(
						"overflow-hidden transition-all duration-200",
						notesOpen ? "max-h-48" : "max-h-0",
					)}
				>
					{notesOpen && (
						<div className="space-y-2 pt-1">
							<textarea
								ref={textareaRef}
								value={notesDraft}
								onChange={(e) => setNotesDraft(e.target.value)}
								placeholder={
									isOpen
										? "Add a note about this violation..."
										: "Add notes about this violation..."
								}
								rows={3}
								className={cn(
									"w-full rounded-md border border-border px-3 py-2 text-sm",
									"resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-transparent",
									"placeholder:text-muted-foreground transition-colors duration-150",
								)}
							/>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									className="text-xs"
									onClick={handleSave}
									disabled={!notesDraft.trim()}
								>
									Save
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="text-xs text-muted-foreground"
									onClick={() => {
										setNotesOpen(false);
										setNotesDraft("");
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
