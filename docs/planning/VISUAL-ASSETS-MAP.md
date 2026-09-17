# Visual assets map — catalog photos + 3D landing page

Date: 2026-09-15. Owner: Denis. Source of the request: client WhatsApp,
2026-09-15 11:46–11:50 (photos for demos; 3D phone that explodes on scroll;
scroll-driven order→delivery landing page).

Part 1 shipped on 2026-09-16 (see 1.4). Part 2 is still a mapping only.

---

## Part 1 — Catalog image coverage

### 1.1 Where we stand (live DB, project `rdkkbiyugcjyrnkvobrr`)

| Fact | Value |
| --- | --- |
| `products` rows | 133 (all `published = true`) |
| distinct phone models (make + model) | 103 — 20 models have 2–3 duplicate rows (different `model_number`) |
| rows with a real `image_url` | **1** (Apple iPhone 11 Pro — a manual test upload) |
| generated assets on disk (`apps/web/public/generated/`) | 12 product renders + 1 hero |
| models that resolve to *some* asset via the fallback | 35 of 103 |
| models that render a grey placeholder | **97 of 133 rows**, 65 586 units of stock (45% of all stock) |

Plumbing already exists end to end, so this is content work, not schema work:

- `products.image_url` + `product-photos` public bucket + staff RLS — `supabase/migrations/20260913160000_product_content.sql`
- upload from Admin → Products — `apps/web/src/data/products.ts:80`, `apps/web/src/routes/admin/config/ProductsTab.tsx:170`
- `image_url` is exposed to the storefront through `catalog_listing` and consumed by
  `apps/web/src/components/store/RealProductCard.tsx:27` / `RealProductDetail` / `RealCartDrawer`
- generation script already wired to OpenRouter — `tooling/image-gen/generate.mjs` (`google/gemini-3.1-flash-image`, Nano Banana 2)

### 1.2 The bug that makes the demo look worse than the numbers suggest

`apps/web/src/lib/productImage.ts:12` picks the **first** `CATALOG` entry whose
family name is a substring either way, and `CATALOG` is ordered newest-first. So
the loosest match wins:

| Real model | Asset shown today | |
| --- | --- | --- |
| iPhone 16 | `iphone-16-pro-max.png` | wrong (shows a Pro Max) |
| iPhone 16 Pro | `iphone-16-pro-max.png` | wrong |
| iPhone 15 | `iphone-15-pro.png` | wrong |
| iPhone 15 Pro Max | `iphone-15-pro.png` | wrong |
| iPhone 14 Pro Max / 14 Pro / 14 Plus | `iphone-14.png` | wrong |
| iPhone 16e / 16 Plus | `iphone-16.png` | close, still wrong |
| Galaxy S24 FE 5G | `galaxy-s24.png` | close, still wrong |

Only **4 of the top 35 models by stock** currently show the right device.
Fix: match longest family first (and only accept `needle.includes(family)`, never
the reverse), plus an alias table for the supplier naming (`5G`, `Fan Edition`,
`Plus` vs `+`). Cheap, and it should land in the same PR as the new assets.

### 1.3 Proposed scope — "main devices"

Ranked by units in stock. **Tier A = rows 1–25 → 88% of all stock.**
**Tier B = rows 26–35 → 94.5%.** The remaining 68 models keep the placeholder
(or inherit a family asset once the matcher is fixed).

| # | Device | Units | Asset today |
| --- | --- | --- | --- |
| 1 | iPhone 14 Pro Max | 7 499 | wrong (14) |
| 2 | iPhone 14 | 6 098 | ok |
| 3 | iPhone 15 Pro | 4 781 | ok |
| 4 | iPhone 14 Pro | 4 686 | wrong (14) |
| 5 | iPhone 13 | 4 434 | none |
| 6 | iPhone 13 Pro Max | 3 802 | none |
| 7 | iPhone 15 | 3 706 | wrong (15 Pro) |
| 8 | iPhone 12 | 3 251 | none |
| 9 | iPhone 14 Plus | 3 221 | wrong (14) |
| 10 | iPhone 16 Pro Max | 3 038 | ok |
| 11 | iPhone 15 Pro Max | 2 997 | wrong (15 Pro) |
| 12 | iPhone 13 Pro | 2 778 | none |
| 13 | Galaxy S23 Ultra 5G | 2 228 | none |
| 14 | iPhone 15 Plus | 1 907 | none |
| 15 | iPhone 11 | 1 832 | none |
| 16 | iPhone 16 | 1 762 | wrong (16 Pro Max) |
| 17 | iPhone 16 Pro | 1 615 | wrong (16 Pro Max) |
| 18 | iPhone 17 Pro Max | 1 465 | none |
| 19 | Galaxy S22 Ultra 5G | 1 376 | none |
| 20 | iPhone 12 Pro Max | 1 308 | none |
| 21 | iPhone 17 Pro | 940 | none |
| 22 | iPhone 16e | 874 | wrong (16) |
| 23 | Galaxy S23 Plus 5G | 868 | none |
| 24 | Galaxy S22 Plus 5G | 729 | none |
| 25 | Galaxy S22 5G | 669 | none |
| 26 | iPhone 16 Plus | 646 | wrong (16) |
| 27 | Galaxy S24 Ultra 5G | 607 | ok |
| 28 | iPhone 12 Pro | 583 | none |
| 29 | Galaxy S23 5G | 518 | none |
| 30 | iPhone 11 Pro Max | 512 | none |
| 31 | iPhone 11 Pro | 482 | real photo |
| 32 | Galaxy S25 Ultra 5G | 442 | none |
| 33 | iPhone 12 mini | 435 | none |
| 34 | Galaxy S24 Fan Edition 5G | 422 | wrong (S24) |
| 35 | Galaxy S25 Fan Edition 5G | 400 | none |

Not in the top 35 but probably worth adding for demo optics (foldables and
Pixels are what a client points at in a demo): Galaxy Z Fold 5/6/7, Z Flip 5/6/7,
Pixel 9 Pro XL, Pixel 10 Pro. ≈ 8 extra images.

Net new images to generate for Tier A + B + foldables/Pixels: **≈ 40**
(the 12 existing renders are reused where the model actually matches; the
"close but wrong" ones get replaced by a correct render of their own model).

### 1.4 Pipeline — as shipped (2026-09-16)

1. `tooling/image-gen/catalog-manifest.mjs` — 47 models (Tier A + B + foldables/
   Pixels), keyed by the supplier spellings and folded through `normalizeModel()`
   (`Galaxy S22+ 5G` = `Galaxy S22 Plus 5G`). Covers 58 of the 102 model
   spellings in the DB.
2. `cd tooling/image-gen && npm run generate:catalog` — OpenRouter
   `google/gemini-3.1-flash-image`, square studio renders, converted with sharp to
   1024px WebP (5–33 KB each instead of ~800 KB PNG) in
   `apps/web/public/generated/catalog/`. Idempotent (`--force`, `--only id,id`).
   It rewrites `apps/web/src/data/catalogImages.json` from the files on disk.
   The 11 mockup renders were regenerated too: they were landscape and rendered
   visibly smaller than the rest of the grid.
3. `apps/web/src/lib/productImage.ts` resolves by exact normalized model (the
   substring matcher is gone), so a missing render shows the placeholder, never
   a sibling device.
4. `products.image_url` populated via SQL (Supabase MCP) with the same
   `/generated/catalog/<id>.webp` paths, only on rows where it was null — staff
   uploads in Admin still replace them.

Actual cost: **$3.36** (36 renders + 11 regenerated mockup models + 3 re-rolls:
Galaxy S22 tilted, Z Flip7 lying flat, S23 FE doubled). ~$0.067 per image.
Key: `~/.claude/secrets/openrouter.key` or `OPENROUTER_API_KEY` in the root `.env.local`.

### 1.4b Imageless products unpublished (2026-09-17)

On request, every product still without an image was hidden from the storefront
with `published = false` (not deleted — stock, prices and variants untouched).
52 product rows, ≈ 2 500 units (1.7% of stock). The storefront now lists 2 405
listings, all with an image. The iPhone 11 Pro "staff photo" was a purple test
rectangle and was replaced by its render.

Unpublished: Galaxy S21 / S21 5G / S21 Plus 5G / S21 Ultra (+5G) / S21 FE 5G,
S24 Plus 5G / S24+, S25 / S25 5G / S25 Plus 5G / S25+ / S25 Edge 5G, S26 / S26+ /
S26 Ultra 5G, Note20 5G / Note20 Ultra 5G, Z Fold 3/3 5G/4/4 5G, Z Flip3 5G / Flip4;
iPhone 17e, iPhone Air, iPhone SE 3, iPhone XR; Pixel 2 XL, 6 Pro, 7 / 7 5G,
7 Pro 5G, 8 5G, 8 Pro 5G, 8a, 9, 9 Pro, 9a, 10, 10a, 10 Pro XL, 10 Pro Fold, Fold;
AirPods Max USB-C / Max 2 USB-C; Watch SE3 (2); ZZUI UI Demo Phone.

To bring one back: generate its render (add it to `catalog-manifest.mjs`), set
`image_url`, then flip **Published** in Admin → Products. Blanket undo:
`update products set published = true where image_url is null;` (only after
they have images, or they return as placeholders).

### 1.5 Risks / decisions

- **These are AI renders, not manufacturer photos.** That is the safer option
  legally (no stock-photo licence), but the prompts must avoid brand logos and
  wordmarks in-frame, and the renders are *representative*, not the actual unit
  being sold. For a used-device marketplace we should add a
  "representative image" microcopy line on the product page before launch, and
  eventually replace it with per-unit photos from the warehouse.
- Fidelity varies per model (an iPhone 17 Pro the model has not seen may drift).
  Plan for a manual pass over the 40 renders and a re-roll of the bad ones.
- Open question: whether to also give the 68 tail models a generic "phone"
  render instead of the grey tile — cheap, and it removes every empty card from
  a demo.

---

## Part 2 — The 3D phone that explodes on scroll

### 2.1 What the client actually sent

Two GitHub projects from a "what an agency would charge you" post:

| Screenshot | Project | What it is |
| --- | --- | --- |
| "The $9,000 3D product" (15.5k★) | **img2threejs** | one reference photo → a *code-only* procedural Three.js model (a TypeScript factory returning a `THREE.Group`), editable and animation-ready |
| "The $18,000 flythrough" (9.1k★) | **scroll-world** | an agent skill that generates AI video scenes + camera flights and scrubs them by scroll position, so the page reads as one continuous flight |

They solve two different halves of what he described, and they can be combined.

### 2.2 Links to evaluate

- img2threejs repo — https://github.com/img2threejs/img2threejs (Apache-2.0, 16.1k★, v2.0.0)
- **Live gallery** — https://img2threejs.io/
  - closest thing to our use case (consumer electronics with a case that opens):
    https://img2threejs.io/#/x/sony-wf1000xm3
  - other exhibits: `#/x/bmx-endurance`, `#/x/awp-medusa-v2`, `#/x/doraemon-house`
- showcase source (how an exhibit is structured) — https://github.com/img2threejs/img2threejs-showcase
- write-up — https://akmaier.substack.com/p/turning-a-single-photo-into-editable
- scroll-world (agent skill, MIT, 9.3k★) — https://github.com/oso95/scroll-world
- a WebGL variant of the same idea, no video generation — https://github.com/sw7rvy/scroll-world
  (Lenis-scrubbed camera spline over four story nodes, isometric mobile fallback)
- a generated example of the scroll-world output — https://github.com/KubeezMedia/kubeez-scroll-world-video

### 2.3 How the exploded phone would actually work

img2threejs runs as an **agent skill** (Claude Code / Codex): it reads a
reference photo, writes TypeScript that builds the object out of primitives and
procedural shaders, renders it headless, compares against the reference, and
iterates. The output is source code — `createIphoneModel(spec, options): THREE.Group`
with a named component tree and sockets — not a `.glb`. That is exactly why it
fits an explode: every component is an addressable node we can move.

Proposed shape for the landing page (four acts, one continuous scroll):

1. **Whole device** — the phone assembled, slowly rotating. `scroll 0–20%`
2. **Explode** — each component animates outward along its own axis while
   callout labels fade in (screen → "graded A/B/C", battery → "85%+ health",
   camera module → "tested", frame → "CTIA certified"). This is the trust story
   of a CPO marketplace, told in one animation. `20–55%`
3. **Reassemble into the box** — parts converge, the phone drops into an
   OrderMyPhones box, the lid closes. `55–80%`
4. **Delivery** — the box travels and is handed over. `80–100%`

Scroll driving: Lenis (smooth scroll) → normalized progress → a single timeline
that sets each part's offset/rotation. One canvas, no cuts,
`prefers-reduced-motion` respected, and a static hero image as the fallback.

**The honest constraint:** a photo only shows the outside. img2threejs can
rebuild the shell (glass, frame, camera bump, buttons, ports) faithfully; it
cannot know what the logic board looks like. Two ways out:

- *Layer explode* (recommended): separate back glass, frame, battery slab,
  screen assembly, camera module — five to seven stylised layers. Reads
  beautifully, is technically honest, and is what iFixit-style marketing uses.
- *Full teardown*: buy or model an accurate internal 3D model. Much more work,
  and the procedural-code advantage disappears.

Since the output is plain TypeScript, we can hand-author the internal layers in
the same file the tool generates — that is the point of code-only output.

### 2.4 Effort, cost and risk

| | img2threejs (hero phone) | scroll-world (journey) |
| --- | --- | --- |
| Asset cost | agent tokens only, no per-asset API spend | ≈ **$27** for a 6-scene 1080p chain (Seedance 2.0 / Higgsfield credits) + image gen |
| Output | TypeScript + Three.js in our Vite bundle (~600 KB gz for three) | `.mp4`/`.webp` files + a vanilla scrub engine (no framework lock-in) |
| Editable later | yes, it is source code | no, re-generate the clip |
| Mobile | must be budgeted for — one canvas, reduced part count | video scrub is heavy on mobile; the skill ships an isometric fallback |
| Risk | fidelity of the generated shell; our time tuning the animation | recurring cost per iteration; the "AI video" look may clash with a B2B trust message |

Recommendation: **img2threejs for the hero phone + a hand-written scroll
timeline** (acts 1–3), and only consider scroll-world if the client wants the
full cinematic journey after seeing acts 1–3 working. It keeps the cost at zero
per iteration and the result stays editable in the repo.

### 2.5 Sequence

Catalog photos first (the demo blocker), then a one-day spike: generate the
phone model from our best iPhone render, put it on a throwaway route with the
four-act scroll, show the client, and only then decide whether it earns a place
on the real landing page.
