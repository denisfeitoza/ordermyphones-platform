// Loads KEY=value pairs from the repo-root .env.local into process.env
// (without overriding anything already exported). Lets the scripts run the
// same way from Git Bash and PowerShell.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const file = join(REPO_ROOT, '.env.local');
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

// Personal key file (same convention as ~/.claude/secrets/groq.key), never in the repo.
const openrouterKeyFile = join(homedir(), '.claude', 'secrets', 'openrouter.key');
if (!process.env.OPENROUTER_API_KEY && existsSync(openrouterKeyFile)) {
  process.env.OPENROUTER_API_KEY = readFileSync(openrouterKeyFile, 'utf8').trim();
}

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`FAIL: ${name} not set (add it to .env.local at the repo root or ~/.claude/secrets/openrouter.key)`);
    process.exit(1);
  }
  return value;
}
