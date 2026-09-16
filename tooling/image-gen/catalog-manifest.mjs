// Catalog image manifest — one studio render per *real* catalog model (the
// supplier import), ranked by units in stock. See
// docs/planning/VISUAL-ASSETS-MAP.md for how the list was chosen.
//
// Each entry → apps/web/public/generated/catalog/<id>.webp. `models` lists the
// supplier spellings it covers; they are matched through normalizeModel(), so
// "Galaxy S22+ 5G" and "Galaxy S22 Plus 5G" land on the same asset.
//
// Keep normalizeModel() in sync with apps/web/src/lib/productImage.ts
// (productImage.test.ts pins the supplier spellings).

export function normalizeModel(model) {
  return model
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/\bfan edition\b/g, 'fe')
    .replace(/\b5g\b/g, '')
    .replace(/\b(fold|flip)\s+(\d)\b/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

const STYLE =
  'floating centered on a seamless very-light-grey (#eef0f3) studio background, ' +
  'soft top-left key light, soft realistic contact shadow beneath, ultra sharp, ' +
  'high-detail premium e-commerce product photography, square frame with generous margin, ' +
  'no text, no watermark, no price tag, no visible brand logo';

const p = (subject) => `${subject}, ${STYLE}`;

export const CATALOG_MANIFEST = [
  // ---- Models the storefront mockup already featured ----
  { id: 'iphone-14', models: ['iPhone 14'], prompt: p('A single Apple iPhone 14 in blue, flat aluminum edges, three-quarter back view showing two diagonal camera lenses in a square bump') },
  { id: 'iphone-15-pro', models: ['iPhone 15 Pro'], prompt: p('A single Apple iPhone 15 Pro in white titanium, brushed titanium edges, three-quarter back view showing three camera lenses, matte glass back') },
  { id: 'iphone-16', models: ['iPhone 16'], prompt: p('A single Apple iPhone 16 in ultramarine blue, three-quarter back view showing a pill-shaped camera bump with two vertically stacked lenses') },
  { id: 'iphone-16-plus', models: ['iPhone 16 Plus'], prompt: p('A single large Apple iPhone 16 Plus in pink, three-quarter back view showing a pill-shaped camera bump with two vertically stacked lenses') },
  { id: 'iphone-16-pro', models: ['iPhone 16 Pro'], prompt: p('A single Apple iPhone 16 Pro in natural titanium, brushed titanium edges, three-quarter back view showing three camera lenses, matte glass back') },
  { id: 'iphone-16-pro-max', models: ['iPhone 16 Pro Max'], prompt: p('A single large Apple iPhone 16 Pro Max in desert titanium, brushed titanium edges, three-quarter back view showing three large camera lenses') },
  { id: 'galaxy-s24', models: ['Galaxy S24 5G'], prompt: p('A single Samsung Galaxy S24 in cobalt violet, flat frame, three-quarter back view showing three separate floating camera lenses stacked vertically') },
  { id: 'galaxy-s24-ultra', models: ['Galaxy S24 Ultra 5G'], prompt: p('A single Samsung Galaxy S24 Ultra in titanium gray with squared corners, back view showing five separate floating camera lenses, with its S Pen lying beside it') },
  { id: 'galaxy-s23-fe', models: ['Galaxy S23 Fan Edition 5G'], prompt: p('Exactly one Samsung Galaxy S23 FE in mint, standing upright, three-quarter back view showing three separate floating camera lenses stacked vertically') },
  { id: 'galaxy-z-fold6', models: ['Galaxy Z Fold6'], prompt: p('A single Samsung Galaxy Z Fold6 in silver shadow, half-open like a book at an angle showing the large inner folding display') },
  { id: 'galaxy-z-flip6', models: ['Galaxy Z Flip 6 5G'], prompt: p('A single Samsung Galaxy Z Flip6 in blue, closed and standing upright, front view showing the square cover screen next to two camera lenses') },

  // ---- iPhone 11 / 12 ----
  { id: 'iphone-11', models: ['iPhone 11'], prompt: p('A single Apple iPhone 11 in purple aluminum, three-quarter back view showing the square camera bump with two lenses, glossy glass back') },
  { id: 'iphone-11-pro', models: ['iPhone 11 Pro'], prompt: p('A single Apple iPhone 11 Pro in midnight green, three-quarter back view showing the square camera bump with three lenses in a triangle, matte glass back, rounded stainless steel edges') },
  { id: 'iphone-11-pro-max', models: ['iPhone 11 Pro Max'], prompt: p('A single large Apple iPhone 11 Pro Max in gold, three-quarter back view showing the square camera bump with three lenses in a triangle, matte glass back') },
  { id: 'iphone-12', models: ['iPhone 12'], prompt: p('A single Apple iPhone 12 in blue, flat aluminum edges, three-quarter back view showing two diagonal camera lenses in a square bump') },
  { id: 'iphone-12-mini', models: ['iPhone 12 mini'], prompt: p('A single small Apple iPhone 12 mini in red, flat aluminum edges, three-quarter back view showing two diagonal camera lenses') },
  { id: 'iphone-12-pro', models: ['iPhone 12 Pro'], prompt: p('A single Apple iPhone 12 Pro in pacific blue, flat polished stainless steel edges, three-quarter back view showing three camera lenses and a LiDAR sensor, matte glass back') },
  { id: 'iphone-12-pro-max', models: ['iPhone 12 Pro Max'], prompt: p('A single large Apple iPhone 12 Pro Max in graphite, flat polished stainless steel edges, three-quarter back view showing three large camera lenses and a LiDAR sensor') },

  // ---- iPhone 13 ----
  { id: 'iphone-13', models: ['iPhone 13'], prompt: p('A single Apple iPhone 13 in pink, flat aluminum edges, three-quarter back view showing two camera lenses arranged diagonally in a square bump') },
  { id: 'iphone-13-mini', models: ['iPhone 13 mini'], prompt: p('A single small Apple iPhone 13 mini in starlight, flat aluminum edges, three-quarter back view showing two diagonal camera lenses') },
  { id: 'iphone-13-pro', models: ['iPhone 13 Pro'], prompt: p('A single Apple iPhone 13 Pro in sierra blue, flat stainless steel edges, three-quarter back view showing three large camera lenses, matte glass back') },
  { id: 'iphone-13-pro-max', models: ['iPhone 13 Pro Max'], prompt: p('A single large Apple iPhone 13 Pro Max in alpine green, flat stainless steel edges, three-quarter back view showing three large camera lenses, matte glass back') },

  // ---- iPhone 14 ----
  { id: 'iphone-14-plus', models: ['iPhone 14 Plus'], prompt: p('A single large Apple iPhone 14 Plus in purple, flat aluminum edges, three-quarter back view showing two diagonal camera lenses') },
  { id: 'iphone-14-pro', models: ['iPhone 14 Pro'], prompt: p('A single Apple iPhone 14 Pro in deep purple, flat stainless steel edges, three-quarter angle showing the three-lens camera on the back and the Dynamic Island pill cutout on the front display') },
  { id: 'iphone-14-pro-max', models: ['iPhone 14 Pro Max'], prompt: p('A single large Apple iPhone 14 Pro Max in gold, flat stainless steel edges, three-quarter back view showing three large camera lenses, matte glass back') },

  // ---- iPhone 15 / 16e / 17 ----
  { id: 'iphone-15', models: ['iPhone 15'], prompt: p('A single Apple iPhone 15 in pink with color-infused matte glass back, contoured aluminum edges, three-quarter back view showing two diagonal camera lenses') },
  { id: 'iphone-15-plus', models: ['iPhone 15 Plus'], prompt: p('A single large Apple iPhone 15 Plus in green with color-infused matte glass back, contoured aluminum edges, three-quarter back view showing two diagonal camera lenses') },
  { id: 'iphone-15-pro-max', models: ['iPhone 15 Pro Max'], prompt: p('A single large Apple iPhone 15 Pro Max in blue titanium, brushed titanium edges, three-quarter back view showing three large camera lenses, matte glass back') },
  { id: 'iphone-16e', models: ['iPhone 16e'], prompt: p('A single Apple iPhone 16e in white, flat aluminum edges, three-quarter back view showing a single camera lens in the corner, matte glass back') },
  { id: 'iphone-17', models: ['iPhone 17'], prompt: p('A single Apple iPhone 17 in lavender, flat aluminum edges, three-quarter back view showing a pill-shaped camera bump with two vertically stacked lenses') },
  { id: 'iphone-17-pro', models: ['iPhone 17 Pro'], prompt: p('A single Apple iPhone 17 Pro in cosmic orange aluminum unibody, three-quarter back view showing a full-width horizontal camera plateau across the top with three lenses') },
  { id: 'iphone-17-pro-max', models: ['iPhone 17 Pro Max'], prompt: p('A single large Apple iPhone 17 Pro Max in deep blue aluminum unibody, three-quarter back view showing a full-width horizontal camera plateau across the top with three lenses') },

  // ---- Galaxy S22 / S23 ----
  { id: 'galaxy-s22', models: ['Galaxy S22 5G'], prompt: p('A single Samsung Galaxy S22 in green, standing perfectly upright, straight three-quarter back view with the camera housing in the top-left corner: three vertically stacked lenses in a contour-cut module that flows into the side frame') },
  { id: 'galaxy-s22-plus', models: ['Galaxy S22 Plus 5G', 'Galaxy S22+ 5G'], prompt: p('A single Samsung Galaxy S22+ in pink gold, three-quarter back view showing the contour-cut camera housing with three vertically stacked lenses') },
  { id: 'galaxy-s22-ultra', models: ['Galaxy S22 Ultra 5G'], prompt: p('A single Samsung Galaxy S22 Ultra in burgundy with squared corners, back view showing five separate floating camera lenses, with its S Pen lying beside it') },
  { id: 'galaxy-s23', models: ['Galaxy S23 5G', 'Galaxy S23'], prompt: p('A single Samsung Galaxy S23 in lavender, three-quarter back view showing three separate floating camera lenses stacked vertically, no camera bump') },
  { id: 'galaxy-s23-plus', models: ['Galaxy S23 Plus 5G', 'Galaxy S23+'], prompt: p('A single Samsung Galaxy S23+ in cream, three-quarter back view showing three separate floating camera lenses stacked vertically') },
  { id: 'galaxy-s23-ultra', models: ['Galaxy S23 Ultra 5G'], prompt: p('A single Samsung Galaxy S23 Ultra in phantom black with squared corners, back view showing five separate floating camera lenses, with its S Pen lying beside it') },

  // ---- Galaxy S24 FE / S25 ----
  { id: 'galaxy-s24-fe', models: ['Galaxy S24 Fan Edition 5G', 'Galaxy S24 FE'], prompt: p('A single Samsung Galaxy S24 FE in blue, flat frame, three-quarter back view showing three separate floating camera lenses stacked vertically') },
  { id: 'galaxy-s25-ultra', models: ['Galaxy S25 Ultra 5G', 'Galaxy S25 Ultra'], prompt: p('A single Samsung Galaxy S25 Ultra in titanium silverblue with rounded corners and flat titanium frame, back view showing five separate floating camera lenses with dark rings') },
  { id: 'galaxy-s25-fe', models: ['Galaxy S25 Fan Edition 5G'], prompt: p('A single Samsung Galaxy S25 FE in icy blue, flat frame, three-quarter back view showing three separate floating camera lenses stacked vertically') },

  // ---- Foldables + Pixels (demo optics) ----
  { id: 'galaxy-z-fold5', models: ['Galaxy Z Fold 5 5G', 'Galaxy Z Fold5'], prompt: p('A single Samsung Galaxy Z Fold5 in icy blue, half-open like a book at an angle showing the large inner folding display and the outer camera column') },
  { id: 'galaxy-z-fold7', models: ['Galaxy Z Fold7'], prompt: p('A single ultra-thin Samsung Galaxy Z Fold7 in blue shadow, opened almost flat at a slight angle showing the large inner folding display') },
  { id: 'galaxy-z-flip5', models: ['Galaxy Z Flip 5 5G'], prompt: p('A single Samsung Galaxy Z Flip5 in mint, closed, front view showing the large folder-shaped cover screen next to two camera lenses') },
  { id: 'galaxy-z-flip7', models: ['Galaxy Z Flip 7 5G', 'Galaxy Z Flip7'], prompt: p('A single Samsung Galaxy Z Flip7 in coral red, closed and standing upright facing the camera, front view showing the edge-to-edge cover screen on the top half with two camera lenses inside it') },
  { id: 'pixel-9-pro-xl', models: ['Pixel 9 Pro XL'], prompt: p('A single Google Pixel 9 Pro XL in porcelain, flat frame, three-quarter back view showing the pill-shaped camera bar island with three lenses') },
  { id: 'pixel-10-pro', models: ['Pixel 10 Pro 5G'], prompt: p('A single Google Pixel 10 Pro in moonstone grey, flat frame, three-quarter back view showing the pill-shaped camera bar island with three lenses') },
];
