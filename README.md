# Livepeer Console

The signed-in surface for developers using the Livepeer network — manage API keys, monitor usage.

## Status

Early development. All data is mock-driven (`lib/console/mock-data.ts`) — there is no backend wired in yet. Auth is stubbed in `components/console/AuthContext.tsx`.

This repo was extracted from [`livepeer/website`](https://github.com/livepeer/website) (branch `claude/dashboard-updates`) and ships independently from the marketing site.

## Tech stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- Geist Sans + Mono via `geist`
- Framer Motion 11, Lucide icons, Recharts
- Package manager: pnpm

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build (verify before pushing)
pnpm lint         # ESLint, zero warnings
pnpm typecheck    # tsc --noEmit
```

## Layout

```
app/
├── layout.tsx              # Root: html/body, Geist fonts, theme bootstrap
├── globals.css             # Token layer + console utilities
├── (app)/                  # Console chrome (sidebar, providers)
│   ├── layout.tsx
│   ├── page.tsx            # /  → Explore (public; → /home when signed in)
│   ├── explore/            # /explore (public)
│   ├── home/               # /home (auth-gated)
│   ├── calls, usage, keys, settings  # auth-gated
│   ├── apps/[id]           # public app detail + playground
│   ├── orgs/[slug]         # public org profile
│   └── network             # public network stats
└── (auth)/                 # Login + signup (no sidebar)

components/
├── console/                # All console surfaces
└── design-system/          # Vendored primitives — Badge, Button, Dialog,
                            # Drawer, ErrorState, Select, Skeleton, Tooltip,
                            # LivepeerLogo. Replace with @livepeer/design-system
                            # when that package ships.

lib/
├── console/                # Mock data, types, utils
└── constants.ts            # PORTAL_NAV_ITEMS + EXTERNAL_LINKS
```

## Routes

| URL            | Auth     | Surface                                       |
| -------------- | -------- | --------------------------------------------- |
| `/`            | public   | Explore — redirects to `/home` when signed in |
| `/explore`     | public   | Explore — app catalog                         |
| `/home`        | required | Console home (your runs / KPIs)               |
| `/calls`       | required | Call history                                  |
| `/usage`       | required | Account usage                                 |
| `/keys`        | required | API keys                                      |
| `/settings`    | required | Account settings                              |
| `/apps/[id]`   | public   | App detail + playground                       |
| `/orgs/[slug]` | public   | Organization's published apps                 |
| `/network`     | public   | Network stats (sidebar: "Stats")              |
| `/login`       | public   | Sign in (hands off to Auth0)                  |
| `/signup`      | public   | Sign up (hands off to Auth0)                  |

See `CLAUDE.md` for console conventions (KPI rows, tables, motion tokens, color rules).

## Database migrations

New migrations are generated into `drizzle-baseline/`. The original `drizzle/`
directory is immutable upgrade history for existing databases; do not edit it.

Use `pnpm db:generate`, then review the generated SQL. For migration, supply an
owner connection through `MIGRATION_DATABASE_URL` (or `DATABASE_URL`), an explicit
`MIGRATION_EXPECTED_HOST`, and, for remote databases,
`MIGRATION_EXPECTED_DATABASE`. Keep credentials out of shell history and Git.

Run `pnpm db:migrate --check` for a rollback rehearsal, then `pnpm db:migrate`
only for an approved target. The wrapper upgrades original-chain databases before
adopting the baseline and preserves their existing migration journal. Do not use
raw `drizzle-kit migrate` for this transition. No migration runs during build or
application startup. Runtime permissions must be verified before deploying code
that uses new tables.

See [migration transition and rollout](docs/early-access/migration-compaction.md)
for the tested production-waitlist upgrade path and preview-specific guard.
