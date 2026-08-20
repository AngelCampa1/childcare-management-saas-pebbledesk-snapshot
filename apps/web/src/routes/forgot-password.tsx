import { createBetterAuthClient } from "@pebbledesk/auth/client";
import { Button } from "@pebbledesk/ui/components/button";
import { Input } from "@pebbledesk/ui/components/input";
import { Label } from "@pebbledesk/ui/components/label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { BrandMark } from "../components/brand-mark";
import { resolveApiBaseUrl } from "../lib/api-origin";
import { extractErrorMessage } from "../lib/extract-error-message";

export const Route = createFileRoute("/forgot-password")({
	component: ForgotPasswordPage,
});

const authClient = createBetterAuthClient(resolveApiBaseUrl(import.meta.env));

export function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const submittingRef = useRef(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (loading) return;
		if (submittingRef.current) return;
		if (!email) {
			setError("Please enter your email address");
			return;
		}
		submittingRef.current = true;
		setError(null);
		setLoading(true);
		try {
			await authClient.requestPasswordReset({
				email,
				redirectTo: "/reset-password",
			});
			setSuccess(true);
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
					<h1 className="text-2xl font-bold text-foreground">Reset your password</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Enter your email and we'll send you a reset link.
					</p>
				</div>

				{success ? (
					<div className="space-y-4">
						<div className="rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
							Check your email for a reset link.
						</div>
						<p className="text-center text-sm text-muted-foreground">
							<Link to="/login" className="font-medium text-primary hover:underline">
								Back to sign in
							</Link>
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4" noValidate>
						<div className="space-y-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								required
								autoComplete="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="you@example.com"
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
							{loading ? "Sending..." : "Send reset link"}
						</Button>

						<p className="text-center text-sm text-muted-foreground">
							<Link to="/login" className="font-medium text-primary hover:underline">
								Back to sign in
							</Link>
						</p>
					</form>
				)}
			</div>
		</div>
	);
}
