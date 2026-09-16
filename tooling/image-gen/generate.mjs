// Generate all storefront images via OpenRouter Nano Banana 2.
// Run from tooling/image-gen: npm run generate:mockup [-- --force]  (key from repo-root .env.local)
//
// Idempotent: skips ids whose PNG already exists unless --force is passed.
// Concurrency-limited, retries once, prints per-item status + total cost.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, FLASH } from './manifest.mjs';
import { requireEnv } from './env.mjs';
import { requestImage } from './openrouter.mjs';

const KEY = requireEnv('OPENROUTER_API_KEY');

const FORCE = process.argv.includes('--force');
const CONCURRENCY = 4;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', '..', 'apps', 'web', 'public', 'generated');
mkdirSync(OUT_DIR, { recursive: true });

let totalCost = 0;

async function generateOne(item, attempt = 1) {
  const outPath = join(OUT_DIR, `${item.id}.png`);
  if (existsSync(outPath) && !FORCE) {
    console.log(`SKIP  ${item.id} (exists)`);
    return { id: item.id, status: 'skip' };
  }
  const model = item.model || FLASH;
  try {
    const { buf, cost } = await requestImage({ key: KEY, model, prompt: item.prompt });
    totalCost += cost;
    writeFileSync(outPath, buf);
    console.log(`OK    ${item.id}  ${(buf.length / 1024).toFixed(0)}KB  $${cost.toFixed(4)}  [${model.split('/')[1]}]`);
    return { id: item.id, status: 'ok' };
  } catch (err) {
    if (attempt < 2) {
      console.log(`RETRY ${item.id} (${err.message.slice(0, 80)})`);
      return generateOne(item, attempt + 1);
    }
    console.error(`FAIL  ${item.id}: ${err.message.slice(0, 160)}`);
    return { id: item.id, status: 'fail' };
  }
}

// Simple concurrency pool.
async function run() {
  const queue = [...MANIFEST];
  const results = [];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const item = queue.shift();
      results.push(await generateOne(item));
    }
  });
  await Promise.all(workers);

  const ok = results.filter((r) => r.status === 'ok').length;
  const skip = results.filter((r) => r.status === 'skip').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  console.log(`\n=== done: ${ok} generated, ${skip} skipped, ${fail} failed — total $${totalCost.toFixed(4)} ===`);
  if (fail > 0) process.exit(1);
}

run();
