// result.jsx — Generated event card + drill-in detail views
// Each section card is clickable → opens a full-screen detail.

function EventResultCard({ data, onDismiss, onConfirm }) {
  const [detail, setDetail] = React.useState(null); // null | 'calendar' | 'payment' | 'map'

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 20, animation: 'zen-fadein 200ms ease',
    }} onClick={onDismiss}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '92%',
        background: '#0f0f10',
        borderRadius: '20px 20px 0 0',
        border: `1px solid ${KB.divider}`,
        borderBottom: 'none',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        animation: 'zen-slideup 320ms cubic-bezier(.2,.7,.2,1)',
        fontFamily: '-apple-system, system-ui',
        position: 'relative',
      }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#3a3a3c' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '6px 18px 14px', display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <ZenemicLogo size={32} glow={false} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: KB.textDim, fontWeight: 600, letterSpacing: 0.4 }}>
              ZENEMIC · GENERATED
            </div>
            <div style={{ fontSize: 17, color: '#fff', fontWeight: 600, marginTop: 2 }}>
              {data.title}
            </div>
          </div>
          <button onClick={onDismiss} style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>{Ic.close('#fff', 14)}</button>
        </div>

        {/* Scrollable sections */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10,
          WebkitOverflowScrolling: 'touch',
        }}>
          <ClickableBlock
            tint="#4285F4"
            icon={<GCalIcon />}
            label="Google Calendar"
            title="Event created"
            summary={data.when}
            sub={data.where}
            onClick={() => setDetail('calendar')}
          />
          <ClickableBlock
            tint="#635BFF"
            icon={<StripeIcon />}
            label="Stripe · Payment split"
            title={`$${data.total} ÷ ${data.guests.length + 1}`}
            summary={`$${(data.total / (data.guests.length + 1)).toFixed(2)} per person`}
            sub={`${data.guests.length} pending requests`}
            onClick={() => setDetail('payment')}
            avatars={['You', ...data.guests]}
          />
          <ClickableBlock
            tint="#34A853"
            icon={<MapIcon />}
            label="Google Maps"
            title="Directions ready"
            summary={data.where}
            sub="12 min · 4.2 mi"
            onClick={() => setDetail('map')}
            mapPreview
          />

          {/* Hint */}
          <div style={{
            fontSize: 11, color: KB.textDim, textAlign: 'center',
            padding: '4px 8px', opacity: 0.7,
          }}>Tap any card to review or edit before confirming</div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 14px 18px', borderTop: `1px solid ${KB.divider}`,
          display: 'flex', gap: 10, flexShrink: 0,
          background: '#0f0f10',
        }}>
          <button onClick={onDismiss} style={btnSecondary}>Discard</button>
          <button onClick={onConfirm} style={btnPrimary}>
            {Ic.sparkle('#fff', 14)} Confirm all
          </button>
        </div>

        {/* Drill-in detail */}
        {detail === 'calendar' && <CalendarDetail data={data} onBack={() => setDetail(null)} />}
        {detail === 'payment' && <PaymentDetail data={data} onBack={() => setDetail(null)} />}
        {detail === 'map' && <MapDetail data={data} onBack={() => setDetail(null)} />}
      </div>
    </div>
  );
}

const btnPrimary = {
  flex: 2, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
  color: '#fff', fontSize: 15, fontWeight: 600,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  background: `linear-gradient(90deg, ${KB.accentA}, ${KB.accentB})`,
  fontFamily: '-apple-system, system-ui',
  boxShadow: `0 8px 24px ${KB.accentB}44`,
};
const btnSecondary = {
  flex: 1, height: 44, borderRadius: 12,
  border: `1px solid ${KB.divider}`, cursor: 'pointer',
  background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 500,
  fontFamily: '-apple-system, system-ui',
};

// ───────────── Clickable summary block ─────────────
function ClickableBlock({ icon, label, title, summary, sub, tint, onClick, avatars, mapPreview }) {
  const [press, setPress] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      onMouseLeave={() => setPress(false)}
      style={{
        background: press ? '#222225' : '#18181a',
        borderRadius: 16,
        border: `1px solid ${KB.divider}`,
        overflow: 'hidden', textAlign: 'left',
        cursor: 'pointer', padding: 0,
        transition: 'background 100ms, transform 100ms',
        transform: press ? 'scale(0.99)' : 'scale(1)',
        fontFamily: '-apple-system, system-ui',
        width: '100%',
      }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 14px 12px',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${tint}22`, color: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: KB.textDim, fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>
          <div style={{ fontSize: 15, color: '#fff', fontWeight: 600, marginTop: 2 }}>{title}</div>
        </div>
        <div style={{
          fontSize: 10, color: tint, fontWeight: 700, padding: '3px 7px',
          borderRadius: 99, background: `${tint}1a`, letterSpacing: 0.3,
        }}>READY</div>
        {Ic.chevron(KB.textDim, 18)}
      </div>

      {mapPreview && <MapPreview where={summary} compact />}

      <div style={{ padding: mapPreview ? '10px 14px 12px' : '0 14px 12px' }}>
        <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{summary}</div>
        <div style={{ fontSize: 12, color: KB.textDim, marginTop: 2 }}>{sub}</div>
        {avatars && (
          <div style={{ display: 'flex', marginTop: 8 }}>
            {avatars.map((p, i) => (
              <div key={p} style={{
                width: 22, height: 22, borderRadius: '50%',
                background: ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6'][i % 5],
                color: '#fff', fontSize: 10, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #18181a',
                marginLeft: i === 0 ? 0 : -7,
              }}>{p[0]}</div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ───────────── Detail screen wrapper ─────────────
function DetailScreen({ tint, label, title, icon, onBack, children, footer }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#0a0a0b',
      zIndex: 10,
      display: 'flex', flexDirection: 'column',
      animation: 'zen-slidein 280ms cubic-bezier(.2,.7,.2,1)',
      fontFamily: '-apple-system, system-ui',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${KB.divider}`, flexShrink: 0,
        background: `linear-gradient(180deg, ${tint}1a 0%, transparent 100%)`,
      }}>
        <button onClick={onBack} style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
        </button>
        <div style={{
          width: 30, height: 30, borderRadius: 8, background: `${tint}22`, color: tint,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: KB.textDim, fontWeight: 600, letterSpacing: 0.4 }}>{label}</div>
          <div style={{ fontSize: 16, color: '#fff', fontWeight: 600, marginTop: 1 }}>{title}</div>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: 12,
        WebkitOverflowScrolling: 'touch',
      }}>{children}</div>

      {/* Footer actions */}
      {footer && (
        <div style={{
          padding: '10px 14px 14px',
          borderTop: `1px solid ${KB.divider}`,
          background: '#0a0a0b', flexShrink: 0,
          display: 'flex', gap: 8,
        }}>{footer}</div>
      )}
    </div>
  );
}

// ───────────── Calendar detail ─────────────
function CalendarDetail({ data, onBack }) {
  const [going, setGoing] = React.useState({ You: 'yes', Sam: 'pending', Alex: 'pending', Priya: 'pending' });
  const cycle = (n) => setGoing({ ...going, [n]: going[n] === 'yes' ? 'no' : going[n] === 'no' ? 'pending' : 'yes' });
  return (
    <DetailScreen
      tint="#4285F4"
      icon={<GCalIcon />}
      label="GOOGLE CALENDAR"
      title="Event details"
      onBack={onBack}
      footer={
        <React.Fragment>
          <button style={{ ...btnSecondary, flex: 1 }}>Edit</button>
          <button style={{ ...btnPrimary, background: '#4285F4', boxShadow: '0 6px 18px #4285F455' }}>
            Add to my calendar
          </button>
        </React.Fragment>
      }>
      {/* Title */}
      <Field label="Event">
        <div style={{ fontSize: 17, color: '#fff', fontWeight: 600 }}>{data.title}</div>
      </Field>

      {/* When */}
      <Field label="When">
        <div style={{ fontSize: 15, color: '#fff' }}>{data.when}</div>
        <div style={{ fontSize: 13, color: KB.textDim, marginTop: 2 }}>Repeats: never · GMT−7</div>
      </Field>

      {/* Where */}
      <Field label="Where">
        <div style={{ fontSize: 15, color: '#fff' }}>{data.where}</div>
        <div style={{
          marginTop: 8, padding: '6px 10px', borderRadius: 8,
          background: 'rgba(66,133,244,0.12)', color: '#4285F4',
          fontSize: 12, fontWeight: 600, display: 'inline-flex', gap: 4,
        }}>📍 Open in Maps</div>
      </Field>

      {/* Guests RSVP */}
      <Field label="Guests">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['You', ...data.guests].map((p, i) => (
            <div key={p} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
            }}>
              <Avatar name={p} index={i} />
              <span style={{ fontSize: 14, color: '#fff', flex: 1 }}>{p}</span>
              <button onClick={() => cycle(p)} style={{
                fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
                background: going[p] === 'yes' ? 'rgba(34,197,94,0.18)' :
                            going[p] === 'no' ? 'rgba(255,77,77,0.18)' : 'rgba(245,158,11,0.18)',
                color: going[p] === 'yes' ? '#4ade80' :
                       going[p] === 'no' ? '#FF8585' : '#fbbf24',
                border: 'none', cursor: 'pointer',
              }}>
                {going[p] === 'yes' ? 'Going' : going[p] === 'no' ? 'Declined' : 'Pending'}
              </button>
            </div>
          ))}
        </div>
      </Field>

      {/* Notes auto-extracted */}
      <Field label="Notes generated by Zenemic">
        <div style={{
          fontSize: 13, color: KB.textDim, lineHeight: 1.5,
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.18)',
        }}>
          Dinner reservation auto-detected. Bill ${data.total} split across {data.guests.length + 1} people via Stripe. Reminder set for 1 hour before.
        </div>
      </Field>

      {/* Reminders */}
      <Field label="Reminders">
        <RowItem text="1 hour before" right="Notification" />
        <RowItem text="1 day before"  right="Email" />
        <RowItem text="+ Add reminder" right="" muted />
      </Field>
    </DetailScreen>
  );
}

// ───────────── Payment (Stripe) detail ─────────────
function PaymentDetail({ data, onBack }) {
  const people = ['You', ...data.guests];
  const [shares, setShares] = React.useState(people.map(() => +(data.total / people.length).toFixed(2)));

  const adjust = (i, delta) => {
    const next = [...shares];
    next[i] = Math.max(0, +(next[i] + delta).toFixed(2));
    setShares(next);
  };

  const subtotal = shares.reduce((a, b) => a + b, 0);

  return (
    <DetailScreen
      tint="#635BFF"
      icon={<StripeIcon />}
      label="STRIPE · PAYMENT SPLIT"
      title={`$${data.total} bill`}
      onBack={onBack}
      footer={
        <React.Fragment>
          <button style={{ ...btnSecondary, flex: 1 }}>Save draft</button>
          <button style={{ ...btnPrimary, background: '#635BFF', boxShadow: '0 6px 18px #635BFF55' }}>
            Send {people.length - 1} requests
          </button>
        </React.Fragment>
      }>
      {/* Total */}
      <div style={{
        padding: '18px', borderRadius: 16,
        background: 'linear-gradient(135deg, #635BFF22, #635BFF08)',
        border: '1px solid rgba(99,91,255,0.25)',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 11, color: '#a8a4ff', fontWeight: 600, letterSpacing: 0.5 }}>BILL TOTAL</div>
        <div style={{ fontSize: 36, color: '#fff', fontWeight: 700, marginTop: 4, fontFamily: 'SF Pro Display, -apple-system, system-ui' }}>
          ${data.total.toFixed(2)}
        </div>
        <div style={{ fontSize: 12, color: KB.textDim, marginTop: 4 }}>
          Splitting across {people.length} people · Status: {subtotal === data.total ? '✓ Balanced' : `${subtotal > data.total ? 'Over' : 'Under'} by $${Math.abs(subtotal - data.total).toFixed(2)}`}
        </div>
      </div>

      {/* Split mode toggle */}
      <Field label="Split method">
        <div style={{ display: 'flex', gap: 6, background: '#18181a', borderRadius: 10, padding: 4 }}>
          {['Equal', 'By share', 'By item'].map((m, i) => (
            <button key={m} style={{
              flex: 1, height: 32, borderRadius: 7, border: 'none', cursor: 'pointer',
              background: i === 0 ? '#2a2a2c' : 'transparent',
              color: i === 0 ? '#fff' : KB.textDim, fontSize: 13, fontWeight: 500,
              fontFamily: '-apple-system, system-ui',
            }}>{m}</button>
          ))}
        </div>
      </Field>

      {/* Per-person split */}
      <Field label="Who pays what">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {people.map((p, i) => (
            <div key={p} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)',
            }}>
              <Avatar name={p} index={i} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: '#fff' }}>{p}</div>
                <div style={{ fontSize: 11, color: KB.textDim }}>{i === 0 ? 'Host · already paid' : p === 'Sam' ? 'sam@stripe.example' : 'via Apple Pay'}</div>
              </div>
              <button onClick={() => adjust(i, -1)} style={stepBtn}>−</button>
              <div style={{
                minWidth: 64, textAlign: 'center', fontSize: 14, color: '#fff',
                fontWeight: 600, background: '#0f0f10', padding: '6px 8px', borderRadius: 8,
              }}>${shares[i].toFixed(2)}</div>
              <button onClick={() => adjust(i, 1)} style={stepBtn}>+</button>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Options">
        <RowItem text="Send via SMS + email" right="On" toggle />
        <RowItem text="Auto-remind after 24 hours" right="On" toggle />
        <RowItem text="Allow tipping" right="Off" toggle off />
      </Field>
    </DetailScreen>
  );
}

const stepBtn = {
  width: 28, height: 28, borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)', color: '#fff',
  border: 'none', fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

// ───────────── Map detail ─────────────
function MapDetail({ data, onBack }) {
  return (
    <DetailScreen
      tint="#34A853"
      icon={<MapIcon />}
      label="GOOGLE MAPS"
      title={data.where.split('·')[0].trim()}
      onBack={onBack}
      footer={
        <React.Fragment>
          <button style={{ ...btnSecondary, flex: 1 }}>Share link</button>
          <button style={{ ...btnPrimary, background: '#34A853', boxShadow: '0 6px 18px #34A85355' }}>
            Open in Google Maps
          </button>
        </React.Fragment>
      }>
      <MapPreview where={data.where} height={200} />

      {/* Travel modes */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[
          { ico: '🚗', label: 'Drive', time: '12 min', active: true },
          { ico: '🚆', label: 'Transit', time: '24 min' },
          { ico: '🚶', label: 'Walk', time: '48 min' },
          { ico: '🚴', label: 'Bike',  time: '18 min' },
        ].map(m => (
          <div key={m.label} style={{
            flex: 1, padding: '10px 6px', borderRadius: 12,
            background: m.active ? 'rgba(52,168,83,0.18)' : 'rgba(255,255,255,0.04)',
            border: m.active ? '1px solid rgba(52,168,83,0.5)' : '1px solid transparent',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 18 }}>{m.ico}</div>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, marginTop: 2 }}>{m.time}</div>
            <div style={{ fontSize: 10, color: KB.textDim }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Steps */}
      <Field label="Turn-by-turn">
        {[
          { dir: '↑',  text: 'Head north on Mission St',    dist: '0.3 mi' },
          { dir: '↱',  text: 'Turn right onto 16th St',       dist: '0.5 mi' },
          { dir: '↰',  text: 'Turn left onto Valencia St',    dist: '1.1 mi' },
          { dir: '●',  text: 'Arrive at Bottega — on right', dist: '' },
        ].map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            marginBottom: 6,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: i === 3 ? '#34A85333' : 'rgba(255,255,255,0.08)',
              color: i === 3 ? '#4ade80' : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
            }}>{s.dir}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: '#fff' }}>{s.text}</div>
              {s.dist && <div style={{ fontSize: 11, color: KB.textDim }}>{s.dist}</div>}
            </div>
          </div>
        ))}
      </Field>

      <Field label="Place">
        <div style={{ fontSize: 14, color: '#fff', fontWeight: 600 }}>Bottega</div>
        <div style={{ fontSize: 13, color: KB.textDim, marginTop: 2 }}>Italian · $$ · ★ 4.6 (1,243 reviews)</div>
        <div style={{ fontSize: 13, color: KB.textDim, marginTop: 4 }}>313 Valencia St, San Francisco, CA</div>
        <div style={{ fontSize: 13, color: '#4ade80', marginTop: 4 }}>Open until 11:00 PM</div>
      </Field>
    </DetailScreen>
  );
}

// ───────────── Helpers ─────────────
function Field({ label, children }) {
  return (
    <div>
      <div style={{
        fontSize: 11, color: KB.textDim, fontWeight: 600,
        letterSpacing: 0.4, marginBottom: 6, paddingLeft: 4,
      }}>{label.toUpperCase()}</div>
      <div style={{
        background: '#18181a', borderRadius: 12,
        border: `1px solid ${KB.divider}`,
        padding: 12,
      }}>{children}</div>
    </div>
  );
}

function RowItem({ text, right, muted, toggle, off }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 4px',
    }}>
      <span style={{ fontSize: 14, color: muted ? KB.textDim : '#fff' }}>{text}</span>
      {toggle ? (
        <div style={{
          width: 32, height: 18, borderRadius: 99,
          background: off ? '#3a3a3c' : KB.accentB,
          position: 'relative',
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 2, left: off ? 2 : 16,
            transition: 'left 180ms',
          }} />
        </div>
      ) : (
        <span style={{ fontSize: 13, color: KB.textDim }}>{right}</span>
      )}
    </div>
  );
}

function Avatar({ name, index }) {
  const palette = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6'];
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%',
      background: palette[index % palette.length],
      color: '#fff', fontSize: 12, fontWeight: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{name[0]}</div>
  );
}

function MapPreview({ where, compact, height }) {
  const h = height || (compact ? 90 : 140);
  return (
    <div style={{
      height: h, overflow: 'hidden',
      background: '#1a2e22', position: 'relative',
      borderRadius: compact ? 0 : 12,
      borderBottom: compact ? `1px solid ${KB.divider}` : 'none',
    }}>
      <svg width="100%" height="100%" viewBox="0 0 320 140" preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <pattern id="streets" width="32" height="32" patternUnits="userSpaceOnUse">
            <rect width="32" height="32" fill="#1a2e22"/>
            <path d="M0 16 H32 M16 0 V32" stroke="#2a4a36" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="320" height="140" fill="url(#streets)"/>
        <rect x="40" y="20" width="60" height="32" fill="#2d4a36" rx="2"/>
        <rect x="220" y="70" width="70" height="40" fill="#2d4a36" rx="2"/>
        <path d="M0 100 Q60 80 130 95 T 320 90 L320 140 L0 140 Z" fill="#1e3a52"/>
        <path d="M-10 85 Q80 70 160 80 T 340 70" stroke="#3a5a45" strokeWidth="3" fill="none"/>
        <path d="M30 110 Q90 80 160 75 T 250 50" stroke={KB.accentB} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <circle cx="30" cy="110" r="5" fill="#fff" stroke={KB.accentA} strokeWidth="2"/>
        <g transform="translate(250 50)">
          <path d="M0 -14 C-7 -14 -10 -8 -10 -4 C-10 4 0 10 0 10 C0 10 10 4 10 -4 C10 -8 7 -14 0 -14z" fill={KB.accentB}/>
          <circle r="3" fill="#fff" cy="-5"/>
        </g>
      </svg>
      <div style={{
        position: 'absolute', bottom: 8, left: 8,
        fontSize: 11, color: '#fff', background: 'rgba(0,0,0,0.65)',
        padding: '3px 8px', borderRadius: 99, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: KB.accentB }} />
        {where.split('·')[0].trim()}
      </div>
    </div>
  );
}

// Brand icons
function GCalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <rect x="11" y="13" width="3" height="3" fill="currentColor"/>
    </svg>
  );
}
function StripeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M13 8c0-1 1-1.5 2.4-1.5 1.6 0 3.2.6 4 1V4c-1-.4-2.4-.8-4-.8-3 0-5.4 1.6-5.4 4.4 0 4.3 6 3.6 6 5.5 0 1-1 1.4-2.4 1.4-1.7 0-4-.7-5-1.3v3.5c1.2.5 3 1 5 1 3 0 5.4-1.5 5.4-4.4 0-4.6-6-3.8-6-5.3z" fill="currentColor"/>
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8.7 2 6 4.7 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.3-2.7-6-6-6z" stroke="currentColor" strokeWidth="1.7"/>
      <circle cx="12" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.7"/>
    </svg>
  );
}

Object.assign(window, { EventResultCard });
