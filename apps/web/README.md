# apps/web — OrderMyPhones.com Storefront & Admin

Customer-facing storefront, customer portal, and admin dashboard. Mobile-first.

## Stack

- **React 18** + **Vite** + **TypeScript** (strict)
- **Tailwind CSS** + **Shadcn/UI**
- **TanStack Query** for server state
- **React Router** for client-side routing
- **Supabase JS** for auth + DB access
- **Stripe.js / Elements** for payments
- **PostHog** for analytics; **Sentry** for errors

## Local

```bash
cp .env.example .env.local        # fill in Supabase URL + anon key
npm install
npm run dev                       # http://localhost:5173
npm run build && npm run preview  # production-shaped preview
npm run typecheck
npm run lint
```

## Routes (scaffolded)

| Path | Surface |
|---|---|
| `/` | Landing |
| `/catalog` | Filtered catalog |
| `/p/:slug` | Product detail (3D viewer slot) |
| `/cart` | Cart |
| `/checkout` | Stripe checkout entrypoint |
| `/auth/sign-in`, `/auth/sign-up`, `/auth/reset`, `/auth/callback` | Auth flows |
| `/portal/*` | Customer portal (orders, tier, addresses, payment methods, settings) |
| `/admin/*` | Admin dashboard (customers, orders, inventory, prices, api-logs, ai, reports) |

Full information architecture: [`../../docs/ux/INFORMATION-ARCHITECTURE.md`](../../docs/ux/INFORMATION-ARCHITECTURE.md).

## Shadcn components

This project uses Shadcn/UI **owned** in `src/components/ui/`. Add components via the official CLI (or the shadcn MCP server when working inside Claude Code):

```bash
npx shadcn@latest add button input dialog ...
```

## Docker

Multi-stage Dockerfile produces a small static-server image (Nginx unprivileged) suitable for the VPS topology in [`../../docs/architecture/DEPLOYMENT.md`](../../docs/architecture/DEPLOYMENT.md).

```bash
docker build -t ordermyphones-web:dev .
docker run --rm -p 8080:8080 --env-file .env.local ordermyphones-web:dev
```
