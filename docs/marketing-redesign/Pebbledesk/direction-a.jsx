/* global React, SketchHeader, ProductShot, Annotation */

// Direction A — "Editorial / Newsprint"
// A confident, hand-set magazine front page. Big serif-feeling display headline,
// product visible as a single inline screenshot. Calm, trustworthy.

const DirectionA = () => {
  return (
    <div className="wf paper" style={{ width: 1280, padding: '0 0 60px' }}>
      <SketchHeader />

      {/* dateline */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 40px', borderBottom: '1px solid var(--ink)', fontFamily: 'var(--mono)', fontSize: 11 }}>
        <div>VOL. 1 · ISSUE 04</div>
        <div>THE AUDIT-READY CHILDCARE PLATFORM</div>
        <div>SPRING 2026</div>
      </div>

      {/* hero */}
      <div style={{ padding: '60px 40px 40px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 50 }}>
        <div>
          <div className="mono" style={{ color: 'var(--terracotta)' }}>For licensed centers</div>
          <h1 className="hand-d" style={{
            fontSize: 88, lineHeight: 0.95, margin: '14px 0 0',
            fontWeight: 700, letterSpacing: '-0.01em'
          }}>
            Audit-ready<br />
            records<br />
            <span className="squiggle">without</span> the<br />
            end-of-week<br />
            scramble.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, marginTop: 28, maxWidth: 460, color: 'var(--ink-2)' }}>
            Attendance, ratios, billing, family records, and audit exports
            in one childcare workflow. Built for the director who already has
            a thousand things to do.
          </p>
          <div style={{ display: 'flex', gap: 14, marginTop: 30, alignItems: 'center' }}>
            <button className="btn primary">Start 30-day free trial</button>
            <button className="btn ghost">Or see a 2-min tour →</button>
          </div>
          <div style={{ marginTop: 22, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)' }}>
            NO CREDIT CARD REQUIRED · 3-DAY REMINDER EMAIL · CANCEL ANY TIME
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <ProductShot kind="ratio" width="100%" height={360} style={{ transform: 'rotate(0.8deg)' }} />
          <Annotation rotate={-4} style={{ position: 'absolute', top: -28, right: -20, fontSize: 18 }}>
            ratios, live ↘
          </Annotation>
          <Annotation rotate={3} style={{ position: 'absolute', bottom: -34, left: 20, color: 'var(--ink)', fontSize: 16 }}>
            ↖ &nbsp;every cell ties back to one record
          </Annotation>
        </div>
      </div>

      {/* trust signal strip */}
      <div style={{ margin: '24px 40px', padding: '18px 24px', border: '1.5px dashed var(--ink)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 30 }}>
        <div className="mono">USED BY DIRECTORS AT</div>
        {['Sunny Days', 'Little Acorns', 'Bright Path', 'Maple St. Co-op', 'Riverside KCC'].map((n) => (
          <div key={n} className="hand-d" style={{ fontSize: 22, opacity: 0.7 }}>{n}</div>
        ))}
      </div>

      {/* The 4-step "promise" — laid out as a newspaper bulletin */}
      <div style={{ padding: '50px 40px 30px' }}>
        <div className="mono" style={{ color: 'var(--terracotta)' }}>WHAT IT DOES</div>
        <h2 className="hand-d" style={{ fontSize: 56, margin: '8px 0 30px', lineHeight: 1 }}>
          One daily record. <span className="squiggle">Four jobs done.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, border: '1.5px solid var(--ink)', borderRadius: 6, overflow: 'hidden', background: 'var(--ink)' }}>
          {[
            { n: '01', t: 'Capture the day', body: 'Attendance, room changes, and staff coverage start in one record.' },
            { n: '02', t: 'Keep context attached', body: 'Guardian, billing, pickup, subsidy details — all stay with the child.' },
            { n: '03', t: 'Turn records into proof', body: 'Invoices, claims, reports, and audit exports point back to the same daily record.' },
            { n: '04', t: 'Start without a rebuild', body: 'CSV import, Brightwheel + Procare presets, and rollout support.' },
          ].map((c) => (
            <div key={c.n} style={{ background: 'var(--paper)', padding: 20, minHeight: 230 }}>
              <div className="hand-d" style={{ fontSize: 44, color: 'var(--terracotta)', lineHeight: 1 }}>{c.n}</div>
              <div className="hand" style={{ fontSize: 19, fontWeight: 700, marginTop: 6 }}>{c.t}</div>
              <p style={{ fontSize: 13, marginTop: 8, lineHeight: 1.5, color: 'var(--ink-2)' }}>{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* small CTA band */}
      <div style={{ margin: '40px 40px 0', padding: 28, border: '2px solid var(--ink)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--paper-2)' }}>
        <div>
          <div className="hand-d" style={{ fontSize: 32, lineHeight: 1.1 }}>Read more inside →</div>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4 }}>Pricing · Features · Compare to Brightwheel & Procare</div>
        </div>
        <button className="btn primary">Start free trial</button>
      </div>
    </div>
  );
};

window.DirectionA = DirectionA;
