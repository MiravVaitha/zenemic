# Zenemic Backend (monorepo)

A small npm-workspaces monorepo with **two independently runnable backend services** that
share one Prisma schema/DB, Supabase auth, the Anthropic AI pipeline, and the
Calendar/Maps/Stripe/TfL integrations:

| Package | What | Port |
| --- | --- | --- |
| [`packages/shared`](packages/shared) — `@zenemic/shared` | Prisma schema + client, Supabase auth, Anthropic AI (extract/chart/chat/receipt/draft), integration clients, and the domain services (event extraction/creation + resource pipeline, payment split, profile). Not run on its own. | — |
| [`main-app`](main-app) — `@zenemic/main-app` | The existing app backend: auth, events, chat, payments, album, integrations under `/api/*`. | 4000 |
| [`keyboard`](keyboard) — `@zenemic/keyboard` | Standalone service for the keyboard: `POST /generate`, `POST /confirm`. | 4100 |

Both services point at the **same database**, so an `Event` created by the keyboard
service is visible to the main-app.

> The repo-root `../main-app/` (Expo app) and `../keyboard/` (keyboard prototype frontend)
> are **frontends** and are separate from these backend services. The keyboard prototype is
> not yet wired to the keyboard backend — that's a deliberate follow-up.

## Layout

```
backend/
  package.json            workspace root (private) + delegating scripts
  tsconfig.base.json       shared compiler options
  packages/shared/         @zenemic/shared
    prisma/                schema.prisma + seed.ts (the one schema/DB)
    src/ config lib middleware ai integrations domain types index.ts
  main-app/                @zenemic/main-app — src/{app,server}.ts + modules/*
  keyboard/                @zenemic/keyboard — src/{app,server,keyboard.routes,keyboard.controller}.ts
```

`main-app` and `keyboard` each contain only their own routes/controllers/entry/env; all
shared infrastructure and domain logic lives in `@zenemic/shared` and is imported via the
`@zenemic/shared` package name.

## Getting started

```sh
cd backend
npm install                 # installs all workspaces + links @zenemic/shared
npm run prisma:generate     # generate the shared Prisma client
npm run prisma:migrate      # create tables from packages/shared/prisma/schema.prisma
npm run seed                # optional: demo user + event

# Run each service (separate terminals):
npm run dev:main            # main-app  → http://localhost:4000
npm run dev:keyboard        # keyboard  → http://localhost:4100
```

Env is **one file for the whole repo** at the repository root (not under `backend/`): copy
`../.env.example` → `../.env.local` and fill it in once — both backend services **and** the Expo
app read it. Required to boot either service: `DATABASE_URL` (+ `DIRECT_URL`), `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `ANTHROPIC_API_KEY`. The two services listen on
`MAIN_APP_PORT` (4000) and `KEYBOARD_PORT` (4100) from that same file, so there's no clash. See
`../.env.example` for the full annotated list (including the `EXPO_PUBLIC_*` keys the app uses).

## Root scripts

```sh
npm run dev:main / dev:keyboard      # run a service in watch mode
npm run build                        # build shared, then both services (in order)
npm run start:main / start:keyboard  # run a built service
npm run typecheck                    # typecheck all three packages
npm run prisma:generate | migrate | deploy | studio | seed   # Prisma (runs in packages/shared)
```

Prisma is driven entirely from `packages/shared` (where `schema.prisma` lives); the root
`prisma:*` scripts delegate there. The generated client is shared by both services.

## Notes

- **Auth**: Supabase Auth owns identity; both services verify the access token
  (`packages/shared/src/lib/supabase.ts`) and key a `User` profile row off the Supabase
  auth UUID. The profile is created lazily on first use (`ensureProfile`).
- **Money** is stored as integer minor units (pence/cents); see
  `packages/shared/src/lib/money.ts`.
- **Resource generation** (`packages/shared/src/domain/resources.service.ts`) is best-effort
  and isolated per resource: a missing integration degrades that one resource, never the
  whole event create.
- `.env` files are git-ignored. Never commit real keys.
```
