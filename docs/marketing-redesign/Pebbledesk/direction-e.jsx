/* global React, SketchHeader, ProductShot, Annotation */

// Direction E — "Bold stacked manifesto"
// Big, opinionated typographic statements stacked. Black/cream blocks
// alternating. Personality dialed up. One bold swing.

const DirectionE = () => {
	return (
		<div className="wf paper" style={{ width: 1280, padding: 0 }}>
			<SketchHeader />

			{/* hero block — big black slab */}
			<div style={{ background: "var(--ink)", color: "var(--paper)", padding: "70px 40px 60px" }}>
				<div className="mono" style={{ color: "var(--terracotta-soft)" }}>
					PEBBLEDESK · THE AUDIT-READY CHILDCARE PLATFORM
				</div>
				<h1
					className="hand-d"
					style={{
						fontSize: 132,
						lineHeight: 0.92,
						margin: "18px 0 0",
						letterSpacing: "-0.015em",
						color: "var(--paper)",
					}}
				>
					The state can <br />
					show up <span style={{ color: "var(--terracotta)" }}>any</span> Tuesday.
				</h1>
				<h2
					className="hand-d"
					style={{ fontSize: 64, marginTop: 24, color: "var(--paper-2)", lineHeight: 1 }}
				>
					Be the center that says{" "}
					<span className="squiggle" style={{ filter: "invert(1)" }}>
						"come on in."
					</span>
				</h2>
				<div style={{ display: "flex", gap: 14, marginTop: 36, alignItems: "center" }}>
					<button
						className="btn"
						style={{
							background: "var(--terracotta)",
							borderColor: "var(--terracotta)",
							color: "#fff",
							boxShadow: "3px 3px 0 var(--paper-2)",
						}}
					>
						Start 30-day free trial
					</button>
					<button
						className="btn"
						style={{
							background: "transparent",
							color: "var(--paper)",
							borderColor: "var(--paper)",
						}}
					>
						Why we built this →
					</button>
				</div>
			</div>

			{/* belief band */}
			<div style={{ padding: "50px 40px", borderBottom: "2px solid var(--ink)" }}>
				<div className="mono" style={{ color: "var(--terracotta)" }}>
					WHAT WE BELIEVE
				</div>
				<div style={{ marginTop: 18 }}>
					{[
						{ n: "01", t: "Compliance is the product.", b: "Not a feature. The whole point." },
						{
							n: "02",
							t: "Directors aren't software people.",
							b: "And they shouldn't have to be.",
						},
						{
							n: "03",
							t: "The day is the record.",
							b: "If it didn't happen on the floor, it shouldn't live in a spreadsheet.",
						},
					].map((row, i) => (
						<div
							key={row.n}
							style={{
								display: "grid",
								gridTemplateColumns: "120px 1fr 1.2fr",
								alignItems: "center",
								padding: "22px 0",
								borderTop: i === 0 ? "none" : "1.5px dashed var(--ink)",
							}}
						>
							<div
								className="hand-d"
								style={{ fontSize: 64, color: "var(--terracotta)", lineHeight: 1 }}
							>
								{row.n}
							</div>
							<div className="hand-d" style={{ fontSize: 40, lineHeight: 1.05 }}>
								{row.t}
							</div>
							<div style={{ fontSize: 16, color: "var(--ink-2)", lineHeight: 1.5 }}>{row.b}</div>
						</div>
					))}
				</div>
			</div>

			{/* product slab — big single screenshot, very confident */}
			<div
				style={{
					padding: "60px 40px",
					background: "var(--paper-2)",
					borderBottom: "2px solid var(--ink)",
				}}
			>
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1.6fr",
						gap: 40,
						alignItems: "center",
					}}
				>
					<div>
						<div className="mono" style={{ color: "var(--terracotta)" }}>
							THE WHOLE THING
						</div>
						<h3 className="hand-d" style={{ fontSize: 56, lineHeight: 0.95, margin: "8px 0 16px" }}>
							One screen. <span className="squiggle">Everything.</span>
						</h3>
						<p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink-2)", maxWidth: 360 }}>
							Attendance, ratios, billing, subsidy claims, family records, audit exports — woven
							into one record, not bolted onto five.
						</p>
						<Annotation rotate={-2} style={{ marginTop: 20 }}>
							↘ no, really. it's all there.
						</Annotation>
					</div>
					<ProductShot
						kind="ratio"
						width="100%"
						height={380}
						style={{ boxShadow: "10px 10px 0 var(--ink)" }}
					/>
				</div>
			</div>

			{/* Pricing teaser — minimal */}
			<div style={{ padding: "60px 40px" }}>
				<div className="mono" style={{ color: "var(--terracotta)" }}>
					PRICING THAT FITS THE PROGRAM YOU RUN NOW
				</div>
				<div
					style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 16 }}
				>
					{[
						{ n: "Home", p: "{{plan.home.promoPriceLabel}}", d: "Family childcare" },
						{
							n: "Center Starter",
							p: "{{plan.center_starter.promoPriceLabel}}",
							d: "Single licensed site",
						},
						{
							n: "Center Pro",
							p: "{{plan.center_pro.promoPriceLabel}}",
							d: "Larger single site",
							hi: true,
						},
						{ n: "Group", p: "{{plan.group.promoPriceLabel}}", d: "2–5 locations" },
						{ n: "Enterprise", p: "Talk to us", d: "6+ locations" },
					].map((t) => (
						<div
							key={t.n}
							className="box solid"
							style={{
								padding: 16,
								background: t.hi ? "var(--terracotta)" : "var(--paper)",
								color: t.hi ? "#fff" : "var(--ink)",
								borderColor: t.hi ? "var(--terracotta)" : "var(--ink)",
							}}
						>
							<div className="mono" style={{ fontSize: 10, opacity: t.hi ? 0.8 : 0.6 }}>
								{t.n}
							</div>
							<div className="hand-d" style={{ fontSize: 36, lineHeight: 1, marginTop: 6 }}>
								{t.p}
							</div>
							<div style={{ fontSize: 12, marginTop: 4, opacity: 0.85 }}>{t.d}</div>
						</div>
					))}
				</div>
				<p
					style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}
				>
					30-DAY FREE TRIAL · NO CREDIT CARD REQUIRED · 3-DAY REMINDER EMAIL
				</p>
			</div>

			{/* Final slab */}
			<div
				style={{
					background: "var(--terracotta)",
					color: "#fff",
					padding: "70px 40px",
					textAlign: "center",
				}}
			>
				<h2 className="hand-d" style={{ fontSize: 88, lineHeight: 0.95, color: "#fff" }}>
					Be the center
					<br />
					that's <u>already ready.</u>
				</h2>
				<button
					className="btn"
					style={{
						background: "var(--ink)",
						borderColor: "var(--ink)",
						color: "var(--paper)",
						marginTop: 28,
					}}
				>
					Start your free trial →
				</button>
			</div>
		</div>
	);
};

window.DirectionE = DirectionE;
