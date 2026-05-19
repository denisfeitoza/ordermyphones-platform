# Data Classification

> Single, simple table the engineering and operations teams reference whenever data leaves the database. Less is more here — if a class is in doubt, treat it as the **higher** class.

## 1. Classes

| Class | Examples | Storage rules | Logging rules | Sharing rules |
|---|---|---|---|---|
| **Public** | Product catalog (published), tier definitions, marketing copy | Anywhere | Free | Public |
| **Internal** | Order counts, supplier sync run summaries | Inside the Platform DB; can be exported to Sentry/PostHog with anonymization | Stripped of PII before logging | Internal to the Client + Developer; never shared with third parties |
| **Confidential** | Customer PII (name, email, phone, address), order line items, account preferences | Postgres only; encryption at rest (Supabase) | Redacted in logs and prompts; only opaque IDs cross service boundaries | Customer themselves + authorized staff/admin |
| **Restricted** | Payment instruments, supplier API keys, Supabase service-role key, admin session tokens | Stripe vault (PCI-out-of-scope), VPS env, Supabase secrets, macOS Keychain (dev) | Never logged in any form | Strictly named individuals; rotated on suspicion or schedule |

## 2. Field-by-field map

| Field | Class | Notes |
|---|---|---|
| `products.*` published | Public | After `status='published'` only |
| `tiers.*` | Public | Published thresholds |
| `prices.*` | Internal | Effective prices shown to authenticated customers |
| `accounts.legal_name`, `tax_id` | Confidential | Business accounts only |
| `users.email`, `phone` | Confidential | PII |
| Shipping addresses | Confidential | PII + behavioral data |
| `orders.notes` | Internal | Admin notes only — never shown to customer; treat as internal-with-PII risk |
| `ai_actions.proposal` | Confidential | Contains account snapshots — redact for analytics export |
| `audit_log.before/after` | Confidential | Can contain PII deltas |
| Stripe `pm_*` / `pi_*` references | Internal | Pointers, not card data |
| Raw card data | **Never stored** | Stripe Checkout only |
| `SUPABASE_SERVICE_ROLE_KEY`, supplier keys, Stripe secret | Restricted | Per §1 storage rules |

## 3. Retention

| Class | Default retention | When deleted |
|---|---|---|
| Public | Indefinite | When product is archived (soft) |
| Internal | 36 months in Postgres; PostHog at provider defaults | Bulk purges scheduled per fiscal year |
| Confidential | 5 years from last activity (configurable per regulation) | Customer-requested deletion within 30 days; cryptographically irretrievable from backups within 90 days |
| Restricted | Lifetime of the engagement; rotated on schedule | Revoked at handover or rotation |

## 4. Export & analytics

- PostHog identifies customers by `account_id` (UUID), **not** email; emails never reach PostHog.
- Sentry events scrub email, phone, and address fields server-side before transmission; PII would only ever reach Sentry as an opaque correlation ID.
- AI prompt logs (when archived for evals) are PII-stripped synthetic transcripts only.

## 5. Customer rights (GDPR / LGPD / CCPA-aligned at launch)

- **Right to access.** A customer can request their full data export — fulfilled within 30 days as JSON + CSV.
- **Right to rectification.** Self-service in the portal for profile, addresses; admin-handled for everything else.
- **Right to erasure.** Confidential-class data is removed; Internal-class anonymized. Audit log and order records retained for the financial retention period required by the Client's jurisdiction.
- **Right to portability.** Same export endpoint provides a portable JSON.

Erasure requests are tracked in `tickets` with a dedicated kind and a defined SLA.

## 6. Cross-references

- [`THREAT-MODEL.md`](THREAT-MODEL.md)
- [`COMPLIANCE.md`](COMPLIANCE.md)
- [`../architecture/AUTH-AND-RLS.md`](../architecture/AUTH-AND-RLS.md)
- [`../architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md) — secret-rotation procedure.
