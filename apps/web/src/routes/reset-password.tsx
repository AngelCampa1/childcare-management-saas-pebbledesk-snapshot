import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { BrandMark } from "../components/brand-mark";
import { PasswordStrengthMeter } from "../components/password-strength-meter";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { extractErrorMessage } from "../lib/extract-error-message";
import { toast } from "../lib/toast";
import { zxcvbn } from "../lib/zxcvbn-init";

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		token: typeof search.token === "string" ? search.token : undefined,
	}),
	component: ResetPasswordPage,
});

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));

const MIN_PASSWORD_STRENGTH = 2;

export function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const submittingRef = useRef(false);

	if (!token) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
				<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm text-center">
					<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
					<h1 className="text-2xl font-bold text-foreground">Invalid reset link</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						This password reset link is invalid or has expired.
					</p>
					<div className="mt-6">
						<Link
							to="/forgot-password"
							className="font-medium text-primary hover:underline text-sm"
						>
							Request a new reset link
						</Link>
					</div>
				</div>
			</div>
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (loading) return;
		if (submittingRef.current) return;
		if (!newPassword) {
			setError("Please enter a new password");
			return;
		}
		if (newPassword.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}
		if (zxcvbn(newPassword).score < MIN_PASSWORD_STRENGTH) {
			setError("Pick a stronger password");
			return;
		}
		if (newPassword !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		submittingRef.current = true;
		setError(null);
		setLoading(true);
		try {
			await authClient.resetPassword({
				newPassword,
				token,
			});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["authStatus"] }),
				queryClient.invalidateQueries({ queryKey: ["authSession"] }),
			]);
			toast.success("Password reset. Please sign in with your new password.");
			await navigate({ to: "/login" }).catch(() => {
				setError("Could not redirect. Please go to login manually.");
			});
		} catch (err) {
			setError(extractErrorMessage(err, "An error occurred. Please try again."));
		} finally {
			setLoading(false);
			submittingRef.current = false;
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
			<div className="w-full max-w-md rounded-xl border border-border bg-background p-8 shadow-sm">
				<div className="mb-8 text-center">
					<BrandMark className="mb-6 justify-center" wordmarkClassName="text-foreground" />
					<h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Choose a strong password for your account.
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="new-password">New password</Label>
						<Input
							id="new-password"
							type="password"
							required
							autoComplete="new-password"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							placeholder="At least 8 characters"
							disabled={loading}
						/>
						<PasswordStrengthMeter password={newPassword} />
					</div>

					<div className="space-y-2">
						<Label htmlFor="confirm-password">Confirm password</Label>
						<Input
							id="confirm-password"
							type="password"
							required
							autoComplete="new-password"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							placeholder="Repeat your new password"
							disabled={loading}
						/>
					</div>

					{error && (
						<p
							role="alert"
							aria-live="polite"
							className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive"
						>
							{error}
						</p>
					)}

					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Resetting..." : "Reset password"}
					</Button>

					<p className="text-center text-sm text-muted-foreground">
						<Link to="/login" className="font-medium text-primary hover:underline">
							Back to sign in
						</Link>
					</p>
				</form>
			</div>
		</div>
	);
}
