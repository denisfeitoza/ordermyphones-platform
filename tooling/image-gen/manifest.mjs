// Image generation manifest for the OrderMyPhones storefront mockup.
// Each entry → one PNG in apps/web/public/generated/<id>.png, generated via
// OpenRouter Nano Banana 2 (google/gemini-3.1-flash-image). The hero uses
// Nano Banana Pro (gemini-3-pro-image) for extra fidelity.
//
// Product shots share one studio recipe so the catalog grid stays cohesive.
// No text/watermark in any asset — brand wordmark is composited in HTML.

const PRODUCT_STYLE =
  'floating centered on a seamless very-light-grey (#eef0f3) studio background, ' +
  'soft top-left key light, soft realistic contact shadow beneath, ultra sharp, ' +
  'high-detail premium e-commerce product photography, 8k, no text, no watermark, no price tag';

const p = (subject) => `${subject}, ${PRODUCT_STYLE}`;

export const FLASH = 'google/gemini-3.1-flash-image';
export const PRO = 'google/gemini-3-pro-image';

export const MANIFEST = [
  // ---- Hero (dark, brand-aligned, no text — wordmark added in HTML) ----
  {
    id: 'hero-phones',
    model: PRO,
    prompt:
      'Cinematic hero composition of three premium smartphones floating at dynamic angles in dark space — ' +
      'an iPhone 16 Pro and two Samsung Galaxy flagships — one device opening/unfolding to suggest motion. ' +
      'Deep charcoal-to-midnight background with a subtle electric-blue and violet rim light, dramatic studio ' +
      'lighting, glossy reflections, shallow depth of field, volumetric haze. Ultra detailed, 8k, cinematic, ' +
      'no text, no watermark, no logo overlay. Leave the left third darker and emptier for headline text.',
  },

  // ---- iPhones ----
  { id: 'iphone-16-pro-max', prompt: p('A single Apple iPhone 16 Pro Max in desert titanium gold, three-quarter back view showing the triple-camera array') },
  { id: 'iphone-16-pro', prompt: p('An Apple iPhone 16 Pro in natural titanium, a matched pair showing front display and back camera, three-quarter angle') },
  { id: 'iphone-16', prompt: p('A single Apple iPhone 16 in ultramarine blue, front view with a vivid wallpaper on screen') },
  { id: 'iphone-16-plus', prompt: p('A single Apple iPhone 16 Plus in pink, three-quarter back view') },
  { id: 'iphone-15-pro', prompt: p('A single Apple iPhone 15 Pro in white titanium, three-quarter back view, pristine certified-pre-owned condition') },
  { id: 'iphone-14', prompt: p('A single Apple iPhone 14 in blue, front view') },

  // ---- Samsung ----
  { id: 'galaxy-s24-ultra', prompt: p('A single Samsung Galaxy S24 Ultra in titanium gray, back view with the S Pen beside it') },
  { id: 'galaxy-s24', prompt: p('A single Samsung Galaxy S24 in cobalt violet, front view with a colorful wallpaper') },
  { id: 'galaxy-z-fold6', prompt: p('A single Samsung Galaxy Z Fold6 in silver shadow, half-folded at an angle showing the inner screen') },
  { id: 'galaxy-z-flip6', prompt: p('A single Samsung Galaxy Z Flip6 in blue, opened upright in an L shape') },
  { id: 'galaxy-a55', prompt: p('A single Samsung Galaxy A55 in navy blue, front view') },
  { id: 'galaxy-s23-fe', prompt: p('A single Samsung Galaxy S23 FE in mint green, three-quarter back view, certified-pre-owned condition') },
];
