# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

**Zenemic** is an AI event-planning app: describe an event in natural language and it extracts the
details, builds a planner timeline, and wires up Google Calendar, a Stripe payment split, and
Maps links. The repo holds three parts (the Expo app is now **wired to the backend**; the
keyboard prototype is not yet):

- **`main-app/`** — the shipping **Expo / React Native** app, iOS + Android (the product UI).
  Day-to-day development and device testing is currently on Android.
- **`backend/`** — an **npm-workspaces monorepo** with two runnable services + a shared library.
- **`keyboard/`** — an HTML/JSX **design prototype** of the custom-keyboard UX (reference only).
- `.design-pkg/` — git-ignored design handoff bundle (the source the UI is built from).

**`LAUNCH.md` at the repo root is the plan of record** — the phased, dependency-ordered list of what
remains before a Google Play (then App Store) release, with each item cited to the code. Read it
before starting feature work so a task lands in the right order; the phases exist because several
items block each other (attendee identity gates the splitter, invites and calendar guests).
**After any session that fixes a bug, ships a feature, or uncovers a new problem, propose what to
add to or remove from it** — the list going stale is the failure mode it exists to prevent.

### ⚠️ Naming trap — read this first
There are **two `main-app` and two `keyboard` directories** that mean different things:

| Path | What it is |
| --- | --- |
| `main-app/` (repo root) | the Expo **frontend** app |
| `backend/main-app/` | the backend **API service** (`@zenemic/main-app`) |
| `keyboard/` (repo root) | the keyboard **design prototype** (frontend) |
| `backend/keyboard/` | the keyboard **backend service** (`@zenemic/keyboard`) |

Always check whether a path is under `backend/` before assuming what `main-app`/`keyboard` refers to.

## Commands

There is **no automated test suite** anywhere in this repo — `typecheck` is the gate. Don't invent test commands.
`TESTING.md` at the repo root is the run-the-stack runbook (which terminal runs what, ports, pointing
the app at your LAN IP, the Stripe webhook, Windows troubleshooting) — read it rather than re-deriving.

### Frontend — run from `main-app/`
```sh
npm install
npm start                 # = expo start; then press i (iOS), a (Android), w (web)
npm run ios | android | web
npm run android:build     # = expo run:android — compiles + installs a NATIVE dev build
npm run typecheck         # tsc --noEmit
```
`android:build` prebuilds `main-app/android/` (and `ios/`); both are git-ignored, so never commit them.
**Auth deep links only work in that native build, never in Expo Go** — see "Auth & email links" below.

### Backend — run from `backend/` (npm workspaces)
```sh
npm install               # installs all workspaces, symlinks @zenemic/shared
npm run prisma:generate   # REQUIRED before typecheck/build — generates the Prisma client
npm run prisma:push       # apply schema.prisma to the DB — THIS is the schema workflow here
npm run seed              # optional demo user + event
npm run backfill:instants # one-off: fill startsAt on events written before it was resolved
npm run dev:main          # main-app API   → http://localhost:4000
npm run dev:keyboard      # keyboard svc   → http://localhost:4100
npm run typecheck         # all three packages (the gate)
npm run build             # builds shared FIRST, then both services (order matters)
npm run start:main | start:keyboard   # run built dist output
npm run prisma:studio     # inspect the database
```
- Run a script in one package: `npm run <script> -w @zenemic/<shared|main-app|keyboard>`.
- Prisma scripts execute inside `packages/shared` (where `schema.prisma` lives); the root `prisma:*`
  scripts delegate there via `-w @zenemic/shared`, and each one runs through `prisma/withEnv.js`.
  That wrapper exists because the Prisma CLI only auto-loads a `.env` sitting *next to the schema*,
  while this repo keeps a single env file at the repo root — without it `DATABASE_URL`/`DIRECT_URL`
  are simply absent and every prisma command fails.
- **There is no `migrations/` directory.** Schema changes ship via `prisma:push` (`db push`);
  `prisma:migrate` still exists as a script but is not the workflow in use.
- Windows gotcha: `prisma generate` can fail with `EPERM` renaming `query_engine-windows.dll.node`
  if a stale `node`/`tsx` server still holds it — kill leftover backend node processes and retry.

## Backend architecture (the part that needs multiple files to grasp)

**Mental model: the two services do NOT call each other over HTTP.** They integrate by sharing
**code** (`@zenemic/shared`) and **state** (one Postgres database). An event created by the keyboard
service appears in the main app because both run the *same* domain code against the *same* DB — not
because one calls the other.

- **`packages/shared` (`@zenemic/shared`) is the brain.** It owns the Prisma client + schema, Supabase
  token verification, the Anthropic AI pipeline (`src/ai`), the integration clients (`src/integrations`:
  Calendar/Maps/Stripe/storage/email/push), and the **domain services** in `src/domain`
  (`events.service` = extract/create/getEvent, `resources.service` = the chart/calendar/split/links
  pipeline, `splitter.service`, `profile`, `events.serializer` = the shape the API returns).
  Everything is re-exported from `src/index.ts`; consumers import from `@zenemic/shared`, never by
  deep path.
- **Planned / Ongoing / Previous is derived, never stored.** There is no `kind` column and no
  `EventKind` enum — `domain/eventKind.ts` computes it from `startsAt`/`endsAt` at read time, so it
  can't go stale as time passes. That only works when an event *has* timestamps, and the AI is
  allowed to return a null start (typically an "All day" event: real date, no clock time), so
  `domain/eventTiming.ts` is the floor under it — recovering an instant from the `dateLabel` /
  `timeLabel` that always exist. Use `EventKindValue`, not a Prisma type.
- **`main-app` and `keyboard` are thin HTTP layers** — only routes/controllers/entry/env live there.
  `main-app` serves the full `/api/*` surface (auth, events, chat, payments, album, integrations,
  Stripe webhook) on **4000**. `keyboard` serves bare `POST /generate`, `POST /confirm`, `GET /health`
  on **4100**; its controller is the same `extractDraft → createEvent → sendSplitRequests/calendar`
  flow the main app uses, sourced from shared.
- **One database, one client.** `packages/shared/prisma/schema.prisma` + `src/lib/prisma.ts`; both
  services read the same `DATABASE_URL`. Money is stored as integer **minor units** (`lib/money.ts`).
- **Auth.** Both services verify Supabase access tokens (`lib/supabase.ts`) and key a `User` row off
  the Supabase UUID; `ensureProfile` creates it lazily. So the same logged-in user owns events from
  either service.
- **AI structured output** uses *forced tool-use* (the pinned `@anthropic-ai/sdk` 0.69 predates
  `messages.parse`); `src/ai/client.ts` is the single place to change models/SDK. Default model
  `claude-opus-4-8`. Resource generation is best-effort and isolated per resource.
- **Feature flags.** Optional integrations are gated by env keys; missing keys make endpoints return
  `503 not_configured` instead of crashing (`config/env.ts` `features`, surfaced at `/health`).

### Env & config (single repo-root file)
The **whole repo** shares ONE env file at the repository root — `.env.local` (falling back to `.env`).
The backend reads it via `packages/shared/src/config/env.ts` (resolved relative to that file's
`__dirname` → repo root, so it works from any cwd); the Expo app reads it via `main-app/app.config.js`
(loads it with `dotenv` and exposes only the `EXPO_PUBLIC_*` values through `Constants.expoConfig.extra`
— backend secrets are NOT bundled into the app). Copy `.env.example` → `.env.local`. Backend needs
`DATABASE_URL` (+ `DIRECT_URL`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`,
`ANTHROPIC_API_KEY`; the app needs `EXPO_PUBLIC_API_URL` (your PC's LAN IP for a physical phone),
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Ports are **`MAIN_APP_PORT`** (4000) and
**`KEYBOARD_PORT`** (4100) — distinct vars so they never collide; don't reintroduce a bare `PORT`.

### TypeScript build setup
Workspace TS uses `tsconfig.base.json` (`module`/`moduleResolution`: **NodeNext**). Each service has
**two** configs: `tsconfig.json` (dev + `typecheck`, `noEmit`, with a `paths` alias mapping
`@zenemic/shared` → shared **source** so `tsx`/typecheck need no prebuild) and `tsconfig.build.json`
(emit, `paths` reset so `@zenemic/shared` resolves to shared's built **dist**). Therefore **shared must
be built before the services** — `npm run build` enforces that order.

## Frontend architecture (`main-app/`, Expo)

- Expo SDK **54**, React Native **0.81**, React **19**, TypeScript ~5.9. (The `main-app/README.md`
  still says SDK 51 / RN 0.74 — stale; trust `package.json`.)
- Entry `App.tsx` → `SafeAreaProvider` → `ThemeProvider` (`src/theme.tsx`) → `AppNavigator`
  (`src/navigation/`, React Navigation native stack). Screens in `src/screens/`, reusable UI in
  `src/components/`, shared types in `src/data/` + `src/types/`, icons via `react-native-svg`
  (`src/icons.tsx`). Config lives at `src/config.ts` — **not** under `lib/`. `src/lib/` holds
  `api.ts`, `supabase.ts`, `auth.tsx`, `authLink.ts`, `authEmail.ts`, `errors.ts`, `push.ts`,
  `format.ts` and `useKeyboardInset.ts`.
- Design system tokens (coral `#FF6B4A`, light-default + dark, Inter + JetBrains Mono) all live in
  `src/theme.tsx`. Logged out: `Splash → SignUp / Login / ForgotPassword`, plus `ResetPassword`,
  which the navigator shows on its own branch rather than as a pushed route. Logged in:
  `Events → EventDetail → {PlannerChart, Splitter, Album, EditEvent, EventLocations}`, plus
  `Settings`, `Keyboard`, and the create flow
  `CreateDescribe → CreateConfirm → CreateProcessing → CreateSuccess`.
- The app is **wired to the main-app backend**: Supabase auth (`src/lib/auth.tsx`) gates the navigator
  (logged-out vs logged-in stacks); a typed API client (`src/lib/api.ts`) attaches the Supabase Bearer
  token and parses the backend error envelope; config comes from the repo-root env via `app.config.js`
  → `Constants.expoConfig.extra` (`src/config.ts`). Screens fetch real data (events, AI create, planner
  chart, chat, splitter, settings); optional integrations degrade gracefully on `503 not_configured`.

## Auth & email links

Password reset and email confirmation both come back into the app as a `zenemic://` deep link
(`scheme` in `app.json`). `detectSessionInUrl` is off — correct on native — so `src/lib/auth.tsx`
establishes the session from the URL by hand, and `src/lib/authLink.ts` parses it, reading **both**
the fragment (implicit `#access_token=`) and the query string (PKCE `?code=`), plus GoTrue's
`#error=` shape.

- **Intent comes from the `type=recovery|signup` param, in preference to the path.** When a
  `redirect_to` is missing from the project's allowlist, GoTrue silently falls back to the **Site
  URL**, so the link arrives on the *wrong* path. Routing by path alone let a recovery link be taken
  for a confirmation — establishing a session and dropping the user into the app, which turns a
  password-reset link into a silent login. Don't "simplify" this back to a path check.
- `recovery.active` is checked **before** `session` in `AppNavigator`: a reset link mints a real
  session, so a session check alone would skip the very step the user came to do. Cancelling signs out.
- `src/lib/authEmail.ts` holds the resend throttle shared by ForgotPassword and SignUp
  (60/60/120/300s, 3-resend cap). The countdown starts at the *first* send, not the first resend,
  because Supabase opens its own ~60s per-address window immediately.

**Supabase dashboard config this depends on** (Authentication → URL Configuration): Site URL
`zenemic://confirm-email`, and Redirect URLs containing both `zenemic://reset-password` and
`zenemic://confirm-email`. Allowlist matching is **exact** — no extra query params.

Two constraints to know before debugging any of this:
- **Supabase rejects `exp://` redirect URLs outright**, so auth links can't be tested in Expo Go.
  Use `npm run android:build`. A link that dead-ends on Site URL usually means Expo Go, not a bug.
- **Email delivery is not production-ready yet.** The built-in sender is capped at ~2/hour, only
  delivers to org members, and returns `429 over_email_send_rate_limit`. Custom SMTP is the fix and
  needs a verified domain, which doesn't exist yet. Relatedly `EMAIL_FROM` is still
  `onboarding@resend.dev` — a Resend sandbox sender that only delivers to the account owner — so the
  backend's split-payment emails to attendees currently don't reach them.

## The error envelope

`backend/packages/shared/src/middleware/error.ts` is the single place an error becomes JSON, and it
covers both services. The contract:

- Only **`AppError`** messages reach the client; those are written for users.
- Everything else returns `{ code: 'internal', message: 'Something went wrong', errorId }`, with the
  full error logged server-side under the same `errorId` so a screenshot can be matched to a stack
  trace. **This is deliberately not gated on `NODE_ENV`** — the repo shares one root env file, so the
  phone talks to a `development` server during normal work, and a dev-only branch is exactly how
  Prisma paths and source frames ended up rendered in the UI.
- `PrismaClientInitializationError` → 503 `service_unavailable`, so a database outage degrades to
  "try again in a moment" rather than dumping a connection string.

On the client, **never render `err.message` directly.** `main-app/src/lib/errors.ts` exposes
`friendlyError(e, fallback)`, which maps by error code and swallows anything that still looks like an
internal dump. Every screen goes through it.

## The keyboard prototype (`keyboard/`)
HTML/JSX reference (preview via `index.html`): `src/keyboard.jsx` (keys + suggestion bar + prompt
panel), `src/result.jsx` (result sheet + Calendar/Stripe/Map detail views), `src/app.jsx`
(`ZenemicController` state machine `idle → listening → generating → done`). Its backend seams
`callZenemicAPI(prompt)` / `confirmZenemicEvent(event)` in `src/app.jsx` are the integration points
for the `backend/keyboard` service (`/generate`, `/confirm`) — **wiring them up is an intended
future step, not yet done.**
