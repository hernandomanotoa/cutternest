import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E del Assembly Planner (página estática servida por playwright.config.ts
// en :8931): para varios ejemplos del catálogo valida la carga, el render
// isométrico (SVG en #iso-canvas) y el render 3D (canvas WebGL en #r3d-canvas),
// guardando screenshots en e2e/screenshots/ para validación visual.

const SCREENSHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'screenshots');

const EXAMPLES = [
  { name: 'estanteria', file: './data/ejemplo-estanteria.csv' },
  { name: 'cocina', file: './data/ejemplo-cocina.csv' },
  { name: 'buro-3-cajones', file: './data/ejemplo-buro-3-cajones.csv' },
] as const;

for (const example of EXAMPLES) {
  test.describe(`Ejemplo del catálogo: ${example.name}`, () => {
    test('carga el CSV y actualiza el resumen', async ({ page }) => {
      await page.goto('/');
      await page.selectOption('#example-selector', example.file);
      await page.click('#btn-load-example');

      await expect(page.locator('#summary-pieces')).not.toHaveText('0', { timeout: 10_000 });
      await expect(page.locator('#status-message')).not.toContainText(
        'Importa un CSV para comenzar',
      );
    });

    test('renderiza la vista isométrica y captura screenshot', async ({ page }) => {
      await page.goto('/');
      await page.selectOption('#example-selector', example.file);
      await page.click('#btn-load-example');
      await expect(page.locator('#summary-pieces')).not.toHaveText('0', { timeout: 10_000 });

      await page.click('#tab-isometric');
      const isoCanvas = page.locator('#iso-canvas');
      await expect(isoCanvas).toBeVisible();
      // El renderizador isométrico pinta un SVG dentro del contenedor.
      await expect(isoCanvas.locator('svg')).toBeVisible({ timeout: 10_000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `iso-${example.name}.png`),
        fullPage: true,
      });
    });

    test('renderiza la vista 3D y captura screenshot', async ({ page }) => {
      await page.goto('/');
      await page.selectOption('#example-selector', example.file);
      await page.click('#btn-load-example');
      await expect(page.locator('#summary-pieces')).not.toHaveText('0', { timeout: 10_000 });

      await page.click('#tab-renderer3d');
      const r3dCanvas = page.locator('#r3d-canvas');
      await expect(r3dCanvas).toBeVisible();
      // Three.js crea un <canvas> dentro del contenedor de la vista 3D.
      await expect(r3dCanvas.locator('canvas')).toBeVisible({ timeout: 10_000 });

      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, `3d-${example.name}.png`),
        fullPage: true,
      });
    });
  });
}
