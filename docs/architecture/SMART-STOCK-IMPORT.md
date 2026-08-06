# Smart Stock Import — universal spreadsheet ingestion

> Goal set by the client (2026-08-06): **high compatibility** — accept many
> spreadsheet layouts, auto-map columns, remap when vendors change formats,
> understand most files on first sight, and support multiple stocks across
> **regions** that customers see **consolidated and per region**.
>
> Grounding evidence: the real HYLA `DailyStockReport_*.xls` (2,675 data rows)
> exercised every design point below.

## Why "dumb import" fails (real-file evidence)

| Trap in the real HYLA file | Consequence for a naive importer |
|---|---|
| Sheet 1 is a decorative "Cover Page"; data lives in sheet "New Availability" | Imports 0 rows |
| Headers are on row 0 of the data sheet, but the cover sheet has junk in rows 2–4 | Header sniffing must be per-sheet, scored |
| `Carrier` mixes codes and names: `ATT`, `VZW`, `UNL`, `OTH` **and** `Verizon`, `T-Mobile`, `Unlocked`, `Sprint`, `Boost`, `Spectrum`, `Xfinity`, `Wi-Fi Only`, `XAG Generic` | Same SKU splits into phantom variants |
| Grade `TPS A-` appears in the feed but is absent from the engine's `VENDOR_GRADE_MAPS.HYLA` | Silently priced as CTIA C unless routed to review |
| `Quantity` arrives as strings, historically including masked `"200+"` | Numeric parse must handle masks + flag them |
| `Warehouse` column: `W23-ATT`, `TX1`, `TN1` | Regions exist in the data — must become first-class locations |
| `Description` is a composite of every attribute (`Apple / iPhone 11 / A2111 / 256GB / GSM / Black / ATT / UNLOCKED / DLS B`) | Redundant with atomic columns — usable as checksum/inference source |

## Pipeline (six stages, every import)

```
file → 1 DETECT → 2 MAP → 3 NORMALIZE → 4 VALIDATE → 5 DRY-RUN 👀 → 6 COMMIT ✓
```

1. **DETECT** — accept `.xls/.xlsx/.csv/.tsv`. For each sheet, scan the first
   ~25 rows and score each row as a header candidate (share of cells matching
   the synonym dictionary + uniqueness + non-empty ratio). Pick the best
   (sheet, header-row) pair; below confidence threshold → ask the user to
   click the header row (one click, then saved in the profile).
2. **MAP** — resolve each column to a canonical field (three layers, below).
3. **NORMALIZE** — per-field normalizers turn raw values into canon.
4. **VALIDATE** — per-row rules; a row is accepted/rejected with a reason
   (never a silent drop).
5. **DRY-RUN** — preview: N accepted / M rejected (reason per line), the
   mapping used, price impact summary (how many SKUs would reprice).
6. **COMMIT** — transactional; writes one adjustment movement per changed
   `(variant, location)` (stock balance = sum of audited movements); triggers
   repricing. Two modes, chosen at upload (resolved 2026-08-06):
   **merge** (default — only rows present in the sheet are adjusted) and
   **replace location** (explicit — zeroes every balance at the chosen
   location first, then sets the sheet values; both steps are ledger
   movements, so history survives).

## Canonical fields

`make · model · model_number · capacity · color · vendor_grade · carrier ·
lock_status · cost · currency · quantity · warehouse · category ·
part_number/sku (optional) · description (optional)`

Variant identity stays as defined in PRODUCT-CATALOG-STANDARD.md
(model|capacity|grade|carrier|lock — grade suffix preserved).

## Auto-mapping — three layers, in order

1. **Synonym dictionary** (exact, case/space/accents-insensitive):
   e.g. quantity ← `qty, quantity, qty available, units, on hand, estoque,
   quantidade, cantidad`; cost ← `price, cost, unit cost, vendor cost, precio,
   custo`; warehouse ← `warehouse, location, wh, site, region, deposito`.
   Dictionary lives in the DB (admin panel editable), not in code.
2. **Fuzzy header match** — token overlap + edit distance against the
   dictionary (`"QTY Avail."` → quantity).
3. **Content inference** (the "understands on first sight" layer) — sample
   ~50 values per unmapped column and classify by shape:
   `\d+GB|\d+TB` → capacity · `LOCKED|UNLOCKED` → lock_status ·
   carrier-domain hits → carrier · `DLS|TPS [A-D][+-]?` style → vendor_grade ·
   money-shaped → cost · small ints (or `\d+\+`) → quantity ·
   known make names → make · 3-char codes matching location table → warehouse.

Each mapping gets a confidence score. High-confidence mappings apply
silently; low ones surface in a **mapping screen** (dropdown per column,
live sample values) — the human confirms once.

## Mapping profiles — the "remap" memory

- On confirm, the mapping is saved as an **import profile**:
  `(supplier, header_fingerprint) → {column map, normalizer options, sheet/header choice}`
  where `header_fingerprint = hash(sorted normalized headers)`.
- Same layout next time → **zero clicks** (profile hit).
- Vendor changes one column → fingerprint miss, but nearest-profile diff is
  proposed: only the delta is asked, then saved as a new profile version.
- Profiles are listed/editable in the admin panel (locked decision: every
  rule is admin configuration).

## Value normalizers

| Field | Rule |
|---|---|
| carrier | Synonym table → canonical set `ATT, VZW, TMO, SPR, BST, XFI, SPC, UNL, OTH…` (`Verizon→VZW`, `T-Mobile→TMO`, `Unlocked→UNL`, `Wi-Fi Only→OTH`, `XAG Generic→OTH`). Unknown value → row accepted, carrier=OTH + warning. |
| vendor_grade | Kept verbatim as `vendor_grade`; CTIA mapping happens at pricing via the per-vendor grade map. **Unknown grade → classification queue** (admin assigns once; meanwhile gated to T3/T4 as CTIA C, exactly `map_grade()`'s safe default). |
| capacity | `256 GB`/`256`/`0.5TB` → `256GB`/`512GB`. |
| cost | Currency symbols, thousand separators (both `1,234.56` and `1.234,56`), negative → reject row. Currency column honored; non-USD flagged. |
| quantity | Int parse; masked `"200+"` → 200 with `masked_qty` flag; ≤0 → treated as delist for that (variant, location). |
| lock_status | `LOCKED/UNLOCKED` (+ synonyms `Yes/No`, `L/U`). |

## Regions: locations model

- **`stock_locations`**: `id, code (TX1…), display_name ("Texas"), region,
  supplier_id?, active`. Auto-created on first sight of a new warehouse code
  (admin can rename/merge in the panel — merge repoints inventory).
- **`inventory`** is keyed `(variant_id, location_id)` with `qty, cost_cents,
  as_of, source_import_id`.
- One import file may carry many warehouses (HYLA does: W23-ATT + TX1 + TN1)
  — rows fan out to their locations. A file without a warehouse column asks
  for a target location at upload (saved in the profile).

### What each side sees
- **Customer (locked decision D2):** consolidated exact total per variant +
  breakdown by location display name ("Texas: 38 · Tennessee: 64").
- **Admin:** the same plus per-location cost, age (`as_of`), and source import.

## Pricing interplay (engine v2)

- T3/T4 are pure cost-plus → **reprice instantly at commit** for every
  touched (variant, location).
- Day-over-day cost swing > `cost_change_review_pct` (15%) → hold-for-review
  flag, price not auto-published (engine rule).
- **Cross-location cost spread:** the same variant can carry different costs
  per region. v1 rule (conservative): the customer-facing tier price is
  computed from the **highest cost among in-stock locations**, so no sale can
  land under any location's band; when the spread exceeds a configurable
  threshold, flag for admin review (panel-tunable). Admin override per
  variant always wins.
- T1/T2 unchanged: benchmark-driven (assisted in v1.0 per the execution plan).

## Export round-trip

Canonical CSV/XLSX export: consolidated or per location, filterable —
re-importable as-is (the canonical layout is itself a saved profile).

## v1.0 scope vs later

| In v1.0 | Later |
|---|---|
| Full pipeline, synonym+fuzzy+content mapping, profiles, dry-run, locations, ledger | Auto-scheduled pulls (e-mail bot / APIs — v1.1+) |
| Admin-editable synonym dictionary & profiles | ML-assisted mapping suggestions |
| Canonical export | Per-customer export layouts |
