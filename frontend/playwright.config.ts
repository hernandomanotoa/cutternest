import { defineConfig } from '@playwright/test';

// E2E mínimo del Assembly Planner (página estática en public/assembly-planner).
// El webServer sirve esa carpeta tal cual; el spec de humo valida carga,
// catálogo y renderizado de un ejemplo.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8931',
    headless: true,
  },
  webServer: {
    command: 'node scripts/serve-planner.mjs',
    url: 'http://localhost:8931',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
