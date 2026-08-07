#!/usr/bin/env node
// scripts/seed-suppliers.mjs
//
// Seeds the two real supplier identities into public.suppliers.
// D16 (repo is PUBLIC): real legal names must never appear in any
// committed file. This script itself is committed and contains no secret
// or real-name literal — it only reads them, at run time, from a gitignored
// local JSON file that you create yourself and that never leaves this
// machine.
//
// 1. Create scripts/.suppliers.local.json (gitignored — see .gitignore),
//    shaped like:
//    [
//      { "code": "source-1", "legal_name": "...", "anon_label": "Source A", "country": "US", "kind": "reverse_logistics", "vendor_code": "..." },
//      { "code": "source-2", "legal_name": "...", "anon_label": "Source B", "country": "US", "kind": "wholesale", "vendor_code": null }
//    ]
//
//    `vendor_code` (Phase 2 Plan 02-01, added to public.suppliers by
//    20260807130000_import_tables.sql) keys vendor_grade_map /
//    grade_classification_queue for imports — e.g. the real source-1 value.
//    Optional per row (omit or set null for a supplier with no vendor-grade
//    mapping yet); read from the local JSON exactly like legal_name/code,
//    never hardcoded in this committed file.
//
// 2. Run with a Supabase Management API personal access token (the same
//    one the linked `supabase` CLI stores in the macOS Keychain under
//    service "Supabase CLI", account "supabase" — never print it):
//      SUPABASE_ACCESS_TOKEN="$(security find-generic-password -s 'Supabase CLI' -a supabase -w)" \
//        node scripts/seed-suppliers.mjs
//
// Idempotent: uses ON CONFLICT (code) DO UPDATE, safe to re-run after a
// project reset or to correct a typo in the local data file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROJECT_REF = 'rdkkbiyugcjyrnkvobrr';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '.suppliers.local.json');

let token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    'SUPABASE_ACCESS_TOKEN is required (Supabase Management API personal access token). ' +
      "Get it from the macOS Keychain: security find-generic-password -s 'Supabase CLI' -a supabase -w"
  );
  process.exit(1);
}
// The Supabase CLI's macOS Keychain entry is itself go-keyring-base64-wrapped
// (`go-keyring-base64:<base64>`) — decode it here so callers can pipe the
// raw `security find-generic-password` output straight into this script.
if (token.startsWith('go-keyring-base64:')) {
  token = Buffer.from(token.slice('go-keyring-base64:'.length), 'base64').toString('utf8');
}

let suppliers;
try {
  suppliers = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
} catch {
  console.error(
    `Could not read ${DATA_FILE}. Create it locally (gitignored, never committed) with the real ` +
      'supplier rows before running this script. See the header comment in this file for the shape.'
  );
  process.exit(1);
}

if (!Array.isArray(suppliers) || suppliers.length === 0) {
  console.error(`${DATA_FILE} must contain a non-empty JSON array.`);
  process.exit(1);
}

const esc = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const values = suppliers
  .map(
    (s) =>
      `(${esc(s.code)}, ${esc(s.legal_name)}, ${esc(s.anon_label)}, ${esc(s.country)}, ${esc(
        s.kind
      )}, true, ${esc(s.vendor_code ?? null)})`
  )
  .join(',\n  ');

const query = `
insert into public.suppliers (code, legal_name, anon_label, country, kind, active, vendor_code)
values
  ${values}
on conflict (code) do update
  set legal_name  = excluded.legal_name,
      anon_label  = excluded.anon_label,
      country     = excluded.country,
      kind        = excluded.kind,
      active      = excluded.active,
      vendor_code = excluded.vendor_code;
`;

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

if (!res.ok) {
  console.error(`Seed failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

console.log(
  `Seeded ${suppliers.length} supplier row(s) into public.suppliers (codes: ${suppliers
    .map((s) => s.code)
    .join(', ')}).`
);
