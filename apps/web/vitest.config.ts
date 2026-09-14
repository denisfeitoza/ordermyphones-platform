import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
      '@shared': path.resolve(dirname, '../../packages/shared-types/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // lib/supabase.ts builds its client at import time. Unit tests never hit
    // the network, so any URL/key shape will do when no .env.local exists
    // (CI). Real values from .env.local still win when present.
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_test_placeholder',
    },
  },
});
