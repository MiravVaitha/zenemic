// app.jsx — Zenemic keyboard controller
//
// This file contains the state machine + orchestration around the keyboard.
// It owns:
//   - mode             : 'idle' | 'listening' | 'generating' | 'done'
//   - text             : the AI prompt buffer (used in listening mode)
//   - composeText      : whatever the host app's text field contains
//   - shift / capsLock : keyboard modifier state
//   - result           : the generated event object after AI returns
//
// Replace `callZenemicAPI()` with a real call to your Anthropic-backed
// endpoint that parses natural language into an event payload.

function ZenemicController({
  composeText,           // current text in the host app's text field
  onComposeChange,       // (newText: string) => void — host updates its field
}) {
  const [mode, setMode]       = React.useState('idle');
  const [text, setText]       = React.useState('');     // AI prompt buffer
  const [result, setResult]   = React.useState(null);   // parsed event
  const [shift, setShift]     = React.useState(true);
  const [capsLock, setCaps]   = React.useState(false);
  const [lastShiftTap, setLastShiftTap] = React.useState(0);

  // ─── Determine which buffer the user is typing into ───
  const target = mode === 'listening' ? 'prompt' : 'compose';
  const cur    = target === 'prompt' ? text : composeText;
  const setCur = target === 'prompt' ? setText : onComposeChange;

  // ─── Apply key presses ───
  const handleKey = (k) => {
    if (k === '__back')  { setCur(cur.slice(0, -1)); return; }
    if (k === '__enter') {
      // Host decides what return does in compose mode.
      // In listening mode return submits the prompt.
      if (mode === 'listening' && text.trim()) submitPrompt();
      return;
    }
    if (k === '__shift') {
      const now = Date.now();
      if (now - lastShiftTap < 300) { setCaps(true); setShift(false); }
      else if (capsLock)            { setCaps(false); setShift(false); }
      else                          { setShift(!shift); }
      setLastShiftTap(now);
      return;
    }
    if (k === '__123' || k === '__globe') return;

    // It's a literal character.
    setCur(cur + k);

    // Single-shift drops after one letter.
    if (shift && !capsLock && /[a-zA-Z]/.test(k)) setShift(false);

    // Re-enable shift after sentence terminator + space.
    if (k === ' ' && cur.slice(-1) === '.') setShift(true);
  };

  const startListening = () => {
    setText('');
    setShift(true);
    setMode('listening');
  };

  const cancelListening = () => {
    setMode('idle');
    setText('');
    setShift(true);
  };

  const submitPrompt = async () => {
    setMode('generating');
    try {
      const event = await callZenemicAPI(text);
      setResult(event);
      setMode('done');
    } catch (err) {
      console.error('Zenemic API failed:', err);
      setMode('listening');
    }
  };

  const dismissResult = () => {
    setResult(null);
    setMode('idle');
    setText('');
    setShift(true);
  };

  return (
    <React.Fragment>
      {/* The generating overlay shows pipeline progress while the AI runs */}
      {mode === 'generating' && <GeneratingOverlay text={text} />}

      {/* The result bottom sheet — drill into Calendar / Payment / Map */}
      {result && mode === 'done' && (
        <EventResultCard
          data={result}
          onDismiss={dismissResult}
          onConfirm={async () => {
            await confirmZenemicEvent(result);
            dismissResult();
          }}
        />
      )}

      {/* The keyboard itself */}
      <ZenemicKeyboard
        mode={mode === 'generating' || mode === 'done' ? 'listening' : mode}
        text={text}
        shift={shift}
        capsLock={capsLock}
        onKey={handleKey}
        onLogoPress={() => mode === 'idle' && startListening()}
        onClose={cancelListening}
        onSubmit={submitPrompt}
      />
    </React.Fragment>
  );
}

// ───────────────────────────────────────────────────────────
// Backend integration — REPLACE WITH REAL API CALLS
//
// callZenemicAPI(prompt)
//   POST the prompt to your backend, which:
//     1. Calls Anthropic to extract { title, when, where, guests, total }
//     2. Creates a Google Calendar event (returns event id + ical link)
//     3. Creates a Stripe payment-split intent (returns request ids)
//     4. Fetches a Google Maps directions URL for the venue
//   Returns the merged payload shape used by the UI.
//
// confirmZenemicEvent(event)
//   Tells the backend the user confirmed — actually send calendar invites,
//   send Stripe payment requests, etc.
// ───────────────────────────────────────────────────────────
async function callZenemicAPI(prompt) {
  // TODO: replace with real fetch to your server.
  // Expected response shape:
  //   {
  //     title:   string,              // e.g. "Dinner at Bottega"
  //     when:    string,              // formatted human-readable, e.g. "Fri, May 30 · 8:00 – 10:30 PM"
  //     where:   string,              // "Venue · address"
  //     guests:  string[],            // ["Sam", "Alex", "Priya"]
  //     total:   number,              // bill total in dollars
  //     // optional fields used by detail views:
  //     calendarEventId?: string,
  //     stripeRequestIds?: string[],
  //     mapsUrl?: string,
  //   }
  await new Promise(r => setTimeout(r, 1400));
  return {
    title:  'Dinner at Bottega',
    when:   'Fri, May 30 · 8:00 – 10:30 PM',
    where:  'Bottega · 313 Valencia St, SF',
    guests: ['Sam', 'Alex', 'Priya'],
    total:  180,
  };
}

async function confirmZenemicEvent(event) {
  // TODO: POST to your backend to actually commit the event.
}

// ───────────────────────────────────────────────────────────
// Generating overlay — shown while callZenemicAPI() is pending.
// Visualises the 4-step pipeline so the wait feels intentional.
// ───────────────────────────────────────────────────────────
function GeneratingOverlay({ text }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 15,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 22, padding: 32, textAlign: 'center',
      animation: 'zen-fadein 200ms',
      fontFamily: '-apple-system, system-ui',
    }}>
      <div style={{ position: 'relative' }}>
        <ZenemicLogo size={72} glow />
        <div style={{
          position: 'absolute', inset: -10, borderRadius: '50%',
          border: '2px solid transparent',
          borderTopColor: '#EC4899', borderRightColor: '#8B5CF6',
          animation: 'zen-spin 1.1s linear infinite',
        }} />
      </div>
      <div>
        <div style={{ fontSize: 18, color: '#fff', fontWeight: 600, marginBottom: 6 }}>Analyzing your event…</div>
        <div style={{ fontSize: 13, color: '#888', maxWidth: 260, lineHeight: 1.4 }}>
          Parsing date, venue, attendees and bill total.
        </div>
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.06)', padding: '10px 14px',
        borderRadius: 12, maxWidth: 300, fontSize: 13, color: '#fff', fontStyle: 'italic',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        "{text}"
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#aaa' }}>
        <Step label="Sending to Anthropic API"         done />
        <Step label="Creating Google Calendar event"   active />
        <Step label="Setting up Stripe payment split" />
        <Step label="Generating Google Maps directions" />
      </div>
    </div>
  );
}

function Step({ label, done, active }) {
  const color = done ? '#22C55E' : active ? '#EC4899' : '#555';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        border: `2px solid ${color}`,
        background: done ? color : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.6" fill="none"/></svg>}
        {active && <span style={{
          width: 6, height: 6, borderRadius: '50%', background: color,
          animation: 'zen-pulse 1s infinite',
        }} />}
      </div>
      <span style={{ color: done ? '#fff' : active ? '#fff' : '#666' }}>{label}</span>
    </div>
  );
}

Object.assign(window, { ZenemicController });
