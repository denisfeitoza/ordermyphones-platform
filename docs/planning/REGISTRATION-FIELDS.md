# Registration fields per tier — v1.0 spec

> Source: client-provided field lists (2026-08-06). Design principle set by the client:
> **keep signup as frictionless as possible** — the invite link already carries the
> tier and the e-mail, so account creation itself must not be a wall.
>
> Site default language: **English** (PT/ES via the discreet header switcher).

## The three-gate model

Instead of one long mandatory form, fields are enforced at the moment they are
actually needed. This keeps signup nearly instant while guaranteeing the data
exists before it matters:

| Gate | Moment | What blocks |
|---|---|---|
| **G0 — Create account** | Opening the invite link | Only: password + the person/business display name. E-mail and tier come from the invite. |
| **G1 — Place first order** | Checkout | Shipping address + contact phone (physically required to ship). Asked inline at checkout, saved to the profile. |
| **G2 — First order approval** (B2B tiers) | Admin approval queue | Sales Tax Certificate + business address (+ business number for T3/T4). The system flags "docs pending" on the order; the ADMIN decides whether to approve anyway or hold — matches the deduct-on-approval model. |
| **Always optional** | Portal → Settings, anytime | Everything else. A profile-completeness checklist nudges without blocking. |

## Field matrix

**Legend:** `G0` required at signup · `G1` required before first order ·
`G2` required before first B2B approval (soft — admin can override) · `opt` optional · `auto` derived, editable.

### Consumer (T1)
| Field | Rule | Notes |
|---|---|---|
| Name | G0 | |
| Email | auto | From the invite; login identity |
| Password | G0 | |
| Shipping address | G1 | Asked at first checkout, saved |
| Billing address | opt | Defaults to shipping ("same as shipping" pre-checked) |
| Phone number | G1 | Delivery contact |
| Date of birth | opt | **Recommend dropping entirely** — sensitive data with no operational use in v1; keep only if the client wants it for fraud checks, and then optional |

### Retailer (T2)
| Field | Rule | Notes |
|---|---|---|
| Business Name | G0 | |
| Email / Password | auto / G0 | |
| DBA | opt | |
| Sales Tax Certificate (file) | **G2** | Upload to Supabase Storage; status chip: pending → submitted → verified. Order can be placed without it; approval screen shows "certificate missing" |
| Retail Type | opt | Dropdown: Multi Carrier · Convenience Store · Cricket/AT&T · Metro/T-Mobile · Boost · Other — 1-click, valuable for segmentation, but never blocking |
| Business Address | G2 | |
| Shipping Address | G1 | |
| Store Number | opt | |
| Principal Name | auto | Defaults to the account holder's name; editable |
| Principal Phone | G1 | Doubles as delivery/ops contact |
| Principal Email | auto | Defaults to account e-mail; editable |
| Website | opt | (client-marked) |
| Monthly Phone Sales Volume | opt | (client-marked) |

### Wholesaler (T3) & Distributor (T4)
Same as Retailer, minus Retail Type, plus:
| Field | Rule | Notes |
|---|---|---|
| Business Number | G2 | EIN / registration — soft-required at approval, admin can override |
| Shipping Account Type | opt | Dropdown: FedEx · DHL · UPS · Other (client-marked optional) |
| Shipping Account Number | opt | (client-marked) |

## Implementation notes (S3)

- The signup form renders conditionally by the tier embedded in the invite.
- Every non-G0 field lives in Portal → Settings with a completeness meter
  ("Profile 60% — add your tax certificate to speed up approvals").
- Certificate uploads: Supabase Storage bucket with RLS (owner + admin read);
  re-upload allowed; admin sees preview in the approval screen.
- G1/G2 enforcement points are configuration (admin panel), not hardcode —
  consistent with the "everything toggleable" locked decision.
- Tier naming is now settled and applied in-app: **Consumer / Retailer /
  Wholesale / Distributor** (T3 50–399, T4 400+).
