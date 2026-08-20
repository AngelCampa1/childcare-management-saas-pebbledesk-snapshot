import { formatCurrency } from "@pebbledesk/shared";
import { Badge } from "@pebbledesk/ui/components/badge";
import { Button } from "@pebbledesk/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@pebbledesk/ui/components/card";
import { Skeleton } from "@pebbledesk/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api";

type PublicPaymentErrorKind = "already_paid" | "invalid_link";

interface PublicPaymentSession {
	invoice: {
		id: string;
		amountDue: number;
		status: string;
		periodStart: string;
		periodEnd: string;
	};
	center?: {
		name?: string;
	};
	guardian?: {
		firstName?: string;
		lastName?: string;
	};
	clientSecret: string;
	paymentIntentId: string;
	stripePublishableKey: string;
}

type StripeCardElement = {
	mount: (element: HTMLElement) => void;
	unmount: () => void;
};

type StripeElements = {
	create: (type: "card") => StripeCardElement;
};

type StripeConfirmationResult = {
	error?: {
		message?: string;
	};
	paymentIntent?: {
		status?: string;
	};
};

type StripeClient = {
	elements: () => StripeElements;
	confirmCardPayment: (
		clientSecret: string,
		data: {
			payment_method: {
				card: StripeCardElement;
			};
		},
	) => Promise<StripeConfirmationResult>;
};

type StripeFactory = (publishableKey: string) => StripeClient;

declare global {
	interface Window {
		Stripe?: StripeFactory;
	}
}

let stripeJsLoadPromise: Promise<StripeFactory> | null = null;

export const Route = createFileRoute("/pay/$token")({
	component: PayPage,
});

function createPaymentError(kind: PublicPaymentErrorKind) {
	const message =
		kind === "already_paid"
			? "This invoice has already been paid."
			: "This payment link is invalid or has expired.";

	return Object.assign(new Error(message), { kind });
}

function getPaymentErrorKind(error: unknown): PublicPaymentErrorKind | null {
	if (typeof error !== "object" || error === null || !("kind" in error)) {
		return null;
	}

	const kind = (error as { kind?: unknown }).kind;
	if (kind === "already_paid" || kind === "invalid_link") {
		return kind;
	}

	return null;
}

function hasSignedPublicInvoiceTokenShape(token: string) {
	const [encodedPayload, signature, extra] = token.split(".");
	return Boolean(encodedPayload && signature && !extra);
}

async function fetchPublicPaymentSession(token: string) {
	const res = await apiFetch(`/api/public/invoices/${encodeURIComponent(token)}/payment-intent`, {
		credentials: "omit",
		method: "POST",
	});

	if (res.status === 404) {
		throw createPaymentError("invalid_link");
	}

	if (res.status === 410) {
		throw createPaymentError("already_paid");
	}

	if (!res.ok) {
		throw new Error("Unable to start checkout");
	}

	return (await res.json()) as PublicPaymentSession;
}

async function loadStripeJs(signal?: AbortSignal): Promise<StripeFactory> {
	if (typeof window === "undefined") {
		throw new Error("Stripe.js is not available during server rendering");
	}

	if (signal?.aborted) {
		throw new DOMException("Stripe load aborted", "AbortError");
	}

	if (window.Stripe) {
		return window.Stripe;
	}

	if (!stripeJsLoadPromise) {
		stripeJsLoadPromise = new Promise<StripeFactory>((resolve, reject) => {
			const rejectAndReset = (message: string, script?: HTMLScriptElement | null) => {
				stripeJsLoadPromise = null;
				script?.remove();
				reject(new Error(message));
			};
			const existingScript = document.querySelector<HTMLScriptElement>("script[data-stripe-js]");
			if (existingScript) {
				existingScript.addEventListener("load", () => {
					if (window.Stripe) {
						resolve(window.Stripe);
						return;
					}
					rejectAndReset("Stripe.js loaded without a Stripe factory", existingScript);
				});
				existingScript.addEventListener("error", () => {
					rejectAndReset("Unable to load Stripe.js", existingScript);
				});
				return;
			}

			const script = document.createElement("script");
			script.src = "https://js.stripe.com/v3/";
			script.async = true;
			script.dataset.stripeJs = "true";
			script.onload = () => {
				if (window.Stripe) {
					resolve(window.Stripe);
					return;
				}
				rejectAndReset("Stripe.js loaded without a Stripe factory", script);
			};
			script.onerror = () => {
				rejectAndReset("Unable to load Stripe.js", script);
			};
			document.head.appendChild(script);
		});
	}

	if (signal) {
		return Promise.race([
			stripeJsLoadPromise,
			new Promise<never>((_, reject) => {
				signal.addEventListener("abort", () => {
					stripeJsLoadPromise = null;
					reject(new DOMException("Stripe load aborted", "AbortError"));
				});
			}),
		]);
	}

	return stripeJsLoadPromise;
}

export function PayPage() {
	const { token } = Route.useParams();
	const hasValidTokenShape = hasSignedPublicInvoiceTokenShape(token);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const mountedCardRef = useRef<StripeCardElement | null>(null);
	const [stripe, setStripe] = useState<StripeClient | null>(null);
	const [checkoutError, setCheckoutError] = useState<string | null>(null);
	const [paymentState, setPaymentState] = useState<"idle" | "processing" | "succeeded">("idle");
	const [submissionErrorKind, setSubmissionErrorKind] = useState<PublicPaymentErrorKind | null>(
		null,
	);

	const publicPayment = useQuery({
		queryKey: ["publicPaymentSession", token],
		enabled: hasValidTokenShape,
		refetchOnMount: false,
		refetchOnReconnect: false,
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		queryFn: () => fetchPublicPaymentSession(token),
	});

	const paymentErrorKind =
		submissionErrorKind ??
		(hasValidTokenShape ? getPaymentErrorKind(publicPayment.error) : "invalid_link");
	const paymentSession = publicPayment.data;
	const stripePublishableKey = paymentSession?.stripePublishableKey;

	useEffect(() => {
		const controller = new AbortController();

		async function setupStripe() {
			if (
				!stripePublishableKey ||
				paymentErrorKind ||
				!cardRef.current ||
				paymentState === "succeeded"
			) {
				return;
			}

			try {
				const stripeFactory = await loadStripeJs(controller.signal);
				if (controller.signal.aborted || !cardRef.current) {
					return;
				}

				const stripeClient = stripeFactory(stripePublishableKey);
				const cardElement = stripeClient.elements().create("card");
				cardElement.mount(cardRef.current);
				mountedCardRef.current = cardElement;
				setStripe(stripeClient);
			} catch {
				if (!controller.signal.aborted) {
					setCheckoutError("Unable to load the secure payment form.");
				}
			}
		}

		void setupStripe();

		return () => {
			controller.abort();
			mountedCardRef.current?.unmount();
			mountedCardRef.current = null;
		};
	}, [paymentErrorKind, stripePublishableKey, paymentState]);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!stripe || !mountedCardRef.current || !paymentSession || paymentState === "processing") {
			return;
		}

		setCheckoutError(null);
		setSubmissionErrorKind(null);
		setPaymentState("processing");

		try {
			const latestSession = await fetchPublicPaymentSession(token);

			if (latestSession.invoice.status === "paid") {
				setPaymentState("idle");
				setSubmissionErrorKind("already_paid");
				return;
			}

			const result = await stripe.confirmCardPayment(latestSession.clientSecret, {
				payment_method: {
					card: mountedCardRef.current,
				},
			});

			if (result.error || result.paymentIntent?.status !== "succeeded") {
				setPaymentState("idle");
				setCheckoutError(result.error?.message ?? "Unable to complete payment.");
				return;
			}

			setPaymentState("succeeded");
		} catch (error) {
			setPaymentState("idle");
			const errorKind = getPaymentErrorKind(error);
			if (errorKind) {
				setSubmissionErrorKind(errorKind);
				return;
			}
			setCheckoutError("Unable to complete payment.");
		}
	}

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
			<div className="w-full space-y-6">
				<div className="space-y-2 text-center">
					<Badge variant="secondary" className="bg-success/10 text-success-foreground">
						<ShieldCheck className="mr-1 h-3.5 w-3.5" />
						Secure payment link
					</Badge>
					<h1 className="text-3xl font-bold tracking-tight text-foreground">Pay your invoice</h1>
					<p className="text-sm text-muted-foreground">
						Review the balance and complete payment for your family&apos;s invoice.
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Payment details</CardTitle>
						<CardDescription>
							Use this public link to review your balance before entering payment details.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{publicPayment.isLoading ? (
							<div className="space-y-3">
								<Skeleton className="h-4 w-2/3" />
								<Skeleton className="h-4 w-1/2" />
								<Skeleton className="h-20 w-full" />
							</div>
						) : paymentErrorKind === "already_paid" ? (
							<p className="rounded-lg border border-dashed border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
								This invoice has already been paid.
							</p>
						) : paymentErrorKind === "invalid_link" || publicPayment.isError ? (
							<p className="rounded-lg border border-dashed border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
								This payment link is invalid or has expired.
							</p>
						) : !paymentSession ? (
							<p className="rounded-lg border border-dashed border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
								This payment link is invalid or has expired.
							</p>
						) : paymentState === "succeeded" ? (
							<div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-foreground">
								Payment complete. Thank you.
							</div>
						) : (
							<form className="space-y-4" onSubmit={handleSubmit}>
								<div className="grid gap-4 sm:grid-cols-2">
									<InvoiceDetail
										label="Center"
										value={paymentSession.center?.name ?? "PebbleDesk Center"}
									/>
									<InvoiceDetail
										label="Guardian"
										value={
											`${paymentSession.guardian?.firstName ?? ""} ${paymentSession.guardian?.lastName ?? ""}`.trim() ||
											"Family account"
										}
									/>
									<InvoiceDetail label="Invoice" value={paymentSession.invoice.id} />
									<InvoiceDetail
										label="Amount due"
										value={formatCurrency(paymentSession.invoice.amountDue)}
									/>
								</div>

								<div className="space-y-2">
									<p className="text-xs uppercase tracking-wide text-muted-foreground">
										Card details
									</p>
									<div
										ref={cardRef}
										className="min-h-14 rounded-lg border border-border bg-background px-4 py-3"
									/>
								</div>

								{checkoutError ? (
									<p className="rounded-lg border border-dashed border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
										{checkoutError}
									</p>
								) : null}

								<Button
									className="w-full"
									type="submit"
									disabled={!stripe || paymentState === "processing"}
								>
									{paymentState === "processing"
										? "Processing..."
										: `Pay ${formatCurrency(paymentSession.invoice.amountDue)}`}
								</Button>
							</form>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

function InvoiceDetail({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-border bg-muted p-4">
			<p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
			<p className="mt-1 text-sm font-medium text-foreground">{value}</p>
		</div>
	);
}
