/* global React, Nav, Footer, Ico */
const { useState: useSt } = React;

// ─────────────────────────────────────────────────────────────────
// Shared SEO page primitives
// ─────────────────────────────────────────────────────────────────

const Breadcrumbs = ({ items }) => (
  <nav style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontFamily: 'var(--pd-mono)', letterSpacing: '0.06em', color: 'var(--pd-muted)', marginBottom: 24 }}>
    {items.map((b, i) => (
      <React.Fragment key={b.label}>
        {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
        <a style={{ color: i === items.length - 1 ? 'var(--pd-text)' : 'var(--pd-muted)', fontWeight: i === items.length - 1 ? 600 : 400 }}>{b.label.toUpperCase()}</a>
      </React.Fragment>
    ))}
  </nav>
);

const ArticleMeta = ({ date = 'Updated May 3, 2026', readTime = '8 min read', accent }) => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14, fontSize: 12, fontFamily: 'var(--pd-mono)', color: 'var(--pd-muted)', letterSpacing: '0.05em' }}>
    <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--pd-p-200)', color: 'var(--pd-p-700)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>PD</div>
    <span>PEBBLEDESK TEAM</span>
    <span style={{ opacity: 0.4 }}>·</span>
    <span>{date}</span>
    <span style={{ opacity: 0.4 }}>·</span>
    <span>{readTime}</span>
  </div>
);

const BlufBlock = ({ text }) => (
  <div style={{ padding: '16px 20px', background: 'var(--pd-cream)', borderLeft: '3px solid var(--pd-a-500)', borderRadius: '0 10px 10px 0', marginBottom: 28 }}>
    <div style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em', color: 'var(--pd-a-700)', marginBottom: 6 }}>TLDR</div>
    <p style={{ fontSize: 15, lineHeight: 1.55, margin: 0, fontStyle: 'italic', color: 'var(--pd-text-2)' }}>{text}</p>
  </div>
);

const TocItem = ({ depth, text, active }) => (
  <a style={{
    display: 'block', fontSize: 13, lineHeight: 1.4, paddingLeft: (depth - 2) * 12 + 12,
    paddingTop: 6, paddingBottom: 6, paddingRight: 12,
    color: active ? 'var(--pd-a-700)' : 'var(--pd-text-2)',
    fontWeight: active ? 600 : 400,
    borderLeft: active ? '2px solid var(--pd-a-500)' : '2px solid transparent',
    cursor: 'pointer',
  }}>{text}</a>
);

const TocSidebar = ({ headings, accent }) => (
  <div className="pd-card" style={{ padding: 0, overflow: 'hidden', width: 260 }}>
    <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--pd-border)', fontSize: 11, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em', color: 'var(--pd-muted)' }}>ON THIS PAGE</div>
    {headings.map((h, i) => <TocItem key={h.text} depth={h.depth || 2} text={h.text} active={i === 0} />)}
  </div>
);

const SidebarCta = ({ accent }) => (
  <div className="pd-card" style={{ padding: 20, background: 'var(--pd-p-700)', color: '#fff', marginTop: 16 }}>
    <div style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', letterSpacing: '0.12em', color: accent || 'var(--pd-a-300)', marginBottom: 10 }}>TRY IT FREE</div>
    <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2, marginBottom: 10 }}>Keep attendance, ratios, and audit records ready before anyone asks.</div>
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 16 }}>30-day free trial. No credit card required. 3-day reminder email.</div>
    <a className="pd-btn pd-btn-primary" style={{ width: '100%', justifyContent: 'center', background: accent || 'var(--pd-a-500)' }}>Start free trial</a>
  </div>
);

const InlineSignup = ({ heading, subtext, accent }) => (
  <div style={{ padding: '24px 24px', background: 'var(--pd-cream)', borderRadius: 14, border: '1px solid var(--pd-border)', margin: '36px 0' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>{heading}</div>
        <p style={{ fontSize: 13, color: 'var(--pd-muted)', marginTop: 6, lineHeight: 1.5 }}>{subtext}</p>
      </div>
      <a className="pd-btn pd-btn-primary" style={{ whiteSpace: 'nowrap', background: accent || 'var(--pd-a-500)' }}>Start free trial</a>
    </div>
  </div>
);

const FaqSection = ({ faqs }) => {
  const [open, setOpen] = useSt(0);
  return (
    <div style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>Frequently asked questions</h2>
      {faqs.map((f, i) => (
        <div key={f.q} className="pd-card" style={{ padding: 0, marginBottom: 8, overflow: 'hidden' }}>
          <button onClick={() => setOpen(i === open ? -1 : i)} style={{
            width: '100%', textAlign: 'left', padding: '16px 20px', background: 'transparent', border: 0, cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'var(--pd-font)', fontSize: 15, fontWeight: 600, color: 'var(--pd-text)',
          }}>
            {f.q}
            <span style={{ fontSize: 18, opacity: 0.5, transition: 'transform .15s', transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
          </button>
          {open === i && (
            <div style={{ padding: '0 20px 16px', fontSize: 14, lineHeight: 1.6, color: 'var(--pd-text-2)', borderTop: '1px solid var(--pd-border)' }}>
              <p style={{ margin: '14px 0 0' }}>{f.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const RelatedPages = ({ pages, heading = 'Related resources' }) => (
  <div style={{ marginTop: 48, padding: '32px 0', borderTop: '1px solid var(--pd-border)' }}>
    <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{heading}</h3>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {pages.map(p => (
        <a key={p.t} className="pd-card" style={{ padding: 16, display: 'block', cursor: 'pointer' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--pd-mono)', color: 'var(--pd-a-700)', letterSpacing: '0.12em', marginBottom: 6 }}>{p.type}</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{p.t}</div>
          <div style={{ fontSize: 12, color: 'var(--pd-muted)', marginTop: 4 }}>{p.d}</div>
        </a>
      ))}
    </div>
  </div>
);

const ProsCons = ({ subject, pros, cons }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '16px 0' }}>
    <div style={{ padding: 16, background: 'var(--pd-success-soft)', borderRadius: 12, border: '1px solid rgba(22,101,52,0.15)' }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', color: 'var(--pd-success)', marginBottom: 10, letterSpacing: '0.12em' }}>PROS — {subject}</div>
      {pros.map(p => (
        <div key={p} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <Ico name="check" size={14} color="var(--pd-success)" />
          <span>{p}</span>
        </div>
      ))}
    </div>
    <div style={{ padding: 16, background: 'var(--pd-error-soft)', borderRadius: 12, border: '1px solid rgba(185,28,28,0.12)' }}>
      <div style={{ fontSize: 11, fontFamily: 'var(--pd-mono)', color: 'var(--pd-error)', marginBottom: 10, letterSpacing: '0.12em' }}>CONS — {subject}</div>
      {cons.map(c => (
        <div key={c} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--pd-error)', fontWeight: 700, lineHeight: 1.2, flexShrink: 0 }}>–</span>
          <span>{c}</span>
        </div>
      ))}
    </div>
  </div>
);

const BodySection = ({ children }) => (
  <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--pd-text-2)', marginBottom: 24 }}>{children}</div>
);

const H2 = ({ children }) => <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', margin: '36px 0 12px', color: 'var(--pd-text)', lineHeight: 1.15 }}>{children}</h2>;
const H3 = ({ children }) => <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', margin: '28px 0 10px', color: 'var(--pd-text)', lineHeight: 1.2 }}>{children}</h3>;

Object.assign(window, {
  Breadcrumbs, ArticleMeta, BlufBlock, TocSidebar, SidebarCta,
  InlineSignup, FaqSection, RelatedPages, ProsCons, BodySection, H2, H3,
});
