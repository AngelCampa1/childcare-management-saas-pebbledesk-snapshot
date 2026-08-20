/**
 * Analytics tests for the EnrollPage component.
 * Verifies that enrollment_started fires once on mount.
 */
import { render } from "@testing-library/react";
import type React from "react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock analytics before importing the component
// ---------------------------------------------------------------------------

vi.mock("../../../lib/analytics", () => ({
	track: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module-level mocks required for enroll.tsx to load under JSDOM
// ---------------------------------------------------------------------------

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return { ...actual, createFileRoute: () => () => ({}), useNavigate: () => vi.fn() };
});

vi.mock("../../../hooks/use-auth-session", () => ({
	useAuthSession: vi.fn(() => ({
		data: {
			user: { id: "u-1" },
			center: { id: "c-1", timezone: "America/Chicago" },
		},
	})),
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
vi.mock("../../../components/capacity-bar", () => ({ CapacityBar: () => null }));
vi.mock("../../../components/date-input", () => ({ DateInput: () => null }));
vi.mock("../../../components/empty-state", () => ({ EmptyState: () => null }));
vi.mock("../../../components/help-tip", () => ({
	FieldHelp: () => null,
	PageHelpPanel: () => null,
}));
vi.mock("../../../lib/extract-error-message", () => ({
	extractErrorMessage: (e: unknown) => String(e),
}));
vi.mock("../../../lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@pebbledesk/ui/components/button", () => ({
	Button: ({
		children,
		onClick,
		disabled,
	}: {
		children: React.ReactNode;
		onClick?: () => void;
		disabled?: boolean;
	}) => (
		<button type="button" onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
}));
vi.mock("@pebbledesk/ui/components/card", () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@pebbledesk/ui/components/checkbox", () => ({ Checkbox: () => null }));
vi.mock("@pebbledesk/ui/components/input", () => ({ Input: () => null }));
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
vi.mock("@pebbledesk/ui/components/separator", () => ({ Separator: () => null }));
vi.mock("@pebbledesk/ui/components/skeleton", () => ({ Skeleton: () => null }));

import { track } from "../../../lib/analytics";
import { EnrollPage } from "./enroll";

const mockedTrack = vi.mocked(track);

describe("EnrollPage — enrollment_started analytics", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("fires track(enrollmentStarted) once on mount", () => {
		render(<EnrollPage />);
		expect(mockedTrack).toHaveBeenCalledTimes(1);
		expect(mockedTrack).toHaveBeenCalledWith("enrollment_started");
	});

	it("does not fire track again on re-render", () => {
		const { rerender } = render(<EnrollPage />);
		rerender(<EnrollPage />);
		// Still only called once — the empty dep array prevents re-firing
		expect(mockedTrack).toHaveBeenCalledTimes(1);
	});

	it("fires only once even when the mount effect double-invokes (StrictMode)", () => {
		render(
			<StrictMode>
				<EnrollPage />
			</StrictMode>,
		);
		// The dedupe ref guards against StrictMode's double effect invocation.
		expect(mockedTrack).toHaveBeenCalledTimes(1);
		expect(mockedTrack).toHaveBeenCalledWith("enrollment_started");
	});
});
