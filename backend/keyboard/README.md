# Zenemic Keyboard Service (`@zenemic/keyboard`)

A small, standalone Express service for the Zenemic custom keyboard. It exposes the
keyboard's two endpoints and reuses all the heavy lifting (AI extraction, event +
resource creation, payment split, calendar) from [`@zenemic/shared`](../packages/shared),
so events it creates live in the **same database** the main-app reads from.

> Part of the `backend/` npm-workspaces monorepo — see [`../README.md`](../README.md).
> This is the backend service; the keyboard **prototype frontend** lives at the repo
> root `keyboard/` and is **not** wired to this service yet (a separate follow-up).

## Endpoints

Both require a **Supabase access token**: `Authorization: Bearer <token>`.

```
POST /generate   { prompt }     → extract + create the event & resources (pending), return the result-sheet payload
POST /confirm    { eventId }    → send calendar invites + Stripe payment requests
GET  /health                    → { status: 'ok', service: 'keyboard', features }
```

These match the old `POST /api/keyboard/generate` / `/confirm` behaviour, now served by
this service (on its own port) at the bare `/generate` and `/confirm` paths.

`POST /generate` runs the **same** shared domain code as the main-app's `POST /api/events`
(`extractDraft` → `createEvent` → resource generation), so the resulting `Event` is
immediately visible via the main-app (`GET /api/events/:id`).

## Run

From the monorepo root (`backend/`):

```sh
npm install                 # once, sets up the workspaces
npm run prisma:generate     # once, generates the shared Prisma client
npm run dev:keyboard        # http://localhost:4100
```

Or from this folder: `npm run dev`. Build/start: `npm run build` then `npm start`
(the shared package must be built first — `npm run build` at the root does both in order).

## Environment

Environment is the **one file for the whole repo** at the repository root — `.env.local` (copy
from `.env.example`); the same file the main-app service and the Expo app use, so it already
points at the same database. Required to boot: `DATABASE_URL` (+ `DIRECT_URL`), `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `ANTHROPIC_API_KEY`. Optional integration keys
(Google Calendar/Maps, Stripe, TfL) enable the matching resource on generated events; leave
them blank to skip it. This service listens on `KEYBOARD_PORT` (default 4100). See the repo-root
`.env.example` for the annotated list.
