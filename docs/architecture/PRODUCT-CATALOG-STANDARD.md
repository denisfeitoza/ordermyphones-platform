# Product Catalog Standard

> The canonical shape of an OMP product: which attributes identify it, which are mandatory, which are optional, and how stock is **imported** from suppliers and **exported** out of the Platform.
>
> Derived from a real Assurant/HYLA *Daily Stock Report* (2,675 live SKUs across 3 warehouses) and reconciled against the existing [`DATA-MODEL.md`](DATA-MODEL.md). Every rule below was validated against that file — see §9.

---

## 1. Three layers of identity

A physical device becomes three nested records. Getting the boundary right is what makes import idempotent and export lossless.

| Layer | Answers | OMP table | Natural key |
|---|---|---|---|
| **Product** | *"What model is this?"* | `products` | `(make, model_number)` |
| **Variant** | *"Which exact sellable configuration?"* | `product_variants` | `(make, model_number, capacity, color, carrier, lock_status, grade)` |
| **Inventory offer** | *"How many, at what cost, in which location?"* | `inventory` (balance) + `stock_movements` (ledger) | `(variant_id, location_id)` |

In the source file these three collapse into one flat row. Import **explodes** the row into the three layers; export **flattens** them back. The `Description` column (`Apple / iPhone 11 / A2111 / 256GB / GSM / Black / ATT / UNLOCKED / DLS B`) is exactly the human-readable rendering of the variant natural key + make — it is a *display projection*, never the identity itself.

> **Proven on the real feed:** the 7-field variant key produces **2,675 distinct keys for 2,675 rows — zero collisions**, matching the 2,675 unique `Description` strings. The key is 1:1 with reality.

---

## 2. The attribute standard (mandatory vs optional)

Fields are graded by how they behave across all 2,675 rows and all three categories (Phones / Accessories / Wearables).

### 2.1 Mandatory — always present, every category (100% fill)

| OMP field | Source column | Layer | Type / rule |
|---|---|---|---|
| `make` | `Make` | Product | enum-ish: `Apple` \| `Samsung` \| `Google` \| … (extensible) |
| `model` | `Model` | Product | e.g. `iPhone 11 Pro Max` |
| `model_number` | `Model Number` | Product | manufacturer part number (MPN): `A2161`, `SM-N986U`, `G011C` |
| `category` | `Category` | Product | `phones` \| `accessories` \| `wearables` |
| `capacity` | `Capacity` | Variant | `64GB` \| `128GB` \| `256GB` \| `512GB` \| `1TB` \| `1GB`¹ |
| `color` | `Color` | Variant | free text; `*` means **unknown** → stored as `null` |
| `carrier` | `Carrier` | Variant | normalized (see §4) |
| `lock_status` | `Lock Status` | Variant | `locked` \| `unlocked` |
| `grade` | `Grade` | Variant | full grade incl. suffix: `DLS B+`, `TPS A-` (see §3) |
| `quantity` | `Quantity` | Inventory | integer ≥ 0; `"200+"` → `200` with `qty_is_floor = true`² |
| `unit_cost_cents` | `Price` | Inventory | `Price × 100`; integer cents; **> 0** |
| `currency` | `Currency` | Inventory | `USD` at launch |
| `warehouse` | `Warehouse` | Inventory | maps to an `inventory_location` (see §5) |

¹ `1GB` is a placeholder capacity the source ships for non-storage devices (AirPods Max). Kept verbatim; not interpreted as real storage.
² `"200+"` is a **masked quantity** — the supplier hides exact stock above a threshold. Parsing it as an integer floor (not rejecting it) is mandatory; 100 rows in the sample carry it.

### 2.2 Conditional — mandatory for Phones, absent otherwise

| OMP field | Source column | Present when | Rule |
|---|---|---|---|
| `product_family` | `Product Family` | `category = phones` (87% overall, 0% for accessories/wearables) | e.g. `iPhone 11`; marketing line above `model` |
| `protocol` | `Protocol` | `category = phones` | only value seen is `GSM`; `null` for non-phones |

These are **not** globally required. A validator that demands `product_family` on an AirPods row is wrong. Requiredness is **per category**, encoded in §7.

### 2.3 Reserved — declared by the source, never populated (0% fill)

`Screen Size`, `Casing Size`, `Casing Material`, `Band Material`, `CPU Model`, `RAM`, `Launch Date`.

The supplier ships these columns empty on every row. We **keep them in the standard as optional, forward-compatible attributes** (stored in `product_variants.attributes` jsonb), so that the day a feed starts populating `RAM` or `Launch Date` we ingest it without a schema change — but we never require them and never block on their absence.

### 2.4 Derived — computed by OMP, not in the source

| OMP field | Derived from | Rule |
|---|---|---|
| `sku` | the 7 variant-key fields | deterministic slug, stable across imports (see §6) |
| `condition` | `grade` | coarse enum for the storefront/pricing (see §3) |
| `grade_scale` | `grade` prefix | `DLS` \| `TPS` |
| `carrier_raw` | `Carrier` | the original string, kept for audit/forensics |
| `qty_is_floor` | `Quantity` | `true` when the source value ended in `+` |

---

## 3. Grade → CTIA grade (the canonical condition axis)

The feed uses two vendor grading scales for **pre-owned / trade-in** stock (HYLA/Assurant is reverse-logistics — no factory-new inventory here):

- **DLS** — `DLS AA+`, `DLS A+`, `DLS A`, `DLS B+`, `DLS B`, `DLS C`
- **TPS** — `TPS A+`, `TPS A`, `TPS B+`, `TPS B-`, `TPS C+`, `TPS C-`, `TPS D`

`grade` (full, suffix included) lives on the **variant** because it moves the price: in the real file `DLS B` and `DLS B+` of the same phone are **different rows at different costs** ($127 vs $136). Collapsing them would merge two sellable units and corrupt pricing.

The canonical condition axis is the **CTIA grade**, not a letter guess. Each vendor label maps to a CTIA grade via a per-vendor table (`vendor_grade_map`); the storefront, pricing engine, and grade gate all run on the CTIA grade. This is the mapping the Pricing Engine v2 uses ([`PRICING-ENGINE.md`](PRICING-ENGINE.md) §2), grounded in OMP field experience — **not** in letter arithmetic:

| CTIA grade | HYLA vendor grades | Consumer/retailer eligible? |
|---|---|---|
| **A** · Like-New | `TPS A+`, `TPS A`, `DLS AA+` | ✅ yes |
| **B** | `DLS A+`, `DLS A`, `DLS B+`, `DLS B`, `TPS B+` | ❌ wholesale/distributor only |
| **C** | `TPS B-`, `TPS C+`, `TPS C-`, `DLS C` | ❌ wholesale/distributor only |
| **D** | `TPS D` | ❌ wholesale/distributor only |

> **This corrects the earlier draft.** A prior version of this section mapped `DLS A+`/`DLS A` to a top "used_a" condition. That was wrong: DLS grades sit **one full notch below** their TPS letter, so `DLS A+`/`DLS A` are **CTIA B — not consumer-eligible**. Only `TPS A+`, `TPS A`, and `DLS AA+` clear the consumer bar. On the sample feed this reclassifies ~17% of units from "top used" to wholesale-only. The letter→`used_a/b/c` table has been removed; CTIA is the single taxonomy.
>
> **Orphan grade — confirm before go-live.** `TPS A-` appears in neither the vendor map nor the deck. `map_grade` defaults any unknown grade to **CTIA C** (safe: wholesale-only, logged). Decide whether `TPS A-` is A, B, or C rather than letting it silently default.

The `VariantCondition` enum (`new` / `cpo` / `refurbished` / `used_a` / `used_b` / `used_c`) remains for coarse storefront display, derived from CTIA: `A → used_a`, `B → used_b`, `C/D → used_c`, with `new`/`cpo` set explicitly for factory-new and certified stock. CTIA is authoritative; `condition` is a derived label.

---

## 4. Carrier normalization

The source carrier column is messy — 16 distinct values with synonyms and regional-generic labels. The standard defines a **canonical set** and a synonym map; the raw value is always retained in `carrier_raw`.

| Canonical `carrier` (code) | Source values folded in |
|---|---|
| `ATT` | `ATT`, `AT&T` |
| `VZW` | `VZW`, `Verizon` |
| `TMO` | `T-Mobile`, `TMO` |
| `SPR` | `Sprint` |
| `BST` | `Boost` |
| `SPC` | `Spectrum` |
| `XFI` | `Xfinity` |
| `UNL` | `UNL`, `Unlocked` |
| `OTH` | `OTH`, `Other`, `Generic`, `XAA Generic`, `XAG Generic`, `Wi-Fi Only` |

> Resolved 2026-08-06 (ingest conflict W-2): canon is the CODE set above,
> matching SMART-STOCK-IMPORT.md. The synonym map is admin-editable.

`carrier` and `lock_status` are **orthogonal**: a device can be `carrier = att, lock_status = unlocked` (AT&T-branded hardware, SIM-unlocked). Both are part of the variant key because both affect resale value.

An unknown carrier string is **accepted as `OTH` with a dry-run warning** (resolved 2026-08-06): the import never blocks on an exotic carrier; the warning invites the admin to extend the synonym map, and the raw value survives in `carrier_raw` so the row can be reclassified later.

---

## 5. Warehouse → inventory location (bridge to the Partner API)

The feed carries three warehouses: `W23-ATT` (2,323 rows), `TX1` (347), `TN1` (5). Each is a physical stocking point **inside one supplier**.

This refines the masking model from [`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md): a masked OMP location is keyed **`(supplier_id, warehouse)`**, not one-per-supplier. One supplier legitimately spans several warehouses, and each becomes its own named OMP inventory that partners see (e.g. `TX1` → *"Texas Inventory"*). See the `inventory_locations` refinement in [`DATA-MODEL.md`](DATA-MODEL.md) §5.

Import maintains one balance per `(variant, location)` via ledger movements; the same variant in two warehouses is two inventory rows sharing one variant, never a summed quantity — consistent with the per-location feed contract.

---

## 6. SKU generation

Suppliers ship no SKU (identity lives in the free-text `Description`). OMP mints a **deterministic** SKU from the variant key so the same physical configuration always resolves to the same SKU across daily imports:

```
{MAKE}-{MODEL_NUMBER}-{CAPACITY}-{COLOR|NA}-{CARRIER}-{LOCK}-{GRADE_TOKEN}
```

- `GRADE_TOKEN` preserves the suffix: `DLS B+` → `DBP`, `TPS A-` → `TAM`. **This is load-bearing** — dropping the `+`/`-` was the one bug that collapsed 2,675 rows into 2,331 fake duplicates during design. The token encoding is what keeps the SKU 1:1 with the sellable unit.
- Unknown color (`*`) → `NA`.
- Slugged uppercase, ASCII-safe.

Example: `Apple / iPhone 11 / A2111 / 256GB / … / Black / ATT / UNLOCKED / DLS B` → `APPLE-A2111-256GB-BLACK-ATT-UNLOCKED-DB`.

---

## 7. Import contract

### 7.1 Accepted inputs

| Shape | Use | How |
|---|---|---|
| **Supplier feed** (`.xls` / `.xlsx` / `.csv` with the supplier's own columns) | Automated daily sync | A per-supplier **column-mapping profile** maps source headers → OMP fields. The Assurant/HYLA profile is the one derived here. |
| **OMP canonical CSV** (our columns, §8) | Manual catalog maintenance, bulk edits, re-import of an export | Direct 1:1, no mapping profile needed |

Both land in the same normalize → validate → upsert pipeline. A new supplier is a new mapping profile, not new pipeline code.

### 7.2 Validation (server-side, hard-fails per row, never per file)

1. All mandatory columns for the row's `category` present and non-empty (§2.1 + §2.2).
2. `quantity` parses to integer ≥ 0; a trailing `+` sets `qty_is_floor` and is **not** an error.
3. `unit_cost_cents = Price × 100` is an integer **> 0**. Zero/negative cost rejects the row (never mint free stock).
4. `carrier` resolves through the synonym map; unmapped → **accepted as `OTH`** with a `carrier_unmapped` warning (raw kept in `carrier_raw`).
5. `grade` matches a known scale/letter; unmapped → **accepted into the grade classification queue**, gated to T3/T4 as CTIA `C` (engine safe default) until the admin classifies it once.
6. `category ∈ {phones, accessories, wearables}`.
7. `currency = USD` (until Schedule A.3 multi-currency).

A rejected row is logged to `supplier_sync_runs.rows_failed` with a structured reason and **does not abort the batch** — the other 2,574 rows still import. Money math is integer-cents only; `Price` is dollars in the source and multiplied to cents exactly, no float rounding.

### 7.3 Upsert semantics (idempotent)

- **Product**: upsert on `(make, model_number)`.
- **Variant**: upsert on the 7-field key; `sku`, `condition`, `grade_scale` recomputed each time (deterministic, so stable).
- **Inventory** (resolved 2026-08-06, ingest conflict W-1): the balance for
  `(variant_id, location_id)` is **derived from an append-only movement
  ledger** (`stock_movements`) — balance = sum of audited movements, the same
  ledger that order approval deducts from. An import computes the DELTA
  between the sheet value and the current balance and writes one adjustment
  movement per changed row (`source = import`, linked to the import job).
  An explicit **"replace this location's stock"** import mode is available:
  it zeroes every variant balance at that location and sets the sheet values —
  still expressed as ledger movements, so history is never lost.

Re-importing the same file twice produces zero-delta rows → zero movements →
a no-op. Importing tomorrow's file writes movements only for what moved.

---

## 8. Export contract

Two distinct exports — do not conflate them:

| Export | Audience | Includes cost? | Format |
|---|---|---|---|
| **Internal canonical export** | OMP admin/staff — backup, bulk edit, migration | ✅ `unit_cost_cents`, `warehouse`, `carrier_raw` | UTF-8 CSV (+ `.xlsx` on request) |
| **Partner feed** | External B2B partners | ❌ never — marked-up `price_cents` only, supplier identity masked | JSON via [`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md) |

The internal export is **round-trippable**: its columns are exactly the canonical CSV that §7.1 re-imports, so an admin can export → edit in Excel → re-import with zero loss. The partner feed is a *projection* with cost and origin stripped by an allow-list serializer — it is not a catalog export and never carries these columns.

### Canonical CSV columns (internal)

```
sku,make,model,model_number,product_family,category,capacity,color,
carrier,carrier_raw,lock_status,grade,grade_scale,condition,protocol,
warehouse,quantity,qty_is_floor,unit_cost_cents,currency
```

A blank template ships at [`../integrations/product-import-template.csv`](../integrations/product-import-template.csv).

---

## 9. Validation evidence (this standard was proven, not assumed)

Run against the real `DailyStockReport_260720090810.xls` (2,675 data rows):

| Check | Result |
|---|---|
| Variant natural key is 1:1 with reality | **2,675 keys / 2,675 rows / 0 collisions** |
| `Description` == rendered variant key | ✅ exact match on sampled rows |
| Distinct products (`make`+`model_number`) | 132 |
| Distinct variants | 2,675 |
| Masked quantity `"200+"` handled | 100 rows → `qty=200, qty_is_floor=true`, 0 rejected for it |
| Quantity integer / non-negative | 2,675 / 2,675 |
| Price → integer cents, all > 0 | 2,675 / 2,675 (min $22, max $1,375) |
| Warehouses → locations | `W23-ATT`, `TX1`, `TN1` |
| Grade→condition distribution | `used_b` 1,394 · `used_c` 704 · `used_a` 477 |
| SKU collision when grade suffix dropped (the trap) | 344 fake dupes — caught and fixed by the `GRADE_TOKEN` encoding |

---

## 10. Related docs

- [`DATA-MODEL.md`](DATA-MODEL.md) — historical field-level reference (schema is being redesigned per DECISIONS-LOCKED.md; inventory is ledger-based, not snapshots).
- [`PARTNER-INVENTORY-API.md`](PARTNER-INVENTORY-API.md) — how imported stock is projected, masked, and marked up for partners.
- [`../integrations/SUPPLIER-SOURCE-1.md`](../integrations/SUPPLIER-SOURCE-1.md) — the Assurant/HYLA adapter that pulls this feed.
- [`PRICING-ENGINE.md`](PRICING-ENGINE.md) — consumes `condition` and cost to produce customer prices.
- [`../integrations/product-import-template.csv`](../integrations/product-import-template.csv) — blank canonical import/export template.
