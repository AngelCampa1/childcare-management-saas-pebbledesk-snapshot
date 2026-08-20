/* global React, Nav, Footer, Ico, Breadcrumbs, ArticleMeta, BlufBlock, FaqSection, RelatedPages, SidebarCta, InlineSignup */

// ─────────────────────────────────────────────────────────────────
// 1. COMPARE HUB INDEX  (/compare)
// ─────────────────────────────────────────────────────────────────
function CompareHubTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const paths = [
		{
			ico: "layers",
			label: "Replacing an incumbent",
			slug: "alternatives",
			desc: "Alternative pages for directors who already know which tool they are replacing and need a cleaner fit.",
			count: 12,
			examples: [
				"Alternatives to parent-app platforms",
				"Alternatives to legacy desktop suites",
				"Alternatives to spreadsheet workflows",
			],
		},
		{
			ico: "chart",
			label: "Shortlist decisions",
			slug: "versus",
			desc: "Head-to-head pages for the last two vendors still in the running when the buying decision is active.",
			count: 8,
			examples: [
				"Pebbledesk vs. parent-app platforms",
				"Pebbledesk vs. legacy suites",
				"Pebbledesk vs. spreadsheets",
			],
		},
		{
			ico: "coin",
			label: "Quote & pricing review",
			slug: "pricing",
			desc: "Pricing breakdowns that surface real contract shape, add-on costs, and where the paperwork burden still lands.",
			count: 6,
			examples: [
				"Real cost of childcare software",
				"Annual vs. monthly billing",
				"Per-child pricing models explained",
			],
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="compare" onNav={onNav} />

			<section className="pd-hero-halo" style={{ padding: "70px 60px 50px" }}>
				<Breadcrumbs items={[{ label: "Home" }, { label: "Compare" }]} />
				<div style={{ maxWidth: 760 }}>
					<div className="caption" style={{ color: accent, marginBottom: 14 }}>
						COMPARE CHILDCARE SOFTWARE
					</div>
					<h1 className="display" style={{ fontSize: 60 }}>
						Compare by what directors need to <span className="pd-mark">prove later.</span>
					</h1>
					<p className="body-lg" style={{ marginTop: 20, maxWidth: 620 }}>
						Choose the path that matches the buying decision in front of you. Replacing a tool,
						shortlisting two, or checking whether a quote is fair.
					</p>
				</div>
			</section>

			{/* Decision path guide */}
			<section style={{ padding: "20px 60px 60px" }}>
				<div
					className="pd-card"
					style={{
						padding: 28,
						background: "var(--pd-cream)",
						display: "grid",
						gridTemplateColumns: "1.2fr 1fr",
						gap: 32,
						marginBottom: 40,
					}}
				>
					<div>
						<div className="caption" style={{ color: accent, marginBottom: 10 }}>
							HOW TO USE THESE GUIDES
						</div>
						<h2 className="h2" style={{ fontSize: 22 }}>
							Start with the record. Then check the price.
						</h2>
						<p className="body" style={{ marginTop: 12 }}>
							Most directors compare parent UX before they compare compliance depth. That's
							backwards for a licensed center. The record, ratio, and billing support determines
							whether you'll be rebuilding spreadsheets in 6 months.
						</p>
					</div>
					<div style={{ display: "grid", gap: 10 }}>
						{[
							{
								n: "1",
								t: "Check the daily record first",
								d: "Attendance, ratios, and billing support. Can it generate 6 months of ratio history in a format the state accepts?",
							},
							{
								n: "2",
								t: "Check the workflow burden next",
								d: "What still gets rebuilt outside the platform? Subsidy reconciliation? Audit prep? Those are the real costs.",
							},
							{
								n: "3",
								t: "Use pricing pages last",
								d: "Once you know the operational fit, confirm the contract shape matches what you actually need.",
							},
						].map((s) => (
							<div key={s.n} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
								<div
									style={{
										width: 26,
										height: 26,
										borderRadius: "50%",
										background: accent,
										color: "#fff",
										display: "grid",
										placeItems: "center",
										fontSize: 12,
										fontWeight: 700,
										flexShrink: 0,
										marginTop: 2,
									}}
								>
									{s.n}
								</div>
								<div>
									<div style={{ fontWeight: 700, fontSize: 14 }}>{s.t}</div>
									<div
										style={{
											fontSize: 13,
											color: "var(--pd-muted)",
											marginTop: 3,
											lineHeight: 1.4,
										}}
									>
										{s.d}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Three path cards */}
				<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
					{paths.map((p, i) => (
						<div
							key={p.slug}
							className="pd-card"
							style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}
						>
							<div
								style={{
									padding: "24px 24px 20px",
									borderBottom: "1px solid var(--pd-border)",
									background: i === 0 ? "rgba(201,123,99,0.04)" : "var(--pd-cream)",
								}}
							>
								<div
									style={{
										width: 44,
										height: 44,
										borderRadius: 12,
										background: i === 0 ? accent : "var(--pd-p-700)",
										color: "#fff",
										display: "grid",
										placeItems: "center",
										marginBottom: 14,
									}}
								>
									<Ico name={p.ico} size={22} color="#fff" />
								</div>
								<h2 className="h3" style={{ fontSize: 20 }}>
									{p.label}
								</h2>
								<p className="body" style={{ fontSize: 14, marginTop: 8 }}>
									{p.desc}
								</p>
								<span className="pd-pill" style={{ marginTop: 12, fontSize: 11 }}>
									{p.count} guides
								</span>
							</div>
							<div style={{ padding: "16px 24px", flex: 1 }}>
								<div className="caption" style={{ color: "var(--pd-muted)", marginBottom: 10 }}>
									EXAMPLES
								</div>
								{p.examples.map((e) => (
									<div
										key={e}
										style={{
											display: "flex",
											gap: 8,
											alignItems: "center",
											padding: "7px 0",
											borderBottom: "1px solid var(--pd-border)",
											fontSize: 13,
										}}
									>
										<Ico name="arrow" size={12} color={accent} />
										<a style={{ color: "var(--pd-text)", cursor: "pointer" }}>{e}</a>
									</div>
								))}
							</div>
							<div style={{ padding: "16px 24px", borderTop: "1px solid var(--pd-border)" }}>
								<a
									className="pd-link-arrow"
									style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}
								>
									Browse {p.label.toLowerCase()} <Ico name="arrow" size={12} />
								</a>
							</div>
						</div>
					))}
				</div>
			</section>

			<section className="pd-section-ink" style={{ padding: "70px 60px", textAlign: "center" }}>
				<h2 className="h1" style={{ color: "#fff", fontSize: 36 }}>
					Ready to move from comparison mode into a cleaner operating system?
				</h2>
				<p className="body-lg" style={{ marginTop: 14, maxWidth: 540, margin: "14px auto 0" }}>
					30-day free trial. No annual-contract friction. We email you 3 days before the trial ends.
				</p>
				<div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12 }}>
					<a className="pd-btn pd-btn-primary pd-btn-lg">Start free trial</a>
					<a
						className="pd-btn pd-btn-ghost pd-btn-lg"
						style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}
					>
						See pricing
					</a>
				</div>
			</section>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 2. PRICING BREAKDOWN TEMPLATE  (/compare/pricing/[slug])
// ─────────────────────────────────────────────────────────────────
function PricingBreakdownTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const faqs = [
		{
			q: "Is per-child pricing better or worse than flat monthly?",
			a: "It depends on enrollment volatility. Flat monthly pricing is predictable and usually cheaper for centers with stable enrollment above ~30 children. Per-child pricing can be cheaper for small or highly variable programs.",
		},
		{
			q: "What are the hidden costs in childcare software?",
			a: "Setup fees, per-child overages, migration charges, API access costs, and support tier fees. Always ask what happens when you exceed the child cap, and whether migration help is included or invoiced separately.",
		},
		{
			q: "When does annual billing make sense?",
			a: "Annual billing makes sense when the platform is operationally embedded — meaning you've completed migration and staff are trained. Don't commit to an annual contract during onboarding.",
		},
	];

	const costItems = [
		{
			cat: "Base subscription",
			pd: "{{plan.center_starter.priceLabel}}",
			other: "$150/mo",
			note: "",
		},
		{
			cat: "Per-child overage",
			pd: "None",
			other: "$2–5/child",
			note: "Can add $40–100/mo for mid-size centers",
		},
		{
			cat: "Setup / onboarding fee",
			pd: "None",
			other: "{{plan.home.promoPriceLabel}}9–999",
			note: "Often required before access",
		},
		{
			cat: "Migration help",
			pd: "Included on Pro+",
			other: "Invoiced separately",
			note: "$500–2,000 typical",
		},
		{
			cat: "Audit export access",
			pd: "Included",
			other: "Add-on tier",
			note: "Requires plan upgrade",
		},
		{ cat: "QuickBooks sync", pd: "Included", other: "Included", note: "" },
		{
			cat: "Phone / priority support",
			pd: "Included on Pro+",
			other: "Premium tier",
			note: "+$50–100/mo",
		},
		{
			cat: "Annual vs. monthly delta",
			pd: "~20% savings",
			other: "Varies",
			note: "Pebbledesk charges no lock-in penalty",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="compare" onNav={onNav} />
			<div style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Compare" },
						{ label: "Pricing" },
						{ label: "Real cost of childcare software" },
					]}
				/>

				{/* Winner callout */}
				<div
					style={{
						padding: "14px 20px",
						background: "var(--pd-success-soft)",
						borderRadius: 10,
						border: "1px solid rgba(22,101,52,0.18)",
						display: "flex",
						gap: 12,
						alignItems: "center",
						marginBottom: 28,
					}}
				>
					<Ico name="check" size={18} color="var(--pd-success)" />
					<span style={{ fontWeight: 700, fontSize: 14, color: "var(--pd-success)" }}>
						Bottom line: Pebbledesk has no per-child overages, no setup fees, and includes migration
						help on Center Pro and above.
					</span>
				</div>

				<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
					<span className="pd-pill accent">PRICING BREAKDOWN</span>
					<span className="pd-pill">Compare & Pricing</span>
					<span className="pd-pill">Updated May 2026</span>
				</div>
				<h1
					style={{
						fontSize: 42,
						fontWeight: 800,
						letterSpacing: "-0.025em",
						lineHeight: 1.05,
						margin: "0 0 4px",
					}}
				>
					Real Cost of Childcare Software: What the Quote Doesn't Show
				</h1>
				<ArticleMeta accent={accent} readTime="6 min read" />

				<BlufBlock text="Most childcare software quotes show the base subscription. The real cost includes per-child overages, setup fees, migration charges, and the compliance burden that stays with you when key features are behind an upgrade paywall." />

				<h2
					style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "36px 0 16px" }}
				>
					Full cost comparison — Pebbledesk vs. typical alternatives
				</h2>

				{/* Cost breakdown table */}
				<div className="pd-card" style={{ overflow: "hidden", marginBottom: 32 }}>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1.8fr 1fr 1fr 1.4fr",
							background: "var(--pd-p-700)",
							color: "#fff",
							fontSize: 11,
							fontFamily: "var(--pd-mono)",
							letterSpacing: "0.1em",
						}}
					>
						<div style={{ padding: "14px 18px" }}>COST ITEM</div>
						<div
							style={{
								padding: "14px 12px",
								textAlign: "center",
								background: "rgba(201,123,99,0.22)",
							}}
						>
							PEBBLEDESK
						</div>
						<div style={{ padding: "14px 12px", textAlign: "center" }}>TYPICAL ALT.</div>
						<div style={{ padding: "14px 12px" }}>NOTE</div>
					</div>
					{costItems.map((r, i) => (
						<div
							key={r.cat}
							style={{
								display: "grid",
								gridTemplateColumns: "1.8fr 1fr 1fr 1.4fr",
								borderTop: "1px solid var(--pd-border)",
								background: i % 2 ? "var(--pd-cream)" : "#fff",
							}}
						>
							<div style={{ padding: "13px 18px", fontSize: 14, fontWeight: 600 }}>{r.cat}</div>
							<div
								style={{
									padding: "13px 12px",
									textAlign: "center",
									background: "rgba(201,123,99,0.05)",
									fontSize: 13,
									fontWeight: 700,
									color:
										r.pd === "None" || r.pd === "Included" ? "var(--pd-success)" : "var(--pd-text)",
								}}
							>
								{r.pd}
							</div>
							<div
								style={{
									padding: "13px 12px",
									textAlign: "center",
									fontSize: 13,
									color:
										r.other.includes("None") || r.other.includes("Included")
											? "var(--pd-success)"
											: "var(--pd-text-2)",
								}}
							>
								{r.other}
							</div>
							<div
								style={{
									padding: "13px 12px",
									fontSize: 12,
									color: "var(--pd-muted)",
									fontStyle: r.note ? "italic" : "normal",
								}}
							>
								{r.note || "—"}
							</div>
						</div>
					))}
				</div>

				{/* Key insight cards */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3, 1fr)",
						gap: 16,
						marginBottom: 36,
					}}
				>
					{[
						{
							t: "Per-child overages add up fast",
							v: "$40–100/mo extra",
							d: "A center with 60 children on a per-child plan at $3/child is paying $180/mo in overages before support.",
						},
						{
							t: "Setup fees are often negotiable",
							v: "{{plan.home.promoPriceLabel}}9–999 typical",
							d: "Ask for a waiver on setup fees. Many platforms waive them for annual commitments or multi-site contracts.",
						},
						{
							t: "Annual savings are real, but risky early",
							v: "~20% typical",
							d: "Don't lock in annually until you've completed migration and confirmed staff adoption. Monthly first.",
						},
					].map((c) => (
						<div key={c.t} className="pd-card" style={{ padding: 20 }}>
							<div
								style={{
									fontSize: 22,
									fontWeight: 700,
									color: accent,
									letterSpacing: "-0.02em",
									marginBottom: 8,
								}}
							>
								{c.v}
							</div>
							<div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{c.t}</div>
							<div style={{ fontSize: 13, color: "var(--pd-muted)", lineHeight: 1.5 }}>{c.d}</div>
						</div>
					))}
				</div>

				<h2
					style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", margin: "36px 0 12px" }}
				>
					What to ask before you sign
				</h2>
				<div style={{ display: "grid", gap: 10, marginBottom: 32 }}>
					{[
						"What happens when my child count exceeds the plan cap?",
						"Is migration help included, or invoiced separately?",
						"Can I export 6 months of ratio history in a format my state accepts?",
						"Is subsidy billing (CCDF/CACFP) included, or an add-on?",
						"What is the notice period to cancel an annual contract?",
						"Is phone support included, or a paid tier?",
					].map((q, i) => (
						<div
							key={q}
							style={{
								display: "flex",
								gap: 14,
								alignItems: "flex-start",
								padding: "13px 18px",
								borderRadius: 10,
								border: "1px solid var(--pd-border)",
								background: "#fff",
								fontSize: 14,
							}}
						>
							<div
								style={{
									width: 22,
									height: 22,
									borderRadius: "50%",
									background: "var(--pd-cream)",
									color: "var(--pd-muted)",
									display: "grid",
									placeItems: "center",
									fontFamily: "var(--pd-mono)",
									fontSize: 10,
									fontWeight: 700,
									flexShrink: 0,
								}}
							>
								Q
							</div>
							{q}
						</div>
					))}
				</div>

				<InlineSignup
					heading="See Pebbledesk's full pricing — no hidden line items."
					subtext="All features listed per plan. No per-child overages. No setup fees."
					accent={accent}
				/>

				<FaqSection faqs={faqs} />
				<RelatedPages
					pages={[
						{
							type: "PRICING",
							t: "Pebbledesk plans & pricing",
							d: "All five plans, monthly and annual.",
						},
						{
							type: "COMPARE",
							t: "Pebbledesk vs. parent-app platforms",
							d: "Feature depth, not just price.",
						},
						{
							type: "FREE TOOL",
							t: "Childcare software scorecard",
							d: "Score vendors on 18 criteria.",
						},
					]}
				/>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 3. PAGINATED LIST / CATEGORY HUB  (guides, best-of, free tools)
// ─────────────────────────────────────────────────────────────────
function CategoryListTemplate({ kind = "guides", accent = "var(--pd-a-500)", onNav }) {
	const configs = {
		guides: {
			title: "How-To Guides",
			label: "GUIDES",
			desc: "Practical guides for childcare directors choosing software, passing state audits, and running a tighter operation.",
			breadcrumb: [{ label: "Home" }, { label: "Resources" }, { label: "Guides" }],
			items: [
				{
					t: "Childcare Licensing Audit Prep: A 12-Step Guide",
					d: "Walk through the six record categories inspectors pull and how to organize them.",
					type: "Guide",
					min: "8 min",
				},
				{
					t: "How to Choose Childcare Management Software",
					d: "8 questions that filter out 80% of vendors before the demo.",
					type: "Guide",
					min: "6 min",
				},
				{
					t: "CCDF Childcare Billing Guide",
					d: "How to file a subsidy claim that doesn't bounce — from attendance to approval.",
					type: "Guide",
					min: "10 min",
				},
				{
					t: "Staff-to-Child Ratio by State (2026)",
					d: "Searchable table covering all 50 states with notes on mixed-age rooms.",
					type: "Reference",
					min: "4 min",
				},
				{
					t: "Childcare Software Implementation Guide",
					d: "A two-week rollout plan for single-site centers migrating from spreadsheets.",
					type: "Guide",
					min: "7 min",
				},
				{
					t: "Subsidy Billing Automation Guide",
					d: "Step-by-step from daily attendance to a clean CCDF/CACFP claim packet.",
					type: "Guide",
					min: "9 min",
				},
				{
					t: "How to Organize Licensing Records by Classroom",
					d: "A filing structure that survives staff turnover and licensing visits.",
					type: "Guide",
					min: "5 min",
				},
				{
					t: "Running a Useful Childcare Software Demo",
					d: "12 questions that surface the truth before you commit to a trial.",
					type: "Guide",
					min: "5 min",
				},
				{
					t: "Reconciling Subsidy Claims with Attendance",
					d: "Where the discrepancies usually hide — and how to catch them before filing.",
					type: "Guide",
					min: "6 min",
				},
				{
					t: "Childcare Software Security Must-Haves",
					d: "SSO, audit logs, data retention, and what to ask before you sign.",
					type: "Guide",
					min: "5 min",
				},
				{
					t: "Incident Reporting That Holds Up Under Review",
					d: "Plain-language framework for staff to follow in the moment.",
					type: "Guide",
					min: "4 min",
				},
				{
					t: "Annual Licensing Renewal Calendar",
					d: "A month-by-month rhythm so compliance prep doesn't pile up.",
					type: "Template",
					min: "3 min",
				},
			],
		},
		best: {
			title: "Best-Of Lists",
			label: "BEST LISTS",
			desc: "Shortlists of childcare software options tested and ranked by a director who needed audit-ready records.",
			breadcrumb: [{ label: "Home" }, { label: "Resources" }, { label: "Best Lists" }],
			items: [
				{
					t: "Best Childcare Audit Software (2026)",
					d: "Four platforms tested on ratio history exports, audit exports, and subsidy billing.",
					type: "Best list",
					min: "7 min",
				},
				{
					t: "Best Childcare Attendance Software",
					d: "Tablet + parent app options compared for licensed centers.",
					type: "Best list",
					min: "6 min",
				},
				{
					t: "Best Childcare Management Software (2026)",
					d: "Director-tested shortlist across all center types.",
					type: "Best list",
					min: "8 min",
				},
				{
					t: "Best Childcare Software for Multi-Site Operators",
					d: "For 2+ locations that need cross-center ratio and billing rollup.",
					type: "Best list",
					min: "6 min",
				},
				{
					t: "Best Ratio Tracking Apps",
					d: "Five options for centers under 60 children.",
					type: "Best list",
					min: "5 min",
				},
				{
					t: "Best Staff Scheduling Apps for Childcare",
					d: "Free and paid options. Includes coverage-based scheduling tools.",
					type: "Best list",
					min: "5 min",
				},
				{
					t: "Best Childcare Waitlist Software",
					d: "Apps that handle deposits, tours, and waitlist communication.",
					type: "Best list",
					min: "5 min",
				},
			],
		},
		free: {
			title: "Free Childcare Resources",
			label: "FREE TOOLS",
			desc: "Downloadable checklists, calculators, templates, and scorecards for audit, subsidy, ratio, and software-buying workflows.",
			breadcrumb: [{ label: "Home" }, { label: "Resources" }, { label: "Free Tools" }],
			items: [
				{
					t: "Licensing Compliance Checklist (PDF)",
					d: "47 items grouped by category. Print-ready with checkbox column.",
					type: "Checklist",
					min: "PDF",
				},
				{
					t: "State Audit Preparation Toolkit",
					d: "Binder dividers, inspection day checklist, and staff briefing templates.",
					type: "Toolkit",
					min: "PDF",
				},
				{
					t: "Childcare Software Scorecard",
					d: "Score vendors on 18 criteria across compliance, billing, and UX.",
					type: "Scorecard",
					min: "Interactive",
				},
				{
					t: "CCDF Billing Claim Worksheet",
					d: "Spreadsheet template to map attendance to subsidy claims.",
					type: "Template",
					min: "Excel",
				},
				{
					t: "Ratio Calculator",
					d: "Drop in your enrollment, see the required staff count by age group.",
					type: "Calculator",
					min: "Interactive",
				},
				{
					t: "Subsidy Reimbursement Estimator",
					d: "Quick CCDF math for budget planning.",
					type: "Calculator",
					min: "Interactive",
				},
				{
					t: "Family Billing Letter Pack",
					d: "Past-due, payment plan, and refund letter templates.",
					type: "Template",
					min: "Word",
				},
				{
					t: "Staff Handbook Starter",
					d: "Editable Word document with ratio, incident, and conduct sections.",
					type: "Template",
					min: "Word",
				},
				{
					t: "Incident Report Form",
					d: "PDF and Word versions. Matches state-standard formats.",
					type: "Form",
					min: "PDF",
				},
			],
		},
	};

	const cfg = configs[kind] || configs.guides;
	const [currentPage, setCurrentPage] = React.useState(1);
	const pageSize = 6;
	const totalPages = Math.ceil(cfg.items.length / pageSize);
	const pageItems = cfg.items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 1140, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs items={cfg.breadcrumb} />

				{/* Intro banner */}
				<div
					className="pd-card"
					style={{
						padding: "28px 32px",
						marginBottom: 32,
						background: "var(--pd-surface-elevated)",
					}}
				>
					<div className="caption" style={{ color: accent, marginBottom: 12 }}>
						{cfg.label}
					</div>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 340px",
							gap: 28,
							alignItems: "center",
						}}
					>
						<div>
							<h1
								style={{
									fontSize: 38,
									fontWeight: 800,
									letterSpacing: "-0.025em",
									lineHeight: 1.1,
									margin: 0,
								}}
							>
								{cfg.title}
							</h1>
							<p className="body-lg" style={{ marginTop: 12 }}>
								{cfg.desc}
							</p>
						</div>
						<div
							style={{
								padding: "18px 20px",
								background: "var(--pd-cream)",
								borderRadius: 12,
								border: "1px solid var(--pd-border)",
							}}
						>
							<div className="caption" style={{ color: "var(--pd-muted)", marginBottom: 10 }}>
								START HERE
							</div>
							<p style={{ fontSize: 13, color: "var(--pd-text-2)", lineHeight: 1.5, margin: 0 }}>
								{kind === "guides" &&
									"If a licensing visit is driving the work, start with the audit prep guide. If you're choosing software, start with the selection guide."}
								{kind === "best" &&
									"If you need audit-readiness, start with the audit software list. If you're evaluating for a multi-site rollout, go to the multi-site list."}
								{kind === "free" &&
									"If you need to walk your building before a licensing visit, start with the compliance checklist. For software evaluation, use the scorecard."}
							</p>
						</div>
					</div>
				</div>

				{/* Grid of items */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(3, 1fr)",
						gap: 16,
						marginBottom: 28,
					}}
				>
					{pageItems.map((item, i) => (
						<a
							key={item.t}
							className="pd-card"
							style={{
								padding: 20,
								display: "block",
								cursor: "pointer",
								transition: "all .15s ease",
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
								<span className="pd-pill accent" style={{ fontSize: 10 }}>
									{item.type}
								</span>
								<span
									style={{ fontSize: 11, fontFamily: "var(--pd-mono)", color: "var(--pd-muted)" }}
								>
									{item.min}
								</span>
							</div>
							<h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25, margin: "0 0 8px" }}>
								{item.t}
							</h3>
							<p style={{ fontSize: 13, color: "var(--pd-muted)", lineHeight: 1.5, margin: 0 }}>
								{item.d}
							</p>
							<div
								className="pd-link-arrow"
								style={{
									marginTop: 14,
									fontSize: 13,
									display: "inline-flex",
									alignItems: "center",
									gap: 5,
								}}
							>
								Read <Ico name="arrow" size={12} />
							</div>
						</a>
					))}
				</div>

				{/* Pagination */}
				{totalPages > 1 && (
					<div
						style={{
							display: "flex",
							justifyContent: "center",
							gap: 8,
							alignItems: "center",
							margin: "32px 0",
						}}
					>
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							style={{
								padding: "8px 16px",
								borderRadius: 999,
								border: "1px solid var(--pd-border)",
								background: "#fff",
								fontSize: 13,
								fontFamily: "var(--pd-font)",
								cursor: currentPage === 1 ? "not-allowed" : "pointer",
								opacity: currentPage === 1 ? 0.4 : 1,
							}}
						>
							← Prev
						</button>
						{Array.from({ length: totalPages }).map((_, i) => (
							<button
								key={i}
								onClick={() => setCurrentPage(i + 1)}
								style={{
									width: 36,
									height: 36,
									borderRadius: "50%",
									border: "1px solid " + (currentPage === i + 1 ? accent : "var(--pd-border)"),
									background: currentPage === i + 1 ? accent : "#fff",
									color: currentPage === i + 1 ? "#fff" : "var(--pd-text)",
									fontSize: 13,
									fontWeight: 600,
									cursor: "pointer",
									fontFamily: "var(--pd-font)",
								}}
							>
								{i + 1}
							</button>
						))}
						<button
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
							disabled={currentPage === totalPages}
							style={{
								padding: "8px 16px",
								borderRadius: 999,
								border: "1px solid var(--pd-border)",
								background: "#fff",
								fontSize: 13,
								fontFamily: "var(--pd-font)",
								cursor: currentPage === totalPages ? "not-allowed" : "pointer",
								opacity: currentPage === totalPages ? 0.4 : 1,
							}}
						>
							Next →
						</button>
					</div>
				)}

				{/* CTA */}
				<div
					className="pd-card"
					style={{
						padding: "32px 36px",
						textAlign: "center",
						background: "var(--pd-cream)",
						marginTop: 24,
					}}
				>
					<h2 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
						{kind === "free"
							? "Want the tools connected to the daily workflow?"
							: "Want help picking the right software?"}
					</h2>
					<p style={{ fontSize: 15, color: "var(--pd-muted)", marginTop: 10 }}>
						Start your 30-day free trial. Attendance, ratios, billing, and audit records in one
						place.
					</p>
					<a className="pd-btn pd-btn-primary" style={{ marginTop: 18, background: accent }}>
						Start free trial
					</a>
				</div>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 4. ABOUT PAGE  (/about)
// ─────────────────────────────────────────────────────────────────
function AboutTemplate({ accent = "var(--pd-a-500)", onNav }) {
	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="home" onNav={onNav} />

			{/* Hero */}
			<section className="pd-hero-halo" style={{ padding: "80px 60px 70px" }}>
				<div style={{ maxWidth: 820 }}>
					<div className="caption" style={{ color: accent, marginBottom: 16 }}>
						ABOUT PEBBLEDESK
					</div>
					<h1 className="display" style={{ fontSize: 68 }}>
						Built because the admin work was <span className="pd-mark">breaking centers.</span>
					</h1>
					<p className="body-lg" style={{ marginTop: 24, maxWidth: 640 }}>
						Pebbledesk is built for licensed childcare centers that need ratio tracking, subsidy
						billing, and audit-ready records — without rebuilding those records by hand every week.
					</p>
				</div>
			</section>

			{/* The problem */}
			<section
				style={{
					padding: "70px 60px",
					background: "var(--pd-cream)",
					borderTop: "1px solid var(--pd-border)",
				}}
			>
				<div
					style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}
				>
					<div>
						<div className="caption" style={{ color: accent, marginBottom: 14 }}>
							THE PROBLEM WE SAW
						</div>
						<h2 className="h1" style={{ fontSize: 40 }}>
							Provider participation in CCDF fell by <span className="pd-mark">53%</span> in 16
							years.
						</h2>
						<p className="body-lg" style={{ marginTop: 18 }}>
							From 475,394 providers in 2006 to 225,204 in 2022. The main drag is paperwork:
							attendance logs in one place, billing notes in another, licensing records somewhere
							else.
						</p>
						<p className="body" style={{ marginTop: 14 }}>
							Most software optimized for the parent experience. Directors were still reconciling by
							hand before every claim. Pebbledesk is built the other way — starting from the
							director's desk, not the parent's phone.
						</p>
					</div>
					<div style={{ display: "grid", gap: 12 }}>
						{[
							{ v: "475K", l: "CCDF providers in 2006" },
							{ v: "225K", l: "CCDF providers in 2022" },
							{ v: "–53%", l: "decline driven by paperwork burden" },
						].map((s) => (
							<div
								key={s.l}
								className="pd-card"
								style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 20 }}
							>
								<div
									style={{
										fontSize: 36,
										fontWeight: 800,
										letterSpacing: "-0.03em",
										color: s.v.startsWith("–") ? "var(--pd-error)" : accent,
										minWidth: 80,
									}}
								>
									{s.v}
								</div>
								<div style={{ fontSize: 14, color: "var(--pd-muted)" }}>{s.l}</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Three things done well */}
			<section style={{ padding: "70px 60px", borderTop: "1px solid var(--pd-border)" }}>
				<div className="caption" style={{ color: accent, marginBottom: 14 }}>
					WHAT WE FOCUS ON
				</div>
				<h2 className="h1" style={{ fontSize: 40, marginBottom: 36 }}>
					Three things done well.
				</h2>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
					{[
						{
							t: "Ratio tracking that catches gaps before the licensor does",
							d: "Live monitoring + historical reports, by room, by minute. The binder builds itself.",
						},
						{
							t: "Subsidy reconciliation tied to attendance, not rebuilt manually",
							d: "CCDF, CACFP, and state. Attendance becomes the claim. No separate spreadsheet.",
						},
						{
							t: "Audit exports from one record, not three spreadsheets",
							d: "One-click PDF + CSV formatted for state licensing. Ready any day, not just before visits.",
						},
					].map((c, i) => (
						<div
							key={c.t}
							style={{
								borderTop: `3px solid ${i === 0 ? accent : "var(--pd-p-400)"}`,
								paddingTop: 20,
							}}
						>
							<h3 style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>
								{c.t}
							</h3>
							<p style={{ fontSize: 14, color: "var(--pd-muted)", lineHeight: 1.55 }}>{c.d}</p>
						</div>
					))}
				</div>
			</section>

			{/* Who it's for */}
			<section
				style={{
					padding: "70px 60px",
					background: "var(--pd-cream)",
					borderTop: "1px solid var(--pd-border)",
				}}
			>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1.3fr",
						gap: 50,
						alignItems: "center",
					}}
				>
					<div>
						<div className="caption" style={{ color: accent, marginBottom: 14 }}>
							WHO PEBBLEDESK SERVES
						</div>
						<h2 className="h1" style={{ fontSize: 36 }}>
							Built for directors running licensed programs.
						</h2>
						<p className="body-lg" style={{ marginTop: 16 }}>
							Pebbledesk serves licensed childcare centers, family childcare homes, and multi-site
							operators that need clearer attendance, ratio, subsidy, billing, and audit records.
						</p>
						<p className="body" style={{ marginTop: 12 }}>
							The product starts with the people who own the daily record. That's the director, the
							owner/operator, the administrator — not the parent, not the IT team.
						</p>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
						{[
							{ t: "Center directors", d: "Managing ratios, licensing, and staff day to day." },
							{ t: "Owner/operators", d: "Responsible for billing, subsidy, and compliance." },
							{ t: "Family childcare providers", d: "Home-based programs with CCDF obligations." },
							{
								t: "Multi-site administrators",
								d: "2+ locations needing cross-center visibility.",
							},
						].map((u) => (
							<div key={u.t} className="pd-card" style={{ padding: 18 }}>
								<div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{u.t}</div>
								<div style={{ fontSize: 13, color: "var(--pd-muted)", lineHeight: 1.4 }}>{u.d}</div>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Security */}
			<section style={{ padding: "60px 60px", borderTop: "1px solid var(--pd-border)" }}>
				<div
					className="pd-card"
					style={{ padding: "32px 36px", background: "var(--pd-surface-elevated)", maxWidth: 800 }}
				>
					<div className="caption" style={{ color: accent, marginBottom: 12 }}>
						DATA & SECURITY
					</div>
					<h2 className="h2" style={{ fontSize: 26 }}>
						Your center's records stay yours.
					</h2>
					<p className="body" style={{ marginTop: 12 }}>
						All center data is isolated — no center can access another center's records — and stored
						in encrypted databases hosted in the United States. Row-level tenancy means your data is
						structurally separated from other accounts, not just access-controlled.
					</p>
				</div>
			</section>

			{/* CTA */}
			<section className="pd-section-ink" style={{ padding: "80px 60px", textAlign: "center" }}>
				<h2 className="h1" style={{ color: "#fff", fontSize: 40 }}>
					See if Pebbledesk fits your center.
				</h2>
				<p className="body-lg" style={{ marginTop: 14, maxWidth: 500, margin: "14px auto 0" }}>
					30-day free trial. No credit card required. We email you 3 days before it ends.
				</p>
				<div style={{ marginTop: 28, display: "flex", justifyContent: "center", gap: 12 }}>
					<a className="pd-btn pd-btn-primary pd-btn-lg">Try the product</a>
					<a
						className="pd-btn pd-btn-ghost pd-btn-lg"
						style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}
					>
						See the plans
					</a>
				</div>
			</section>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 5. 404 PAGE  (/404)
// ─────────────────────────────────────────────────────────────────
function NotFoundTemplate({ accent = "var(--pd-a-500)", onNav }) {
	return (
		<div
			className="pd"
			style={{
				width: "100%",
				minWidth: 1280,
				minHeight: "100vh",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<Nav active="home" onNav={onNav} />
			<div
				style={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "80px 60px",
					background: "var(--pd-cream)",
				}}
			>
				<div
					className="pd-card"
					style={{
						padding: "60px 56px",
						maxWidth: 680,
						textAlign: "center",
						boxShadow: "var(--pd-shadow-lg)",
					}}
				>
					<div
						className="caption"
						style={{ color: accent, marginBottom: 16, fontSize: 14, letterSpacing: "0.18em" }}
					>
						404
					</div>
					<h1
						style={{
							fontSize: 36,
							fontWeight: 800,
							letterSpacing: "-0.02em",
							lineHeight: 1.1,
							margin: "0 0 16px",
						}}
					>
						This page is not part of the current record.
					</h1>
					<p
						style={{
							fontSize: 16,
							color: "var(--pd-muted)",
							lineHeight: 1.6,
							maxWidth: 480,
							margin: "0 auto 32px",
						}}
					>
						The page may have moved, the link may be outdated, or the route may no longer be
						published. Start from one of these paths and you should find what you need.
					</p>
					<div
						style={{
							display: "flex",
							gap: 10,
							justifyContent: "center",
							flexWrap: "wrap",
							marginBottom: 40,
						}}
					>
						<a
							className="pd-btn pd-btn-primary"
							style={{ background: accent }}
							onClick={() => onNav?.("home")}
						>
							Back to home
						</a>
						<a className="pd-btn pd-btn-ghost" onClick={() => onNav?.("resources")}>
							Browse resources
						</a>
						<a className="pd-btn pd-btn-ghost" onClick={() => onNav?.("compare")}>
							Compare software
						</a>
					</div>
					{/* Pebble illustration */}
					<div style={{ display: "flex", justifyContent: "center", gap: 12, opacity: 0.25 }}>
						{[
							{ w: 44, h: 34, bg: "var(--pd-p-500)" },
							{ w: 60, h: 46, bg: "var(--pd-p-700)" },
							{ w: 38, h: 30, bg: accent },
						].map((s, i) => (
							<div
								key={i}
								style={{ width: s.w, height: s.h, borderRadius: "50%", background: s.bg }}
							/>
						))}
					</div>
				</div>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 6. PRINT / LEAD MAGNET PRINT LAYOUT  (/free/[slug]/print)
// ─────────────────────────────────────────────────────────────────
function PrintTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const items = [
		{
			sec: "A",
			t: "Ratio & Attendance",
			items: [
				"Sign-in and sign-out times documented for every child, every room",
				"Staff-to-child counts recorded at each transition point",
				"Room roster matches enrollment records",
				"Temporary staff coverage logged separately",
			],
		},
		{
			sec: "B",
			t: "Staff Records",
			items: [
				"Staff certifications on file and current",
				"Background check results documented",
				"CPR and First Aid certifications current",
				"Staff scheduling records match attendance data",
			],
		},
		{
			sec: "C",
			t: "Child & Family Files",
			items: [
				"Enrollment agreements signed and dated",
				"Immunization records on file and current",
				"Allergy documentation updated this year",
				"Authorized pickup lists current",
				"Emergency contact information verified",
			],
		},
		{
			sec: "D",
			t: "Billing & Subsidy",
			items: [
				"Subsidy eligibility documentation current",
				"CCDF/CACFP enrollment forms on file",
				"Attendance-to-claim reconciliation complete",
				"Parent co-pay records match invoices",
			],
		},
		{
			sec: "E",
			t: "Facility & Safety",
			items: [
				"Fire drill log current (required frequency met)",
				"Medication authorization forms signed",
				"Incident reports filed within required window",
				"Emergency evacuation plan posted",
			],
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 840, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Free Tools" },
						{ label: "Licensing checklist" },
						{ label: "Print version" },
					]}
				/>

				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						marginBottom: 30,
					}}
				>
					<div>
						<div className="caption" style={{ color: accent, marginBottom: 8 }}>
							PRINTABLE RESOURCE
						</div>
						<h1
							style={{
								fontSize: 34,
								fontWeight: 800,
								letterSpacing: "-0.02em",
								lineHeight: 1.1,
								margin: 0,
							}}
						>
							Licensing Compliance Checklist
						</h1>
						<div
							style={{
								fontSize: 12,
								fontFamily: "var(--pd-mono)",
								color: "var(--pd-muted)",
								marginTop: 8,
								letterSpacing: "0.06em",
							}}
						>
							PEBBLEDESK · UPDATED MAY 2026 · 47 ITEMS
						</div>
					</div>
					<a
						className="pd-btn pd-btn-primary"
						style={{
							background: accent,
							display: "inline-flex",
							gap: 8,
							alignItems: "center",
							flexShrink: 0,
						}}
					>
						<Ico name="download" size={16} /> Download PDF
					</a>
				</div>

				{/* Print-style checklist */}
				{items.map((sec, si) => (
					<div key={sec.sec} style={{ marginBottom: 28 }}>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
								padding: "12px 16px",
								background: si === 0 ? accent : "var(--pd-p-700)",
								borderRadius: "10px 10px 0 0",
								color: "#fff",
							}}
						>
							<div style={{ fontFamily: "var(--pd-mono)", fontSize: 13, fontWeight: 700 }}>
								SECTION {sec.sec}
							</div>
							<div style={{ fontWeight: 700, fontSize: 15 }}>{sec.t}</div>
						</div>
						<div
							style={{
								border: "1px solid var(--pd-border)",
								borderTop: "none",
								borderRadius: "0 0 10px 10px",
								overflow: "hidden",
							}}
						>
							{sec.items.map((item, i) => (
								<div
									key={item}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 14,
										padding: "14px 18px",
										borderTop: i > 0 ? "1px solid var(--pd-border)" : "none",
										background: i % 2 ? "var(--pd-cream)" : "#fff",
									}}
								>
									<div
										style={{
											width: 20,
											height: 20,
											borderRadius: 5,
											border: "1.5px solid var(--pd-border-strong)",
											flexShrink: 0,
											background: "#fff",
										}}
									/>
									<div style={{ fontSize: 14, lineHeight: 1.4 }}>{item}</div>
									<div
										className="pd-pill"
										style={{ marginLeft: "auto", fontSize: 9, flexShrink: 0 }}
									>
										PRIORITY
									</div>
								</div>
							))}
						</div>
					</div>
				))}

				{/* Footer note */}
				<div
					style={{
						padding: "20px 24px",
						background: "var(--pd-cream)",
						borderRadius: 10,
						border: "1px solid var(--pd-border)",
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
					}}
				>
					<div>
						<div style={{ fontWeight: 700, fontSize: 14 }}>
							Keep these records audit-ready every day.
						</div>
						<div style={{ fontSize: 13, color: "var(--pd-muted)", marginTop: 4 }}>
							Pebbledesk exports a state-formatted audit PDF in one click.
						</div>
					</div>
					<a className="pd-btn pd-btn-primary pd-btn-sm" style={{ background: accent }}>
						Start free trial
					</a>
				</div>
			</div>
			<Footer />
		</div>
	);
}

window.CompareHubTemplate = CompareHubTemplate;
window.PricingBreakdownTemplate = PricingBreakdownTemplate;
window.CategoryListTemplate = CategoryListTemplate;
window.AboutTemplate = AboutTemplate;
window.NotFoundTemplate = NotFoundTemplate;
window.PrintTemplate = PrintTemplate;
