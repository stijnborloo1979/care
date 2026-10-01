import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests voor de edge functions (Deno). De import van supabase-js via esm.sh
// wordt vervangen door een stub; Deno zelf zet de test op globalThis.
export default defineConfig({
  resolve: {
    alias: {
      'https://esm.sh/@supabase/supabase-js@2': fileURLToPath(
        new URL('./supabase/functions/_test/supabase-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
})
