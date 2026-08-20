import type { BreadcrumbItem } from "@pebbledesk/marketing";

export function buildAlternativeBreadcrumbs(
	competitorName: string,
	canonicalPath: string,
): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Compare", href: "/compare" },
		{ label: "Alternatives", href: "/compare/alternatives" },
		{
			label: `${competitorName} Alternative`,
			href: canonicalPath,
		},
	];
}

export function buildVersusBreadcrumbs(
	nameA: string,
	nameB: string,
	canonicalPath: string,
): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Compare", href: "/compare" },
		{ label: "Head-to-Head", href: "/compare/versus" },
		{ label: `${nameA} vs ${nameB}`, href: canonicalPath },
	];
}

export function buildPricingBreadcrumbs(
	competitorName: string,
	canonicalPath: string,
): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Compare", href: "/compare" },
		{ label: "Pricing", href: "/compare/pricing" },
		{ label: `${competitorName} Pricing`, href: canonicalPath },
	];
}

export function buildGuideBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Resources", href: "/resources" },
		{ label: "Guides", href: "/resources/guides" },
		{ label: title, href: canonicalPath },
	];
}

export function buildListicleBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Resources", href: "/resources" },
		{ label: "Software Roundups", href: "/resources/best" },
		{ label: title, href: canonicalPath },
	];
}

export function buildStateBreadcrumbs(state: string, canonicalPath: string): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Childcare Software", href: "/childcare-software/" },
		{ label: state, href: canonicalPath },
	];
}

export function buildFeatureBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Features", href: "/features" },
		{ label: title, href: canonicalPath },
	];
}

export function buildCityBreadcrumbs(
	city: string,
	state: string,
	canonicalPath: string,
): BreadcrumbItem[] {
	return [
		{ label: "Home", href: "/" },
		{ label: "Childcare Software", href: "/childcare-software/" },
		{ label: `${city}, ${state}`, href: canonicalPath },
	];
}
