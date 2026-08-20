import { render, toPlainText } from "@react-email/render";
import React from "react";
import SignupEmailConfirmation, {
	subject as signupEmailConfirmationSubject,
} from "./templates/signup-email-confirmation.js";
import SubscriptionTrialEndingSoonEmail, {
	subject as subscriptionTrialEndingSoonSubject,
} from "./templates/subscription-trial-ending-soon.js";
import SubscriptionTrialStartedEmail, {
	subject as subscriptionTrialStartedSubject,
} from "./templates/subscription-trial-started.js";

export type { MagnetSlug, MagnetTrack } from "./tracks.js";
export { getTrackForMagnet, MAGNET_TRACKS } from "./tracks.js";

export type TemplateKey = "nurture-0-welcome";

export type SubscriptionEmailTemplateKey =
	| "subscription-trial-started"
	| "subscription-trial-ending-soon";

export interface TemplateVars {
	firstName?: string;
	/** used by API layer for routing/tracking; templates may ignore */
	magnetSlug: string;
	magnetTitle: string;
	downloadUrl?: string;
	unsubscribeUrl: string;
	/** CTA signup URL; templates use the shared default when omitted. */
	signupUrl?: string;
}

interface TemplateModule {
	default: React.ComponentType<TemplateVars>;
	subject: (vars: TemplateVars) => string;
}

export interface SubscriptionEmailVars {
	firstName?: string;
	planLabel: string;
	monthlyPriceLabel: string;
	trialStartedAt: string;
	trialEndsAt: string;
	billingUrl: string;
}

export interface SignupEmailConfirmationVars {
	name?: string;
	verificationUrl: string;
}

interface SubscriptionTemplateModule {
	default: React.ComponentType<SubscriptionEmailVars>;
	subject: (vars: SubscriptionEmailVars) => string;
}

const templateMap: Record<TemplateKey, () => Promise<TemplateModule>> = {
	"nurture-0-welcome": () => import("./templates/nurture-0-welcome.js") as Promise<TemplateModule>,
};

const subscriptionTemplateMap: Record<SubscriptionEmailTemplateKey, SubscriptionTemplateModule> = {
	"subscription-trial-started": {
		default: SubscriptionTrialStartedEmail,
		subject: subscriptionTrialStartedSubject,
	},
	"subscription-trial-ending-soon": {
		default: SubscriptionTrialEndingSoonEmail,
		subject: subscriptionTrialEndingSoonSubject,
	},
};

async function renderEmailContent(
	element: React.ReactElement,
): Promise<{ html: string; text: string }> {
	const html = await render(element);
	return {
		html,
		text: toPlainText(html),
	};
}

export async function renderTemplate(
	key: TemplateKey,
	vars: TemplateVars,
): Promise<{ html: string; text: string; subject: string }> {
	const mod = await templateMap[key]();
	const Component = mod.default;
	const resolvedSubject = mod.subject(vars);

	const element = React.createElement(Component, vars);
	const { html, text } = await renderEmailContent(element);

	return { html, text, subject: resolvedSubject };
}

export async function renderSubscriptionEmail(
	key: SubscriptionEmailTemplateKey,
	vars: SubscriptionEmailVars,
): Promise<{ html: string; text: string; subject: string }> {
	const mod = subscriptionTemplateMap[key];
	const Component = mod.default;
	const resolvedSubject = mod.subject(vars);
	const element = React.createElement(Component, vars);
	const { html, text } = await renderEmailContent(element);

	return { html, text, subject: resolvedSubject };
}

export async function renderSignupEmailConfirmation(
	vars: SignupEmailConfirmationVars,
): Promise<{ html: string; text: string; subject: string }> {
	const element = React.createElement(SignupEmailConfirmation, vars);
	const { html, text } = await renderEmailContent(element);
	return { html, text, subject: signupEmailConfirmationSubject() };
}
