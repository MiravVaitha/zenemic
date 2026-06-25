# Testing Zenemic locally

> **Last verified: 2026-06-25** — backend boots, DB schema applied, and `/api/health`
> reports every integration configured. The Expo app is wired to the **main-app**
> backend. The **keyboard** prototype is **not yet wired** to its backend — see
> [Keyboard service (not yet wired)](#keyboard-service-not-yet-wired).

Day-to-day runbook for running and testing Zenemic on a local machine (Windows).
For architecture see [`CLAUDE.md`](./CLAUDE.md); for env vars see [`.env.example`](./.env.example).

---

## TL;DR — every session

Open three terminals from the repo root (`C:\Users\mirav\zenemic`):

| Terminal | Command | Needed for |
| --- | --- | --- |
| **1 — Backend API** | `cd backend` then `npm run dev:main` | always (serves `:4000`) |
| **2 — Stripe webhook** | `stripe listen --forward-to localhost:4000/api/webhooks/stripe` | only when testing the payment split |
| **3 — Expo app** | `cd main-app` then `npm start` | always |

Then press **`w`** (web) or **scan the QR** in Expo Go on your iPhone. `Ctrl+C` in each terminal to stop.

---

## Prerequisites (one-time)

- **Node 20+** and npm.
- **Dependencies installed:** `npm install` in both `backend/` and `main-app/`.
- **`.env.local` at the repo root**, copied from [`.env.example`](./.env.example) and filled in.
  The whole repo shares this one file. Required backend keys: `DATABASE_URL`, `DIRECT_URL`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `ANTHROPIC_API_KEY`. Required app
  keys: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  - In connection strings, **percent-encode special characters in the DB password**
    (e.g. `!` → `%21`, `?` → `%3F`, `@` → `%40`). Don't encode the real `?` that begins
    `?pgbouncer=true...` at the end of `DATABASE_URL`.
- **Stripe CLI logged in:** `stripe login` (once per machine; opens the browser).
- **DB schema applied** — see [Apply / update the DB schema](#apply--update-the-db-schema).
- **`STRIPE_WEBHOOK_SECRET` set** — see [Terminal 2](#2--stripe-webhook--terminal-2-payments-only).

---

## Start the stack (every session)

### 1. Backend API — Terminal 1

```sh
cd C:\Users\mirav\zenemic\backend
npm run dev:main
```

Wait for `Zenemic main-app listening on http://localhost:4000`. Leave it running.
(The log says `localhost`, but the server binds to all interfaces, so a phone can reach it
at your LAN IP.)

### 2. Stripe webhook — Terminal 2 (payments only)

```sh
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

Leave it running while testing payments. It prints `Your webhook signing secret is whsec_…`.

- **First run:** copy that `whsec_…` into `STRIPE_WEBHOOK_SECRET=` in `.env.local`, then
  restart Terminal 1. This CLI secret differs from the Stripe Dashboard one, and it stays the
  same on future runs — so you only set it once.
- After that, just keep this command running; no re-copying needed.

### 3. Expo app — Terminal 3

```sh
cd C:\Users\mirav\zenemic\main-app
npm start
```

Then **press `w`** for web, or **scan the QR** in Expo Go on your iPhone (same Wi-Fi as the PC).
The same LAN IP works for both, so you don't change anything to switch between them.

> The **keyboard service** (`npm run dev:keyboard`, `:4100`) is **not needed** — the Expo app
> only talks to `dev:main`.

---

## Where to point the app (`EXPO_PUBLIC_API_URL`)

Set this in `.env.local` to match how you run the app, then restart `npm start`
(the value is read only at startup):

| Run target | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| **Physical iPhone / Android (Expo Go)** | `http://<your-PC-LAN-IP>:4000` — currently `http://192.168.3.187:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| Web (`w`) | `http://localhost:4000` (the LAN IP also works from the same PC) |

> No iOS **simulator** on Windows (needs a Mac) — use a physical iPhone via Expo Go.
> Your LAN IP can change when Wi-Fi reconnects; re-check with `ipconfig` (IPv4 of the Wi-Fi adapter).

---

## Verify the backend

```sh
curl http://localhost:4000/api/health
```

Expected (all integrations configured):

```json
{
  "status": "ok",
  "features": {
    "anthropic": true, "googleCalendar": true, "googleMaps": true,
    "stripe": true, "storage": true, "push": true, "email": true
  }
}
```

A `true` flag means the key is **present**, not that it's been proven **valid** — the live test
happens when you exercise the feature in the app (create an event, send a split, etc.).

---

## Occasional commands

### Apply / update the DB schema

Run from the **repo root**. Stop the backend first (the Prisma client regenerates, and a running
server holds the engine DLL on Windows → `EPERM`):

```sh
node --env-file=.env.local backend/node_modules/prisma/build/index.js db push --schema backend/packages/shared/prisma/schema.prisma
```

Why the `--env-file`: the Prisma CLI only auto-loads a plain `.env`, **not** this repo's
`.env.local`, so `npm run prisma:migrate` alone won't find `DATABASE_URL`. The flag injects it.
This connects via `DIRECT_URL` (port 5432). For migration history instead of a direct push,
swap `db push` for `migrate dev --name <name>`.

### Seed demo data

Creates a Supabase auth user `eve@email.com` / `password123`, a profile, and one full event.
(The seed script loads `.env.local` itself, so no `--env-file` needed.) Requires the schema to be applied first.

```sh
cd C:\Users\mirav\zenemic\backend
npm run seed
```

### Typecheck (the gate — there is no test suite)

```sh
cd C:\Users\mirav\zenemic\backend ; npm run typecheck
cd C:\Users\mirav\zenemic\main-app ; npm run typecheck
```

### Install / regenerate after pulling changes

```sh
cd C:\Users\mirav\zenemic\backend ; npm install ; npm run prisma:generate
cd C:\Users\mirav\zenemic\main-app ; npm install
```

---

## Keyboard service (not yet wired)

> **Status: TODO.** The keyboard prototype (`keyboard/`) is an HTML/JSX reference and is **not**
> connected to its backend yet. Update this section when it is.

What exists today:

- **Backend service** `@zenemic/keyboard` runs on `:4100` (`cd backend` then `npm run dev:keyboard`),
  exposing `POST /generate`, `POST /confirm`, `GET /health`.
- **Frontend seams:** `keyboard/src/app.jsx` has `callZenemicAPI(prompt)` and
  `confirmZenemicEvent(event)` — the integration points to call `/generate` and `/confirm`.

When wiring is done, document here: how to start the keyboard service, how to run/preview the
keyboard prototype, the env it needs, and the end-to-end `generate → confirm` test steps.

---

## Troubleshooting (Windows)

- **`EPERM` renaming `query_engine-windows.dll.node`** during a Prisma command: a stale Node
  process is holding it. Run `Get-Process node | Stop-Process -Force`, then retry.
- **Port already in use (`EADDRINUSE` on 4000/4100):** another backend (or a leftover one) is
  running. `Get-Process node | Stop-Process -Force`, then restart.
- **Phone can't reach the backend:** confirm `EXPO_PUBLIC_API_URL` is your current LAN IP, the
  phone is on the **same Wi-Fi**, and Windows Firewall allows **Node.js on Private networks**
  (or add an inbound rule for TCP 4000).
- **`Environment variable not found: DATABASE_URL`** from a Prisma command: you ran the bare
  `prisma`/`npm run prisma:*` without injecting env — use the `--env-file` form above.
- **Server exits with `Invalid environment configuration`:** a required key in `.env.local` is
  missing or malformed; the error names the exact variable.

---

## Stopping

`Ctrl+C` in each terminal. To clear any stragglers: `Get-Process node | Stop-Process -Force`.
