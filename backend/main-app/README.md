# Zenemic Main-App Backend (`@zenemic/main-app`)

API + AI orchestration for **Zenemic**, the AI event-planning app (`../../main-app`).
This service owns everything the app's UI calls into: authentication, events, the AI
chat assistant, payments/splitter, the shared album, and the third-party integration
OAuth flows. Shared infrastructure (Prisma/DB, Supabase auth, the Anthropic pipeline,
and the Calendar/Maps/Stripe/TfL clients) comes from
[`@zenemic/shared`](../packages/shared).

> Part of the `backend/` npm-workspaces monorepo — see [`../README.md`](../README.md).
> The keyboard's `generate`/`confirm` endpoints are **no longer here** — they moved to
> the standalone [`@zenemic/keyboard`](../keyboard) service.

## What it does

| App flow | Backend |
| --- | --- |
| `CreateDescribe` → "Zenemic AI will pull out the details" | `POST /api/events/draft` — Claude extracts structured fields from free text |
| `CreateProcessing` → "Setting up your event…" | `POST /api/events` — planner chart, calendar event, payment splitter, Maps + TfL links, album, then persists |
| `EventDetail` / `PlannerChart` | `GET /api/events/:id`, `GET /api/events/:id/chart` |
| `EventChatPanel` ("Ask Zenemic") | `POST /api/events/:id/chat` — Claude with tool use; receipts itemised via vision |
| Splitter | `GET/POST /api/events/:id/split`, `POST /api/events/:id/split/send` |
| Auth + Settings | Supabase Auth (client SDK) for identity; `GET/PATCH /api/auth/me`, `DELETE /api/auth/account`, Google connect under `/api/integrations/*` |

## Stack

- Node 20+ · TypeScript · Express, listening on **port 4000**
- All domain/AI/integration logic + the Prisma client come from `@zenemic/shared`
- Per-service deps here are just the HTTP layer (`express`, `helmet`, `cors`, `pino-http`,
  `zod`) plus type-only `@anthropic-ai/sdk` / `stripe` / `@prisma/client`

## Run

From the monorepo root (`backend/`):

```sh
npm install                 # once, sets up the workspaces
npm run prisma:generate     # once, generates the shared Prisma client
npm run prisma:migrate      # creates tables from packages/shared/prisma/schema.prisma
npm run seed                # optional: demo user + event
npm run dev:main            # http://localhost:4000
```

Or from this folder: `npm run dev`. Build/start: `npm run build` then `npm start`.

## Environment

Environment is the **one file for the whole repo** at the repository root — `.env.local` (copy
from `.env.example`), shared with the keyboard service and the Expo app. Required to boot:
`DATABASE_URL` (+ `DIRECT_URL`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`,
`ANTHROPIC_API_KEY`; this service listens on `MAIN_APP_PORT` (default 4000). Every other
integration is optional — leave its keys blank and the related endpoints return a clear
`503 not_configured` instead of crashing. See the repo-root `.env.example` for the full list.

## API reference (all under `/api`)

Auth-required routes need a Supabase access token: `Authorization: Bearer <token>`.

```
# Auth (identity is client-side via the Supabase SDK; the backend verifies the token)
GET    /auth/me                 (verify token, sync + return profile)  (auth)
PATCH  /auth/me                 { name?, defaultSplitMode?, notificationsEnabled?, expoPushToken? }  (auth)
DELETE /auth/account            (delete profile + Supabase auth user)  (auth)

# Events
POST   /events/draft            { message, todayISO?, timezoneOffset? }  (auth)
POST   /events                  { title, dateLabel, timeLabel, locationName, attendees, ... }  (auth)
GET    /events                  ?kind=planned|ongoing|previous (optional)  (auth)
GET    /events/:id              (auth)
PATCH  /events/:id              { title?, dateLabel?, timeLabel?, location?, splitMode? }  (auth)
DELETE /events/:id              (auth)

# Planner chart / attendees
GET    /events/:id/chart        (auth)
POST   /events/:id/chart        (AI regenerate)  (auth)
PUT    /events/:id/chart        { stages: [...] }  (auth)
PATCH  /events/:id/stages/:stageId        { done }  (auth)
PATCH  /events/:id/attendees/:attendeeId  { rsvp }  (auth)

# Ask Zenemic
GET    /events/:id/chat         (auth)
POST   /events/:id/chat         { text?, receipt?: { imageBase64, mediaType } }  (auth)

# Splitter
GET    /events/:id/split        (auth)
POST   /events/:id/split        { totalMajor?, mode? }  (auth)
PATCH  /events/:id/split/shares { shares: [{ shareId, amountMajor }], mode? }  (auth)
POST   /events/:id/split/send   (issue Stripe links)  (auth)

# Shared photo album
GET    /events/:id/album        (auth)
POST   /events/:id/album/upload-url  { contentType, ext? }  (auth)
POST   /events/:id/album        { url, caption?, uploaderName? }  (auth)
DELETE /events/:id/album/:photoId    (auth)

# Integrations + webhooks
GET    /integrations/status
GET    /integrations/google/connect      (auth)  → { url }
GET    /integrations/google/callback?code&state
POST   /integrations/google/disconnect   (auth)
POST   /webhooks/stripe         (Stripe signs this; raw body)

GET    /health
```
