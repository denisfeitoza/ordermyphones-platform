#!/usr/bin/env node
/**
 * Seed the six is_test accounts (one per role/tier) with a known password.
 *
 * Canonical, reproducible path — uses the Supabase Auth Admin API with the
 * service-role key. Secrets come from the macOS Keychain, never from code:
 *   - service-role key:  security add-generic-password -a "$USER" -s omp-supabase-service-role -w
 *   - seed password:     security add-generic-password -a "$USER" -s omp-seed-password -w
 *
 * Run:  node scripts/seed-test-users.mjs
 *
 * NOTE (2026-08-07): the six accounts already exist on project
 * rdkkbiyugcjyrnkvobrr — they were seeded via an interim direct-SQL path
 * (auth.users + auth.identities + bcrypt hash, password in the gitignored
 * scripts/.seed-password.local) because the Keychain entries were not yet set.
 * This script is the canonical way to (re)seed a fresh database once the
 * Keychain entries exist, and to rotate the password before real customers
 * are invited (Phase 8). createUser is idempotent-ish: it errors if the email
 * already exists — delete first or use the admin update path to rotate.
 *
 * The admin@test account is a REAL administrator on the live project. Keep the
 * password out of the repo, and rotate it before go-live.
 */
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rdkkbiyugcjyrnkvobrr.supabase.co';

function keychain(service) {
  try {
    return execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', service, '-w'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    throw new Error(`Keychain item "${service}" not found. Add it with:\n  security add-generic-password -a "$USER" -s ${service} -w`);
  }
}

const SERVICE_ROLE = keychain('omp-supabase-service-role');
const PASSWORD = keychain('omp-seed-password');

const ACCOUNTS = [
  { email: 'admin@test', role: 'admin', tier: null, name: 'Admin (test)' },
  { email: 'staff@test', role: 'staff', tier: null, name: 'Staff (test)' },
  { email: 'consumer@test', role: 'customer', tier: 'consumer', name: 'Consumer (test)' },
  { email: 'retailer@test', role: 'customer', tier: 'retailer', name: 'Retailer (test)' },
  { email: 'wholesale@test', role: 'customer', tier: 'wholesale', name: 'Wholesale (test)' },
  { email: 'distributor@test', role: 'customer', tier: 'distributor', name: 'Distributor (test)' },
];

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

for (const a of ACCOUNTS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: a.email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) {
    console.error(`  ${a.email}: ${error.message}`);
    continue;
  }
  // handle_new_user() trigger already inserted a customer profile; set the real role/tier/is_test.
  const { error: pErr } = await admin
    .from('profiles')
    .update({ role: a.role, tier: a.tier, is_test: true, display_name: a.name })
    .eq('id', data.user.id);
  console.log(`  ${a.email}: ${pErr ? 'profile update FAILED — ' + pErr.message : 'seeded (' + a.role + (a.tier ? '/' + a.tier : '') + ')'}`);
}
console.log('Done. Rotate this password before inviting real customers (Phase 8).');
