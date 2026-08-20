import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChildren, useLinkGuardian } from "../hooks/use-children";
import {
	useCreateGuardian,
	useGuardian,
	useGuardians,
	useUpdateGuardian,
} from "../hooks/use-guardians";
import { Route as GuardianDetailRoute } from "./_auth/guardians/$id";
import { Route as GuardiansRoute } from "./_auth/guardians/index";

vi.mock("@tanstack/react-router", async () => {
	const actual =
		await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");

	return {
		...actual,
		useNavigate: () => vi.fn(),
		Link: ({
			children,
			to,
			params,
			className,
		}: {
			children: React.ReactNode;
			to: string;
			params?: Record<string, string>;
			className?: string;
		}) => {
			const href = params
				? Object.entries(params).reduce((u, [k, v]) => u.replace(`$${k}`, v), to)
				: to;
			return (
				<a href={href} className={className}>
					{children}
				</a>
			);
		},
	};
});

vi.mock("../hooks/use-children", () => ({
	useChildren: vi.fn(),
	useLinkGuardian: vi.fn(),
}));

vi.mock("../hooks/use-guardians", () => ({
	useCreateGuardian: vi.fn(),
	useGuardian: vi.fn(),
	useGuardians: vi.fn(),
	useUpdateGuardian: vi.fn(),
}));

const mockedUseGuardians = vi.mocked(useGuardians);
const mockedUseCreateGuardian = vi.mocked(useCreateGuardian);
const mockedUseGuardian = vi.mocked(useGuardian);
const mockedUseUpdateGuardian = vi.mocked(useUpdateGuardian);
const mockedUseChildren = vi.mocked(useChildren);
const mockedUseLinkGuardian = vi.mocked(useLinkGuardian);

describe("guardian route dialogs", () => {
	it("describes the add guardian dialog on the guardians index page", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		mockedUseGuardians.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) {
			throw new Error("Expected guardians index route component");
		}

		render(<GuardiansPage />);
		const headerCta = screen.getAllByRole("button", { name: "Add Guardian" })[0];
		expect(headerCta?.className).toMatch(/self-start/);
		fireEvent.click(headerCta as HTMLButtonElement);

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByRole("heading", { name: "Add Guardian" })).toBeInTheDocument();
		expect(
			within(dialog).getByText(
				/Guardians are authorized for pickup, billing, and emergency contact/i,
			),
		).toBeInTheDocument();

		const messages = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
			.flat()
			.map((value) => String(value))
			.join("\n");

		expect(messages).not.toMatch(/Missing Description|aria-describedby/);

		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	it("formats guardian phone numbers on the guardians index page", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-1",
					firstName: "Mia",
					lastName: "Johnson",
					email: "mia@example.com",
					phone: "5125550111",
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) {
			throw new Error("Expected guardians index route component");
		}

		render(<GuardiansPage />);

		expect(screen.getByText("(512) 555-0111")).toBeInTheDocument();
	});

	it("shows contact completeness cues and a view details action on the guardians list", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-1",
					firstName: "Mia",
					lastName: "Johnson",
					email: "mia@example.com",
					phone: "5125550111",
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");

		render(<GuardiansPage />);

		expect(screen.getByText("Email on file")).toBeInTheDocument();
		expect(screen.getByText("Phone on file")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "View details for Mia Johnson" }),
		).toBeInTheDocument();
	});

	it("renders guardian name as an explicit link to the guardian profile", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "guardian-99",
					firstName: "Elena",
					lastName: "Torres",
					email: "elena@example.com",
					phone: null,
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");

		render(<GuardiansPage />);

		const nameLink = screen.getByRole("link", { name: /Elena Torres/i });
		expect(nameLink).toBeInTheDocument();
		expect(nameLink).toHaveAttribute("href", expect.stringContaining("/guardians/"));
	});

	beforeEach(() => {
		vi.spyOn(GuardianDetailRoute, "useParams").mockReturnValue({ id: "guardian-1" } as never);

		mockedUseGuardian.mockReturnValue({
			data: {
				guardian: {
					id: "guardian-1",
					firstName: "Mia",
					lastName: "Johnson",
					email: "mia@example.com",
					phone: "5125550111",
				},
				children: [],
			},
			isLoading: false,
		} as never);
		mockedUseUpdateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
		mockedUseChildren.mockReturnValue({
			data: [
				{
					id: "child-1",
					firstName: "Ava",
					lastName: "Johnson",
					enrollmentStatus: "active",
				},
			],
			isLoading: false,
		} as never);
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);
	});

	it("describes the link child dialog on the guardian detail page", () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) {
			throw new Error("Expected guardian detail route component");
		}

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Link to Child" })[0]);

		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByRole("heading", { name: "Link to Child" })).toBeInTheDocument();
		expect(
			within(dialog).getByText("Search for a child to link to this guardian."),
		).toBeInTheDocument();

		const messages = [...consoleErrorSpy.mock.calls, ...consoleWarnSpy.mock.calls]
			.flat()
			.map((value) => String(value))
			.join("\n");

		expect(messages).not.toMatch(/Missing Description|aria-describedby/);

		consoleErrorSpy.mockRestore();
		consoleWarnSpy.mockRestore();
	});

	it("formats the phone number on the guardian detail page", () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) {
			throw new Error("Expected guardian detail route component");
		}

		render(<GuardianDetailPage />);

		expect(screen.getByText("Mia Johnson")).toBeInTheDocument();
		expect(screen.getByText("(512) 555-0111")).toBeInTheDocument();
	});

	it("stacks the add guardian name fields on mobile before splitting them on larger screens", () => {
		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) {
			throw new Error("Expected guardians index route component");
		}

		mockedUseGuardians.mockReturnValue({
			data: [],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		render(<GuardiansPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);

		const firstNameInput = screen.getByLabelText("First Name");
		const nameGrid = firstNameInput.closest(".space-y-2")?.parentElement;
		if (!nameGrid) throw new Error("Expected guardian name grid");

		expect(nameGrid.className).toContain("grid");
		expect(nameGrid.className).toContain("sm:grid-cols-2");
		expect(nameGrid.className).not.toContain("grid-cols-2 gap-4");
	});

	it("shows inline error and keeps edit contact info open when updateGuardian fails", async () => {
		mockedUseUpdateGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Email already in use")),
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Email already in use");
		});
		expect(screen.getByLabelText("Email")).toBeInTheDocument();
	});

	it("shows inline error and keeps link child dialog open when linkGuardian fails", async () => {
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Child already linked")),
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Link to Child" })[0]);
		fireEvent.click(screen.getByRole("button", { name: /Ava Johnson active/i }));
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Child already linked");
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("shows inline error and keeps add guardian dialog open when createGuardian fails on list page", async () => {
		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");

		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn().mockRejectedValue(new Error("Server error")),
			isPending: false,
		} as never);

		render(<GuardiansPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0]);

		fireEvent.change(screen.getByLabelText("First Name"), { target: { value: "Jordan" } });
		fireEvent.change(screen.getByLabelText("Last Name"), { target: { value: "Lee" } });
		const dialog = screen.getByRole("dialog");
		const submitButton = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button")).find(
			(btn) => btn.textContent?.trim() === "Save guardian",
		);
		if (!submitButton) throw new Error("Expected Save guardian submit button in dialog");
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByRole("alert")).toHaveTextContent("Server error");
		});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("renders phone fields with type='tel' and inputMode='tel' for numeric keyboards", () => {
		mockedUseGuardians.mockReturnValue({ data: [], isLoading: false } as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");

		render(<GuardiansPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Add Guardian" })[0] as HTMLElement);

		const addPhone = screen.getByLabelText("Phone") as HTMLInputElement;
		expect(addPhone.type).toBe("tel");
		expect(addPhone.inputMode).toBe("tel");
	});

	it("renders the edit guardian phone field with type='tel' and inputMode='tel'", () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		const editPhone = screen.getByLabelText("Phone") as HTMLInputElement;
		expect(editPhone.type).toBe("tel");
		expect(editPhone.inputMode).toBe("tel");
	});

	it("shows a green completeness dot when guardian has both phone and email", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "g1",
					firstName: "Elena",
					lastName: "Torres",
					email: "elena@example.com",
					phone: "5551234567",
					childIds: [],
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");
		render(<GuardiansPage />);

		expect(screen.getByTestId("completeness-complete")).toBeInTheDocument();
		expect(screen.queryByTestId("completeness-partial")).not.toBeInTheDocument();
		expect(screen.queryByTestId("completeness-none")).not.toBeInTheDocument();
	});

	it("shows an amber completeness dot when guardian has only email and no phone", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "g2",
					firstName: "Carlos",
					lastName: "Vega",
					email: "carlos@example.com",
					phone: null,
					childIds: [],
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");
		render(<GuardiansPage />);

		expect(screen.getByTestId("completeness-partial")).toBeInTheDocument();
		expect(screen.queryByTestId("completeness-complete")).not.toBeInTheDocument();
		expect(screen.queryByTestId("completeness-none")).not.toBeInTheDocument();
	});

	it("shows a gray completeness dot when guardian has neither phone nor email", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "g3",
					firstName: "Sam",
					lastName: "Kim",
					email: null,
					phone: null,
					childIds: [],
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");
		render(<GuardiansPage />);

		expect(screen.getByTestId("completeness-none")).toBeInTheDocument();
		expect(screen.queryByTestId("completeness-complete")).not.toBeInTheDocument();
		expect(screen.queryByTestId("completeness-partial")).not.toBeInTheDocument();
	});

	it("treats whitespace-only phone as absent when computing completeness", () => {
		mockedUseGuardians.mockReturnValue({
			data: [
				{
					id: "g4",
					firstName: "Pat",
					lastName: "Lee",
					email: "pat@example.com",
					phone: "   ",
					childIds: [],
				},
			],
			isLoading: false,
		} as never);
		mockedUseCreateGuardian.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		} as never);

		const GuardiansPage = GuardiansRoute.options.component;
		if (!GuardiansPage) throw new Error("Expected guardians index route component");
		render(<GuardiansPage />);

		// Phone is whitespace-only → treated as absent → partial state
		expect(screen.getByTestId("completeness-partial")).toBeInTheDocument();
		expect(screen.queryByTestId("completeness-complete")).not.toBeInTheDocument();
	});

	it("shows an email validation error when an invalid email is entered and blurred", async () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		const emailInput = screen.getByLabelText("Email");
		fireEvent.change(emailInput, { target: { value: "not-an-email" } });
		fireEvent.blur(emailInput);

		await waitFor(() => {
			expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent(
				"Enter a valid email address.",
			);
		});
	});

	it("disables Save Changes when the email field has a validation error", async () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "bad-email" } });
		fireEvent.blur(screen.getByLabelText("Email"));

		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Save Changes" })).toBeDisabled();
		});
	});

	it("shows a phone validation error for a number with fewer than 10 digits", async () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		// Clear the pre-filled email so email validation passes, only test phone
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });

		const phoneInput = screen.getByLabelText("Phone");
		fireEvent.change(phoneInput, { target: { value: "123" } });
		fireEvent.blur(phoneInput);

		await waitFor(() => {
			expect(
				screen
					.getAllByRole("alert", { hidden: true })
					.some((el) => el.textContent?.includes("Enter a valid phone number")),
			).toBe(true);
		});
	});

	it("accepts a valid phone number with formatting characters and no validation error", async () => {
		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		// Clear email so only phone is tested
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });

		const phoneInput = screen.getByLabelText("Phone");
		fireEvent.change(phoneInput, { target: { value: "+1 (512) 555-0100" } });
		fireEvent.blur(phoneInput);

		// No phone error should appear
		await waitFor(() => {
			const alerts = screen.queryAllByRole("alert", { hidden: true });
			const hasPhoneError = alerts.some((el) =>
				el.textContent?.includes("Enter a valid phone number"),
			);
			expect(hasPhoneError).toBe(false);
		});
	});

	it("prevents save when Save Changes is clicked with invalid fields, touching both", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseUpdateGuardian.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		// Enter an invalid email
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not-valid" } });

		// Click Save — should mark fields as touched and block the mutation
		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(screen.getByRole("alert", { hidden: true })).toHaveTextContent(
				"Enter a valid email address.",
			);
		});
		expect(mutateAsync).not.toHaveBeenCalled();
	});

	it("sends null when clearing email and phone so the stale value is removed", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseUpdateGuardian.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		// Guardian starts with mia@example.com / 5125550111; clearing both must persist as
		// null (omitting them would leave the old contact info in place — silent no-op).
		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "" } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "" } });

		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				email: null,
				phone: null,
			});
		});
	});

	it("sends trimmed replacement values when email and phone are edited", async () => {
		const mutateAsync = vi.fn().mockResolvedValue(undefined);
		mockedUseUpdateGuardian.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) throw new Error("Expected guardian detail route component");

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getByRole("button", { name: "Edit" }));

		fireEvent.change(screen.getByLabelText("Email"), { target: { value: "  new@example.com  " } });
		fireEvent.change(screen.getByLabelText("Phone"), { target: { value: " 5125550999 " } });

		fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				email: "new@example.com",
				phone: "5125550999",
			});
		});
	});

	it("does not grant pickup authorization by default when linking a guardian to a child", async () => {
		const mutateAsync = vi.fn().mockResolvedValue({});
		mockedUseLinkGuardian.mockReturnValue({
			mutateAsync,
			isPending: false,
		} as never);

		const GuardianDetailPage = GuardianDetailRoute.options.component;
		if (!GuardianDetailPage) {
			throw new Error("Expected guardian detail route component");
		}

		render(<GuardianDetailPage />);
		fireEvent.click(screen.getAllByRole("button", { name: "Link to Child" })[0]);
		expect(screen.getByLabelText("Authorized for pickup")).not.toBeChecked();
		fireEvent.click(screen.getByRole("button", { name: /Ava Johnson active/i }));
		fireEvent.click(screen.getByRole("button", { name: "Link" }));

		await waitFor(() => {
			expect(mutateAsync).toHaveBeenCalledWith({
				guardianId: "guardian-1",
				isPrimary: false,
				authorizedPickup: false,
			});
		});
	});
});
