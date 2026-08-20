import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockNavigate, mockCreateGuardian } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockCreateGuardian: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
	return {
		...actual,
		Link: ({
			children,
			className,
			onClick,
			params,
			to,
		}: {
			children: React.ReactNode;
			className?: string;
			onClick?: React.MouseEventHandler<HTMLAnchorElement>;
			params?: { id: string };
			to: string;
		}) => (
			<a href={params ? to.replace("$id", params.id) : to} className={className} onClick={onClick}>
				{children}
			</a>
		),
		useNavigate: () => mockNavigate,
	};
});

vi.mock("../../../hooks/use-guardians", () => ({
	useCreateGuardian: vi.fn(() => ({ mutateAsync: mockCreateGuardian, isPending: false })),
	useGuardians: vi.fn(),
}));

import { useGuardians } from "../../../hooks/use-guardians";
import { GuardiansPage } from "./index";

const mockedUseGuardians = vi.mocked(useGuardians);

describe("GuardiansPage", () => {
	beforeEach(() => {
		mockNavigate.mockReset();
		mockCreateGuardian.mockReset();
	});

	it("shows reachability summary and short visible row actions with full accessible labels", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "guardian-1",
					firstName: "Avery",
					lastName: "Lopez",
					email: "avery@example.com",
					phone: "5551234567",
				},
				{
					id: "guardian-2",
					firstName: "Blair",
					lastName: "Kim",
					email: null,
					phone: null,
				},
				{
					id: "guardian-3",
					firstName: "Casey",
					lastName: "Ng",
					email: null,
					phone: "5557654321",
				},
			],
		} as never);

		render(<GuardiansPage />);

		expect(screen.getByRole("region", { name: "Reachability summary" })).toBeInTheDocument();
		expect(screen.getByText("2 reachable")).toBeInTheDocument();
		expect(screen.getByText("1 missing contact")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "View details for Avery Lopez" })).toHaveTextContent(
			"View",
		);
		expect(screen.getByText("Missing email")).toBeInTheDocument();
		expect(screen.getAllByText("No contact info")).toHaveLength(2);
	});

	it("exposes an accessible name for guardian search", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<GuardiansPage />);

		expect(screen.getByRole("textbox", { name: "Search guardians" })).toBeInTheDocument();
	});

	it("search input has an explicit id paired with a visually-hidden label", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<GuardiansPage />);

		const input = screen.getByRole("textbox", { name: "Search guardians" });
		const id = input.getAttribute("id");
		expect(id).toBeTruthy();

		const label = document.querySelector(`label[for="${id}"]`);
		expect(label).not.toBeNull();
		expect(label?.className).toContain("sr-only");
	});

	it("shows linked children and pickup authorization in the directory table", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "guardian-1",
					firstName: "Avery",
					lastName: "Lopez",
					email: "avery@example.com",
					phone: "5551234567",
					children: [
						{
							id: "child-1",
							firstName: "Mia",
							lastName: "Lopez",
							authorizedPickup: true,
						},
						{
							id: "child-2",
							firstName: "Noah",
							lastName: "Lopez",
							authorizedPickup: false,
						},
					],
				},
				{
					id: "guardian-2",
					firstName: "Blair",
					lastName: "Kim",
					email: null,
					phone: null,
					children: [],
				},
			],
		} as never);

		render(<GuardiansPage />);

		expect(screen.getByRole("columnheader", { name: /children/i })).toBeInTheDocument();
		expect(screen.getByRole("columnheader", { name: /pickup/i })).toBeInTheDocument();

		const averyRow = screen.getByRole("row", { name: /Avery Lopez/i });
		const miaLink = within(averyRow).getByRole("link", { name: "Mia Lopez" });
		expect(miaLink).toHaveAttribute("href", "/children/child-1");
		expect(within(averyRow).getByText("1 pickup approved")).toBeInTheDocument();

		expect(screen.getByRole("row", { name: /Blair Kim/i })).toHaveTextContent("No children linked");
		expect(screen.getByRole("row", { name: /Blair Kim/i })).toHaveTextContent("No pickup approval");
	});

	it("passes search text into the guardians query", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<GuardiansPage />);

		fireEvent.change(screen.getByRole("textbox", { name: "Search guardians" }), {
			target: { value: "Avery" },
		});

		expect(mockedUseGuardians).toHaveBeenLastCalledWith("Avery");
	});

	it("renders loading and empty states", () => {
		mockedUseGuardians.mockReturnValueOnce({
			isLoading: true,
			data: undefined,
		} as never);
		const { rerender } = render(<GuardiansPage />);

		expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);

		mockedUseGuardians.mockReturnValueOnce({
			isLoading: false,
			data: [],
		} as never);
		rerender(<GuardiansPage />);

		expect(screen.getByText("Add your first family contact")).toBeInTheDocument();
	});

	it("opens the add dialog from the empty state and closes it with cancel", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<GuardiansPage />);

		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[1]);
		expect(screen.getByRole("button", { name: "Save guardian" })).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(screen.queryByRole("button", { name: "Save guardian" })).not.toBeInTheDocument();
	});

	it("opens the add guardian dialog and saves a new guardian", async () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);
		mockCreateGuardian.mockResolvedValue({ id: "guardian-new" });

		render(<GuardiansPage />);

		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "  Mia " } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: " Johnson " } });
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: " mia@example.com " } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: " 5551234567 " } });
		fireEvent.click(screen.getByRole("button", { name: "Save guardian" }));

		await waitFor(() =>
			expect(mockCreateGuardian).toHaveBeenCalledWith({
				firstName: "Mia",
				lastName: "Johnson",
				email: "mia@example.com",
				phone: "5551234567",
			}),
		);
		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/guardians/$id",
			params: { id: "guardian-new" },
		});
	});

	it("keeps the add dialog open and shows errors when save fails", async () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);
		mockCreateGuardian.mockRejectedValue(new Error("Guardian already exists"));

		render(<GuardiansPage />);

		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Mia" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Johnson" } });
		fireEvent.click(screen.getByRole("button", { name: "Save guardian" }));

		expect(await screen.findByRole("alert")).toHaveTextContent("Guardian already exists");
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("navigates from row and button actions", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "guardian-1",
					firstName: "Avery",
					lastName: "Lopez",
					email: "avery@example.com",
					phone: "5551234567",
				},
			],
		} as never);

		render(<GuardiansPage />);

		fireEvent.click(screen.getByRole("row", { name: /Avery Lopez/i }));
		fireEvent.click(screen.getByRole("button", { name: "View details for Avery Lopez" }));

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/guardians/$id",
			params: { id: "guardian-1" },
		});
	});

	it("shows error state and not empty state when useGuardians returns isError true", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch: vi.fn(),
		} as never);

		render(<GuardiansPage />);

		expect(screen.getByText("Failed to load family contacts.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
		expect(screen.queryByText("Add your first family contact")).not.toBeInTheDocument();
	});

	it("calls refetch when Try again is clicked in the error state", () => {
		const refetch = vi.fn();
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			isError: true,
			data: undefined,
			refetch,
		} as never);

		render(<GuardiansPage />);

		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it("keeps guardian and child links from also triggering row navigation", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [
				{
					id: "guardian-1",
					firstName: "Avery",
					lastName: "Lopez",
					email: "avery@example.com",
					phone: "5551234567",
					children: [
						{
							id: "child-1",
							firstName: "Mia",
							lastName: "Lopez",
							authorizedPickup: true,
						},
					],
				},
			],
		} as never);

		render(<GuardiansPage />);

		const row = screen.getByRole("row", { name: /Avery Lopez/i });
		fireEvent.click(within(row).getByRole("link", { name: "Avery Lopez" }));
		fireEvent.click(within(row).getByRole("link", { name: "Mia Lopez" }));

		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("resets all fields to seed values when AddGuardianDialog (guardians page) is closed without saving", () => {
		mockedUseGuardians.mockReturnValue({
			isLoading: false,
			data: [],
		} as never);

		render(<GuardiansPage />);

		// Open the add dialog
		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);
		expect(screen.getByRole("button", { name: "Save guardian" })).toBeInTheDocument();

		// Fill fields with non-seed values
		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "jordan@example.com" } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "5551234567" } });

		// Close via Radix close button — fires Dialog's onOpenChange(false), triggering the reset
		fireEvent.click(screen.getByRole("button", { name: "Close" }));

		// Reopen
		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);
		expect(screen.getByRole("button", { name: "Save guardian" })).toBeInTheDocument();

		// All fields back to seed values (empty strings)
		expect((screen.getByLabelText("First Name") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Last Name") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
		expect((screen.getByLabelText("Phone") as HTMLInputElement).value).toBe("");
	});
});
