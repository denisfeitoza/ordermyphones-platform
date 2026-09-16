// Generate the real-catalog renders (catalog-manifest.mjs) as optimized WebP.
// Run from tooling/image-gen: npm run generate:catalog [-- --force] [-- --only id1,id2]
//
// - Every entry goes through OpenRouter (Nano Banana 2) — needs OPENROUTER_API_KEY.
// - Idempotent: skips ids whose .webp already exists unless --force.
// - Always rewrites apps/web/src/data/catalogImages.json with the ids that exist
//   on disk, so the storefront never points at a missing file.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT, requireEnv } from './env.mjs';
import { requestImage } from './openrouter.mjs';
import { CATALOG_MANIFEST, normalizeModel } from './catalog-manifest.mjs';

const MODEL = 'google/gemini-3.1-flash-image';
const CONCURRENCY = 4;
const MAX_SIDE = 1024;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const onlyArg = args[args.indexOf('--only') + 1];
const ONLY = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;

const OUT_DIR = join(REPO_ROOT, 'apps', 'web', 'public', 'generated', 'catalog');
const MAP_FILE = join(REPO_ROOT, 'apps', 'web', 'src', 'data', 'catalogImages.json');
mkdirSync(OUT_DIR, { recursive: true });

const outPath = (id) => join(OUT_DIR, `${id}.webp`);
const toWebp = (buf) =>
  sharp(buf).resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

const KEY = requireEnv('OPENROUTER_API_KEY');

let totalCost = 0;

async function generateOne(entry, attempt = 1) {
  if (existsSync(outPath(entry.id)) && !FORCE) {
    console.log(`SKIP  ${entry.id} (exists)`);
    return 'skip';
  }
  try {
    const { buf, cost } = await requestImage({ key: KEY, model: MODEL, prompt: entry.prompt });
    totalCost += cost;
    const webp = await toWebp(buf);
    writeFileSync(outPath(entry.id), webp);
    console.log(`OK    ${entry.id}  ${(webp.length / 1024).toFixed(0)}KB  $${cost.toFixed(4)}`);
    return 'ok';
  } catch (err) {
    if (attempt < 2) {
      console.log(`RETRY ${entry.id} (${err.message.slice(0, 80)})`);
      return generateOne(entry, attempt + 1);
    }
    console.error(`FAIL  ${entry.id}: ${err.message.slice(0, 160)}`);
    return 'fail';
  }
}

function writeMap() {
  const map = {};
  for (const entry of CATALOG_MANIFEST) {
    if (!existsSync(outPath(entry.id))) continue;
    for (const model of entry.models) map[normalizeModel(model)] = entry.id;
  }
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MAP_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  console.log(`MAP   ${Object.keys(sorted).length} model keys → ${MAP_FILE}`);
}

async function run() {
  const queue = CATALOG_MANIFEST.filter((e) => !ONLY || ONLY.has(e.id));
  const results = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) results.push(await generateOne(queue.shift()));
    }),
  );
  writeMap();
  const count = (s) => results.filter((r) => r === s).length;
  console.log(`\n=== done: ${count('ok')} written, ${count('skip')} skipped, ${count('fail')} failed — API cost $${totalCost.toFixed(4)} ===`);
  if (count('fail') > 0) process.exit(1);
}

run();
