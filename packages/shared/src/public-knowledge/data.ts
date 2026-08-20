import {
	getPromotionalPlanPrice,
	PEBBLEDESK_PROMOTION,
	SUBSCRIPTION_PLAN_CONFIG,
	SUBSCRIPTION_PROMOTIONS,
} from "../constants/billing.js";
import { PEBBLEDESK_OFFERING } from "../constants/offering.js";
import { APP_PAGE_HELP, GUIDES, HELP_TOPICS } from "./app.js";
import type { PublicKnowledgeDocument, PublicMarketingKnowledgeConfig } from "./types.js";

const homePromoPrice = getPromotionalPlanPrice("home");
const starterPromoPrice = getPromotionalPlanPrice("center_starter");
const proPromoPrice = getPromotionalPlanPrice("center_pro");
const groupPromoPrice = getPromotionalPlanPrice("group");
const [monthlyPromotion, annualPromotion] = SUBSCRIPTION_PROMOTIONS;

const appHelpSections = [
	...APP_PAGE_HELP.map((help) => ({
		id: `app-help.${help.id}`,
		heading: help.title,
		body: `${help.what} ${help.first} ${help.watch}`,
	})),
	...GUIDES.map((guide) => ({
		id: `app-guide.${guide.id}`,
		heading: guide.title,
		body: `${guide.description} Steps: ${guide.steps
			.map((step) => `${step.title}: ${step.description}`)
			.join(" ")}`,
	})),
	...HELP_TOPICS.map((topic) => ({
		id: `app-topic.${topic.id}`,
		heading: topic.title,
		body: topic.description,
	})),
];

export const publicKnowledgeCompetitorRegistry = [
	"brightwheel",
	"brightwheel-center-directors",
	"brightwheel-hidden-costs",
	"brightwheel-preschools",
	"brightwheel-small-centers",
	"brightwheel-subsidy-centers",
	"childpilot",
	"childplus",
	"ezcare",
	"famly",
	"icare",
	"illumine",
	"jackrabbit-care",
	"kangarootime",
	"kangarootime-hidden-costs",
	"kindersystems",
	"lifecubby",
	"lillio",
	"lillio-affordable",
	"lillio-at-scale",
	"lillio-hidden-costs",
	"mykidzday",
	"pebbledesk",
	"playground",
	"playground-childcare",
	"procare",
	"procare-church-daycare",
	"procare-for-small-centers",
	"procare-multi-location",
	"procare-small-centers",
	"sandbox",
	"sawyer",
	"smartcare",
	"tadpoles",
	"xplor",
] as const;

export const publicMarketingKnowledgeConfig = {
	product: {
		category: PEBBLEDESK_OFFERING.positioning.productCategory,
		targetAudience: PEBBLEDESK_OFFERING.positioning.targetAudience,
		trustSignals: PEBBLEDESK_OFFERING.positioning.trustSignals,
	},
	competitors: [
		{
			slug: "brightwheel",
			name: "Brightwheel",
			pricing: "Written quote required; payment service fees vary by program and payment method",
			weakness:
				"Agencies cannot pay through the platform directly; public review complaints often mention billing timing and support responsiveness",
		},
		{
			slug: "procare",
			name: "Procare",
			pricing: "Written quote required; cost varies by modules and center size",
			weakness:
				"Enterprise ownership posture; support coverage and cloud sync behavior should be confirmed before signing",
		},
		{
			slug: "lillio",
			name: "Lillio",
			pricing: "Not published",
			weakness:
				"Canada-focused reporting; slow app performance; pricing converges with Procare at scale",
		},
		{
			slug: "playground",
			name: "Playground",
			pricing: "Custom quote",
			weakness: "Smaller team; subsidy reconciliation is not built for licensed CCDF programs",
		},
		{
			slug: "kangarootime",
			name: "Kangarootime",
			pricing: "Written quote required; per-class model should be confirmed",
			weakness: "Ownership and roadmap direction should be confirmed; ratio tracking stays manual",
		},
	],
	faqs: [
		{
			q: "Does PebbleDesk handle my state's subsidy reporting?",
			a: "PebbleDesk enforces state-mandated staff-to-child ratios for Texas, California, and Florida. Generic ratio and licensing workflows are available for all other states. State-specific licensing report formats are available for TX (HHSC 2936), CA (LIC 9040), and FL (DCF CF-FSP 5337).",
		},
		{
			q: "How does ratio tracking work?",
			a: "PebbleDesk tracks staff-to-child ratios from check-ins and room assignments. The goal is to show the gap while the director can still fix the room, not after the licensor writes it down.",
		},
		{
			q: "Can I import data from Brightwheel or Procare?",
			a: "Import from CSV, with column mapping presets for Brightwheel and Procare. Works for child rosters, family contacts, and billing records.",
		},
		{
			q: "What happens if my internet goes down?",
			a: "PebbleDesk is online-only in V1. If your connection drops, keep a paper fallback for temporary attendance notes and enter them once service returns.",
		},
	],
	cta: PEBBLEDESK_OFFERING.ctaDefaults,
	comparison: {
		defaultHref: "/compare/",
	},
} satisfies PublicMarketingKnowledgeConfig;

export const publicKnowledgeDocuments: readonly PublicKnowledgeDocument[] = [
	{
		schemaVersion: 1,
		id: "pebbledesk-public-pricing",
		title: "Public pricing",
		tags: ["pricing", "plans", "trial", "billing", "limited-offer"],
		sections: [
			{
				id: "pricing.default-cadence",
				heading: "Annual billing is the default",
				body: `PebbleDesk publishes flat childcare software pricing with annual billing as the default. The ${SUBSCRIPTION_PLAN_CONFIG.home.label}, ${SUBSCRIPTION_PLAN_CONFIG.center_starter.label}, ${SUBSCRIPTION_PLAN_CONFIG.center_pro.label}, and ${SUBSCRIPTION_PLAN_CONFIG.group.label} plans are self-serve. Larger multi-site rollouts are sales-led and custom-priced.`,
			},
			{
				id: "pricing.published-plans",
				heading: "Published plan labels",
				body: `${SUBSCRIPTION_PLAN_CONFIG.home.label} is ${homePromoPrice.discountedPriceLabel} (${homePromoPrice.discountedAnnualTotalLabel}), ${homePromoPrice.renewalPriceLabel.toLowerCase()}. ${SUBSCRIPTION_PLAN_CONFIG.center_starter.label} is ${starterPromoPrice.discountedPriceLabel} (${starterPromoPrice.discountedAnnualTotalLabel}), ${starterPromoPrice.renewalPriceLabel.toLowerCase()}. ${SUBSCRIPTION_PLAN_CONFIG.center_pro.label} is ${proPromoPrice.discountedPriceLabel} (${proPromoPrice.discountedAnnualTotalLabel}), ${proPromoPrice.renewalPriceLabel.toLowerCase()}. ${SUBSCRIPTION_PLAN_CONFIG.group.label} is ${groupPromoPrice.discountedPriceLabel} (${groupPromoPrice.discountedAnnualTotalLabel}), ${groupPromoPrice.renewalPriceLabel.toLowerCase()}.`,
			},
			{
				id: "pricing.promotion",
				heading: "Limited subscription offer",
				body: `Use ${monthlyPromotion.code} or ${annualPromotion.code}. Get ${PEBBLEDESK_OFFERING.promotion.label}. Home is ${homePromoPrice.discountedPriceLabel}, ${homePromoPrice.renewalPriceLabel.toLowerCase()}. Center Starter is ${starterPromoPrice.discountedPriceLabel}, ${starterPromoPrice.renewalPriceLabel.toLowerCase()}. Center Pro is ${proPromoPrice.discountedPriceLabel}, ${proPromoPrice.renewalPriceLabel.toLowerCase()}. Group is ${groupPromoPrice.discountedPriceLabel}, ${groupPromoPrice.renewalPriceLabel.toLowerCase()}. PebbleDesk offers a ${PEBBLEDESK_OFFERING.claims.trialLabel}.`,
			},
		],
		sourceRefs: [
			{
				id: "site.pricing",
				label: "Pricing page",
				url: "/pricing/",
				kind: "site-page",
			},
			{
				id: "site.signup",
				label: "Signup page",
				url: "/signup/",
				kind: "site-page",
			},
		],
		publicPaths: ["/pricing/", "/signup/"],
		roleVisibility: ["public", "guardian", "staff", "director", "owner"],
		lastReviewed: "2026-05-09",
		botSafeAnswer: `PebbleDesk has flat published pricing with annual billing as the default. Plans start with ${SUBSCRIPTION_PLAN_CONFIG.home.label} at ${homePromoPrice.discountedPriceLabel}, ${homePromoPrice.renewalPriceLabel.toLowerCase()}. Center plans start with ${SUBSCRIPTION_PLAN_CONFIG.center_starter.label} at ${starterPromoPrice.discountedPriceLabel}, ${starterPromoPrice.renewalPriceLabel.toLowerCase()}. Use ${monthlyPromotion.code} or ${PEBBLEDESK_PROMOTION.code}. Get ${PEBBLEDESK_OFFERING.promotion.label}. Larger multi-site rollouts are sales-led and custom-priced, and PebbleDesk offers a ${PEBBLEDESK_OFFERING.claims.trialLabel}.`,
	},
	{
		schemaVersion: 1,
		id: "pebbledesk-records-audit-readiness",
		title: "Records and audit readiness",
		tags: ["audit-readiness", "attendance", "records", "ratios", "subsidy-billing"],
		sections: [
			{
				id: "records.connected-workflow",
				heading: "Connected childcare records",
				body: "PebbleDesk keeps attendance, ratios, family records, subsidy billing context, and reports connected so directors can answer licensing and payment questions without rebuilding records from separate tools.",
			},
			{
				id: "records.operational-scope",
				heading: "Operational scope",
				body: "PebbleDesk supports online childcare administration for licensed centers, family childcare homes, and multi-site operators. V1 focuses on attendance, ratio visibility, child and guardian records, billing workflows, messaging, and report readiness.",
			},
			{
				id: "records.state-support",
				heading: "State support posture",
				body: "PebbleDesk supports generic childcare workflows nationally, with verified state-specific ratio and licensing report support for Texas, California, and Florida. State-specific workflows outside those formats are scoped during rollout.",
			},
		],
		sourceRefs: [
			{
				id: "site.features.audit",
				label: "Audit-ready childcare platform positioning",
				url: "/features/audit-readiness/",
				kind: "site-page",
			},
			{
				id: "site.resources.audit",
				label: "Audit and licensing resources",
				url: "/resources/audit-licensing/",
				kind: "site-page",
			},
		],
		publicPaths: ["/features/audit-readiness/", "/resources/audit-licensing/"],
		roleVisibility: ["public", "staff", "director", "owner"],
		lastReviewed: "2026-05-09",
		botSafeAnswer:
			"PebbleDesk is an audit-ready childcare administration platform for licensed childcare operators. It keeps attendance, ratios, family records, billing context, messaging, and reports connected so center teams can prepare for licensing visits and payment reviews with less manual record chasing.",
	},
	{
		schemaVersion: 1,
		id: "pebbledesk-authenticated-app-help",
		title: "Authenticated app help",
		tags: ["app-help", "guidance", "dashboard", "attendance", "ratios", "billing", "reports"],
		sections: appHelpSections,
		sourceRefs: [
			{
				id: "app.help",
				label: "Authenticated help center",
				url: "/help",
				kind: "app-copy",
			},
			...APP_PAGE_HELP.map((help) => ({
				id: `app.route.${help.id}`,
				label: help.title,
				url: help.route,
				kind: "app-copy" as const,
			})),
		],
		publicPaths: ["/help", ...APP_PAGE_HELP.map((help) => help.route)],
		roleVisibility: ["staff", "director", "owner"],
		lastReviewed: "2026-05-09",
		botSafeAnswer:
			"PebbleDesk app help explains the main authenticated workflows in plain language: start on the dashboard, keep attendance current, watch ratio colors, maintain child and guardian records, use reports for proof, and separate family billing from subsidy cases.",
	},
];
