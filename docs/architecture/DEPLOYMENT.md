# Deployment

> Production topology, build pipeline, DNS, TLS, and rollback. The Platform runs as Docker containers on a dedicated VPS (developer standard §9). No PaaS, no Vercel, no Netlify.

## 1. Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VPS (Linux, Docker host)                         │
│                                                                         │
│  ┌───────────────┐    ┌────────────────────┐    ┌────────────────────┐ │
│  │   Caddy /     │    │   apps/web         │    │  services/ai-api   │ │
│  │   Traefik     │◀──▶│   (Vite SSR-less)  │    │  (Node + Agent SDK)│ │
│  │   (TLS + LB)  │    │   exposed at /     │    │  exposed at        │ │
│  │   port 80/443 │    │                    │    │  /ai/* (proxied)   │ │
│  └───────┬───────┘    └────────────────────┘    └────────────────────┘ │
│          │                                                              │
│          │  ┌────────────────────────────┐  ┌─────────────────────────┐ │
│          └─▶│ services/supplier-source-1 │  │ services/supplier-      │ │
│             │ (Python + Scrapling)       │  │ source-2 (consolidated) │ │
│             │ internal-only (no inbound) │  │ internal-only           │ │
│             └────────────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ outbound only
                                  ▼
       ┌──────────────────────────────────────────────────────────┐
       │ Supabase (managed cloud project, Client-owned)           │
       │ Stripe (Client's merchant account)                       │
       │ OpenRouter / Anthropic API (AI gateway, Developer-owned   │
       │   until handover, then transferred or kept under §2.3)   │
       │ Supplier APIs #1 and #2                                  │
       │ Sentry / PostHog (Client projects)                       │
       └──────────────────────────────────────────────────────────┘
```

## 2. VPS specs

- 4–8 vCPU, 8–16 GB RAM, 100+ GB SSD, 1 Gbps NIC. Sized for the launch tier (Schedule A).
- Linux (Ubuntu LTS or Debian stable), unattended security upgrades enabled.
- SSH key-only access; password auth disabled; fail2ban for SSH; UFW or nftables open only on 22, 80, 443.
- Docker Engine + Docker Compose v2.

VPS access fields (host, user, port, key path) are documented in the Developer's local `CLAUDE.md` and are **not** included in this public-to-the-Client repository.

## 3. Container layout

```yaml
# docker-compose.prod.yml (excerpt)
services:
  caddy:
    image: caddy:2-alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

  web:
    image: ghcr.io/<org>/ordermyphones-web:${RELEASE_TAG}
    environment:
      - VITE_SUPABASE_URL
      - VITE_SUPABASE_ANON_KEY
      - VITE_SENTRY_DSN
      - VITE_POSTHOG_KEY
    restart: unless-stopped

  ai-api:
    image: ghcr.io/<org>/ordermyphones-ai-api:${RELEASE_TAG}
    environment:
      - ANTHROPIC_API_KEY
      - OPENROUTER_API_KEY
      - SUPABASE_URL
      - SUPABASE_SERVICE_ROLE_KEY
      - SENTRY_DSN
    restart: unless-stopped

  supplier-source-1:
    image: ghcr.io/<org>/ordermyphones-supplier-source-1:${RELEASE_TAG}
    environment:
      - SUPPLIER_1_API_BASE
      - SUPPLIER_1_API_KEY
      - SUPABASE_URL
      - SUPABASE_SERVICE_ROLE_KEY
      - SENTRY_DSN
    restart: unless-stopped

  supplier-source-2:
    image: ghcr.io/<org>/ordermyphones-supplier-source-2:${RELEASE_TAG}
    environment:
      - SUPPLIER_2_API_BASE
      - SUPPLIER_2_API_KEY
      - SUPPLIER_DUBAI_API_BASE
      - SUPPLIER_DUBAI_API_KEY
      - SUPABASE_URL
      - SUPABASE_SERVICE_ROLE_KEY
      - SENTRY_DSN
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

A scaffolded compose file lives at the repo root: [`docker-compose.yml`](../../docker-compose.yml) (development) and [`docker-compose.prod.yml`](../../docker-compose.prod.yml) (production-shaped).

## 4. Reverse proxy & TLS

Caddy is the default for its automatic TLS; Traefik is acceptable when label-driven discovery is preferred. The Caddyfile contract:

```
ordermyphones.com {
  encode gzip zstd
  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "interest-cohort=()"
  }
  reverse_proxy /ai/* ai-api:8787
  reverse_proxy web:8080
}

www.ordermyphones.com {
  redir https://ordermyphones.com{uri}
}
```

## 5. Build & release flow

1. **Local build** of each image: `docker build --target prod -t ghcr.io/<org>/ordermyphones-<svc>:vX.Y.Z` (multi-stage Dockerfiles in every service).
2. **Push** to GHCR (or the Client's private registry once handover happens).
3. **Tag** the git commit with `vX.Y.Z`; create a GitHub release with the changelog.
4. **Deploy** by SSH-ing into the VPS:
   ```bash
   ssh deploy@vps "cd /srv/apps/ordermyphones && export RELEASE_TAG=vX.Y.Z && docker compose pull && docker compose up -d"
   ```
5. **Smoke** the production host (storefront `/`, AI `/ai/healthz`, supplier health endpoints).
6. **Sentry release** is tagged automatically via the per-service Dockerfile build args.

Per the developer's deploy standard (§2 of CLAUDE.md), deploys happen immediately after merging into `main`. No manual approval gate between merge and deploy.

## 6. Database migrations

- Migrations live in [`supabase/migrations/`](../../supabase/migrations/) and are versioned by timestamp.
- Applied to the production Supabase project via `supabase db push` (CLI) or the Supabase MCP server.
- **Non-destructive** by default. Any migration containing `DROP`, `TRUNCATE`, or a destructive `ALTER` requires explicit Client confirmation per the developer standard §2.
- Migration order: apply before deploying a new image that depends on the schema change. The runbook in [`OBSERVABILITY.md`](OBSERVABILITY.md) details the rollback path.

## 7. DNS

- Production domain (Client-owned, per Agreement §2.7) points to the VPS public IP.
- A and AAAA records for `ordermyphones.com` and `www.ordermyphones.com`.
- TTL lowered to 60s 48h before any planned cutover; restored to 3600s after.

## 8. Backups

- Supabase project on **PITR** (point-in-time recovery), retention ≥ 7 days at launch.
- Nightly `pg_dump` of the production project to S3-compatible storage (Backblaze B2 or equivalent), encrypted with `age`.
- Quarterly **restore drill**: restore the latest backup to a temporary project, verify row counts and a sample query set. Documented in [`BACKUP-DRILL.md`](BACKUP-DRILL.md) (created in Phase 4).

## 9. Secrets

- VPS environment variables stored in `/etc/ordermyphones/env.d/*.env`, mode `600`, owned by `root`.
- Docker Compose reads them via `env_file`. They are **not** committed; the repo only ships `.env.example` files.
- Key rotation procedure documented in [`OBSERVABILITY.md`](OBSERVABILITY.md).

## 10. Rollback

- **Code rollback:** `docker compose pull` of the previous tag + `up -d`. ~30 seconds.
- **Schema rollback:** apply the reverse migration; for destructive changes, restore from PITR. Decision documented in the runbook.
- **DNS rollback:** revert A/AAAA records to the previous IP (TTL kept at 60s during cutover windows).

## 11. Open items at Final Delivery

These are negotiated as part of the §2.3 maintenance addendum:

- VPS provisioning (Client-owned, Developer-owned during the engagement, transferred under the addendum).
- Container registry (GHCR personal vs Client-owned org account).
- Off-site backup destination and retention.
- Uptime monitoring provider (Better Stack / UptimeRobot).
- On-call rotation and response SLAs.
