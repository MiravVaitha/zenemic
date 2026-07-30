# Zenemic — road to launch

The plan of record for getting Zenemic onto Google Play (first) and the App Store (second).
Restructured from the original TODO / BUGS list on 2026-07-30.

**How this list is organised.** The old list mixed four different kinds of thing — real bugs,
features never built, infrastructure, and store-submission gates — in no particular order, so it was
impossible to tell what blocked what. Two things changed in the rewrite:

1. **Bugs vs. never-built.** Most of the old "BUGS TO FIX" entries weren't bugs; they were features
   that were never written. That matters because a bug is a fix and a missing feature is a design
   decision. They're separated now.
2. **Ordered by dependency, not by annoyance.** Several items block each other. The big one:
   **you cannot add a named person with an email address to an event.** That single gap is the root
   of the payment splitter, invites, calendar guests and album sharing. It's Phase 1 for that reason.

Each item cites the code so it can be picked up cold. Phases are ordered; within a phase, order is
flexible. **Launch gates** are marked — those must be done before store submission regardless.

---

## Done and verified

- ✅ **"Look right?" has explicit setters.** Date and Time are native pickers (no text entry
  possible), attendees uses a numeric keypad, split mode is a tap-to-cycle enum, and Create is
  blocked with `· required` markers until valid. Also fixed the bug underneath it: editing the date
  used to change only the *label* while `startsAt` kept the AI's original value, so the event
  displayed one date, filed itself under another and would have calendared a third.
  *(`CreateConfirmScreen.tsx`, shared `components/DateTimePickerSheet.tsx`)*
- ✅ **Loading / Event-ready tell the truth.** The backend always returned a per-resource report;
  the app threw it away and animated a hardcoded 7-item checklist on a 540 ms timer, then claimed
  "all 5 automated resources". Now rows sit genuinely pending, then resolve to DONE / SKIPPED /
  FAILED **with the reason**, and Success reads "N of 5" with actions for the fixable ones.
  *(`CreateProcessingScreen.tsx`, `CreateSuccessScreen.tsx`, `resources.service.ts`)*
- ✅ **AI no longer invents details.** The extraction schema forbade nulls for date/time/location
  while the prompt told the model to "return null if unknown" — impossible, so it confabulated. Those
  are nullable now and the confirm screen asks instead. *(`ai/extractEvent.ts`, `ai/prompts.ts`)*
- ✅ **Calendar could never sync for most events.** It required `endsAt`, which is legitimately null
  whenever the host doesn't state an end time — 5 of 9 existing events were affected. Now an end is
  assumed (+2h) for the calendar call only, and `POST /events/:id/calendar` lets an existing event be
  synced after connecting Google. *(`resources.service.ts` `syncCalendar`)*
- ✅ **Requests can no longer hang forever.** `getSession()` and `fetch` had no timeouts, so an
  unresolved promise meant an infinite spinner with no error path. *(`lib/api.ts`)*

All verified end-to-end on the Android emulator via Expo Go, 2026-07-30.

---

---

## How testing works in this plan

There is **no automated test suite and no lint script** in any of the four packages — `typecheck` is
the only gate, and `TESTING.md` is a runbook (how to start the stack), not a test plan. So testing is
manual, and it has to be scheduled or it won't happen.

It sits in **three places, deliberately not one phase at the end**:

1. **Phase 0 — test what's already built.** Several features are finished but have never been run
   once. Testing them *before* building on top of them is the whole point: what you find changes the
   design of Phases 1–2.
2. **A "Test before ticking off" block on every phase.** Test while the code is fresh and you're
   still in it. A phase isn't done until its block passes.
3. **Phase 8 — full pre-launch pass.** For the things that only break in combination — multiple
   users, timezones, money edge cases, both platforms. Integration bugs don't show up in per-phase
   testing by definition.

**Where bugs get logged:** the *Bugs found in testing* inbox at the bottom of this file. Triage rule —
if it's in the phase you're currently testing, fix it now; if it's elsewhere, drop it into the
relevant phase; if it's cosmetic, drop it into Papercuts. Don't leave things in the inbox.

---

## Phase 0 — Test what's already built · **do this next**

Built, shipped, never run once. Each will have its own bugs, and those bugs should shape Phases 1–2
rather than be discovered after them.

- [ ] **Payment splitter, end to end.** Never tested. Needs Stripe test keys and the webhook running
      (`TESTING.md` Terminal 2). Verify: split created from a budget · amounts add up to the total in
      whole pennies · send requests issues a Stripe link per guest · paying a link flips that share to
      PAID via webhook · host gets the push. Expect problems — the host's share is born PAID and
      guests currently have no email, so "send" may reach nobody.
- [ ] **Google Calendar, end to end.** Never tested, and it now carries an unverified fix. Connect
      Google in Settings, then: create a timed event with no end time and confirm an entry appears
      with a 2-hour default *(this is the case that silently produced nothing before)* · use "TAP TO
      SYNC" on an older event and confirm it back-fills · edit an event's time and confirm the
      calendar entry moves · confirm the event still reads Ongoing until midnight, not Previous
      2 hours in.
- [ ] **Photo album, end to end.** Upload, view, save to device, share, delete. Needs object storage
      configured.
- [ ] **Receipt itemisation.** Photograph a receipt in chat and confirm it itemises — then note that
      there is nowhere to view it afterwards (Phase 3).
- [ ] **Push notifications.** Cannot be tested in Expo Go — needs the dev build rebuilt first.
- [ ] **Password reset & email confirmation.** Built and previously tested, but currently blocked by
      the email rate limit (Phase 5). Retest once custom SMTP is in.

**Test before ticking off:** each item above verified against a real run, with anything found written
into the inbox at the bottom.

---

## Phase 1 — Shared events between real accounts · **the unblocker**

**Decision (2026-07-30):** attendees are **real Zenemic accounts**. You add someone in-app and the
event appears in *their* Planned list as if they'd made it. Guests have to download the app to take
part — the invite is the growth loop.

That's a bigger build than the current schema allows, and it's worth being clear-eyed about why.
Today the roster is a *number*: `createEvent` pads it with `{ name: 'Guest 1', isHost: false }` rows
carrying no email (`events.service.ts:96`), `updateEventSchema` accepts only `attendees: number`, and
`Attendee` has **no link to `User`** at all. An event belongs to exactly one person
(`Event.userId`), and every read is gated on that (`loadOwned` / `assertOwner` throw `forbidden`
when `event.userId !== userId`).

Suggested order within the phase — each step is usable on its own:

- [ ] **1a. Link attendees to users.** Add `Attendee.userId → User` and make `listEvents` return
      events where you are the owner **or** an attendee. This is the step that makes a shared event
      actually appear in someone else's list.
- [ ] **1b. Permissions model.** `loadOwned`/`assertOwner` currently mean "owner only". Decide what an
      attendee may do vs. the host — view, RSVP, upload photos, tick chart stages, edit the budget,
      delete. Every route that calls those two helpers needs the new rule.
- [ ] **1c. Invite flow.** Add by email. If an account exists, attach it. If not, store a **pending
      invite** that resolves on signup — that pending state *is* the growth loop, so it needs to
      survive until they install.
- [ ] **1d. Named attendees without accounts.** Decide whether a plain name+email attendee still
      exists for people who won't install. Related: **can a non-user still pay?** A Stripe link works
      fine by email — if paying requires installing the app, some guests simply won't, and the host
      eats it. Worth deciding deliberately rather than by omission.
- [ ] **1e. Wire up RSVP.** `api.setRsvp` is dead code; `Attendee.rsvp` is stored and serialized but
      nothing sets it.
- [ ] **1f. Backfill `Guest N` rows** on existing events — become editable, or cleared.

**Why it's first:** payment links are gated on `if (share.attendee?.email)`
(`splitter.service.ts:103`) and calendar guests on `attendeeEmails` filtered to truthy
(`resources.service.ts`), so today both can only ever reach the host. The create flow now *reports*
this ("2 guests have no email address, so their payment requests can't be sent yet") — the fix is here.

**Knock-on:** multi-user access makes **RLS (Phase 6) materially more important** — several people
now touch the same rows, and application-level scoping becomes the only thing standing between them.
It also makes push notifications meaningful (invite received, guest paid) and adds user-to-user data
sharing to the privacy policy and store data-safety declarations (Phase 7).

**Test before ticking off** — needs **two accounts** (the standing test account plus your own):
invite an existing user and confirm the event appears in their list · invite an email with no
account, sign that account up, confirm the pending invite resolves · confirm a guest sees only what
they're allowed to and **cannot** see the host's other events · remove a guest and confirm access
disappears · RSVP round-trips · a guest uploading a photo shows for the host.

## Phase 2 — Payment splitter

Depends on Phase 1 for anything involving sending.

- [ ] **You can't edit your own share.** The host's share is created `status: 'PAID'`
      (`splitter.service.ts:55`) and the stepper is `disabled={sh.status === 'PAID'}`
      (`SplitterScreen.tsx:133`), so your own row is locked from birth. Decide whether the host
      should be PAID by default at all.
- [ ] **±1 steppers only.** Setting £47.50 takes 47 taps. Needs direct numeric entry.
- [ ] **The empty state is a dead end.** With no split, Splitter renders only the text "No split yet
      for this event. Add a budget to the event to generate one" — no button
      (`SplitterScreen.tsx:80-85`). The backend already supports creating one from nothing:
      `POST /events/:id/split` with `totalMajor` (`payments.service.ts:28-39`).
- [ ] **Define when the link is sent.** Currently only a manual "Send requests" tap. Decide: on
      creation, on a host action, on a schedule, or after RSVP.
- [ ] **Currency is locked after creation** by design (`events.schemas.ts:42`) and there's no UI
      saying so. Confirm that's the intended behaviour and surface it.
- [ ] **Stripe is in test mode.** Live keys, webhook secret, and a real payout account before launch.

**Test before ticking off:** amounts always total exactly (odd splits like £10 ÷ 3) · editing your
own share works · changing the budget after requests are sent is refused with a readable message ·
a paid share can't be silently reset · declined/expired card handled · webhook arriving twice
doesn't double-mark · create a split on an event that had none.

## Phase 3 — Ask Zenemic can actually do things

**Decision (2026-07-30):** give it **real mutating tools**, not just better copy.

Today the four tools are `get_split_status`, `propose_split_update`, `draft_group_message`,
`get_travel_time` — all read-or-propose (`chat.service.ts:116-163`) — while the greeting already
promises "Ask me to update the splitter, the planner chart, the calendar"
(`EventChatPanel.tsx:28`) and offers a "Move start +30 min" chip nothing can perform. That mismatch
is what makes it feel useless.

- [ ] **Mutating tools**, each mapping to an existing service call so the logic isn't duplicated:
      change date/time (`updateEvent`), edit the planner chart (`replaceChart`), recompute the split
      (`createOrUpdateSplit`), tick a stage (`setStageDone`), add an attendee (Phase 1).
- [ ] **Confirmation UX.** The brand voice already commits to this — *"confirm before taking
      irreversible actions like sending invites or payment requests"* (`prompts.ts` `BRAND_VOICE`) —
      and `propose_split_update` already returns a proposal shape to build on. Money and messages must
      stay confirmed; low-risk edits (tick a stage) probably shouldn't need a tap.
- [ ] **Respect the money guard.** `updateEvent` throws `conflict` once requests are sent
      (`events.service.ts:301-311`); the tool must surface that as a sentence, not an error.
- [ ] **Interim:** until the tools land, trim the greeting and the "Move start +30 min" chip so it
      stops promising what it can't do. Cheap, and stops the bad first impression in the meantime.
- [ ] **Receipts are invisible.** `EventDetail.receipts` is fetched, typed and URL-signed
      (`events.service.ts:169-177`) but no screen renders it. Receipts can only be created via chat
      and can never be viewed again.

**Test before ticking off:** every mutating tool actually changes the thing and the screen reflects
it · confirmation appears for money/messages and can be cancelled · a cancelled action changes
nothing · it refuses gracefully when the budget is locked · it doesn't claim to have done something
it didn't (the original complaint) · nonsense requests get a plain answer, not an error.

## Phase 4 — Keyboard

- [ ] **Wire the prototype to the service.** `keyboard/src/app.jsx`'s `callZenemicAPI` /
      `confirmZenemicEvent` are the seams; `backend/keyboard` already serves `POST /generate` and
      `POST /confirm` on 4100 and shares the same domain code as the main app.
- [ ] **Build it as a real iOS/Android keyboard extension** (this is the actual work — the prototype
      is HTML/JSX reference only).
- [ ] Zenemic branding/logo in the keyboard UI.
- [ ] **Setup guide + a working "Set up" button.** `SettingsScreen.tsx:168-170` hardcodes
      "Set up ›" and never reflects real keyboard state.
- [ ] Note: `/generate` now rejects prompts too vague to place ("Add when and where to that and I'll
      set it up") rather than inventing details, since it's one-shot with nowhere to ask.

**Test before ticking off:** on a real device, in a real third-party app (Messages, WhatsApp) ·
generate → confirm creates an event visible in the main app · a vague prompt is refused clearly ·
works with the app closed · doesn't break the host app's own text field.

## Phase 5 — Email & comms

- [ ] **Custom SMTP via Resend**, to escape Supabase's built-in ~2/hour cap and
      `429 over_email_send_rate_limit`. Needs a verified sending domain.
- [ ] **`EMAIL_FROM` is still `onboarding@resend.dev`** — a sandbox sender that only delivers to the
      account owner, so split-payment emails to guests don't arrive today.
- [ ] **Email failures are silent.** `integrations/email.ts:21-24` logs "would send" when disabled and
      `splitter.service.ts:114` swallows send errors — the host is never told a request didn't go out.
- [ ] Buy the domain (also needed for Phase 6 and the website).

**Test before ticking off:** payment request actually lands in a guest's inbox (not just yours) ·
password reset and email confirmation arrive and work · a deliberately failing send surfaces to the
host instead of being swallowed · check spam placement.

## Phase 6 — Security & compliance · **launch gate**

- [ ] **No rate limiting anywhere.** `app.ts` has `helmet` and `cors` but no limiter package is even
      installed. The expensive endpoints are unprotected: `POST /events/draft` and `POST /events`
      both call Anthropic, and chat accepts a 12 MB JSON body for receipt photos.
- [ ] **Row Level Security.** No RLS policies exist. Every query is scoped in application code via
      `loadOwned` / `assertOwner`. That's consistent today, but RLS is the backstop if one route ever
      forgets — and it's the kind of thing a reviewer asks about.
- [ ] **Endpoint exposure review.** Notably `GET /events/:id/map.png` is deliberately public,
      HMAC-signed (`lib/mapToken.ts`) — verify the signature can't be replayed or enumerated.
- [ ] **Google OAuth app verification** (the thing the list called "CASA compliance" — same goal,
      and the name matters because it decides the cost). The app requests `calendar.events`
      (`googleCalendar.ts:6-10`), a **sensitive** scope. A CASA security assessment is only required
      for **restricted** scopes (Gmail, Drive). Sensitive scopes need ordinary OAuth app
      verification: verified domain, privacy policy, homepage, demo video. Confirm the scope
      classification in the Cloud Console before paying for an audit you may not need.
- [ ] **API billing review** before launch: Anthropic, Google Maps, Stripe (currently sandbox),
      Resend. Set budget alerts.
- [ ] **Secrets hygiene.** One repo-root `.env.local` holds everything including
      `SUPABASE_SERVICE_ROLE_KEY`; confirm the production deployment path keeps it server-side only.

**Test before ticking off:** try to read another user's event with a valid token for a *different*
account and confirm it's refused at every route · hammer the AI endpoints and confirm the limiter
trips · confirm no secret appears in any client bundle or API response · confirm an error still shows
a generic message plus an id, never a stack trace.

## Phase 7 — Store submission · **launch gate**

- [ ] **Website** with privacy policy and terms of service. Blocks Google OAuth verification (Phase 6)
      and both store listings — worth doing earlier than it looks.
- [ ] **Google Play first**, then App Store.
- [ ] Store listing assets: icon, feature graphic, screenshots, description.
- [ ] Data safety / privacy nutrition labels — declare Supabase auth, photo album storage, Stripe,
      Google Calendar.
- [ ] Account deletion must be discoverable in-app (Play requirement). `DELETE /api/auth/account`
      exists — confirm it's reachable from Settings and actually cascades.
- [ ] Rebuild the dev build before release testing — the installed one is stale and couldn't complete
      any authenticated request on 2026-07-30.

---

## Phase 8 — Full test pass before submission · **launch gate**

Everything above is tested in isolation. These only fail in combination, so they need a dedicated
pass on a **real device** (not just the emulator), on **both platforms**, with **two real accounts**.

- [ ] **The whole journey, twice.** Host and guest, on separate devices/accounts: create → invite →
      RSVP → planner chart → pay → photos → event ends and moves to Previous.
- [ ] **Dates and time.** All-day events · multi-day ranges · an event starting within the hour ·
      one crossing midnight · a phone in a different timezone from the server · a phone with the
      clock deliberately wrong. This area has already produced two real bugs.
- [ ] **Money.** Odd splits, currency symbols typed by hand ("about £50 each"), zero and negative
      budgets, changing the budget mid-flight, a guest paying twice.
- [ ] **Bad input.** Empty and enormous prompts, emoji, other languages, prompts that aren't events
      at all ("hello"), 25 locations, very long titles.
- [ ] **Failure modes.** Airplane mode mid-create · backend down · AI returning nonsense · storage
      key removed · Stripe key removed. Nothing should hang, and every error should be readable.
- [ ] **Permissions and privacy.** Denying photo access · revoking Google Calendar mid-use ·
      deleting your account and confirming the data actually goes.
- [ ] **Both platforms.** iOS and Android, on hardware, including a small screen and a large one.
- [ ] **Fresh install.** First-run experience with no events, no permissions granted, nothing cached.

---

## Bugs found in testing

The inbox. Anything found during a test pass lands here first, then gets triaged: **in the phase
you're testing → fix now** · **elsewhere → move it to that phase** · **cosmetic → Papercuts**.
Nothing should sit here long.

| Found | What's wrong | Where it came from | Triaged to |
| --- | --- | --- | --- |
| _(empty — Phase 0 hasn't run yet)_ | | | |

---

## Papercuts found while investigating

Small, individually cheap, none blocking. Batch them when convenient.

| Item | Where |
| --- | --- |
| `api.regenerateChart` is dead code — no "regenerate with AI" button exists | `lib/api.ts:126` |
| `api.setRsvp` is dead code | `lib/api.ts` |
| EventLocations is unreachable for single-stop events, so a one-venue event can never see its own map | `EventDetailScreen.tsx` locations row |
| EventLocations is read-only — no add/edit, and 0 stops renders an empty bordered box | `EventLocationsScreen.tsx` |
| Planner chart only renders inline on EventDetail for *ongoing* events; a planned event with a good chart shows nothing | `EventDetailScreen.tsx:125` |
| Keyboard status in Settings is hardcoded "Set up ›" | `SettingsScreen.tsx:168-170` |
| `CreateDescribe` has 3 example prompts but `const exi = 0` pins it to the first | `CreateDescribeScreen.tsx:24` |
| Currency default disagrees: `env.STRIPE_CURRENCY` is `eur`, `schema.prisma` is `gbp` | `config/env.ts:61` vs `schema.prisma:65` |
| `generateChart` bounds disagree: Zod `.min(3)` vs JSON Schema `minItems: 4` | `ai/generateChart.ts:16,26` |

---

## Decided

- **Attendees are real accounts** with shared event access; the invite is the growth loop. *(Phase 1)*
- **Ask Zenemic gets real mutating tools**, behind confirmation. *(Phase 3)*

## Open questions

1. **Can a non-user still pay?** Stripe links work fine by email. If paying requires installing the
   app, some guests won't, and the host absorbs it. This is the one soft spot in the accounts-only
   model and it's worth an explicit answer rather than falling out of the implementation. *(1d)*
2. **What can an attendee do vs. the host?** View, RSVP, upload photos, tick chart stages, edit the
   budget, delete. Needed before `loadOwned`/`assertOwner` can be rewritten. *(1b)*
3. **Should the host's share default to PAID?** It's why you can't edit your own price. If the host
   often fronts a bigger share, "PAID" is the wrong default. *(Phase 2)*
4. **When do payment links go out** — on split creation, on an explicit host action (today), or once
   a guest RSVPs yes? *(Phase 2)*
5. **iOS timing** — fast follow or later milestone? Decides whether the keyboard extension is one
   platform or two. *(Phase 4)*
