export { EmailCapture } from "./components/email-capture";
export { ExitIntentPopup } from "./components/exit-intent-popup";
export { FakeDoorPricing } from "./components/fake-door-pricing";
export { FilterChips } from "./components/filter-chips";
export {
	MarketingIslandErrorBoundary,
	MarketingIslandFallbackCta,
	withMarketingIslandErrorBoundary,
} from "./components/marketing-island-error-boundary";
export { PostSignupSurvey } from "./components/post-signup-survey";
export { PricingCards } from "./components/pricing-cards";
export { ReferralShare } from "./components/referral-share";
export { SearchOverlay } from "./components/search-overlay";
export { ThemeToggle } from "./components/theme-toggle";
export type { CityPageEntry, GoalPageEntry, PhasePageEntry } from "./content/schemas";
export { cityPageSchema, goalPageSchema, phasePageSchema } from "./content/schemas";
export type { PostHogInstance } from "./lib/analytics";
export {
	identifyUser,
	resolvePostHogConfig,
	sanitizeAnalyticsProperties,
	trackEvent,
} from "./lib/analytics";
export {
	formatNumber,
	mapToContentItems,
	resolveCanonicalUrl,
	sortByUpdatedAtDesc,
	sumCategoryCounts,
} from "./lib/collections";
export type { StageBadge } from "./lib/content-helpers";
export {
	filterMetadata,
	formatContentDate,
	STAGE_BADGES,
} from "./lib/content-helpers";
export {
	formatArticleDate,
	getCurrentYear,
	normalizeDateInput,
} from "./lib/dates";
export { resolveFaqHeading } from "./lib/faq-utils";
export {
	buildFontCssOverrides,
	buildGoogleFontsUrl,
	DEFAULT_FONTS,
} from "./lib/fonts";
export type { FooterEmailCaptureProps } from "./lib/footer-utils";
export { buildFooterEmailCaptureProps } from "./lib/footer-utils";
export type { TocHeading } from "./lib/headings";
export { filterTocHeadings, shouldShowToc } from "./lib/headings";
export {
	CheckIcon,
	CheckIconHidden,
	ChevronRightIcon,
	CrossIcon,
	CrossIconHidden,
	MinusIcon,
	PlusIcon,
} from "./lib/icons";
export { resolveInlineSignupKicker } from "./lib/inline-signup-utils";
export { resolveMarketingApiUrl } from "./lib/marketing-api-url";
export {
	ensureTrailingSlash,
	resolveLandingTitle,
	resolveOgImage,
} from "./lib/meta";
export { initMobileNav } from "./lib/mobile-nav";
export { getPageNumbers, pageUrl } from "./lib/pagination";
export {
	getProductLoginUrl,
	getProductSignupUrl,
	isDirectSignupTarget,
	PRODUCT_SIGNUP_URL,
	resolvePublicSignupCta,
	sanitizePublicSignupCtaText,
} from "./lib/public-signup-cta";
export { buildGraph, refId, withId } from "./lib/schema-graph";
export { lockScroll, unlockScroll } from "./lib/scroll-lock";
export type { SidebarCtaProps } from "./lib/sidebar-cta-utils";
export { buildSidebarCtaProps } from "./lib/sidebar-cta-utils";
export { createSitemapSerializer } from "./lib/sitemap-utils";
export type { CategoryStyle } from "./lib/trust-signal-styles";
export { CATEGORY_ICONS, CATEGORY_STYLES } from "./lib/trust-signal-styles";
export { cn } from "./lib/utils";
export { toEmbedUrl } from "./lib/video";
export type {
	BreadcrumbItem,
	BuyerStage,
	CategorySummary,
	Competitor,
	ContentItem,
	CtaCopyBlock,
	CtaMode,
	ExitPopupConfig,
	ExitPopupCopy,
	FaqItem,
	FilterDef,
	FooterConfig,
	FooterLinkGroup,
	FunnelStage,
	HomepageCopy,
	HomepageProofCard,
	HomepageProofStack,
	LeadMagnet,
	NavItem,
	NavItemConfig,
	NavMegaMenuCategory,
	NavMegaMenuItem,
	NavMegaMenuLink,
	PersonaDefinition,
	PricingTier,
	ProblemAgitationConfig,
	ReferralConfig,
	ReferralReward,
	RelatedPage,
	SchemaType,
	SiteAuthor,
	SiteConfig,
	SortOption,
	SurveyQualificationConfig,
	SurveyQualificationRule,
	SurveyQuestion,
	TrustSignal,
	TrustSignalCategory,
	VisualProofConfig,
} from "./types";
