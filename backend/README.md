# Zenemic Backend

API + AI orchestration for **Zenemic**, the AI event-planning app (`../main-app`) and
its custom keyboard (`../keyboard`). This service owns everything the app's UI calls into:
authentication, the AI pipeline, and the third-party integrations the design relies on
(Google Calendar, Stripe, Google Maps, TfL).

> The mobile app is **not** wired to this yet — that's deliberate. This is the full
> backend logic; pointing the app at it is a separate step.

## What it does

Tracing the app's screens to the backend work behind them:

| App flow | Backend |
| --- | --- |
| `CreateDescribe` → "Zenemic AI will pull out the details" | `POST /api/events/draft` — Claude extracts structured fields from free text |
| `CreateConfirm` → editable fields | client edits the returned draft |
| `CreateProcessing` → "Setting up your event…" | `POST /api/events` — generates planner chart, calendar event, payment splitter, Maps + TfL links, shared album, then persists |
| `EventDetail` / `PlannerChart` | `GET /api/events/:id`, `GET /api/events/:id/chart` |
| `EventChatPanel` ("Ask Zenemic") | `POST /api/events/:id/chat` — Claude with tool use; receipts itemised via vision |
| Splitter | `GET/POST /api/events/:id/split`, `POST /api/events/:id/split/send` |
| Keyboard "Generate" / "Confirm all" | `POST /api/keyboard/generate`, `POST /api/keyboard/confirm` |
| Auth + Settings | Supabase Auth (client SDK) for identity; `GET/PATCH /api/auth/me` profile, `DELETE /api/auth/account`, Google connect under `/api/integrations/*` |

## AI features (Anthropic / Claude)

All under `src/ai/`, defaulting to **`claude-opus-4-8`**:

- **`extractEvent`** — natural language → structured event. Uses forced tool-use to get a
  schema-validated object back (stable across SDK versions; see `src/ai/client.ts`).
- **`generateChart`** — event → bespoke planner-chart timeline (forced tool-use).
- **`runEventChat`** — the "Ask Zenemic" assistant: a manual tool-use loop so reads hit
  the DB and money/calendar actions stay gated behind explicit confirmation.
- **`itemizeReceipt`** — receipt photo → itemised lines + total (vision).
- **`draftMessage`** — short group-chat messages (reminders, nudges).

> Structured output is done via forced tool-use because the installed `@anthropic-ai/sdk`
> (0.69.x) predates the `messages.parse` / `output_config` structured-output helpers. If
> you upgrade the SDK, `src/ai/client.ts` is the single place to switch over, and you can
> re-enable adaptive thinking there too.

## Stack

- Node 20+ · TypeScript · Express
- Prisma + PostgreSQL (Supabase) — pooled `DATABASE_URL` at runtime, `DIRECT_URL` for migrations
- `@anthropic-ai/sdk`, `stripe`, `googleapis`, `@aws-sdk/client-s3`, `expo-server-sdk`
- **Supabase Auth** for identity — backend verifies access tokens with `jose` (JWKS, or
  HS256 for legacy projects) · zod validation · pino logging

## Setup

```sh
cd backend
npm install
cp .env.example .env.local        # then fill in values (see below)

# Database
npm run prisma:generate
npm run prisma:migrate            # creates tables from prisma/schema.prisma
npm run seed                      # optional: demo user + event

npm run dev                       # http://localhost:4000
```

Required env to boot: `DATABASE_URL` (+ `DIRECT_URL` for migrations), `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `ANTHROPIC_API_KEY`. For the database, grab both
connection strings from the dashboard → **Connect → ORMs/Prisma** (`DATABASE_URL` = transaction
pooler on `:6543` with `?pgbouncer=true`; `DIRECT_URL` = session/direct on `:5432`); the
Supabase keys are under **Settings → API**. Every other integration is **optional** — leave
its keys blank and the related endpoints return a clear `503 not_configured` instead of
crashing, so you can bring the system up incrementally. See `.env.example` for the full list.

### Which keys unlock what

| Integration | Keys | Powers |
| --- | --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` | all AI features (required) |
| Supabase Postgres | `DATABASE_URL` + `DIRECT_URL` | persistence (required) |
| Supabase Auth | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | user identity / token verification (required) |
| Google Calendar | `GOOGLE_CLIENT_ID/SECRET` + OAuth | calendar events + invites |
| Google Maps | `GOOGLE_MAPS_API_KEY` | geocoding, directions, travel estimates |
| Stripe | `STRIPE_SECRET_KEY` (+ webhook secret) | payment split requests |
| TfL | `TFL_APP_KEY` | London transit journeys |
| Object storage | `S3_*` | shared photo albums + receipt images |
| Expo push | `EXPO_ACCESS_TOKEN` (optional) | reminders / RSVP nudges |
| Email | `RESEND_API_KEY` | event invites (auth emails are sent by Supabase) |

## Project layout

```
src/
  config/        env (zod-validated) + logger
  lib/           prisma client, errors, supabase (admin + JWT verify), oauthState, money, http
  middleware/    auth (Supabase JWT), validation, error handling
  ai/            Anthropic client + extract / chart / chat / receipt / draft
  integrations/  stripe, googleCalendar, googleMaps, tfl, storage, push, email
  modules/
    auth/        Supabase JWT verify, profile sync (GET /me), settings, delete account
    events/      draft extraction, create + resource pipeline, CRUD, chart
    chat/        "Ask Zenemic" assistant
    payments/    splitter, split endpoints, Stripe webhook
    keyboard/    one-shot generate + confirm (keyboard app)
    integrations/ Google OAuth connect/callback, integration status
  app.ts         Express app assembly
  server.ts      entry point
prisma/schema.prisma
```

## API reference (all under `/api`)

Auth-required routes need a **Supabase access token**: `Authorization: Bearer <token>`.

```
# Auth — signup / login / password reset / MFA / OAuth happen CLIENT-SIDE via the
# Supabase Auth SDK. The backend only verifies the token + manages the profile.
GET    /auth/me               (verify token, sync + return profile)  (auth)
PATCH  /auth/me               { name?, defaultSplitMode?, notificationsEnabled?, expoPushToken? }  (auth)
DELETE /auth/account          (delete profile + Supabase auth user)  (auth)

# Events
POST   /events/draft           { message, todayISO?, timezoneOffset? }    (auth)  → extracted fields
POST   /events                 { title, dateLabel, timeLabel, locationName, attendees, ... }  (auth)
GET    /events                 ?kind=planned|ongoing|previous (optional)  (auth)
GET    /events/:id                                      (auth)
PATCH  /events/:id             { title?, dateLabel?, timeLabel?, location?, splitMode? }  (auth)
DELETE /events/:id                                      (auth)

# Planner chart
GET    /events/:id/chart                                (auth)
POST   /events/:id/chart       (AI regenerate)          (auth)
PUT    /events/:id/chart       { stages: [...] }  (edit chart)  (auth)
PATCH  /events/:id/stages/:stageId   { done }     (tick stage off)  (auth)

# Attendees
PATCH  /events/:id/attendees/:attendeeId  { rsvp: GOING|DECLINED|PENDING }  (auth)

# Ask Zenemic
GET    /events/:id/chat                                 (auth)
POST   /events/:id/chat        { text?, receipt?: { imageBase64, mediaType } }  (auth)

# Splitter
GET    /events/:id/split                                (auth)
POST   /events/:id/split       { totalMajor?, mode? }   (auth)  (even split)
PATCH  /events/:id/split/shares { shares: [{ shareId, amountMajor }], mode? }  (auth)  (per-person)
POST   /events/:id/split/send  (issue Stripe links)     (auth)

# Shared photo album
GET    /events/:id/album                                (auth)
POST   /events/:id/album/upload-url  { contentType, ext? }  (auth)  → presigned S3 PUT
POST   /events/:id/album       { url, caption?, uploaderName? }  (auth)  (record uploaded photo)
DELETE /events/:id/album/:photoId                       (auth)

# Keyboard
POST   /keyboard/generate      { prompt }               (auth)
POST   /keyboard/confirm       { eventId }              (auth)

# Integrations
GET    /integrations/status
GET    /integrations/google/connect                     (auth)  → { url }
GET    /integrations/google/callback?code&state
POST   /integrations/google/disconnect                  (auth)

# Webhooks
POST   /webhooks/stripe        (Stripe signs this; raw body)

GET    /health
```

## Notes

- **Auth**: Supabase Auth owns identity. The client authenticates with the Supabase SDK and
  sends the resulting access token; the backend verifies it (`src/lib/supabase.ts`) and keeps
  a `User` profile row whose `id` **is** the Supabase auth user UUID. The profile is created
  lazily on first `GET /auth/me` or first event create. `DELETE /auth/account` removes both
  the profile (cascading all data) and the Supabase auth user.
- **RLS**: enable Row Level Security on all `public` tables in Supabase. The backend connects
  as the table-owner role (so it bypasses RLS and keeps working), while the public anon/REST
  API is denied by default — closing the main Supabase exposure. Authorization is also enforced
  in app code (every query is scoped to the owner).
- **Money** is stored as integer minor units (pence/cents); see `src/lib/money.ts`.
- **Splits** distribute evenly across attendees with exact remainder handling. The host's
  share defaults to `PAID`. `BY_SHARE` / `BY_ITEM` modes are stored but currently compute
  the even distribution — wire item→person allocation when the UI captures it.
- **Resource generation** (`src/modules/events/resources.service.ts`) is best-effort and
  isolated per resource: a missing integration degrades that one resource, never the whole
  event create.
- The `.env.local` file is git-ignored. Never commit real keys.
