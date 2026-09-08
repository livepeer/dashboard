# CLAUDE.md

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion 11, Geist Sans/Mono, Lucide, Recharts, wavesurfer.js. Auth via `@auth0/nextjs-auth0`; billing/usage/keys via `@pymthouse/builder-sdk`. Package manager: **pnpm**.

**Tests:** there are ~9 `*.test.ts` files under `lib/console/`, but **no test runner is installed and no `test` script exists** — they cannot currently run. Either wire up a runner or treat those files as documentation; don't assume `pnpm test` works.

## Commands

- `pnpm dev` — Next.js dev server on localhost:3000
- `pnpm build` — production build (use to verify changes compile)
- `pnpm lint` — ESLint, zero warnings tolerated
- `pnpm typecheck` — tsc --noEmit
- `pnpm format` / `pnpm format:check` — Prettier

⚠️ `pnpm format` currently reformats ~22 files it did not author — the committed code does not match the installed Prettier 3.8.1 (trailing-comma differences). Until that's reconciled, format only the files you touched.

## Environment

Local dev needs `.env.local` (see `.env.example`). Auth0 vars are required — without them `proxy.ts` throws `DomainResolutionError` on every request and the whole app 404s. Preview values can be pulled with `vercel env pull --environment=preview` against `livepeer-foundation/console`, except values Vercel marks **Sensitive** (`AUTH0_SECRET`, `AUTH0_CLIENT_SECRET`, `LP_DASHBOARD_SESSION_SECRET`, `PYMTHOUSE_M2M_CLIENT_SECRET`) which the API will not return to anyone.

`CONSOLE_DEV_MOCK=1` serves auth + PymtHouse endpoints from `lib/console/dev-mock.ts` so auth-gated surfaces can be worked on without credentials. Hard-disabled when `NODE_ENV === "production"`.

## Project structure

```
app/
├── layout.tsx              # Root layout — html/body, Geist fonts, theme bootstrap (FOUT-safe)
├── globals.css             # Tailwind v4 @theme block + console token layer
├── (app)/                  # Console chrome (sidebar, providers, keyboard shortcuts)
│   ├── page.tsx            # /          → Explore (public; → /home when signed in)
│   ├── explore, apps/[id], orgs/[slug], network   # public
│   ├── home, calls, usage, keys, settings          # auth-gated
│   ├── device, waitlist                            # device-approval + early-access
│   └── error.tsx
├── (auth)/                 # /login, /signup — branded pages; hand off to Auth0; no sidebar
├── api/
│   ├── pymthouse/          # BFF: account-usage, keys, plans, subscribe, wallet, invoices
│   ├── mcp/                # Streamable HTTP MCP resource server
│   └── v1/auth/            # device approval
├── authorize, token, register, .well-known/   # MCP OAuth AS (DCR + PKCE)
└── not-found.tsx

components/
├── console/                # Console surfaces, providers (Auth, Theme), nav, charts, tables
└── design-system/          # Vendored primitives — Badge, Button, Dialog, Drawer,
                            # ErrorState, Select, Skeleton, Tooltip, LivepeerLogo.
                            # TEMPORARY — replace with @livepeer/design-system when published.

lib/console/                # ~47 modules. Roughly: pymthouse-* (BFF clients + types),
                            # use* hooks (useAccountUsage, useApiKeys, useOwnerWallet,
                            # useBillingPlans), display helpers (usage-capability-display,
                            # wallet-settlement-display), auth (session-user,
                            # email-allowlist, external-user-id), and mock-data.
lib/mcp/                    # MCP tools, Streamable HTTP, OAuth AS, gateway inference.
```

## Data layer

Not all mock. Two sources coexist:

- **Live** — Auth0 session → `app/api/pymthouse/*` BFF routes → PymtHouse (usage, keys, plans, wallet, invoices). Server-only helpers live in `lib/console/pymthouse-*.ts` and must never be imported from a client component (they carry `import "server-only"`).
- **Mock** — `lib/console/mock-data.ts` still backs Explore, the model catalog, app/org detail pages, and network stats (~15 importers).

When migrating a surface from mock to live, replace the import surgically; don't restructure the component around the data layer.

## Conventions

### First-run flag

Home (`/home`) shows `<FirstRunChecklist>` for any signed-in user where `localStorage["livepeer.firstRunDismissed"] !== "1"`. Skip / "I've made my first call" / clicking through to the playground all set the flag. The Quickstart sidebar entry clears it and dispatches a same-tab `livepeer:firstrun-changed` CustomEvent so Home re-reads. When real auth lands, AND this with a server-side run-history check.

### Section headings

One pattern, used above the card rather than inside it — title, optional
description, actions on the same line:

```tsx
<SectionHeader variant="default" title="Members"
  description="Anyone with organization access · 4 of 5 free seats"
  action={<>…</>} />
```

`SettingsHeader` is a thin alias of the same component, kept because every
Settings section already calls it. 17 uses between them; this is the console's
section header.

Two narrower variants exist. `variant="mono"` is an 11px uppercase label with a
count chip, for a minor divider inside an already-headed region — 2 uses, don't
reach for it by default. `variant="lg"` is the same recipe one step larger.

Put the heading **outside** the card and let the card hold content. Titles set
inside a card's top edge (`text-base font-semibold`, 9 uses) are the older
pattern; they leave nowhere for section-level actions to sit and compete with
the page header. Don't add more.

`font-bold` is for **display headings only** — the page `h1` (404, the Home
greeting) at `text-[28px]` and up. Inside the console body reach for
`font-medium` (191 uses), then `font-semibold` (34).

### KPI rows

Wrap any row of `<KpiCard>` / `<StatCard>` in `<KpiStrip cols={3 | 4}>` (`components/console/KpiStrip.tsx`). Don't roll ad-hoc `grid grid-cols-2 sm:grid-cols-4` containers — they drift over time.

### Page max-widths

`max-w-[1200px]` is the dominant container for data/chart pages (11 uses); `max-w-5xl` for forms-heavy pages (Settings tabs, Model detail header); `max-w-7xl` for dense catalogs. Whatever a page picks, it must repeat for every inner container (header, sticky tab strip, content) so they line up.

There's no shared `<ConsolePage>` wrapper because every page layers a sticky `<TabStrip>` between header and content, requiring the max-width to repeat 2-3 times intentionally per page.

### Cards

Radius encodes what a surface *is*, so pick by kind rather than by taste:

- **Cards and panels** — `rounded-md border border-hairline bg-dark-lighter shadow-card`, with `px-4 py-3.5` headers and `px-4 py-3` rows (or `p-4` / `p-5` for a plain block). This is the console card. `<Skeleton variant="card">` and `<ErrorState>` match it, so a loading or failed panel keeps the same silhouette as the real one.
- **Floating surfaces** — menus, popovers, dropdowns, command palette: `rounded-xl`. The larger radius is what separates something that hovers above the page from something set into it.
- **Media frames** — video/image output in the playground: `rounded-xl`, softer to suit the content.

`bg-dark-surface` (#1a1a1a) and `bg-dark-lighter` (#181818) were an accidental near-duplicate; cards use `bg-dark-lighter`.

### Tables

Tables in the console are intentionally bespoke — Home "Your runs", `UsageView` breakdown, and `PaymentTab` connected-providers all roll their own markup because their interaction patterns differ. There is no shared `<DataTable>` primitive. If a future surface needs a generic sortable table, build it then — don't back-fit a primitive that compromises the existing surfaces.

### Button hierarchy

**At most one solid button per panel, and it is the action that panel exists to enable.** Everything else is outline. A screen with four solid buttons has four primaries, which means it has none.

| Weight | Recipe | Use for |
|---|---|---|
| Solid | `.btn-primary` / `variant="primary"` | the one action a panel exists for — Add funds in the credits panel, Create key on API keys, Manage plan in the page header |
| Outline | `.btn-outline` / `variant="secondary"` | everything else: peer choices in a list, maintenance actions, secondary echoes of a primary elsewhere on the page |
| Text | `variant="ghost"`, or a plain link | tertiary, repeated-per-row, or in-prose actions |
| Green | `.btn-accent` / `variant="accent"` | reserved. Not currently used anywhere. Reach for it deliberately or not at all |

A **list of options is not a list of primary actions.** Plan rows, environment choices, and anything with a "current" pill are peer alternatives — outline them all so the set reads as a choice rather than three competing demands.

`.btn-primary` is `--color-foreground` on `--color-background`, so light mode inverts for free. `.btn-outline` carries colour and hover only — **not** sizing, because console chrome legitimately comes in three heights: `h-[26px]` (page-header and panel actions, `size="xs"`), `h-[30px]` (detail-view actions), `h-9` (auth walls). Hand-rolled sizing is fine; a hand-rolled *palette* is not — two different outline looks shipped that way before these were unified.

Known soft spot: whether a given action is "the one the panel exists for" is a judgment call. Add funds is solid while Subscribe is outline, which is arguable — panel-scoped primaries were chosen over page-scoped importance. If you disagree, change it deliberately and update this table rather than styling one button differently.

### Form-control focus ring

All form controls (`SearchInput`, `Select`, etc.) show `focus-visible:ring-1 focus-visible:ring-green-bright/30`. Don't ship border-only focus states. Green as a focus ring is an accent use and is correct.

### Loading + error states

Suspense boundaries on every console route use `<ConsolePageSkeleton>` as the fallback. The `(app)/error.tsx` segment-level boundary renders `<ErrorState>` for any thrown render error, with a request ID + retry + Discord help link.

### Color / token rules

- **Ink and paper.** The console is neutral: ink surfaces, paper text, hairline borders. Livepeer green is an **accent**, not a fill. It belongs on status dots, liveness pulses, focus rings, positive deltas, small meters, and the occasional badge — never on a row of buttons. If a screen has more than one or two green elements, the accent has stopped meaning anything.
- **Buttons** get their own section below — green never fills one.
- `globals.css` outside the `@theme` and `:root` token blocks contains **zero raw hex/rgba** — use `var(--color-X)` everywhere, or `color-mix(in srgb, var(--color-X) N%, transparent)` for opacity-based tints. Theme variants belong in the light `:root` block as token overrides, not as `html[data-theme="light"] .foo` rules with literal colors.
- `warm` (orange) is reserved for **liveness/activity** indicators (model warm/cold status, "live" pulses) and for approaching-limit warnings. Never decorative, and never for "this number grew".
- Blue = cold / secondary. Red = failure (`red-400`; there is no red token yet — don't add a second red like `rose-400`).
- Tokenomics is invisible by default — LPT, staking, orchestrator addresses, on-chain mechanics never appear on Home / Capabilities / Playground / Usage / Settings unless the user explicitly opts into a network/protocol view.

### Spend cap (not built yet)

The only limit this product needs is a **hard spend cap**. Concurrent streams,
per-key rate limits and allowed regions were removed in Aug 2026 — they were an
unbacked settings form, and per-key rate limits belong next to the key on
`/keys` if they ever return.

When a cap lands it goes on the **Usage meter**, not in a settings form: you
cannot choose a sensible cap without seeing your spend, and the meter already
draws a ceiling notch for included usage — a cap is the same gesture on the
same rule, with the projection saying which you hit first.

**Do not ship the control before the endpoint exists.** There is no cap API in
`@pymthouse/builder-sdk` today (`AllowancePolicy` is the plan's included
amount; `UserAllowanceGrantInput` grants credit — neither caps spend). A spend
cap that does not stop spending is worse than no control, because it implies
protection that is not there.

The predecessor to avoid rebuilding: a "Limits & metering" panel on `/usage`
with four rows, three of whose bars were hardcoded (`pct: 40`, `30`, `45`)
against `—` and `pass-through` denominators, and none of which were adjustable.

### Honest UI

- A progress bar needs a real denominator. If the maximum is unknown (`—`, "pass-through"), render the figure, not a bar with an invented percentage.
- Don't ship a caption for a control that isn't rendered, or a chevron on a button that opens nothing.
- Never surface a raw enum or internal identifier as user-facing copy (`charge_threshold`, `network_spend`).

### Iconography

- Lucide React. Default stroke width is 1.5. Override only when the glyph reads too thin at the size you're using (e.g. `Activity` at sizes ≥ 16px reads better at `strokeWidth={1.75}`).
- Sizes: `h-3.5 w-3.5` (14px) for inline label icons, `h-4 w-4` (16px) for buttons / nav, `h-5 w-5` (20px) for cards, `h-10 w-10` (40px) for empty-state hero glyphs.

### Monospace

**Sans for language, mono for quantity.** `font-mono` is for IDs, hashes, tokens, addresses, model `id` slugs (e.g. `daydream-video`), and every figure — latency, cost, counts — with `tabular-nums`. Everything that is words uses the default sans: headings, column labels, eyebrow labels, prose, and human-readable names (model display name, provider, user name).

Setting labels in mono too is what makes a dense screen read as undifferentiated — typeface stops carrying hierarchy and only size is left to do it. A capability called "Daydream Video" is a name (sans); `daydream-video` is an identifier (mono).

### Motion

Existing tokens in `globals.css` `@theme`: `--motion-duration-fast` (150ms, hover/focus), `--motion-duration-base` (200ms, dropdowns/menus), `--motion-duration-slow` (300ms, drawers/dialogs). Easings: `--motion-easing-out` (most exits), `--motion-easing-in` (entries), `--motion-easing-spring` (drawer-style spring). All animations must respect `prefers-reduced-motion: reduce`.

## Design system — vendored, not final

`components/design-system/` is **vendored**. When `@livepeer/design-system` ships as a real package, swap the imports — keep `components/design-system/` as a barrel that re-exports from the package, or delete it entirely. 17 files import from `@/components/design-system/X`, so the swap-out is a single barrel-file change rather than a 17-file rewrite.

## Don't

- **No `next/image`** — use raw `<img>` tags. Some downstream primitives need direct CSS filter/absolute stacking that `next/image`'s wrapper breaks. (Currently zero uses — keep it that way.)
- **No global state** — local `useState` only. No state libraries. (Currently none installed.)
- **No new dependencies without discussion.** The dependency list is intentionally small.
- **No Tailwind class names that aren't real.** `divide-hairline` and `cta-primary` both shipped as dangling names that silently did nothing (`divide-y` fell back to white `currentColor`; the button lost its entire fill). For divide utilities the token form is `divide-[var(--color-border-hairline)]`.
