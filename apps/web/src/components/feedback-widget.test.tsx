import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		createFileRoute: () => (options: unknown) => options,
		Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
			<a href={to}>{children}</a>
		),
	};
});

vi.mock("../api", () => ({
	apiFetch: vi.fn(),
}));

vi.mock("@pebbledesk/ui/components/dialog", async () => {
	const React = await vi.importActual<typeof import("react")>("react");

	type DialogContextValue = { open: boolean; onOpenChange: (open: boolean) => void };
	const DialogContext = React.createContext<DialogContextValue>({
		open: false,
		onOpenChange: () => undefined,
	});

	return {
		Dialog: ({
			children,
			open,
			onOpenChange,
		}: {
			children: React.ReactNode;
			open: boolean;
			onOpenChange: (open: boolean) => void;
		}) => (
			<DialogContext.Provider value={{ open, onOpenChange }}>
				<div data-testid="dialog" data-open={open}>
					{children}
				</div>
			</DialogContext.Provider>
		),
		DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => {
			const ctx = React.useContext(DialogContext);
			if (asChild && React.isValidElement(children)) {
				const child = children as React.ReactElement<{
					onClick?: React.MouseEventHandler;
					onKeyDown?: React.KeyboardEventHandler;
				}>;
				return React.cloneElement(child, {
					onClick: (e: React.MouseEvent) => {
						ctx.onOpenChange(true);
						if (child.props.onClick) child.props.onClick(e);
					},
				});
			}
			return (
				<button
					type="button"
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") ctx.onOpenChange(true);
					}}
					onClick={() => ctx.onOpenChange(true)}
				>
					{children}
				</button>
			);
		},
		DialogContent: ({ children }: { children: React.ReactNode }) => {
			const ctx = React.useContext(DialogContext);
			if (!ctx.open) return null;
			return <div data-testid="dialog-content">{children}</div>;
		},
		DialogHeader: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="dialog-header">{children}</div>
		),
		DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
		DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
		DialogFooter: ({ children }: { children: React.ReactNode }) => (
			<div data-testid="dialog-footer">{children}</div>
		),
	};
});

vi.mock("@pebbledesk/ui/components/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
		type,
		className,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
		type?: "button" | "submit" | "reset";
		className?: string;
	}) => (
		<button
			type={type ?? "button"}
			onClick={onClick}
			disabled={disabled}
			className={className}
			data-testid="button"
		>
			{children}
		</button>
	),
}));

vi.mock("@pebbledesk/ui/components/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@pebbledesk/ui/components/textarea", () => ({
	Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));

vi.mock("@pebbledesk/ui/components/label", () => ({
	Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
		<label htmlFor={htmlFor}>{children}</label>
	),
}));

import { apiFetch } from "../api";
import { FeedbackWidget } from "./feedback-widget";

const mockedApiFetch = vi.mocked(apiFetch);

describe("FeedbackWidget", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mockedApiFetch.mockReset();
		sessionStorage.clear();
	});

	it("renders the floating feedback button", () => {
		render(<FeedbackWidget />);
		expect(screen.getByRole("button", { name: /feedback/i })).toBeInTheDocument();
	});

	it("keeps the floating feedback trigger at least 44px tall", () => {
		render(<FeedbackWidget />);
		const trigger = screen.getByRole("button", { name: /feedback/i });
		expect(trigger.className).toContain("min-h-11");
	});

	it("clicking the button opens the dialog", () => {
		render(<FeedbackWidget />);

		expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
		expect(screen.getByTestId("dialog-content")).toBeInTheDocument();
		expect(screen.getByText("Send feedback")).toBeInTheDocument();
	});

	it("submit with empty message shows inline validation error", async () => {
		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(
				screen.getByText(/message must be between 1 and 5000 characters/i),
			).toBeInTheDocument();
		});
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("submit with invalid email shows inline validation error", async () => {
		render(<FeedbackWidget userEmail="not-an-email" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "This is a test message" } });

		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(screen.getByText(/valid email/i)).toBeInTheDocument();
		});
		expect(mockedApiFetch).not.toHaveBeenCalled();
	});

	it("successful submit calls apiFetch with correct payload and shows success message", async () => {
		mockedApiFetch.mockResolvedValue({ ok: true } as Response);

		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const emailInput = screen.getByLabelText(/your email/i);
		fireEvent.change(emailInput, { target: { value: "user@example.com" } });

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "This is my feedback message" } });

		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(mockedApiFetch).toHaveBeenCalledWith(
				"/api/feedback",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("user@example.com"),
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText(/thanks — we'll get back to you/i)).toBeInTheDocument();
		});
	});

	it("failed submit shows error message", async () => {
		mockedApiFetch.mockResolvedValue({ ok: false } as Response);

		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "This is my feedback message" } });

		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(screen.getByText(/something went wrong. please try again/i)).toBeInTheDocument();
		});
	});

	it("cancel button closes the dialog", () => {
		render(<FeedbackWidget />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
		expect(screen.getByTestId("dialog-content")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();
	});

	it("prefills email from userEmail prop", () => {
		render(<FeedbackWidget userEmail="prefilled@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const emailInput = screen.getByLabelText(/your email/i) as HTMLInputElement;
		expect(emailInput.value).toBe("prefilled@example.com");
	});

	it("shows character count for the message textarea", () => {
		render(<FeedbackWidget />);
		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		expect(screen.getByText("0 / 5000")).toBeInTheDocument();

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "Hello" } });

		expect(screen.getByText("5 / 5000")).toBeInTheDocument();
	});

	it("resets message on dialog close but keeps email prefilled", async () => {
		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "Some draft message" } });

		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const emailInput = screen.getByLabelText(/your email/i) as HTMLInputElement;
		const freshTextarea = screen.getByPlaceholderText(/describe the issue/i) as HTMLTextAreaElement;
		expect(emailInput.value).toBe("user@example.com");
		expect(freshTextarea.value).toBe("");
	});

	it("allows editing the email field", () => {
		render(<FeedbackWidget userEmail="original@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const emailInput = screen.getByLabelText(/your email/i) as HTMLInputElement;
		fireEvent.change(emailInput, { target: { value: "changed@example.com" } });
		expect(emailInput.value).toBe("changed@example.com");
	});

	it("shows network error when apiFetch throws", async () => {
		mockedApiFetch.mockRejectedValue(new Error("Network failure"));

		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "This is my feedback message" } });

		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(screen.getByText(/something went wrong. please try again/i)).toBeInTheDocument();
		});
	});

	it("triggers pulse animation after 10 seconds if dialog was never opened", async () => {
		vi.useFakeTimers();

		render(<FeedbackWidget />);

		expect(screen.getByRole("button", { name: /feedback/i })).not.toHaveClass("feedback-pulse");

		await act(async () => {
			vi.advanceTimersByTime(10001);
		});

		expect(screen.getByRole("button", { name: /feedback/i })).toHaveClass("feedback-pulse");

		// Advance 700ms more so the inner setTimeout clears the pulse class
		await act(async () => {
			vi.advanceTimersByTime(700);
		});

		expect(screen.getByRole("button", { name: /feedback/i })).not.toHaveClass("feedback-pulse");

		vi.useRealTimers();
	});

	it("does not trigger pulse animation if sessionStorage key is already set", async () => {
		vi.useFakeTimers();
		sessionStorage.setItem("feedback_widget_pulsed", "1");

		render(<FeedbackWidget />);

		await act(async () => {
			vi.advanceTimersByTime(10001);
		});

		expect(screen.getByRole("button", { name: /feedback/i })).not.toHaveClass("feedback-pulse");

		vi.useRealTimers();
	});

	it("does not pulse when the dialog is open when the timeout fires", async () => {
		vi.useFakeTimers();

		render(<FeedbackWidget />);

		// Open the dialog before the pulse timeout fires — this re-runs the effect
		// clearing the old timer and setting a new one with open=true in closure
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
		});

		// Advance past the 10s threshold — the new timer fires with open=true
		// so the pulse branch is skipped
		await act(async () => {
			vi.advanceTimersByTime(11000);
		});

		// Dialog should still be open and no pulse class applied
		expect(screen.queryByTestId("dialog-content")).toBeInTheDocument();
		expect(sessionStorage.getItem("feedback_widget_pulsed")).toBeNull();

		vi.useRealTimers();
	});

	it("does not re-arm pulse timer when the dialog is toggled open/closed", async () => {
		vi.useFakeTimers();

		render(<FeedbackWidget />);

		// Advance 5 seconds (before pulse)
		await act(async () => {
			vi.advanceTimersByTime(5000);
		});

		// Toggle the dialog open then closed
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /feedback/i }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		});

		// Advance just past the 10s pulse threshold (total 10.001s from mount)
		// — pulse fires exactly once. We intentionally stop BEFORE the 700ms
		// end-pulse timer fires so the class is still applied.
		await act(async () => {
			vi.advanceTimersByTime(5001);
		});

		expect(screen.getByRole("button", { name: /feedback/i })).toHaveClass("feedback-pulse");
		expect(sessionStorage.getItem("feedback_widget_pulsed")).toBe("1");

		// Advance past the 700ms end-pulse window — the class is removed.
		await act(async () => {
			vi.advanceTimersByTime(700);
		});
		expect(screen.getByRole("button", { name: /feedback/i })).not.toHaveClass("feedback-pulse");

		// Advance another 15s — pulse must NOT fire again (timer is run-once)
		await act(async () => {
			vi.advanceTimersByTime(15000);
		});
		expect(screen.getByRole("button", { name: /feedback/i })).not.toHaveClass("feedback-pulse");

		vi.useRealTimers();
	});

	it("cleans up pulse timeout on unmount", () => {
		vi.useFakeTimers();

		const { unmount } = render(<FeedbackWidget />);

		// Unmount before the 10s timer fires — cleanup should cancel the timer
		unmount();

		// Advancing time after unmount should not cause any errors
		act(() => {
			vi.advanceTimersByTime(11000);
		});

		vi.useRealTimers();
	});

	it("auto-closes dialog after 1500ms on successful submit", async () => {
		// Use real timers but spy on setTimeout to capture auto-close callback
		let autoCloseCallback: (() => void) | null = null;
		const originalSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation(
			(fn: TimerHandler, delay?: number, ...args: unknown[]) => {
				if (delay === 1500 && typeof fn === "function") {
					autoCloseCallback = fn as () => void;
					return 0 as unknown as ReturnType<typeof setTimeout>;
				}
				return originalSetTimeout(fn, delay, ...args);
			},
		);

		mockedApiFetch.mockResolvedValue({ ok: true } as Response);

		render(<FeedbackWidget userEmail="user@example.com" />);

		fireEvent.click(screen.getByRole("button", { name: /feedback/i }));

		const textarea = screen.getByPlaceholderText(/describe the issue/i);
		fireEvent.change(textarea, { target: { value: "My feedback" } });

		fireEvent.click(screen.getByRole("button", { name: /^send$/i }));

		await waitFor(() => {
			expect(screen.getByText(/thanks — we'll get back to you/i)).toBeInTheDocument();
		});

		expect(autoCloseCallback).not.toBeNull();
		act(() => {
			if (autoCloseCallback) autoCloseCallback();
		});

		expect(screen.queryByTestId("dialog-content")).not.toBeInTheDocument();

		vi.restoreAllMocks();
	});
});
