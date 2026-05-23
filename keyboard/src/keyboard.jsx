// keyboard.jsx — Zenemic AI Keyboard
//
// A dark iOS-style keyboard with a Zenemic logo button in the suggestion bar
// that, when pressed, expands the keyboard vertically and opens an AI-powered
// "event prompt" — the user describes an event in natural language, hits
// Generate, and a backend (Anthropic API) parses the description and creates
// a Google Calendar event, Stripe payment split, and Google Maps directions.
//
// This file contains:
//   - <ZenemicKeyboard />      — the keyboard itself + suggestion bar + prompt panel
//   - <ZenemicLogo />          — the brand mark (also used in result views)
//   - The Ic icon set and KB color tokens
//
// All typing state (text buffer, shift, caps lock) is owned by the parent.
// The keyboard is a controlled component: it emits key presses via onKey
// and the parent applies them to whichever target field is focused.

const KB = {
  // Keyboard chrome (iOS dark)
  bg:        '#1c1c1e',
  surface:   '#1c1c1e',
  key:       '#6b6b6e',         // letter keys
  keyAlt:    '#3a3a3c',         // shift / delete / 123 / return
  text:      '#ffffff',
  textDim:   '#a8a8ad',
  divider:   'rgba(255,255,255,0.08)',

  // Zenemic brand gradient
  accentA:   '#8B5CF6',         // violet
  accentB:   '#EC4899',         // pink
  accentC:   '#F59E0B',         // amber

  // Result tints
  red:       '#FF4D4D',
  ok:        '#22C55E',
  blue:      '#3B82F6',
};

// ───────────────────────────────────────────────────────────
// Zenemic logo button. Tapping this in the suggestion bar
// puts the keyboard into "listening" mode.
// ───────────────────────────────────────────────────────────
function ZenemicLogo({ size = 32, active = false, onPress, glow = true }) {
  const id = React.useId();
  return (
    <button
      onClick={onPress}
      aria-label="Zenemic — start event prompt"
      style={{
        width: size, height: size, borderRadius: '50%',
        border: 'none', padding: 0, cursor: 'pointer',
        background: 'transparent', position: 'relative',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        outline: 'none',
        transition: 'transform 180ms cubic-bezier(.2,.7,.2,1)',
        transform: active ? 'scale(0.92)' : 'scale(1)',
      }}>
      {glow && (
        <span style={{
          position: 'absolute', inset: -5, borderRadius: '50%',
          background: `radial-gradient(closest-side, ${KB.accentB}66, transparent 70%)`,
          filter: 'blur(6px)', opacity: active ? 1 : 0.65,
          transition: 'opacity 200ms',
        }} />
      )}
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ position: 'relative' }}>
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor={KB.accentA} />
            <stop offset="55%" stopColor={KB.accentB} />
            <stop offset="100%" stopColor={KB.accentC} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill={`url(#g-${id})`} />
        {/* Stylized Z mark */}
        <path
          d="M12 13 H28 L16 22 H28 M12 27 H28"
          stroke="#fff" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round" fill="none"
        />
        <circle cx="30" cy="11" r="2.2" fill="#fff" />
      </svg>
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// Icon set
// ───────────────────────────────────────────────────────────
const Ic = {
  shift: (c = KB.text) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 5l8 8h-4v5H8v-5H4l8-8z" stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill="none"/>
    </svg>
  ),
  shiftFilled: (c = '#000') => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 5l8 8h-4v5H8v-5H4l8-8z" fill={c}/>
    </svg>
  ),
  back: (c = KB.text) => (
    <svg width="22" height="20" viewBox="0 0 24 22" fill="none">
      <path d="M8 3h13a2 2 0 012 2v12a2 2 0 01-2 2H8L1 11l7-8z" stroke={c} strokeWidth="1.5" fill="none"/>
      <path d="M11 8l6 6M17 8l-6 6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  globe: (c = KB.text) => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.6"/>
      <ellipse cx="12" cy="12" rx="4" ry="9" stroke={c} strokeWidth="1.5"/>
      <path d="M3 12h18M3.5 8h17M3.5 16h17" stroke={c} strokeWidth="1.4"/>
    </svg>
  ),
  close: (c = KB.text, s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  sparkle: (c = '#fff', s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" fill={c}/>
    </svg>
  ),
  chevron: (c = KB.textDim, s = 16) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ───────────────────────────────────────────────────────────
// Key — a single keyboard key. Renders the iOS bevel via a
// 1px dark drop shadow. Press feedback brightens the bg.
// ───────────────────────────────────────────────────────────
function Key({ label, flex = 1, bg = KB.key, fs = 24, color = KB.text, onPress, wide, children, radius = 5 }) {
  const [down, setDown] = React.useState(false);
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); setDown(true); }}
      onMouseUp={() => setDown(false)}
      onMouseLeave={() => setDown(false)}
      onTouchStart={() => setDown(true)}
      onTouchEnd={() => setDown(false)}
      onClick={(e) => { e.preventDefault(); onPress && onPress(); }}
      style={{
        flex, minWidth: wide || 0, height: 42,
        background: down ? '#8a8a8c' : bg,
        border: 'none', borderRadius: radius,
        color, fontSize: fs, fontWeight: 400,
        fontFamily: '-apple-system, "SF Pro Display", BlinkMacSystemFont, system-ui, sans-serif',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', cursor: 'pointer', padding: 0,
        boxShadow: '0 1px 0 rgba(0,0,0,0.85)',
        transition: 'background 50ms',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none',
      }}>
      {children || label}
    </button>
  );
}

// ───────────────────────────────────────────────────────────
// Suggestion bar with Zenemic logo on the left.
// In a production keyboard the suggestions come from a
// predictive-text engine; here they're whatever the parent passes.
// ───────────────────────────────────────────────────────────
function SuggestionBar({ active, onLogoPress, suggestions = ['I', '"I', "I'm"] }) {
  return (
    <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 6px' }}>
      <div style={{ width: 40, display: 'flex', justifyContent: 'center' }}>
        <ZenemicLogo size={30} active={active} onPress={onLogoPress} />
      </div>
      <Divider />
      {suggestions.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{
            flex: 1, textAlign: 'center', color: KB.text,
            fontSize: 16, fontFamily: '-apple-system, system-ui', padding: '6px 4px',
          }}>{i === 1 ? `"${s.replace(/"/g, '')}"` : s}</div>
          {i < suggestions.length - 1 && <Divider />}
        </React.Fragment>
      ))}
    </div>
  );
}
function Divider() {
  return <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.18)' }} />;
}

// ───────────────────────────────────────────────────────────
// Key grid — QWERTY rows + shift/delete row + 123/globe/space/return
// ───────────────────────────────────────────────────────────
function KeyRows({ onKey, shift, capsLock }) {
  const r1 = ['q','w','e','r','t','y','u','i','o','p'];
  const r2 = ['a','s','d','f','g','h','j','k','l'];
  const r3 = ['z','x','c','v','b','n','m'];
  const xform = (l) => shift || capsLock ? l.toUpperCase() : l;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '8px 3px 0' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {r1.map(l => <Key key={l} label={xform(l)} onPress={() => onKey(xform(l))} />)}
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 18px' }}>
        {r2.map(l => <Key key={l} label={xform(l)} onPress={() => onKey(xform(l))} />)}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Key
          bg={shift || capsLock ? '#fff' : KB.keyAlt}
          flex={1.4}
          onPress={() => onKey('__shift')}
        >
          {(shift || capsLock) ? Ic.shiftFilled('#000') : Ic.shift('#fff')}
        </Key>
        <div style={{ display: 'flex', gap: 6, flex: 7 }}>
          {r3.map(l => <Key key={l} label={xform(l)} onPress={() => onKey(xform(l))} />)}
        </div>
        <Key bg={KB.keyAlt} flex={1.4} onPress={() => onKey('__back')}>{Ic.back()}</Key>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Key bg={KB.keyAlt} flex={1.5} fs={16} label="123" onPress={() => onKey('__123')} />
        <Key bg={KB.keyAlt} flex={1.1} onPress={() => onKey('__globe')}>{Ic.globe()}</Key>
        <Key bg={KB.key} flex={5} fs={16} label="space" onPress={() => onKey(' ')} />
        <Key bg={KB.keyAlt} flex={2} fs={16} label="return" onPress={() => onKey('__enter')} />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// Prompt panel — shown when the Zenemic logo is pressed.
// Displays the live transcription + a "Generate" CTA.
// ───────────────────────────────────────────────────────────
function PromptPanel({ text, listening, onClose, onSubmit }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #232325 0%, #1c1c1e 100%)',
      borderTop: `0.5px solid ${KB.divider}`,
      padding: '12px 12px 10px',
      animation: 'zen-expand 280ms cubic-bezier(.2,.7,.2,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <ZenemicLogo size={26} glow={false} />
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: KB.text,
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: '-apple-system, system-ui',
          }}>
            Zenemic
            <span style={{
              fontSize: 9, padding: '2px 5px', borderRadius: 99,
              background: `linear-gradient(90deg, ${KB.accentA}, ${KB.accentB})`,
              color: '#fff', fontWeight: 700, letterSpacing: 0.3,
            }}>AI</span>
          </div>
          <div style={{ fontSize: 10.5, color: KB.textDim, marginTop: 1 }}>
            {listening ? 'Describe your event — Anthropic will handle the rest' : 'Ready'}
          </div>
        </div>
        {listening && <Waveform />}
        <button onClick={onClose} style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
          background: 'rgba(255,255,255,0.08)', borderRadius: '50%', border: 'none',
        }}>{Ic.close(KB.textDim, 13)}</button>
      </div>

      <div style={{
        background: '#0f0f10', borderRadius: 14,
        border: `1px solid ${KB.divider}`,
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(60% 80% at 0% 0%, ${KB.accentA}1f, transparent 60%), radial-gradient(60% 80% at 100% 100%, ${KB.accentB}1f, transparent 60%)`,
          pointerEvents: 'none',
        }} />
        <div style={{
          fontSize: 15, color: text ? KB.text : KB.textDim,
          lineHeight: 1.4, position: 'relative', minHeight: 42,
          fontFamily: '-apple-system, system-ui', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {text || 'Try: "Friday 8pm dinner at Bottega with Sam, Alex, Priya — split $180"'}
          {listening && <span style={cursorStyle} />}
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, position: 'relative', flexWrap: 'wrap',
        }}>
          <Chip>📅 Calendar</Chip>
          <Chip>💸 Split</Chip>
          <Chip>📍 Map</Chip>
          <div style={{ flex: 1 }} />
          <button
            onClick={onSubmit}
            disabled={!text || !text.trim()}
            style={{
              height: 30, padding: '0 13px', borderRadius: 99,
              border: 'none', cursor: text?.trim() ? 'pointer' : 'default',
              color: '#fff', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
              background: text?.trim()
                ? `linear-gradient(90deg, ${KB.accentA}, ${KB.accentB})`
                : '#2a2a2c',
              opacity: text?.trim() ? 1 : 0.5,
              fontFamily: '-apple-system, system-ui',
            }}>
            {Ic.sparkle('#fff', 13)} Generate
          </button>
        </div>
      </div>
    </div>
  );
}

const cursorStyle = {
  display: 'inline-block', width: 2, height: 16, marginLeft: 2,
  background: KB.accentB, verticalAlign: 'text-bottom',
  animation: 'zen-blink 900ms infinite',
};

function Chip({ children }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, color: KB.textDim,
      padding: '4px 8px', borderRadius: 99,
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${KB.divider}`,
    }}>{children}</span>
  );
}

function Waveform() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2.5, height: 22 }}>
      {[0,1,2,3,4,5,6].map(i => (
        <span key={i} style={{
          width: 2.5, borderRadius: 2,
          background: `linear-gradient(180deg, ${KB.accentA}, ${KB.accentB})`,
          animation: `zen-wave 700ms ${i*80}ms infinite ease-in-out`,
        }} />
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// <ZenemicKeyboard /> — public component
//
// Props:
//   mode         : 'idle' | 'listening' | 'generating' | 'done'
//                  Controls whether the suggestion bar or prompt
//                  panel is shown. 'generating' and 'done' should
//                  keep the prompt panel visible.
//   text         : the current prompt buffer (only when listening)
//   shift        : whether the next character should be uppercased
//   capsLock     : whether all characters should be uppercased
//   onKey(k)     : called for every key press. k is either:
//                    - a literal character (e.g. 'a', ' ', '.')
//                    - a control token: '__shift' | '__back' | '__enter'
//                                        '__123' | '__globe'
//   onLogoPress(): called when the Zenemic logo is tapped (start listening)
//   onClose()    : called when the user dismisses the prompt panel
//   onSubmit()   : called when the user hits Generate
// ───────────────────────────────────────────────────────────
function ZenemicKeyboard({ mode, text, onKey, onLogoPress, onClose, onSubmit, shift, capsLock }) {
  const expanded = mode !== 'idle';
  return (
    <div style={{
      background: KB.surface, userSelect: 'none',
      paddingBottom: 8,
      borderTop: '0.5px solid rgba(255,255,255,0.06)',
    }}>
      {expanded
        ? <PromptPanel
            text={text}
            listening={mode === 'listening'}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        : <SuggestionBar active={false} onLogoPress={onLogoPress} />}
      <KeyRows onKey={onKey} shift={shift} capsLock={capsLock} />
      {/* iOS home-bar gesture line */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, background: '#fff', opacity: 0.95 }} />
      </div>
    </div>
  );
}

Object.assign(window, {
  ZenemicKeyboard, ZenemicLogo, Ic, KB,
});
