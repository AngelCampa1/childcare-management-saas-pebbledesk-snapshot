/* global React, Nav, Footer, Ico, ProductDashboard, AttendanceCard, SubsidyCard, AuditCard */
const { useState } = React;

function FeaturesPage({ accent = 'var(--pd-a-500)', onNav }) {
  const pillars = [
    {
      eyebrow: 'DAILY OPERATIONS',
      h: 'The live operational loop directors monitor all day.',
      body: 'Attendance, ratios, and scheduling stay tied to one record so what happens on the floor is the source of truth.',
      features: [
        { t: 'Attendance tracking', d: 'Tablet check-in by room, tied to ratio + audit log.' },
        { t: 'Ratio tracking', d: 'Live ratio status with history. Green/amber/red.' },
        { t: 'Staff scheduling', d: 'Coverage built around the rooms that need staff.' },
      ],
      visual: <ProductDashboard compact />,
    },
    {
      eyebrow: 'FAMILY & ROOM RECORDS',
      h: 'Every family detail attached to the right child.',
      body: 'Enrollment, guardians, classrooms, pickup permissions, and subsidy eligibility — managed as one structured record set.',
      features: [
        { t: 'Enrollment & records', d: 'Documents, agreements, immunizations, allergies.' },
        { t: 'Guardians & pickup', d: 'Authorized pickup with photo verification.' },
        { t: 'Subsidy eligibility', d: 'CCDF/CACFP eligibility tied to family record.' },
      ],
      visual: <AttendanceCard />,
    },
    {
      eyebrow: 'BILLING & COMPLIANCE',
      h: 'Records become proof, automatically.',
      body: 'Subsidy workflows, invoices, public payments, audit exports, and reporting stay tied to the daily record — never a side spreadsheet.',
      features: [
        { t: 'Subsidy billing', d: 'CCDF, CACFP, and state. Reconciliation built in.' },
        { t: 'Billing & payments', d: 'Invoices, parent pay links, QuickBooks sync.' },
        { t: 'Audit reports', d: 'One-click exports formatted for state licensing.' },
      ],
      visual: <SubsidyCard />,
    },
    {
      eyebrow: 'ROLLOUT & SCALE',
      h: 'Land cleanly. Stay there.',
      body: 'Migration support, outbound messaging, QuickBooks support, and cross-center visibility help Pebbledesk feel complete as the operation grows.',
      features: [
        { t: 'Imports & migration', d: 'CSV import + presets for common platforms.' },
        { t: 'Messaging & alerts', d: 'Reach families during the day, not after.' },
        { t: 'Multi-location oversight', d: 'Cross-center ratio + compliance rollup.' },
      ],
      visual: <AuditCard />,
    },
  ];

  // Plan comparison matrix
  const planRows = [
    { group: 'Daily operations', items: [
      { f: 'Attendance tracking', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Live ratio monitoring', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Historical ratio reports', h: false, cs: true, cp: true, g: true, e: true },
      { f: 'Staff scheduling', h: false, cs: true, cp: true, g: true, e: true },
    ]},
    { group: 'Records', items: [
      { f: 'Family + child records', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Documents & immunizations', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Custom record fields', h: false, cs: false, cp: true, g: true, e: true },
    ]},
    { group: 'Billing & compliance', items: [
      { f: 'Invoices + parent payments', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Subsidy billing (CCDF/CACFP)', h: false, cs: true, cp: true, g: true, e: true },
      { f: 'QuickBooks sync', h: false, cs: true, cp: true, g: true, e: true },
      { f: 'One-click audit exports', h: false, cs: true, cp: true, g: true, e: true },
      { f: 'Custom audit templates', h: false, cs: false, cp: true, g: true, e: true },
    ]},
    { group: 'Rollout & scale', items: [
      { f: 'CSV imports', h: true, cs: true, cp: true, g: true, e: true },
      { f: 'Migration presets', h: false, cs: false, cp: true, g: true, e: true },
      { f: 'Multi-location oversight', h: false, cs: false, cp: false, g: true, e: true },
      { f: 'Dedicated rollout manager', h: false, cs: false, cp: false, g: true, e: true },
      { f: 'SSO + advanced security', h: false, cs: false, cp: false, g: false, e: true },
    ]},
  ];
  const planCols = [
    { k: 'h', n: 'Home' },
    { k: 'cs', n: 'Center Starter' },
    { k: 'cp', n: 'Center Pro', hi: true },
    { k: 'g', n: 'Group' },
    { k: 'e', n: 'Enterprise' },
  ];
  const tick = (v, hi) => v
    ? <Ico name="check" size={16} color={hi ? '#fff' : 'var(--pd-success)'} />
    : <span style={{ color: 'var(--pd-muted)', opacity: 0.5 }}>—</span>;

  return (
    <div className="pd" style={{ width: '100%', minWidth: 1280 }}>
      <Nav active="features" onNav={onNav} />
      <section className="pd-hero-halo" style={{ padding: '70px 60px 50px' }}>
        <div style={{ maxWidth: 760 }}>
          <div className="caption" style={{ color: accent, marginBottom: 16 }}>FEATURES</div>
          <h1 className="display" style={{ fontSize: 64 }}>Every workflow feeds the same <span className="pd-mark">audit-ready record.</span></h1>
          <p className="body-lg" style={{ marginTop: 22, maxWidth: 620 }}>
            Start with the part of the day causing the most rework. Attendance, ratios, records, billing, and reports each have their own workflow — the proof stays connected.
          </p>
        </div>
      </section>

      {pillars.map((p, i) => (
        <section key={p.eyebrow} style={{ padding: '70px 60px', background: i % 2 ? 'var(--pd-cream)' : 'var(--pd-surface)', borderTop: '1px solid var(--pd-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 50, alignItems: 'center', direction: i % 2 ? 'rtl' : 'ltr' }}>
            <div style={{ direction: 'ltr' }}>
              <div className="caption" style={{ color: accent, marginBottom: 14 }}>{p.eyebrow}</div>
              <h2 className="h1" style={{ fontSize: 38 }}>{p.h}</h2>
              <p className="body-lg" style={{ marginTop: 16 }}>{p.body}</p>
              <div style={{ marginTop: 24, display: 'grid', gap: 14 }}>
                {p.features.map(f => (
                  <div key={f.t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--pd-success-soft)', color: 'var(--pd-success)', display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2 }}>
                      <Ico name="check" size={13} color="var(--pd-success)" />
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>{f.t}</div>
                      <div style={{ fontSize: 13, color: 'var(--pd-muted)', marginTop: 2 }}>{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ direction: 'ltr', display: 'flex', justifyContent: 'center' }}>{p.visual}</div>
          </div>
        </section>
      ))}

      {/* PLAN COMPARISON TABLE */}
      <section style={{ padding: '90px 60px', background: 'var(--pd-surface)', borderTop: '1px solid var(--pd-border)' }}>
        <div style={{ maxWidth: 720, marginBottom: 36 }}>
          <div className="caption" style={{ color: accent, marginBottom: 14 }}>WHAT'S IN EACH PLAN</div>
          <h2 className="h1" style={{ fontSize: 40 }}>Every feature, in one table.</h2>
          <p className="body-lg" style={{ marginTop: 14 }}>
            See exactly which workflows are included on each plan.
          </p>
        </div>

        <div className="pd-card" style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(5, 1fr)', background: 'var(--pd-p-700)', color: '#fff' }}>
            <div style={{ padding: '16px 20px', fontSize: 12, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em', fontWeight: 600 }}>FEATURE</div>
            {planCols.map(c => (
              <div key={c.k} style={{ padding: '16px 12px', textAlign: 'center', fontSize: 13, fontWeight: 700, position: 'relative', background: c.hi ? 'rgba(201,123,99,0.2)' : 'transparent' }}>
                {c.n}
                {c.hi && <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', fontSize: 8, color: accent, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em' }}>● POPULAR</div>}
              </div>
            ))}
          </div>
          {planRows.map(grp => (
            <React.Fragment key={grp.group}>
              <div style={{ background: 'var(--pd-cream)', padding: '10px 20px', fontSize: 11, fontFamily: 'var(--pd-mono)', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--pd-muted)', fontWeight: 600, borderTop: '1px solid var(--pd-border)' }}>
                {grp.group}
              </div>
              {grp.items.map((row, i) => (
                <div key={row.f} style={{ display: 'grid', gridTemplateColumns: '2fr repeat(5, 1fr)', borderTop: i === 0 ? 'none' : '1px solid var(--pd-border)', background: '#fff' }}>
                  <div style={{ padding: '14px 20px', fontSize: 14 }}>{row.f}</div>
                  {planCols.map(c => (
                    <div key={c.k} style={{ padding: '14px 12px', textAlign: 'center', background: c.hi ? 'rgba(201,123,99,0.05)' : 'transparent' }}>
                      {tick(row[c.k], false)}
                    </div>
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>

        <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--pd-muted)' }}>
          See <a href="#pricing" className="pd-link-arrow">full pricing →</a>
        </div>
      </section>

      <section className="pd-section-ink" style={{ padding: '80px 60px', textAlign: 'center' }}>
        <h2 className="h1" style={{ color: '#fff', fontSize: 44 }}>See it on a real Tuesday.</h2>
        <p className="body-lg" style={{ marginTop: 16, maxWidth: 560, margin: '16px auto 0' }}>30-day free trial. We email you 3 days before it ends.</p>
        <div style={{ marginTop: 28, display: 'flex', justifyContent: 'center', gap: 12 }}>
          <a className="pd-btn pd-btn-primary pd-btn-lg">Start free trial</a>
          <a className="pd-btn pd-btn-ghost pd-btn-lg" style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}>Book a demo</a>
        </div>
      </section>
      <Footer />
    </div>
  );
}

// Pricing — billing toggle, expandable feature lists
function PricingPage({ accent = 'var(--pd-a-500)', onNav }) {
  const [billing, setBilling] = useState('annual'); // 'annual' | 'monthly'
  const [openTier, setOpenTier] = useState(null);

  // monthly price; annual = 20% off
  const tiers = [
    {
      n: 'Home', monthly: 36, annualMonthly: 29, d: 'Family childcare programs',
      core: ['Attendance + live ratios','Family & child records','CSV import','Email support'],
      all: ['Up to 12 children','Tablet check-in','Live ratio monitoring','Family + guardian records','Document storage','Allergy + immunization tracking','CSV import','Parent payment links','Email support']
    },
    {
      n: 'Center Starter', monthly: 110, annualMonthly: 89, d: 'Single licensed center',
      core: ['Everything in Home','Subsidy billing','Audit exports','QuickBooks sync'],
      all: ['Up to 60 children','Everything in Home','Subsidy billing (CCDF/CACFP)','State-formatted audit exports','QuickBooks sync','Invoice automation','Basic reporting','Chat support']
    },
    {
      n: 'Center Pro', monthly: 210, annualMonthly: 169, d: 'Larger single sites', hi: true,
      core: ['Everything in Starter','Advanced reporting','Custom audit templates','Migration presets','Priority support'],
      all: ['Unlimited children','Everything in Starter','Advanced reporting + dashboards','Custom audit templates','Custom record fields','Migration presets for common platforms','Priority chat + phone support','API access']
    },
    {
      n: 'Group', monthly: 430, annualMonthly: 349, d: '2–5 locations',
      core: ['Everything in Pro','Cross-center oversight','Group billing','Dedicated rollout manager'],
      all: ['Everything in Pro','Cross-center ratio rollup','Group billing & invoicing','Dedicated rollout manager','Quarterly business reviews','Premium support SLA']
    },
    {
      n: 'Enterprise', monthly: null, annualMonthly: null, d: '6+ locations',
      core: ['Everything in Group','SSO + advanced security','Custom integrations','Annual contracts'],
      all: ['Everything in Group','SSO (SAML, OIDC)','Advanced security & audit logs','Custom integrations','Sandbox environment','Custom contract terms','24/7 support']
    },
  ];

  const fmt = (n) => '$' + n.toLocaleString();

  return (
    <div className="pd" style={{ width: '100%', minWidth: 1280 }}>
      <Nav active="pricing" onNav={onNav} />
      <section className="pd-hero-halo" style={{ padding: '70px 60px 40px', textAlign: 'center' }}>
        <div className="caption" style={{ color: accent, marginBottom: 16 }}>PRICING</div>
        <h1 className="display" style={{ fontSize: 64, maxWidth: 900, margin: '0 auto' }}>Pricing that fits the program <span className="pd-mark">you run today.</span></h1>
        <p className="body-lg" style={{ marginTop: 20, maxWidth: 580, margin: '20px auto 0' }}>
          30-day free trial on every plan. No credit card required. We email you 3 days before the trial ends.
        </p>

        {/* Billing toggle */}
        <div style={{ marginTop: 32, display: 'inline-flex', alignItems: 'center', gap: 4, padding: 5, background: '#fff', borderRadius: 999, border: '1px solid var(--pd-border)', boxShadow: 'var(--pd-shadow-sm)' }}>
          <button onClick={() => setBilling('monthly')} style={{ border: 0, padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: 'var(--pd-font)', cursor: 'pointer', background: billing === 'monthly' ? 'var(--pd-p-700)' : 'transparent', color: billing === 'monthly' ? '#fff' : 'var(--pd-text-2)' }}>
            Monthly
          </button>
          <button onClick={() => setBilling('annual')} style={{ border: 0, padding: '8px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600, fontFamily: 'var(--pd-font)', cursor: 'pointer', background: billing === 'annual' ? 'var(--pd-p-700)' : 'transparent', color: billing === 'annual' ? '#fff' : 'var(--pd-text-2)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Annual
            <span style={{ background: accent, color: '#fff', fontSize: 10, padding: '2px 7px', borderRadius: 999, fontFamily: 'var(--pd-mono)', letterSpacing: '0.08em' }}>SAVE 20%</span>
          </button>
        </div>
      </section>

      <section style={{ padding: '20px 60px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, alignItems: 'flex-start' }}>
          {tiers.map(t => {
            const isEnt = t.monthly == null;
            const price = billing === 'annual' ? t.annualMonthly : t.monthly;
            const open = openTier === t.n;
            const visibleFeatures = open ? t.all : t.core;
            return (
              <div key={t.n} className="pd-card" style={{
                padding: 22, position: 'relative',
                background: t.hi ? 'var(--pd-p-700)' : '#fff',
                color: t.hi ? '#fff' : 'var(--pd-text)',
                borderColor: t.hi ? 'var(--pd-p-700)' : 'var(--pd-border)',
                boxShadow: t.hi ? '0 18px 50px -10px rgba(47,65,56,0.4)' : 'var(--pd-shadow-sm)',
                transform: t.hi ? 'translateY(-12px)' : 'none',
              }}>
                {t.hi && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: accent, color: '#fff', padding: '3px 10px', borderRadius: 999, fontSize: 10, fontFamily: 'var(--pd-mono)', letterSpacing: '0.1em', fontWeight: 600 }}>BEST FIT</div>}
                <div className="caption" style={{ color: t.hi ? 'rgba(255,255,255,0.7)' : 'var(--pd-muted)' }}>{t.n}</div>

                <div style={{ marginTop: 14, minHeight: 64 }}>
                  {isEnt ? (
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Talk to us</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmt(price)}</span>
                        <span style={{ fontSize: 13, color: t.hi ? 'rgba(255,255,255,0.65)' : 'var(--pd-muted)' }}>/mo</span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', color: t.hi ? 'rgba(255,255,255,0.65)' : 'var(--pd-muted)', marginTop: 4, letterSpacing: '0.04em' }}>
                        {billing === 'annual' ? `BILLED ANNUALLY · ${fmt(price * 12)}/yr` : 'BILLED MONTHLY'}
                      </div>
                    </>
                  )}
                </div>

                <div style={{ fontSize: 13, marginTop: 10, opacity: 0.85 }}>{t.d}</div>

                <button className={t.hi ? 'pd-btn pd-btn-primary' : 'pd-btn pd-btn-ghost'} style={{ width: '100%', justifyContent: 'center', marginTop: 18, ...(t.hi ? { background: accent, color: '#fff' } : {}) }}>
                  {isEnt ? 'Contact sales' : 'Start free trial'}
                </button>

                <div style={{ marginTop: 18, display: 'grid', gap: 8 }}>
                  {visibleFeatures.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.4 }}>
                      <Ico name="check" size={13} color={t.hi ? 'var(--pd-a-300)' : 'var(--pd-success)'} />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setOpenTier(open ? null : t.n)}
                  style={{
                    marginTop: 14, width: '100%', background: 'transparent', border: 0,
                    fontSize: 12, fontWeight: 600, fontFamily: 'var(--pd-font)',
                    color: t.hi ? 'rgba(255,255,255,0.85)' : 'var(--pd-a-700)',
                    cursor: 'pointer', padding: 8, borderTop: '1px solid ' + (t.hi ? 'rgba(255,255,255,0.15)' : 'var(--pd-border)'),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {open ? 'Show less' : `See all ${t.all.length} features`}
                  <span style={{ fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>▼</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="pd-card" style={{ marginTop: 60, padding: 32, background: 'var(--pd-cream)' }}>
          <div className="caption" style={{ color: accent, marginBottom: 14 }}>PLAN FIT GUIDE</div>
          <h3 className="h2">Not sure which plan? Here's the rule of thumb.</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 24 }}>
            {[
              { t: 'Family home', d: 'Up to ~12 children · Home plan' },
              { t: 'One licensed center', d: '< 60 kids → Starter · 60+ → Pro' },
              { t: '2–5 locations', d: 'Group plan with cross-center oversight' },
              { t: '6+ locations', d: 'Enterprise · talk to us about rollout' },
            ].map(g => (
              <div key={g.t} style={{ borderLeft: `2px solid ${accent}`, paddingLeft: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{g.t}</div>
                <div style={{ fontSize: 13, color: 'var(--pd-muted)', marginTop: 4 }}>{g.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 60 }}>
          <h3 className="h2" style={{ marginBottom: 24 }}>Common questions</h3>
          {[
            { q: 'Do I need a credit card to start the trial?', a: 'No. No credit card is required to start your 30-day free trial. We email you 3 days before the trial ends — add a payment method any time before it ends to continue without interruption.' },
            { q: 'What\u2019s the difference between monthly and annual billing?', a: 'Annual saves you 20%. You pay once for the year up front; the listed price is the equivalent monthly rate. Monthly billing charges your card every month and you can cancel any time.' },
            { q: 'Can I migrate from my current childcare platform?', a: 'Yes — Center Pro and above include migration presets that map exports from common childcare platforms. Group + Enterprise include a dedicated rollout manager.' },
            { q: 'Do you support CCDF / CACFP / state subsidies?', a: 'Yes. Subsidy claim workflows are included in Center Starter and above, with state-specific export formats supported across the US.' },
          ].map(f => (
            <div key={f.q} className="pd-card" style={{ padding: 20, marginBottom: 10 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{f.q}</div>
              <div className="body" style={{ marginTop: 8, fontSize: 14 }}>{f.a}</div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

// Compare — generic categories instead of named competitors
function ComparePage({ accent = 'var(--pd-a-500)', onNav }) {
  const cats = [
    { k: 'pd', n: 'Pebbledesk', sub: 'Built for the director', hi: true },
    { k: 'parent', n: 'Parent-app platforms', sub: 'Built for the family side' },
    { k: 'legacy', n: 'Legacy childcare suites', sub: 'Old-school all-in-one' },
    { k: 'sheets', n: 'Spreadsheets + binders', sub: 'What you\u2019re probably doing now' },
  ];

  const rows = [
    { c: 'Live ratio monitoring', pd: true, parent: 'partial', legacy: 'partial', sheets: false },
    { c: 'Historical ratio reports for licensing', pd: true, parent: false, legacy: 'partial', sheets: 'partial' },
    { c: 'CCDF / CACFP / state subsidy billing', pd: true, parent: false, legacy: 'partial', sheets: 'partial' },
    { c: 'One-click audit-ready PDF export', pd: true, parent: false, legacy: false, sheets: false },
    { c: 'QuickBooks sync', pd: true, parent: 'partial', legacy: true, sheets: false },
    { c: 'Built specifically for licensed centers', pd: true, parent: 'partial', legacy: 'partial', sheets: false },
    { c: 'Single-screen director dashboard', pd: true, parent: false, legacy: false, sheets: false },
    { c: 'CSV import from existing tools', pd: true, parent: false, legacy: false, sheets: 'partial' },
    { c: 'Migration help included', pd: true, parent: false, legacy: 'partial', sheets: false },
    { c: 'Parent app for daily updates', pd: 'partial', parent: true, legacy: true, sheets: false },
    { c: 'Family communication / messaging', pd: true, parent: true, legacy: true, sheets: 'partial' },
    { c: 'Modern UI built in the last 5 years', pd: true, parent: true, legacy: false, sheets: false },
  ];

  const cell = (v) => v === true
    ? <Ico name="check" size={18} color="var(--pd-success)" />
    : v === 'partial'
      ? <span style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', color: 'var(--pd-warn)' }}>PARTIAL</span>
      : <span style={{ color: 'var(--pd-muted)', fontSize: 16 }}>—</span>;

  return (
    <div className="pd" style={{ width: '100%', minWidth: 1280 }}>
      <Nav active="compare" onNav={onNav} />
      <section className="pd-hero-halo" style={{ padding: '70px 60px 30px' }}>
        <div style={{ maxWidth: 760 }}>
          <div className="caption" style={{ color: accent, marginBottom: 16 }}>HOW WE COMPARE</div>
          <h1 className="display" style={{ fontSize: 60 }}>Built for the director, <span className="pd-mark">not the parent app.</span></h1>
          <p className="body-lg" style={{ marginTop: 18 }}>
            Most childcare software was built around parent updates or 20-year-old desktop suites. Pebbledesk starts from the daily record a director actually has to defend.
          </p>
        </div>
      </section>

      <section style={{ padding: '40px 60px 80px' }}>
        <div className="pd-card" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr 1.1fr 1.1fr 1.1fr', background: 'var(--pd-p-700)', color: '#fff' }}>
            <div style={{ padding: '20px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em' }}>FEATURE</div>
            {cats.map(c => (
              <div key={c.k} style={{ padding: '16px 14px', textAlign: 'center', position: 'relative', background: c.hi ? 'rgba(201,123,99,0.18)' : 'transparent' }}>
                {c.hi && <div style={{ fontSize: 9, color: accent, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em', marginBottom: 4 }}>● US</div>}
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.n}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3 }}>{c.sub}</div>
              </div>
            ))}
          </div>
          {rows.map((r, i) => (
            <div key={r.c} style={{ display: 'grid', gridTemplateColumns: '2fr 1.1fr 1.1fr 1.1fr 1.1fr', borderTop: '1px solid var(--pd-border)', background: i % 2 ? 'var(--pd-cream)' : '#fff' }}>
              <div style={{ padding: '14px 20px', fontSize: 14 }}>{r.c}</div>
              <div style={{ padding: '14px 20px', textAlign: 'center', background: 'rgba(201,123,99,0.05)' }}>{cell(r.pd)}</div>
              <div style={{ padding: '14px 20px', textAlign: 'center' }}>{cell(r.parent)}</div>
              <div style={{ padding: '14px 20px', textAlign: 'center' }}>{cell(r.legacy)}</div>
              <div style={{ padding: '14px 20px', textAlign: 'center' }}>{cell(r.sheets)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, marginTop: 60 }}>
          {[
            { t: 'Made for compliance, not parent updates.', d: 'Parent-first apps put the family experience first. Pebbledesk puts the audit binder first. Different jobs, different software.' },
            { t: 'Migrate cleanly, in a week.', d: 'Pull a CSV export from whatever you\u2019re using today. Pebbledesk maps it on first import — children, guardians, classrooms, attendance.' },
          ].map(c => (
            <div key={c.t} className="pd-card" style={{ padding: 24 }}>
              <h3 className="h3">{c.t}</h3>
              <p className="body" style={{ marginTop: 8 }}>{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}

window.FeaturesPage = FeaturesPage;
window.PricingPage = PricingPage;
window.ComparePage = ComparePage;
