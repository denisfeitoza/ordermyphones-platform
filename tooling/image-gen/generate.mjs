// Generate all storefront images via OpenRouter Nano Banana 2.
// Run: set -a; source .env.local; set +a; node tooling/image-gen/generate.mjs [--force]
//
// Idempotent: skips ids whose PNG already exists unless --force is passed.
// Concurrency-limited, retries once, prints per-item status + total cost.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, FLASH } from './manifest.mjs';

const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) {
  console.error('FAIL: OPENROUTER_API_KEY not set (source .env.local first)');
  process.exit(1);
}

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
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ordermyphones.com',
        'X-Title': 'OrderMyPhones',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: item.prompt }],
        modalities: ['image', 'text'],
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
    const cost = json.usage?.cost ?? 0;
    totalCost += cost;
    const images = json.choices?.[0]?.message?.images ?? [];
    if (images.length === 0) throw new Error('no image in response');
    const url = images[0].image_url?.url ?? images[0].url ?? '';
    const b64 = url.includes(',') ? url.split(',')[1] : url;
    const buf = Buffer.from(b64, 'base64');
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
