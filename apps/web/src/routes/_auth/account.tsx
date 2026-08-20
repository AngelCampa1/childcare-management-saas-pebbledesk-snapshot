import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pebbledesk/ui/components/card";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useAuthSession } from "../../hooks/use-auth-session";
import { resolveApiBaseUrl } from "../../lib/api-origin";
import { extractErrorMessage } from "../../lib/extract-error-message";

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));
const PASSWORD_UPDATED_COPY = "Password updated. Other sessions were signed out.";
const PASSWORD_MISMATCH_COPY = "New password and confirmation must match.";

export const Route = createFileRoute("/_auth/account")({
	component: AccountPage,
});

export function AccountPage() {
	const { data: session } = useAuthSession();
	const navigate = useNavigate();
	const accountEmail = session?.user.email ?? "";
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmNewPassword, setConfirmNewPassword] = useState("");
	const [deletePassword, setDeletePassword] = useState("");
	const [deleteConfirmation, setDeleteConfirmation] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setError(null);

		if (newPassword !== confirmNewPassword) {
			setError(PASSWORD_MISMATCH_COPY);
			return;
		}

		setIsSubmitting(true);
		try {
			const result = await authClient.changePassword({
				currentPassword,
				newPassword,
				revokeOtherSessions: true,
			});

			if (result.error) {
				setError(result.error.message ?? "Could not update password.");
				return;
			}

			setCurrentPassword("");
			setNewPassword("");
			setConfirmNewPassword("");
			setStatus(PASSWORD_UPDATED_COPY);
		} catch (caught) {
			setError(extractErrorMessage(caught, "Could not update password."));
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleAccountDeletion(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus(null);
		setDeleteError(null);

		if (deleteConfirmation !== "DELETE") {
			setDeleteError("Type DELETE to confirm account deletion.");
			return;
		}

		setIsDeleting(true);
		try {
			const result =
				deletePassword.length > 0
					? await authClient.deleteUser({ password: deletePassword })
					: await authClient.deleteUser();

			if (result.error) {
				setDeleteError(result.error.message ?? "Could not delete account.");
				return;
			}

			await navigate({ to: "/login", replace: true });
		} catch (caught) {
			setDeleteError(extractErrorMessage(caught, "Could not delete account."));
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Account</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Manage your sign-in credentials and account support requests.
					</p>
				</div>
				<div className="rounded-full bg-primary/10 p-2 text-primary">
					<ShieldCheck className="h-5 w-5" aria-hidden="true" />
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
				<Card>
					<CardHeader>
						<CardTitle role="heading" aria-level={2}>
							Identity
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Name
							</p>
							<p className="mt-1 text-sm font-medium text-foreground">
								{session?.user.name ?? "Signed-in user"}
							</p>
						</div>
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Email
							</p>
							<p className="mt-1 text-sm text-foreground">
								{session?.user.email ?? "Email unavailable"}
							</p>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle role="heading" aria-level={2}>
							Account deletion
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<form className="space-y-3" onSubmit={handleAccountDeletion}>
							<input
								type="text"
								name="username"
								autoComplete="username"
								value={accountEmail}
								readOnly
								tabIndex={-1}
								aria-hidden="true"
								className="sr-only"
							/>
							<p className="text-sm text-muted-foreground">
								Permanently delete your login and revoke sessions. Leave all centers before deleting
								your account so center records stay intact.
							</p>
							<div className="space-y-2">
								<Label htmlFor="delete-password">Password</Label>
								<Input
									id="delete-password"
									type="password"
									autoComplete="current-password"
									placeholder="Required for password accounts"
									value={deletePassword}
									onChange={(event) => setDeletePassword(event.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="delete-confirmation">Type DELETE to confirm</Label>
								<Input
									id="delete-confirmation"
									autoComplete="off"
									value={deleteConfirmation}
									onChange={(event) => setDeleteConfirmation(event.target.value)}
								/>
							</div>
							<Button type="submit" variant="destructive" disabled={isDeleting}>
								{isDeleting ? "Deleting..." : "Delete account"}
							</Button>
							{deleteError ? (
								<p role="alert" className="text-sm text-destructive">
									{deleteError}
								</p>
							) : null}
						</form>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle role="heading" aria-level={2}>
						Password
					</CardTitle>
				</CardHeader>
				<CardContent>
					<form className="max-w-md space-y-4" onSubmit={handlePasswordChange}>
						<input
							type="text"
							name="username"
							autoComplete="username"
							value={accountEmail}
							readOnly
							tabIndex={-1}
							aria-hidden="true"
							className="sr-only"
						/>
						<p className="text-sm text-muted-foreground">
							Use this form for email and password sign-ins. If you only sign in with Google,
							contact support to add a password sign-in method.
						</p>
						<div className="space-y-2">
							<Label htmlFor="current-password">Current password</Label>
							<Input
								id="current-password"
								type="password"
								autoComplete="current-password"
								value={currentPassword}
								onChange={(event) => setCurrentPassword(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="new-password">New password</Label>
							<Input
								id="new-password"
								type="password"
								autoComplete="new-password"
								value={newPassword}
								onChange={(event) => setNewPassword(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="confirm-new-password">Confirm new password</Label>
							<Input
								id="confirm-new-password"
								type="password"
								autoComplete="new-password"
								value={confirmNewPassword}
								onChange={(event) => setConfirmNewPassword(event.target.value)}
								required
							/>
						</div>
						{error ? (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						) : null}
						{status ? (
							<p role="status" className="text-sm text-success">
								{status}
							</p>
						) : null}
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Updating..." : "Update password"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
