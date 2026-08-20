import { getProductLoginUrl, getProductSignupUrl, type SiteConfig } from "@pebbledesk/marketing";
import {
	buildPricingTiers,
	formatAnnualSavingsLabel,
	formatPricingFaqAnswer,
	formatTrialEndReminderLabel,
	getPromotionalPlanPrice,
	getPromotionalPriceLabel,
	PEBBLEDESK_OFFERING,
	SUBSCRIPTION_PROMOTIONS,
} from "@pebbledesk/shared/constants";
import {
	PUBLIC_BRAND_KNOWLEDGE,
	publicMarketingKnowledgeConfig,
} from "@pebbledesk/shared/public-knowledge/marketing";

const { trial, guarantee, promotion, positioning } = PEBBLEDESK_OFFERING;
const homeAnnualPromo = getPromotionalPlanPrice("home");
const starterAnnualPromo = getPromotionalPlanPrice("center_starter");
const limitedOfferCodes = SUBSCRIPTION_PROMOTIONS.map((item) => item.code).join(" and ");
const limitedOfferLabel = `${promotion.urgencyLabel}: ${promotion.code} gives ${promotion.label}. ${homeAnnualPromo.renewalPriceLabel}.`;
const trialEndReminderLabel = formatTrialEndReminderLabel();
const trialDisclosure = `${trial.label}. No credit card required. ${trialEndReminderLabel} ${guarantee.label} after your first paid charge.`;

export const siteConfig = {
	name: PUBLIC_BRAND_KNOWLEDGE.name,
	domain: new URL(PUBLIC_BRAND_KNOWLEDGE.publicOrigin).hostname,
	defaultOgImage: "/og-default.png",
	preserveMetaTagCopy: true,
	metaDescription:
		"PebbleDesk helps childcare directors keep attendance, ratio checks, and subsidy records audit-ready without rebuilding the week before licensing visits.",
	contactEmail: PUBLIC_BRAND_KNOWLEDGE.supportEmail,
	areaServed: "United States",
	tagline: positioning.tagline,
	author: {
		name: "Angel Campa",
		url: "/about/",
		jobTitle: "Founder",
		sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
	},

	logo: {
		light: "/logo-light.svg",
		dark: "/logo-dark.svg",
	},

	promoBanner: {
		code: promotion.code,
		label: promotion.label,
		renewalLabel: homeAnnualPromo.renewalPriceLabel,
		validThrough: promotion.validThrough,
		urgencyLabel: promotion.urgencyLabel,
		ctaHref: "/pricing/",
		ctaLabel: "View pricing",
	},

	theme: {
		primary: "#4f6b5f",
		accent: "#c97b63",
		surface: "#f6efe6",
		text: "#22312d",
		muted: "#61716a",
		fonts: {
			heading: "Manrope",
			body: "Manrope",
			mono: "IBM Plex Mono",
		},
	},

	product: {
		category: positioning.productCategory,
		price: `Plans start at ${getPromotionalPriceLabel("home")}, ${homeAnnualPromo.renewalPriceLabel.toLowerCase()}. Center plans start at ${getPromotionalPriceLabel("center_starter")}, ${starterAnnualPromo.renewalPriceLabel.toLowerCase()}. ${limitedOfferCodes} give ${promotion.label} on eligible subscriptions.`,
		targetAudience: positioning.targetAudience,
		trustSignals: positioning.trustSignals,
	},

	competitors: publicMarketingKnowledgeConfig.competitors,

	funnel: {
		tofu: PEBBLEDESK_OFFERING.ctaDefaults.tofu,
		mofu: PEBBLEDESK_OFFERING.ctaDefaults.mofu,
		bofu: {
			ctaMode: "convert",
			ctaText: `Start ${trial.label}`,
			ctaTarget: `${getProductSignupUrl()}?plan=center_starter&source=%2F`,
		},
		ctaSubtitle: trialDisclosure,
	},

	survey: {
		questions: [
			{
				id: "role",
				text: "Which role fits you best?",
				options: [
					"Center director",
					"Owner/operator",
					"Assistant director",
					"Administrator",
					"Other",
				],
			},
			{
				id: "center_size",
				text: "How many children does your program serve?",
				options: [
					"1-15 children",
					"16-50 children",
					"51-100 children",
					"100+ children",
					"Planning a new center",
				],
			},
			{
				id: "pain",
				text: "What is the job you need to fix first?",
				options: [
					"Subsidy reconciliation",
					"Ratio tracking",
					"Audit prep and reporting",
					"Staff scheduling",
				],
			},
		],
		qualification: {
			logic: "all",
			rules: [
				{
					questionId: "role",
					answers: ["Center director", "Owner/operator", "Assistant director", "Administrator"],
				},
				{
					questionId: "center_size",
					answers: ["1-15 children", "16-50 children", "51-100 children", "100+ children"],
				},
				{
					questionId: "pain",
					answers: ["Subsidy reconciliation", "Ratio tracking", "Audit prep and reporting"],
				},
			],
		},
	},

	faqs: [
		...publicMarketingKnowledgeConfig.faqs,
		{
			q: "How does PebbleDesk pricing work?",
			a: formatPricingFaqAnswer(),
		},
		{
			q: "Is there a contract or commitment?",
			a: "No long-term contract is required. Choose annual or monthly billing and cancel any time.",
		},
		{
			q: "What happens after I create an account?",
			a: `You create your account in the PebbleDesk product app, choose the plan that fits your program, start the ${trial.label} with no credit card required, and continue into center setup. PebbleDesk emails you when the trial starts. ${trialEndReminderLabel} Add a payment method any time before the trial ends to continue without interruption. If your team wants help mapping migration, subsidy, or rollout steps first, you can also book the optional 15-minute setup walkthrough.`,
		},
		{
			q: "Do you support every state and operate offline?",
			a: "PebbleDesk is online-only in V1. We support generic attendance, records, billing, messaging, and ratio workflows nationally, with verified state-specific ratio and licensing report support today for Texas, California, and Florida. If you need a state-specific workflow outside those formats, we scope it during rollout instead of claiming parity we have not verified.",
		},
		{
			q: "How does rollout work for an existing center or multi-site group?",
			a: "Single-site centers and Group buyers can start self-serve, import CSV data, and use Brightwheel or Procare migration presets to get the first roster loaded quickly. Larger multi-site rollouts are sales-led, with center setup, migration sequencing, and cross-center reporting mapped during implementation.",
		},
		{
			q: "Why are so many childcare providers leaving the subsidy system?",
			a: "Federal data from the ACF Office of Child Care shows provider participation in the CCDF subsidy program fell from 475,394 in 2006 to 225,204 in 2022. The main drag is admin burden: attendance tracking, billing reconciliation, portal rules, and documentation retention. PebbleDesk is built to cut that paperwork load, not add another place to manage it.",
		},
		{
			q: "How much revenue do centers lose without billing automation?",
			a: "Pie for Providers estimates that providers miss more than 8% of annual subsidy revenue to billing errors without automation. For example, a center with $200,000 in annual subsidy revenue could lose about $16,000 a year to missed claims and documentation mistakes.",
		},
		{
			q: "How long does it take to receive subsidy reimbursements?",
			a: "Most states pay subsidies after care is delivered, and reimbursement can take up to 60 days. PebbleDesk tracks what was billed, what is still outstanding, and which records support the claim.",
		},
		{
			q: "What is the national improper payment rate for CCDF subsidies?",
			a: "Federal CCDF improper payment data shows the national rate was 3.55% in 2023. Missing or incomplete documentation still drives a large share of those errors, which is why PebbleDesk keeps attendance, ratios, and claim support in one record.",
		},
	],

	discoveryCallUrl: "https://cal.com/pebbledesk/discovery",
	discoveryCallIncentive:
		"Need help mapping migration, subsidy, or multi-center rollout workflows? Book a 15-minute setup walkthrough.",

	problemAgitation: positioning.problemAgitation,

	leadMagnet: {
		title: "Daycare Licensing Compliance Checklist",
		description:
			"State-by-state licensing requirements, staff-to-child ratios, and the documentation you need ready before your next inspection.",
		slug: "licensing-compliance-checklist",
		ctaText: "Send me the checklist",
	},

	referral: {
		enabled: true,
		rewards: [
			{ threshold: 3, description: "Get 7 extra days on your free trial" },
			{
				threshold: 10,
				description: "Get 30 extra days on your free trial",
			},
		],
	},

	heroBenefits: positioning.heroBenefits,
	heroTrustSignal: positioning.heroTrustSignal,
	heroCopy: {
		headline: positioning.hero.headline,
		subheadline: positioning.hero.subheadline,
	},

	copy: {
		emailCapture: {
			subtitle: `Pick a plan to see pricing details and next steps. No credit card required for the ${trial.label}. ${trialEndReminderLabel}`,
			whatHappensNext: `Create your account first. We email you when your ${trial.label} starts. ${trialEndReminderLabel} If your center needs extra help, you can book a 15-minute setup walkthrough.`,
			surveyPreview: "Three short questions help us tailor setup guidance.",
		},
		survey: {
			qualifiedHeading: `You look like a fit for ${PEBBLEDESK_OFFERING.plans[0].label}, ${PEBBLEDESK_OFFERING.plans[1].label}, or ${PEBBLEDESK_OFFERING.plans[2].label}.`,
			qualifiedBody:
				"Create your account in PebbleDesk and continue into setup for the plan that fits your program. If you need help first, book the optional 15-minute setup walkthrough.",
			qualifiedCtaText: "Create account",
			qualifiedDismissText: "Close",
			unqualifiedHeading: "You are on the list.",
			unqualifiedBody:
				"We will send rollout updates and point you to the right comparison pages while we expand support.",
			unqualifiedCtaText: "Compare childcare software",
			unqualifiedCtaTarget: "/compare/",
			unqualifiedDismissText: "Close",
		},
		funnelCta: {
			subtitle: trialDisclosure,
			benefitBullets: [
				`${PEBBLEDESK_OFFERING.plans[1].label} from ${getPromotionalPriceLabel("center_starter")}`,
				limitedOfferLabel,
				"Migration presets for Brightwheel, Procare, and CSV cleanup",
				"No setup fee on self-serve plans",
			],
			secondaryCta: {
				text: "Compare PebbleDesk",
				target: "/pricing/",
			},
		},
		exitPopup: {
			headline: "Before you go, grab the licensing checklist",
			description:
				"State-by-state licensing requirements, staff-to-child ratios, and the documentation you need ready before your next inspection.",
			ctaText: "Send me the checklist",
			leftPanelLabel: "FREE RESOURCE",
			successSubMessage: "We will send the PDF to your inbox.",
			declineText: "No thanks",
			privacyNote: "We will email the checklist you requested.",
		},
	},

	pricingConfig: {
		trialBannerText: `Start your ${trial.label}. ${limitedOfferLabel}. ${guarantee.label}. No credit card required. ${trialEndReminderLabel}`,
		annualSavingsText: formatAnnualSavingsLabel(),
		monthlyToggleLabel: "Monthly",
		annualToggleLabel: "Annual",
	},

	pricingTiers: buildPricingTiers(),

	nav: {
		signInHref: getProductLoginUrl(),
		ctaText: "Start free trial",
		items: [
			{
				label: "Product",
				megaMenu: [
					{
						heading: "Features",
						links: [
							{ label: "Features", href: "/features/" },
							{ label: "Ratio Tracking", href: "/features/ratio-tracking/" },
							{ label: "Subsidy Billing", href: "/features/subsidy-billing/" },
						],
						viewAllHref: "/features/",
						viewAllText: "See product features ->",
					},
					{
						heading: "Who it's for",
						links: [
							{ label: "Center Directors", href: "/for/childcare-center-directors/" },
							{ label: "In-Home Providers", href: "/for/in-home-daycare-providers/" },
							{ label: "Multi-Site Operators", href: "/for/multi-site-childcare-operators/" },
						],
						viewAllHref: "/for/",
						viewAllText: "See who PebbleDesk helps ->",
					},
				],
			},
			{ label: "Pricing", href: "/pricing/" },
			{
				label: "Resources",
				megaMenu: [
					{
						heading: "Compliance",
						links: [
							{ label: "Audit & Licensing", href: "/resources/audit-licensing/" },
							{ label: "Attendance & Ratios", href: "/resources/attendance-ratios/" },
							{ label: "State & Local", href: "/resources/state-local/" },
						],
						viewAllText: "All resource hubs ->",
					},
					{
						heading: "Compare & plan",
						links: [
							{ label: "Subsidy & Billing", href: "/resources/subsidy-billing/" },
							{ label: "Compare & Pricing", href: "/resources/compare-pricing/" },
							{ label: "Compare Software", href: "/compare/" },
							{ label: "Free Tools", href: "/resources/free-tools/" },
						],
						viewAllText: "All resource hubs ->",
					},
					{
						heading: "Operations",
						links: [
							{ label: "Staff & Operations", href: "/resources/staff-operations/" },
							{ label: "Software Buying", href: "/resources/software-buying/" },
						],
						viewAllText: "All resource hubs ->",
					},
				],
			},
			{ label: "About", href: "/about/" },
		],
	},

	footer: {
		linkGroups: [
			{
				heading: "Product",
				links: [
					{ label: "Features", href: "/features/" },
					{ label: "Ratio Tracking", href: "/features/ratio-tracking/" },
					{ label: "Subsidy Billing", href: "/features/subsidy-billing/" },
					{ label: "Pricing", href: "/pricing/" },
				],
			},
			{
				heading: "Resources",
				links: [
					{
						label: "Guides",
						href: "/resources/guides/how-to-choose-childcare-management-software/",
					},
					{
						label: "Best Lists",
						href: "/resources/best/best-childcare-software-small-centers/",
					},
					{ label: "Compare Software", href: "/compare/" },
					{ label: "Compare Pricing", href: "/resources/compare-pricing/" },
					{
						label: "State Compliance",
						href: "/childcare-software/texas/",
					},
					{
						label: "Free Licensing Checklist",
						href: "/free/licensing-compliance-checklist/",
					},
				],
			},
			{
				heading: "About",
				links: [
					{ label: "About PebbleDesk", href: "/about/" },
					{ label: "Who PebbleDesk is for", href: "/for/" },
					{ label: "Center Directors", href: "/for/childcare-center-directors/" },
					{ label: "In-Home Providers", href: "/for/in-home-daycare-providers/" },
					{ label: "Multi-Site Operators", href: "/for/multi-site-childcare-operators/" },
				],
			},
		],
		legalLinks: [
			{ label: "Privacy Policy", href: "/privacy/" },
			{ label: "Terms of Service", href: "/terms/" },
		],
		emailCapture: {
			heading: "See if PebbleDesk fits your center",
		},
	},
} satisfies SiteConfig;
