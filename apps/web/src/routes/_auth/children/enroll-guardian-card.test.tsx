import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuardianCard, type WizardGuardian } from "./enroll";

// ---------------------------------------------------------------------------
// Module mocks — only what GuardianCard actually touches
// ---------------------------------------------------------------------------

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return { ...actual, createFileRoute: () => () => ({}) };
});

vi.mock("@pebbledesk/ui/components/button", () => ({
	Button: ({
		children,
		onClick,
		"aria-label": ariaLabel,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		"aria-label"?: string;
	}) => (
		<button type="button" onClick={onClick} aria-label={ariaLabel}>
			{children}
		</button>
	),
}));

vi.mock("@pebbledesk/ui/components/card", () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../components/status-badge", () => ({
	StatusBadge: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock("../../../lib/format-phone", () => ({
	formatPhoneNumber: (v: string) => v,
}));

// Hooks used by other functions in the module — GuardianCard itself doesn't
// call them, but the module-level import chain may resolve them.
vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({ data: undefined })),
}));
vi.mock("../../../hooks/use-children", () => ({
	useEnrollChild: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("../../../hooks/use-classrooms", () => ({
	useClassrooms: vi.fn(() => ({ data: [] })),
}));
vi.mock("../../../hooks/use-guardians", () => ({
	useGuardians: vi.fn(() => ({ data: [] })),
}));
vi.mock("../../../components/capacity-bar", () => ({
	CapacityBar: () => null,
}));
vi.mock("../../../components/date-input", () => ({
	DateInput: () => null,
}));
vi.mock("../../../components/empty-state", () => ({
	EmptyState: () => null,
}));
vi.mock("../../../components/help-tip", () => ({
	FieldHelp: () => null,
	PageHelpPanel: () => null,
}));
vi.mock("../../../lib/extract-error-message", () => ({
	extractErrorMessage: (e: unknown) => String(e),
}));
vi.mock("../../../lib/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@pebbledesk/ui/components/checkbox", () => ({
	Checkbox: () => null,
}));
vi.mock("@pebbledesk/ui/components/input", () => ({
	Input: () => null,
}));
vi.mock("@pebbledesk/ui/components/label", () => ({
	Label: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@pebbledesk/ui/components/select", () => ({
	Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectValue: () => null,
}));
vi.mock("@pebbledesk/ui/components/separator", () => ({
	Separator: () => null,
}));
vi.mock("@pebbledesk/ui/components/skeleton", () => ({
	Skeleton: () => null,
}));

import type React from "react";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const GUARDIAN: WizardGuardian = {
	_rowId: "row-1",
	type: "new",
	firstName: "Maria",
	lastName: "Garcia",
	email: "maria@example.com",
	phone: "5125550100",
	relationship: "Mother",
	isPrimary: true,
	authorizedPickup: false,
};

describe("GuardianCard a11y — icon-only action buttons", () => {
	it("edit button has an accessible name including the guardian's full name", () => {
		render(<GuardianCard guardian={GUARDIAN} onEdit={vi.fn()} onRemove={vi.fn()} />);

		const editBtn = screen.getByRole("button", { name: /Edit Maria Garcia/i });
		expect(editBtn).toBeInTheDocument();
	});

	it("remove button has an accessible name including the guardian's full name", () => {
		render(<GuardianCard guardian={GUARDIAN} onEdit={vi.fn()} onRemove={vi.fn()} />);

		const removeBtn = screen.getByRole("button", { name: /Remove Maria Garcia/i });
		expect(removeBtn).toBeInTheDocument();
	});
});
