# Blue Voice — Geographic Analytics Explorer

An internal analytics tool for the Blue Voice team. Pick a product event, see it
shaded across a US choropleth, and click any state to drill into its
departments, device/role split, and daily trend. Data comes from **Amplitude**
(project `Blue Voice App`, appId `602375`) via **server-side route handlers** —
the browser never sees Amplitude credentials.

> Internal tool. Officer question logs are intentionally anonymous; this app
> works at the **department/state** grain only. Keep the deployment
> access-controlled (see _Deploy_).

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind v4** + **shadcn/ui** (new-york) · Lucide · Sonner — mirrors
  `bluevoice-admin-app` for easy future migration
- **Map:** `react-simple-maps` + `us-atlas` (states-10m TopoJSON) +
  `d3-scale` (`scaleSqrt`) · tooltips via `react-tooltip`
- **Charts:** `recharts` · **Server state:** TanStack React Query v5
- **Tests:** Vitest (parser + helpers)

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then fill in the two keys
npm run dev                        # http://localhost:3000
```

### Environment variables (server-only — never `NEXT_PUBLIC_`)

| Var | Where to get it |
| --- | --- |
| `AMPLITUDE_API_KEY` | Amplitude → Settings → Projects → **Blue Voice App** → General |
| `AMPLITUDE_SECRET_KEY` | same page |
| `AMPLITUDE_BASE_URL` | `https://amplitude.com` (US data center for this org) |

Set `AMPLITUDE_DEBUG=1` to log one raw segmentation response (handy for locking
the parser to the exact shape).

## Verify the pipeline (sanity baseline, spec §8)

With keys in place, hit the geo route directly and compare to the known values
(New Question Asked, Prod, last 90 days, totals):

```bash
curl 'http://localhost:3000/api/geo?event=New%20Question%20Asked&metric=totals&range=90d&env=Prod' | jq '.byState'
# expect ~ Massachusetts 17702, New Jersey 4003, Texas 3331, Florida 2456 ...
```

Small drift is expected as the 90-day window rolls forward.

## Architecture

```
Browser (client components)
   │  fetch /api/geo?event=…&metric=…
   ▼
Next.js Route Handler (app/api/**, Node runtime)   ← holds AMPLITUDE_*_KEY
   │  HTTPS Basic auth
   ▼
Amplitude Dashboard REST API  /api/2/events/segmentation
```

- `lib/amplitude.ts` — **server-only** (`import "server-only"`): auth + the
  segmentation fetch. The browser importing it fails the build.
- `lib/amplitude-parse.ts` — **pure** parsing/aggregation, unit tested. The
  segmentation response shape varies by group-by depth; the parser tolerates
  the documented variants.
- `app/api/**` — six route handlers (`runtime = "nodejs"`,
  `revalidate = 600`). React Query adds a second client cache layer.

### Data-coverage caveat (spec §4)

`State` is only reliably populated on a subset of events. Map-ready events
(Questions Asked, Workspace Chats) are the default; events with poor coverage
are gated behind **Show all events** and trigger an inline coverage warning so
the map isn't silently misleading.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # ESLint (zero-warnings policy)
npm run test         # Vitest (parser + helpers)
```

## Deploy (Vercel)

1. Push to GitHub, import the project in Vercel (framework auto-detected).
2. Add `AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`, `AMPLITUDE_BASE_URL` for
   **Production**, **Preview**, and **Development** — no `NEXT_PUBLIC_` prefix.
3. Deploy. Route handlers become serverless functions automatically.
4. **Harden:** protect the deployment (Vercel password / SSO or auth
   middleware) — it exposes internal usage analytics.
