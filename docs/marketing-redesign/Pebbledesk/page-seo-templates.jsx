/* global React, Nav, Footer, Ico, Breadcrumbs, ArticleMeta, BlufBlock, TocSidebar, SidebarCta, InlineSignup, FaqSection, RelatedPages, ProsCons, BodySection, H2, H3 */

// ─────────────────────────────────────────────────────────────────
// 1. GUIDE TEMPLATE  (/resources/guides/[slug])
// ─────────────────────────────────────────────────────────────────
function GuideTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const headings = [
		{ depth: 2, text: 'What does "audit-ready" actually mean?' },
		{ depth: 2, text: "The six records licensing inspectors pull" },
		{ depth: 3, text: "Attendance logs" },
		{ depth: 3, text: "Ratio history" },
		{ depth: 3, text: "Staff coverage records" },
		{ depth: 2, text: "How to organize records before the visit" },
		{ depth: 2, text: "Export formats the state accepts" },
		{ depth: 2, text: "A 12-step audit prep checklist" },
		{ depth: 2, text: "Frequently asked questions" },
	];
	const faqs = [
		{
			q: "How far back do inspectors typically look?",
			a: "Most state licensing visits request 6–12 months of records. CCDF audits can go back 3 years. Keep records accordingly.",
		},
		{
			q: "Do I need paper copies or digital?",
			a: "Most states now accept both, but digital exports must be printable and clearly legible. PDFs are universally accepted.",
		},
		{
			q: "What happens if a ratio record is missing for one day?",
			a: "Missing records create a corrective action item. One gap rarely triggers a citation, but multiple gaps can affect licensing status.",
		},
	];
	const related = [
		{
			type: "FREE TOOL",
			t: "Licensing compliance checklist",
			d: "A 47-item PDF you can walk room by room.",
		},
		{ type: "GUIDE", t: "Staff-to-child ratio by state", d: "Searchable table for all 50 states." },
		{
			type: "FEATURE",
			t: "Audit reports in Pebbledesk",
			d: "One-click exports formatted for state licensing.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Resources" },
						{ label: "Guides" },
						{ label: "Audit prep guide" },
					]}
				/>

				{/* Header card */}
				<div
					className="pd-card"
					style={{
						padding: "32px 36px",
						marginBottom: 32,
						background: "var(--pd-surface-elevated)",
					}}
				>
					<div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
						<span className="pd-pill accent">GUIDE</span>
						<span className="pd-pill">Audit & Licensing</span>
						<span className="pd-pill">Compliance</span>
					</div>
					<h1
						style={{
							fontSize: 42,
							fontWeight: 800,
							letterSpacing: "-0.025em",
							lineHeight: 1.05,
							maxWidth: 780,
							margin: 0,
						}}
					>
						Childcare Licensing Audit Prep: A 12-Step Guide for Directors
					</h1>
					<ArticleMeta accent={accent} />
				</div>

				{/* Two-column layout: body + sidebar */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 280px",
						gap: 36,
						alignItems: "start",
					}}
				>
					<article>
						<BlufBlock text="Before the inspector arrives, you need six categories of records within arm's reach: attendance logs, ratio history, staff coverage, guardian paperwork, billing documentation, and any corrective action responses. This guide walks you through each one and shows how to export everything in under a minute." />

						<H2>What does "audit-ready" actually mean?</H2>
						<BodySection>
							<p>
								Audit-ready doesn't mean perfect records. It means records you can locate, explain,
								and hand over without rebuilding anything. Most licensing violations happen not
								because centers were non-compliant — but because the documentation wasn't organized
								well enough to prove compliance on the spot.
							</p>
							<p style={{ marginTop: 12 }}>
								A director who can pull six months of ratio history in under two minutes is in a
								fundamentally different position than one who needs to find a binder from a filing
								cabinet.
							</p>
						</BodySection>

						<H2>The six records licensing inspectors pull</H2>
						<BodySection>
							<p>
								Inspectors vary by state, but these six categories come up in virtually every
								licensing review:
							</p>
						</BodySection>

						{/* Numbered record cards */}
						{[
							{
								n: "01",
								t: "Daily attendance logs",
								d: "Sign-in and sign-out times for every child, by room, by date. Inspectors check that records match authorized pickup lists.",
							},
							{
								n: "02",
								t: "Ratio history by room",
								d: "Staff-to-child counts at each point in the day. A spot-check of 3–5 days across the review period is standard.",
							},
							{
								n: "03",
								t: "Staff coverage documentation",
								d: "Which staff were on shift, in which rooms, and how long. Gaps in coverage are the most common corrective action.",
							},
							{
								n: "04",
								t: "Guardian & pickup records",
								d: "Authorization forms, IDs on file, and any special pickup restrictions.",
							},
							{
								n: "05",
								t: "Incident and injury reports",
								d: "All incidents must be documented within 24 hours. Inspectors count missing reports.",
							},
							{
								n: "06",
								t: "Corrective action responses",
								d: "Responses to any prior citations. Outstanding CARs are addressed first.",
							},
						].map((r) => (
							<div
								key={r.n}
								style={{
									display: "flex",
									gap: 16,
									padding: "16px 0",
									borderBottom: "1px solid var(--pd-border)",
								}}
							>
								<div
									style={{
										fontSize: 28,
										fontWeight: 800,
										color: "var(--pd-border-strong)",
										letterSpacing: "-0.02em",
										lineHeight: 1,
										flexShrink: 0,
										width: 48,
										textAlign: "right",
									}}
								>
									{r.n}
								</div>
								<div>
									<div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{r.t}</div>
									<div style={{ fontSize: 14, color: "var(--pd-muted)", lineHeight: 1.5 }}>
										{r.d}
									</div>
								</div>
							</div>
						))}

						<InlineSignup
							heading="Running a licensed center? Keep these records ready every day."
							subtext="Pebbledesk exports audit-ready PDFs in one click. 30-day free trial. No credit card required."
							accent={accent}
						/>

						<H2>A 12-step audit prep checklist</H2>
						<div style={{ marginTop: 16 }}>
							{[
								"Pull attendance logs for the past 6 months",
								"Export ratio history with timestamps, by room",
								"Verify staff coverage records match scheduling",
								"Check all incident reports are filed and complete",
								"Confirm guardian pickup authorizations are current",
								"Review corrective action responses from prior visits",
								"Verify child enrollment files are complete",
								"Check immunization records are on file and current",
								"Confirm subsidy documentation matches attendance",
								"Export emergency contact lists for each classroom",
								"Verify medication authorization forms are signed",
								"Print or save everything to a labeled folder per period",
							].map((s, i) => (
								<div
									key={s}
									style={{
										display: "flex",
										gap: 12,
										alignItems: "flex-start",
										padding: "10px 0",
										borderBottom: "1px solid var(--pd-border)",
									}}
								>
									<div
										style={{
											width: 22,
											height: 22,
											borderRadius: "50%",
											background: "var(--pd-p-700)",
											color: "#fff",
											display: "grid",
											placeItems: "center",
											fontSize: 11,
											fontWeight: 700,
											flexShrink: 0,
										}}
									>
										{i + 1}
									</div>
									<div style={{ fontSize: 14, paddingTop: 3 }}>{s}</div>
								</div>
							))}
						</div>

						<FaqSection faqs={faqs} />
						<RelatedPages pages={related} />
					</article>

					<div>
						<TocSidebar headings={headings} accent={accent} />
						<SidebarCta accent={accent} />
					</div>
				</div>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 2. BEST-OF / LISTICLE TEMPLATE  (/resources/best/[slug])
// ─────────────────────────────────────────────────────────────────
function ListicleTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const tools = [
		{
			n: "Pebbledesk",
			badge: "Editor's pick",
			badgeOk: true,
			tagline: "Best for licensed centers needing audit-ready records.",
			pricing: "{{plan.home.priceLabel}} · 30-day free trial",
			scores: [
				{ l: "Audit depth", v: 5 },
				{ l: "Subsidy billing", v: 5 },
				{ l: "Ratio monitoring", v: 5 },
				{ l: "Parent UX", v: 3 },
			],
			verdict:
				"The only platform built around compliance-first hierarchy. Live ratio monitoring, CCDF/CACFP billing, and one-click state-formatted audit exports make it the clear choice for licensed centers.",
			pros: [
				"Live ratio monitoring with historical reports",
				"CCDF, CACFP, and state subsidy billing built in",
				"One-click PDF + CSV audit export",
				"Attendance tied to classroom and audit log",
				"Migration presets for common platforms",
			],
			cons: ["No dedicated parent mobile app", "Newer platform — smaller integration library"],
			cta: true,
		},
		{
			n: "Option B (Parent-first)",
			badge: "Best parent UX",
			badgeOk: false,
			tagline: "Best for centers that prioritize the parent experience.",
			pricing: "From $150/mo · Demo required",
			scores: [
				{ l: "Audit depth", v: 2 },
				{ l: "Subsidy billing", v: 1 },
				{ l: "Ratio monitoring", v: 2 },
				{ l: "Parent UX", v: 5 },
			],
			verdict:
				"A polished parent app and photo sharing make it popular with parents. Ratio reporting is too shallow to be audit-defensible, and there is no CCDF/CACFP billing.",
			pros: [
				"Polished parent-facing mobile app",
				"Photo sharing + daily reports",
				"Large user community",
			],
			cons: [
				"Ratio reporting not audit-defensible",
				"No CCDF/CACFP subsidy billing",
				"Per-child pricing gets expensive quickly",
			],
			cta: false,
		},
		{
			n: "Option C (Legacy suite)",
			badge: "Established",
			badgeOk: false,
			tagline: "Best for centers already deep in a desktop workflow.",
			pricing: "From $99/mo · Setup fee applies",
			scores: [
				{ l: "Audit depth", v: 3 },
				{ l: "Subsidy billing", v: 3 },
				{ l: "Ratio monitoring", v: 2 },
				{ l: "Parent UX", v: 2 },
			],
			verdict:
				"Long market history and a solid QuickBooks integration. The interface is dated, mobile experience is poor, and migration away from it is painful.",
			pros: ["Mature QuickBooks integration", "Long track record", "Desktop + web access"],
			cons: [
				"Dated interface, steep learning curve",
				"Poor mobile experience",
				"Migration to modern systems is painful",
			],
			cta: false,
		},
		{
			n: "Option D (Free tier)",
			badge: "Budget pick",
			badgeOk: false,
			tagline: "Best for family childcare homes on a tight budget.",
			pricing: "Free tier · Paid from $19/mo",
			scores: [
				{ l: "Audit depth", v: 1 },
				{ l: "Subsidy billing", v: 1 },
				{ l: "Ratio monitoring", v: 1 },
				{ l: "Parent UX", v: 3 },
			],
			verdict:
				"The free tier is genuinely usable for a family daycare home. Not suitable for a licensed center with ratio compliance and subsidy obligations.",
			pros: ["Genuinely usable free tier", "Easy setup", "Good for family daycare homes"],
			cons: ["No ratio tracking", "No subsidy billing", "Not built for licensed center compliance"],
			cta: false,
		},
	];

	const ScoreDots = ({ v, max = 5 }) => (
		<div style={{ display: "flex", gap: 4 }}>
			{Array.from({ length: max }).map((_, i) => (
				<div
					key={i}
					style={{
						width: 10,
						height: 10,
						borderRadius: "50%",
						background: i < v ? accent : "var(--pd-border)",
					}}
				/>
			))}
		</div>
	);

	const faqs = [
		{
			q: "What should licensed centers look for in audit software?",
			a: "Ratio history export, attendance logs tied to classrooms, subsidy reconciliation, and one-click licensing exports. Parent apps are a nice-to-have, not a compliance tool.",
		},
		{
			q: "Is free childcare software good enough for a licensed center?",
			a: "Free tools rarely include ratio tracking or audit export. For a licensed center, compliance gaps cost far more than software.",
		},
		{
			q: "How do I evaluate these tools fairly?",
			a: "Request a trial or demo. Run a real compliance scenario: can you generate 6 months of ratio history and export it in a format the state accepts? That question separates compliance tools from parent apps.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 1140, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Resources" },
						{ label: "Best Lists" },
						{ label: "Best childcare audit software" },
					]}
				/>

				{/* Header */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 300px",
						gap: 40,
						alignItems: "start",
						marginBottom: 36,
					}}
				>
					<div>
						<div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
							<span className="pd-pill accent">BEST LIST</span>
							<span className="pd-pill">4 tools compared</span>
							<span className="pd-pill">Updated May 2026</span>
						</div>
						<h1
							style={{
								fontSize: 44,
								fontWeight: 800,
								letterSpacing: "-0.025em",
								lineHeight: 1.05,
								margin: 0,
							}}
						>
							Best Childcare Audit Software (2026): 4 Tools Compared for Licensed Centers
						</h1>
						<ArticleMeta accent={accent} readTime="7 min read" />
						<BlufBlock text="We evaluated four childcare platforms on audit-readiness: ratio history exports, subsidy billing depth, and licensing export quality. Pebbledesk leads for licensed centers. The others serve different jobs." />
					</div>
					{/* Quick comparison sidebar */}
					<div className="pd-card" style={{ padding: 0, overflow: "hidden", alignSelf: "start" }}>
						<div
							style={{
								padding: "14px 16px",
								borderBottom: "1px solid var(--pd-border)",
								fontSize: 11,
								fontFamily: "var(--pd-mono)",
								letterSpacing: "0.12em",
								color: "var(--pd-muted)",
							}}
						>
							QUICK JUMP
						</div>
						{tools.map((t, i) => (
							<div
								key={t.n}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 12,
									padding: "12px 16px",
									borderBottom: i < tools.length - 1 ? "1px solid var(--pd-border)" : "none",
									cursor: "pointer",
								}}
							>
								<div
									style={{
										width: 28,
										height: 28,
										borderRadius: 8,
										background: i === 0 ? accent : "var(--pd-cream)",
										color: i === 0 ? "#fff" : "var(--pd-muted)",
										display: "grid",
										placeItems: "center",
										fontFamily: "var(--pd-mono)",
										fontSize: 11,
										fontWeight: 700,
										flexShrink: 0,
									}}
								>
									{String(i + 1).padStart(2, "0")}
								</div>
								<div>
									<div style={{ fontSize: 13, fontWeight: 600 }}>{t.n}</div>
									<div style={{ fontSize: 11, color: "var(--pd-muted)" }}>
										{t.pricing.split("·")[0].trim()}
									</div>
								</div>
								{t.badgeOk && (
									<span
										className="pd-pill ok"
										style={{ fontSize: 9, marginLeft: "auto", padding: "2px 7px" }}
									>
										<span className="dot" />
										Pick
									</span>
								)}
							</div>
						))}
					</div>
				</div>

				{/* Tool entries */}
				{tools.map((t, i) => (
					<section key={t.n} style={{ marginBottom: 32 }}>
						<div
							className="pd-card"
							style={{
								overflow: "hidden",
								boxShadow:
									i === 0 ? `0 0 0 2px ${accent}, var(--pd-shadow-md)` : "var(--pd-shadow-sm)",
							}}
						>
							{/* Tool header */}
							<div
								style={{
									padding: "24px 28px",
									background:
										i === 0
											? `linear-gradient(135deg, var(--pd-cream) 0%, rgba(201,123,99,0.06) 100%)`
											: "var(--pd-cream)",
									borderBottom: "1px solid var(--pd-border)",
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "flex-start",
										gap: 20,
									}}
								>
									<div style={{ display: "flex", gap: 18, alignItems: "center" }}>
										<div
											style={{
												width: 48,
												height: 48,
												borderRadius: 12,
												background: i === 0 ? accent : "var(--pd-p-200)",
												color: i === 0 ? "#fff" : "var(--pd-p-700)",
												display: "grid",
												placeItems: "center",
												fontFamily: "var(--pd-mono)",
												fontSize: 16,
												fontWeight: 700,
												flexShrink: 0,
											}}
										>
											{String(i + 1).padStart(2, "0")}
										</div>
										<div>
											<div
												style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
											>
												<h2
													style={{
														fontSize: 24,
														fontWeight: 700,
														letterSpacing: "-0.02em",
														margin: 0,
													}}
												>
													{t.n}
												</h2>
												<span
													className={`pd-pill ${t.badgeOk ? "ok" : ""}`}
													style={{ fontSize: 11 }}
												>
													{t.badgeOk && <span className="dot" />}
													{t.badge}
												</span>
											</div>
											<div style={{ fontSize: 13, color: "var(--pd-muted)", marginTop: 4 }}>
												{t.tagline}
											</div>
										</div>
									</div>
									<div style={{ textAlign: "right", flexShrink: 0 }}>
										<div
											style={{
												fontSize: 11,
												fontFamily: "var(--pd-mono)",
												color: "var(--pd-muted)",
												marginBottom: 4,
											}}
										>
											PRICING
										</div>
										<div style={{ fontSize: 14, fontWeight: 700 }}>
											{t.pricing.split("·")[0].trim()}
										</div>
										{t.pricing.split("·")[1] && (
											<div style={{ fontSize: 11, color: "var(--pd-muted)" }}>
												{t.pricing.split("·")[1].trim()}
											</div>
										)}
									</div>
								</div>
							</div>

							{/* Scores + pros/cons */}
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "200px 1fr",
									borderBottom: "1px solid var(--pd-border)",
								}}
							>
								{/* Score bars */}
								<div
									style={{
										padding: "20px 20px",
										borderRight: "1px solid var(--pd-border)",
										background: "#fff",
									}}
								>
									<div
										style={{
											fontSize: 11,
											fontFamily: "var(--pd-mono)",
											color: "var(--pd-muted)",
											letterSpacing: "0.12em",
											marginBottom: 14,
										}}
									>
										SCORES
									</div>
									{t.scores.map((s) => (
										<div key={s.l} style={{ marginBottom: 12 }}>
											<div
												style={{
													display: "flex",
													justifyContent: "space-between",
													marginBottom: 5,
												}}
											>
												<span style={{ fontSize: 12, color: "var(--pd-text-2)" }}>{s.l}</span>
												<span
													style={{
														fontSize: 11,
														fontFamily: "var(--pd-mono)",
														color: "var(--pd-muted)",
													}}
												>
													{s.v}/5
												</span>
											</div>
											<div
												style={{
													height: 6,
													borderRadius: 999,
													background: "var(--pd-border)",
													overflow: "hidden",
												}}
											>
												<div
													style={{
														height: "100%",
														width: `${(s.v / 5) * 100}%`,
														background: i === 0 ? accent : "var(--pd-p-400)",
														borderRadius: 999,
														transition: "width .3s ease",
													}}
												/>
											</div>
										</div>
									))}
								</div>
								{/* Pros + cons */}
								<div
									style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#fff" }}
								>
									<div style={{ padding: "20px 20px", borderRight: "1px solid var(--pd-border)" }}>
										<div
											style={{
												fontSize: 11,
												fontFamily: "var(--pd-mono)",
												color: "var(--pd-success)",
												letterSpacing: "0.12em",
												marginBottom: 12,
											}}
										>
											PROS
										</div>
										{t.pros.map((p) => (
											<div
												key={p}
												style={{
													display: "flex",
													gap: 8,
													marginBottom: 8,
													alignItems: "flex-start",
													fontSize: 13,
												}}
											>
												<Ico name="check" size={14} color="var(--pd-success)" />
												<span style={{ lineHeight: 1.4 }}>{p}</span>
											</div>
										))}
									</div>
									<div style={{ padding: "20px 20px" }}>
										<div
											style={{
												fontSize: 11,
												fontFamily: "var(--pd-mono)",
												color: "var(--pd-error)",
												letterSpacing: "0.12em",
												marginBottom: 12,
											}}
										>
											CONS
										</div>
										{t.cons.map((c) => (
											<div
												key={c}
												style={{
													display: "flex",
													gap: 8,
													marginBottom: 8,
													alignItems: "flex-start",
													fontSize: 13,
												}}
											>
												<span
													style={{
														color: "var(--pd-error)",
														fontWeight: 700,
														lineHeight: 1,
														flexShrink: 0,
														marginTop: 1,
													}}
												>
													–
												</span>
												<span style={{ lineHeight: 1.4 }}>{c}</span>
											</div>
										))}
									</div>
								</div>
							</div>

							{/* Verdict + CTA */}
							<div
								style={{
									padding: "16px 24px",
									background: i === 0 ? "rgba(201,123,99,0.04)" : "#fff",
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									gap: 20,
								}}
							>
								<div style={{ flex: 1 }}>
									<span style={{ fontWeight: 700, fontSize: 13 }}>Verdict: </span>
									<span style={{ fontSize: 13, color: "var(--pd-text-2)", lineHeight: 1.5 }}>
										{t.verdict}
									</span>
								</div>
								{t.cta && (
									<a
										className="pd-btn pd-btn-primary"
										style={{ background: accent, flexShrink: 0 }}
									>
										Try free for 30 days →
									</a>
								)}
							</div>
						</div>
					</section>
				))}

				<FaqSection faqs={faqs} />
				<RelatedPages
					pages={[
						{
							type: "GUIDE",
							t: "How to choose childcare management software",
							d: "8 questions to filter out 80% of vendors.",
						},
						{
							type: "COMPARE",
							t: "Pebbledesk vs. parent-app platforms",
							d: "Built for directors, not parents.",
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
// 3. VERSUS / COMPARISON TEMPLATE  (/compare/versus/[a]-vs-[b])
// ─────────────────────────────────────────────────────────────────
function VersusTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const rows = [
		{ f: "Live ratio monitoring", pd: "✓", other: "Partial" },
		{ f: "Historical ratio reports (licensing)", pd: "✓", other: "—" },
		{ f: "CCDF / CACFP subsidy billing", pd: "✓", other: "—" },
		{ f: "One-click audit PDF export", pd: "✓", other: "—" },
		{ f: "QuickBooks sync", pd: "✓", other: "✓" },
		{ f: "Parent app / daily updates", pd: "Partial", other: "✓" },
		{ f: "Family messaging", pd: "✓", other: "✓" },
		{ f: "CSV import from other platforms", pd: "✓", other: "—" },
		{ f: "Migration help included", pd: "✓", other: "—" },
		{ f: "Pricing starts at", pd: "{{plan.home.priceLabel}}", other: "$150/mo" },
		{ f: "Free trial", pd: "30 days", other: "Demo only" },
	];
	const faqs = [
		{
			q: "Is Pebbledesk a replacement for parent-app platforms?",
			a: "For licensed centers that need compliance records, yes — Pebbledesk covers more of the director workflow. For centers where the parent experience is the top priority, the two serve different jobs.",
		},
		{
			q: "How long does migration take?",
			a: "Most single-site centers complete migration in under a week using our CSV presets. Multi-site operators can work with a dedicated rollout manager.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="compare" onNav={onNav} />
			<div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Compare" },
						{ label: "Pebbledesk vs. Parent-App Platform" },
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
						Our verdict: Pebbledesk is the better fit for licensed centers that need audit-ready
						records and compliance reporting.
					</span>
				</div>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 300px",
						gap: 40,
						alignItems: "start",
					}}
				>
					<div>
						<div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
							<span className="pd-pill accent">COMPARISON</span>
							<span className="pd-pill">Compare & Pricing</span>
						</div>
						<h1
							style={{
								fontSize: 40,
								fontWeight: 800,
								letterSpacing: "-0.025em",
								lineHeight: 1.05,
								margin: "0 0 4px",
							}}
						>
							Pebbledesk vs. Parent-App Platforms
						</h1>
						<ArticleMeta accent={accent} readTime="5 min read" />

						<BlufBlock text="Parent-app platforms were built around the family experience — daily photos, pickup alerts, parent messaging. Pebbledesk was built around the director's compliance workflow — ratio records, audit exports, subsidy billing. Different jobs." />

						<H2>Feature-by-feature comparison</H2>

						{/* Comparison table */}
						<div className="pd-card" style={{ overflow: "hidden", marginBottom: 28 }}>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "2fr 1fr 1fr",
									background: "var(--pd-p-700)",
									color: "#fff",
								}}
							>
								<div
									style={{
										padding: "14px 18px",
										fontSize: 11,
										fontFamily: "var(--pd-mono)",
										letterSpacing: "0.12em",
									}}
								>
									FEATURE
								</div>
								<div
									style={{
										padding: "14px 12px",
										textAlign: "center",
										fontWeight: 700,
										position: "relative",
										background: "rgba(201,123,99,0.22)",
									}}
								>
									<div
										style={{
											fontSize: 9,
											color: accent,
											fontFamily: "var(--pd-mono)",
											marginBottom: 2,
										}}
									>
										● RECOMMENDED
									</div>
									Pebbledesk
								</div>
								<div
									style={{
										padding: "14px 12px",
										textAlign: "center",
										fontWeight: 600,
										opacity: 0.8,
									}}
								>
									Parent-App Platform
								</div>
							</div>
							{rows.map((r, i) => (
								<div
									key={r.f}
									style={{
										display: "grid",
										gridTemplateColumns: "2fr 1fr 1fr",
										borderTop: "1px solid var(--pd-border)",
										background: i % 2 ? "var(--pd-cream)" : "#fff",
									}}
								>
									<div style={{ padding: "12px 18px", fontSize: 13 }}>{r.f}</div>
									<div
										style={{
											padding: "12px 12px",
											textAlign: "center",
											background: "rgba(201,123,99,0.05)",
										}}
									>
										{r.pd === "✓" ? (
											<Ico name="check" size={16} color="var(--pd-success)" />
										) : (
											<span
												style={{
													fontSize: 12,
													fontFamily: "var(--pd-mono)",
													color: r.pd === "—" ? "var(--pd-muted)" : "var(--pd-warn)",
												}}
											>
												{r.pd}
											</span>
										)}
									</div>
									<div style={{ padding: "12px 12px", textAlign: "center" }}>
										{r.other === "✓" ? (
											<Ico name="check" size={16} color="var(--pd-success)" />
										) : (
											<span
												style={{
													fontSize: 12,
													fontFamily: "var(--pd-mono)",
													color: r.other === "—" ? "var(--pd-muted)" : "var(--pd-warn)",
												}}
											>
												{r.other}
											</span>
										)}
									</div>
								</div>
							))}
						</div>

						<H2>Where parent-app platforms win</H2>
						<BodySection>
							<p>
								If your primary goal is a polished parent experience — daily photos, push
								notifications for pickups, two-way messaging with families — parent-app platforms
								have invested more in that surface. Pebbledesk has a family portal, but it's not the
								product's centerpiece.
							</p>
						</BodySection>

						<H2>Where Pebbledesk wins for licensed centers</H2>
						<BodySection>
							<p>
								Ratio history that survives a licensing visit. Attendance tied to classrooms and
								subsidy eligibility. Audit exports a state inspector can actually use. These are the
								workflows Pebbledesk was built to nail — and parent-app platforms treat as
								afterthoughts.
							</p>
						</BodySection>

						<H2>Verdict</H2>
						<div
							style={{
								padding: "20px 24px",
								background: "var(--pd-cream)",
								borderRadius: 12,
								border: "1px solid var(--pd-border)",
								marginBottom: 24,
							}}
						>
							<p style={{ fontSize: 16, fontWeight: 500, margin: 0, lineHeight: 1.6 }}>
								For a licensed center whose primary compliance burden is ratios, attendance, and
								subsidy billing, Pebbledesk is the clearer choice. If parent communication is the
								top priority and compliance is secondary, a parent-app platform may be a better fit.
							</p>
						</div>

						<FaqSection faqs={faqs} />
						<RelatedPages
							heading="Related comparisons"
							pages={[
								{
									type: "COMPARE",
									t: "Pebbledesk vs. legacy desktop suites",
									d: "Desktop workflow vs. modern web.",
								},
								{ type: "COMPARE", t: "Pebbledesk vs. spreadsheets", d: "Where DIY breaks first." },
								{
									type: "PRICING",
									t: "Pebbledesk pricing",
									d: "All five plans, monthly and annual.",
								},
							]}
						/>
					</div>

					<div style={{ position: "sticky", top: 80 }}>
						<SidebarCta accent={accent} />
						<div className="pd-card" style={{ padding: 20, marginTop: 16 }}>
							<div
								style={{
									fontSize: 11,
									fontFamily: "var(--pd-mono)",
									color: "var(--pd-muted)",
									marginBottom: 12,
									letterSpacing: "0.1em",
								}}
							>
								QUICK FACTS
							</div>
							{[
								{ l: "Pebbledesk starts at", v: "{{plan.home.priceLabel}}" },
								{ l: "Free trial", v: "30 days" },
								{ l: "Migration help", v: "Included on Pro+" },
								{ l: "State-formatted exports", v: "38 states" },
							].map((f) => (
								<div
									key={f.l}
									style={{
										display: "flex",
										justifyContent: "space-between",
										padding: "8px 0",
										borderBottom: "1px solid var(--pd-border)",
										fontSize: 13,
									}}
								>
									<span style={{ color: "var(--pd-muted)" }}>{f.l}</span>
									<span style={{ fontWeight: 700 }}>{f.v}</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 4. STATE / CITY PAGE TEMPLATE  (/childcare-software/[slug])
// ─────────────────────────────────────────────────────────────────
function StateTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const metroRows = [
		{ name: "Houston", count: "2,140" },
		{ name: "Dallas–Fort Worth", count: "1,980" },
		{ name: "San Antonio", count: "1,320" },
		{ name: "Austin", count: "1,100" },
		{ name: "El Paso", count: "680" },
		{ name: "Total — TX", count: "14,200+", bold: true },
	];
	const faqs = [
		{
			q: "What is the staff-to-child ratio in Texas?",
			a: "Texas DFPS requires 1:4 for infants (0–11 months), 1:5 for toddlers (12–17 months), 1:9 for preschool (18 months–3 years), and 1:15 for school age (3+). Ratios must be documented and defensible during licensing visits.",
		},
		{
			q: "Does Texas require CCDF-compliant software?",
			a: "Texas DFPS doesn't mandate specific software, but centers participating in Texas CCDF (Child Care Development Fund) reimbursement must maintain attendance records that match subsidy claims. Pebbledesk ties attendance to claims automatically.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[{ label: "Home" }, { label: "Childcare Software" }, { label: "Texas" }]}
				/>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 300px",
						gap: 40,
						alignItems: "start",
					}}
				>
					<div>
						<div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
							<span className="pd-pill accent">STATE PAGE</span>
							<span className="pd-pill">Texas · TX</span>
						</div>
						<h1
							style={{
								fontSize: 40,
								fontWeight: 800,
								letterSpacing: "-0.025em",
								lineHeight: 1.05,
								margin: "0 0 4px",
							}}
						>
							Childcare Software for Texas Licensed Centers
						</h1>
						<ArticleMeta accent={accent} readTime="7 min read" />

						<BlufBlock text="Texas DFPS licenses over 14,200 childcare facilities — the second-largest market in the US. Centers participating in Texas CCDF or Head Start need software that ties attendance to subsidy claims and exports ratio history in the format inspectors expect." />

						<H2>Licensed childcare in Texas — market overview</H2>
						<BodySection>
							<p>
								Texas is one of the most complex childcare regulatory environments in the US. The
								Texas Department of Family and Protective Services (DFPS) manages licensing, while
								the Texas Workforce Commission oversees CCDF reimbursement. Centers often report to
								both agencies, with different record formats for each.
							</p>
						</BodySection>

						{/* Metro table */}
						<div className="pd-card" style={{ overflow: "hidden", marginBottom: 28 }}>
							<div
								style={{
									padding: "14px 18px",
									background: "var(--pd-p-700)",
									color: "#fff",
									display: "flex",
									justifyContent: "space-between",
								}}
							>
								<div style={{ fontWeight: 700, fontSize: 14 }}>
									Licensed Childcare Facilities — Top Texas Markets
								</div>
							</div>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									padding: "10px 18px 6px",
									fontSize: 11,
									fontFamily: "var(--pd-mono)",
									color: "var(--pd-muted)",
									letterSpacing: "0.1em",
									borderBottom: "1px solid var(--pd-border)",
								}}
							>
								<div>METRO AREA</div>
								<div style={{ textAlign: "right" }}>FACILITIES</div>
							</div>
							{metroRows.map((r) => (
								<div
									key={r.name}
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										padding: "10px 18px",
										fontSize: 13,
										fontWeight: r.bold ? 700 : 400,
										borderTop: r.bold ? "2px solid var(--pd-border)" : "1px solid var(--pd-border)",
										background: r.bold ? "var(--pd-cream)" : "#fff",
									}}
								>
									<div>{r.name}</div>
									<div style={{ textAlign: "right" }}>{r.count}</div>
								</div>
							))}
						</div>

						{/* Licensing notes card */}
						<div
							style={{
								padding: 20,
								background: "var(--pd-a-50)",
								borderRadius: 12,
								border: "1px solid var(--pd-a-200)",
								marginBottom: 16,
							}}
						>
							<div
								style={{
									fontSize: 11,
									fontFamily: "var(--pd-mono)",
									color: "var(--pd-a-700)",
									marginBottom: 8,
									letterSpacing: "0.12em",
								}}
							>
								LICENSING REQUIREMENTS — TEXAS
							</div>
							<p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--pd-text-2)", margin: 0 }}>
								Texas DFPS requires licensed childcare centers to maintain attendance records,
								staff-to-child ratio logs, and incident reports for a minimum of two years. Centers
								receiving CCDF reimbursement must retain claims documentation for three years.
								Electronic records are accepted provided they are printable and accessible within 24
								hours of a licensing request.
							</p>
						</div>

						{/* Enrollment patterns card */}
						<div
							style={{
								padding: 20,
								background: "var(--pd-p-50)",
								borderRadius: 12,
								border: "1px solid var(--pd-p-200)",
								marginBottom: 28,
							}}
						>
							<div
								style={{
									fontSize: 11,
									fontFamily: "var(--pd-mono)",
									color: "var(--pd-p-700)",
									marginBottom: 8,
									letterSpacing: "0.12em",
								}}
							>
								ENROLLMENT PATTERNS — TEXAS
							</div>
							<p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--pd-text-2)", margin: 0 }}>
								Texas enrollment typically peaks in late August (school year start) and drops in
								June as school-age programs shift to summer camp models. CCDF waitlist pressures are
								highest in Houston, Dallas, and Austin metro areas. Summer capacity planning is
								critical for centers serving subsidy families.
							</p>
						</div>

						<InlineSignup
							heading="Running a Texas childcare center?"
							subtext="Start your 30-day free trial. Attendance, ratios, and audit exports built for DFPS licensing."
							accent={accent}
						/>

						<H2>What Texas directors need from childcare software</H2>
						<BodySection>
							<p>
								The most common pain point Texas directors report is the disconnect between their
								daily attendance system and the documentation format DFPS inspectors request.
								Centers running paper logs or generic software often spend 2–3 days before a
								licensing visit manually reorganizing records.
							</p>
							<p style={{ marginTop: 12 }}>
								Pebbledesk ties attendance to ratio history to subsidy claims to audit exports — so
								the records are always in the shape a DFPS inspector expects.
							</p>
						</BodySection>

						<FaqSection faqs={faqs} />
						<RelatedPages
							pages={[
								{
									type: "STATE",
									t: "California childcare software",
									d: "Title 22 + CSPP context.",
								},
								{
									type: "STATE",
									t: "Florida childcare software",
									d: "DCF licensing + School Readiness.",
								},
								{
									type: "GUIDE",
									t: "Staff-to-child ratio by state",
									d: "All 50 states in one table.",
								},
							]}
						/>
					</div>

					<div style={{ position: "sticky", top: 80 }}>
						<SidebarCta accent={accent} />
					</div>
				</div>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 5. FREE TOOL / LEAD MAGNET TEMPLATE  (/free/[slug])
// ─────────────────────────────────────────────────────────────────
function LeadMagnetTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const [unlocked, setUnlocked] = useSt(false);
	const [email, setEmail] = useSt("");
	const bullets = [
		"47 compliance items grouped by category (ratios, records, billing, facility)",
		"Works for DFPS, DCFS, and most state licensing frameworks",
		"Print-ready PDF with checkbox column",
		"Includes corrective action priority column",
		"Updated May 2026",
	];
	const faqs = [
		{
			q: "Is this checklist state-specific?",
			a: "The core 47 items apply across most US state licensing frameworks. A small number are state-specific and labeled accordingly.",
		},
		{
			q: "Can I use this for my annual self-assessment?",
			a: "Yes. Many directors use this checklist once per quarter and before any scheduled licensing visit.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="resources" onNav={onNav} />
			<div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Free Tools" },
						{ label: "Licensing compliance checklist" },
					]}
				/>

				<div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
					<span className="pd-pill accent">FREE TOOL</span>
					<span className="pd-pill">PDF · Printable</span>
					<span className="pd-pill">Audit & Licensing</span>
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
					Childcare Licensing Compliance Checklist (Free PDF)
				</h1>
				<ArticleMeta accent={accent} readTime="2 min" date="Updated May 2026" />

				{/* Cover + bullets side by side */}
				<div
					style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 28, margin: "28px 0" }}
				>
					{/* PDF cover placeholder */}
					<div
						style={{
							borderRadius: 12,
							border: "1px solid var(--pd-border)",
							background: "var(--pd-p-700)",
							aspectRatio: "3/4",
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
							justifyContent: "center",
							padding: 20,
							gap: 10,
							boxShadow: "var(--pd-shadow-md)",
						}}
					>
						<div style={{ fontSize: 32, color: "#fff", opacity: 0.25 }}>📋</div>
						<div
							style={{
								fontSize: 11,
								fontFamily: "var(--pd-mono)",
								color: "rgba(255,255,255,0.6)",
								letterSpacing: "0.1em",
								textAlign: "center",
							}}
						>
							PEBBLEDESK
						</div>
						<div
							style={{
								fontSize: 14,
								fontWeight: 700,
								color: "#fff",
								textAlign: "center",
								lineHeight: 1.3,
							}}
						>
							Licensing Compliance Checklist
						</div>
						<div
							style={{
								marginTop: 8,
								padding: "4px 10px",
								background: accent,
								borderRadius: 999,
								fontSize: 10,
								color: "#fff",
								fontFamily: "var(--pd-mono)",
							}}
						>
							FREE PDF
						</div>
					</div>

					{/* Value bullets */}
					<div className="pd-card" style={{ padding: 24 }}>
						<div
							style={{
								fontSize: 11,
								fontFamily: "var(--pd-mono)",
								color: accent,
								letterSpacing: "0.12em",
								marginBottom: 14,
							}}
						>
							WHAT'S INSIDE
						</div>
						{bullets.map((b) => (
							<div
								key={b}
								style={{
									display: "flex",
									gap: 10,
									alignItems: "flex-start",
									marginBottom: 10,
									fontSize: 14,
								}}
							>
								<span
									style={{
										width: 18,
										height: 18,
										borderRadius: "50%",
										background: "var(--pd-success-soft)",
										display: "grid",
										placeItems: "center",
										flexShrink: 0,
										marginTop: 1,
									}}
								>
									<Ico name="check" size={11} color="var(--pd-success)" />
								</span>
								{b}
							</div>
						))}
						<div
							style={{ marginTop: 12, fontSize: 12, fontStyle: "italic", color: "var(--pd-muted)" }}
						>
							Downloaded by directors across the US
						</div>
					</div>
				</div>

				<BlufBlock text="Walk your building with this 47-item checklist before any licensing visit. Items are grouped by the category inspectors review first — ratios, records, billing, and facility safety." />

				{/* Teaser content */}
				<H2>How to use this checklist</H2>
				<BodySection>
					<p>
						Print one copy per location. Walk through the checklist at least two weeks before a
						scheduled inspection — that leaves enough time to address any gaps. For annual
						self-assessments, use it once per quarter.
					</p>
					<p style={{ marginTop: 12 }}>
						Items marked "Priority" are those most frequently cited in corrective actions. Address
						these first.
					</p>
				</BodySection>

				<H2>Section overview</H2>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(2, 1fr)",
						gap: 12,
						marginBottom: 24,
					}}
				>
					{[
						{ n: "Section A", t: "Ratio & Attendance", c: "12 items" },
						{ n: "Section B", t: "Staff Records", c: "9 items" },
						{ n: "Section C", t: "Child & Family Files", c: "11 items" },
						{ n: "Section D", t: "Billing & Subsidy", c: "8 items" },
						{ n: "Section E", t: "Facility & Safety", c: "7 items" },
					].map((s) => (
						<div
							key={s.n}
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								padding: "12px 16px",
								borderRadius: 10,
								border: "1px solid var(--pd-border)",
								background: "#fff",
							}}
						>
							<div>
								<div
									style={{ fontSize: 11, fontFamily: "var(--pd-mono)", color: "var(--pd-muted)" }}
								>
									{s.n}
								</div>
								<div style={{ fontWeight: 700, fontSize: 14 }}>{s.t}</div>
							</div>
							<span className="pd-pill" style={{ fontSize: 11 }}>
								{s.c}
							</span>
						</div>
					))}
				</div>

				{/* Gate */}
				{!unlocked ? (
					<div
						style={{
							padding: 32,
							background: "var(--pd-p-700)",
							borderRadius: 16,
							textAlign: "center",
							margin: "24px 0",
						}}
					>
						<div
							style={{
								fontSize: 11,
								fontFamily: "var(--pd-mono)",
								color: "var(--pd-a-300)",
								letterSpacing: "0.12em",
								marginBottom: 12,
							}}
						>
							SECTIONS C, D + E + THE FULL PDF
						</div>
						<div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>
							Get the complete checklist — free.
						</div>
						<p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>
							Enter your email to unlock the full 47-item PDF. No spam — just the checklist.
						</p>
						<div style={{ display: "flex", gap: 10, maxWidth: 440, margin: "0 auto" }}>
							<input
								type="email"
								placeholder="you@yourcenter.org"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								style={{
									flex: 1,
									padding: "11px 16px",
									borderRadius: 999,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.1)",
									color: "#fff",
									fontSize: 14,
									fontFamily: "var(--pd-font)",
									outline: "none",
								}}
							/>
							<button
								className="pd-btn pd-btn-primary"
								onClick={() => setUnlocked(true)}
								style={{ background: accent, flexShrink: 0 }}
							>
								Get the checklist
							</button>
						</div>
						<div
							style={{
								marginTop: 12,
								fontSize: 11,
								fontFamily: "var(--pd-mono)",
								color: "rgba(255,255,255,0.4)",
							}}
						>
							NO SPAM · UNSUBSCRIBE ANY TIME
						</div>
					</div>
				) : (
					<div
						style={{
							padding: 24,
							background: "var(--pd-success-soft)",
							borderRadius: 16,
							margin: "24px 0",
							textAlign: "center",
							border: "1px solid rgba(22,101,52,0.2)",
						}}
					>
						<Ico name="check" size={28} color="var(--pd-success)" />
						<div
							style={{ fontWeight: 700, fontSize: 20, color: "var(--pd-success)", marginTop: 8 }}
						>
							Checklist unlocked.
						</div>
						<p style={{ fontSize: 14, color: "var(--pd-text-2)", marginTop: 6 }}>
							The full PDF has been sent to your email. You can also open it below.
						</p>
						<a
							className="pd-btn pd-btn-primary"
							style={{ marginTop: 14, background: accent, display: "inline-flex" }}
						>
							<Ico name="download" size={16} /> Download PDF
						</a>
					</div>
				)}

				<p style={{ fontSize: 13, color: "var(--pd-muted)", marginBottom: 28 }}>
					Prefer a plain version?{" "}
					<a style={{ color: accent, fontWeight: 600, cursor: "pointer" }}>
						Open the printable resource
					</a>
				</p>

				<FaqSection faqs={faqs} />
				<RelatedPages
					pages={[
						{
							type: "TOOLKIT",
							t: "State audit preparation toolkit",
							d: "Binder dividers, email templates, briefing guide.",
						},
						{
							type: "GUIDE",
							t: "Childcare licensing audit prep guide",
							d: "A 12-step walkthrough.",
						},
						{
							type: "FEATURE",
							t: "Audit reports in Pebbledesk",
							d: "One-click exports for state licensing.",
						},
					]}
				/>
			</div>
			<Footer />
		</div>
	);
}

// ─────────────────────────────────────────────────────────────────
// 6. ALTERNATIVES TEMPLATE  (/compare/alternatives/[slug])
// ─────────────────────────────────────────────────────────────────
function AlternativesTemplate({ accent = "var(--pd-a-500)", onNav }) {
	const alts = [
		{
			n: "Pebbledesk",
			badge: "Top pick",
			badge_style: "ok",
			verdict:
				"Built for licensed centers. Ratio monitoring, subsidy billing, and audit exports in one workflow. Best compliance depth of any option here.",
			price: "From {{plan.home.priceLabel}}",
			url: "pebbledesk.app",
		},
		{
			n: "Option B (parent-first)",
			badge: "Best parent UX",
			badge_style: null,
			verdict:
				"Great parent app and photo sharing. Lacks audit-grade compliance reporting and subsidy billing depth.",
			price: "From $150/mo",
		},
		{
			n: "Option C (legacy suite)",
			badge: "Established",
			badge_style: null,
			verdict:
				"Long market history. Dated interface, poor mobile experience, but solid QuickBooks integration.",
			price: "From $99/mo",
		},
		{
			n: "Option D (free tier)",
			badge: "Budget option",
			badge_style: null,
			verdict:
				"Good for family daycare homes. Not suitable for licensed centers with compliance obligations.",
			price: "Free tier + $19/mo",
		},
		{
			n: "Option E (multi-site)",
			badge: "Enterprise",
			badge_style: null,
			verdict:
				"Built for large multi-site operators. Overkill for single-site centers. Pricing reflects complexity.",
			price: "Custom pricing",
		},
	];

	const faqs = [
		{
			q: "How do I evaluate alternatives fairly?",
			a: "Compare on the three dimensions that matter for licensed centers: compliance record export quality, ratio monitoring depth, and subsidy billing support. Everything else is secondary.",
		},
		{
			q: "Can I import my data if I switch?",
			a: "Pebbledesk provides CSV import presets for the most common platforms. Most single-site centers complete migration in under a week.",
		},
	];

	return (
		<div className="pd" style={{ width: "100%", minWidth: 1280 }}>
			<Nav active="compare" onNav={onNav} />
			<div style={{ maxWidth: 920, margin: "0 auto", padding: "40px 40px 80px" }}>
				<Breadcrumbs
					items={[
						{ label: "Home" },
						{ label: "Compare" },
						{ label: "Alternatives" },
						{ label: "Platform X alternatives" },
					]}
				/>

				<div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
					<span className="pd-pill accent">ALTERNATIVES</span>
					<span className="pd-pill">Compare & Pricing</span>
				</div>
				<h1
					style={{
						fontSize: 40,
						fontWeight: 800,
						letterSpacing: "-0.025em",
						lineHeight: 1.05,
						margin: "0 0 4px",
					}}
				>
					Best Platform X Alternatives for Licensed Childcare Centers (2026)
				</h1>
				<ArticleMeta accent={accent} readTime="5 min read" />

				<BlufBlock text="If you're looking at alternatives to your current platform, the right switch depends on what's broken: compliance records, billing, parent communication, or pricing. This guide breaks down five options with honest verdicts." />

				{/* Quick comparison strip */}
				<div className="pd-card" style={{ padding: 0, overflow: "hidden", marginBottom: 36 }}>
					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
							background: "var(--pd-p-700)",
							color: "#fff",
							fontSize: 11,
							fontFamily: "var(--pd-mono)",
							letterSpacing: "0.1em",
						}}
					>
						<div style={{ padding: "12px 16px" }}>OPTION</div>
						<div style={{ padding: "12px 12px", textAlign: "center" }}>AUDIT DEPTH</div>
						<div style={{ padding: "12px 12px", textAlign: "center" }}>SUBSIDY BILLING</div>
						<div style={{ padding: "12px 12px", textAlign: "center" }}>STARTS AT</div>
					</div>
					{[
						{
							n: "Pebbledesk",
							audit: "Full",
							sub: "✓",
							price: "{{plan.home.priceLabel}}",
							hi: true,
						},
						{ n: "Option B", audit: "Basic", sub: "—", price: "$150/mo" },
						{ n: "Option C", audit: "Partial", sub: "Partial", price: "$99/mo" },
						{ n: "Option D", audit: "—", sub: "—", price: "$19/mo" },
						{ n: "Option E", audit: "Full", sub: "✓", price: "Custom" },
					].map((r, i) => (
						<div
							key={r.n}
							style={{
								display: "grid",
								gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
								borderTop: "1px solid var(--pd-border)",
								background: r.hi ? "rgba(201,123,99,0.06)" : i % 2 ? "var(--pd-cream)" : "#fff",
							}}
						>
							<div style={{ padding: "12px 16px", fontWeight: r.hi ? 700 : 400, fontSize: 13 }}>
								{r.n}{" "}
								{r.hi && (
									<span className="pd-pill ok" style={{ fontSize: 9, marginLeft: 6 }}>
										<span className="dot" />
										Best
									</span>
								)}
							</div>
							<div
								style={{
									padding: "12px 12px",
									textAlign: "center",
									fontSize: 12,
									fontFamily: "var(--pd-mono)",
									color:
										r.audit === "Full"
											? "var(--pd-success)"
											: r.audit === "—"
												? "var(--pd-muted)"
												: "var(--pd-warn)",
								}}
							>
								{r.audit}
							</div>
							<div style={{ padding: "12px 12px", textAlign: "center" }}>
								{r.sub === "✓" ? (
									<Ico name="check" size={14} color="var(--pd-success)" />
								) : (
									<span
										style={{ fontSize: 12, color: "var(--pd-muted)", fontFamily: "var(--pd-mono)" }}
									>
										{r.sub}
									</span>
								)}
							</div>
							<div
								style={{
									padding: "12px 12px",
									textAlign: "center",
									fontSize: 12,
									fontFamily: "var(--pd-mono)",
									fontWeight: r.hi ? 700 : 400,
								}}
							>
								{r.price}
							</div>
						</div>
					))}
				</div>

				{alts.map((a, i) => (
					<section
						key={a.n}
						style={{
							marginBottom: 40,
							paddingBottom: 40,
							borderBottom: i < alts.length - 1 ? "1px solid var(--pd-border)" : "none",
						}}
					>
						<div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
							<h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{a.n}</h2>
							{a.badge && (
								<span className={`pd-pill ${a.badge_style || ""}`} style={{ fontSize: 11 }}>
									{a.badge_style === "ok" && <span className="dot" />}
									{a.badge}
								</span>
							)}
						</div>
						<div
							style={{
								display: "flex",
								gap: 10,
								marginBottom: 12,
								fontSize: 12,
								color: "var(--pd-muted)",
								fontFamily: "var(--pd-mono)",
							}}
						>
							<span>{a.price}</span>
							{a.url && (
								<>
									<span>·</span>
									<span style={{ color: accent }}>{a.url}</span>
								</>
							)}
						</div>
						<p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "var(--pd-text-2)" }}>
							{a.verdict}
						</p>
						{i === 0 && (
							<a
								className="pd-btn pd-btn-primary pd-btn-sm"
								style={{ marginTop: 14, background: accent, display: "inline-flex" }}
							>
								Try Pebbledesk free →
							</a>
						)}
					</section>
				))}

				<FaqSection faqs={faqs} />
				<RelatedPages
					heading="Related comparisons"
					pages={[
						{
							type: "COMPARE",
							t: "Pebbledesk vs. parent-app platforms",
							d: "Built for directors, not parents.",
						},
						{
							type: "BEST",
							t: "Best childcare audit software",
							d: "Four tools compared on compliance depth.",
						},
						{ type: "PRICING", t: "Pebbledesk pricing", d: "All five plans, monthly and annual." },
					]}
				/>
			</div>
			<Footer />
		</div>
	);
}

window.GuideTemplate = GuideTemplate;
window.ListicleTemplate = ListicleTemplate;
window.VersusTemplate = VersusTemplate;
window.StateTemplate = StateTemplate;
window.LeadMagnetTemplate = LeadMagnetTemplate;
window.AlternativesTemplate = AlternativesTemplate;
