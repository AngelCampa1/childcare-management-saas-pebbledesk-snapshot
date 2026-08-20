import type { PersonaDefinition } from "@pebbledesk/marketing";
import { formatPlanCapacityClaim } from "@pebbledesk/shared/constants";

export const personas = [
	{
		slug: "center-director",
		label: "Center Director (licensed, 20-75 children)",
		description: "Passing licensing audits, keeping ratios compliant, not losing the license.",
	},
	{
		slug: "in-home-daycare-operator",
		label: `In-Home Daycare Operator (${formatPlanCapacityClaim("home")})`,
		description: "Affordable software that handles licensing requirements for her state.",
	},
	{
		slug: "multi-site-operator",
		label: "Multi-Site Operator or Head Start Grantee",
		description: "Consistent reporting across sites, subsidy billing at scale.",
	},
] as const satisfies readonly PersonaDefinition[];

export type PersonaSlug = (typeof personas)[number]["slug"];
