import { test, expect } from '@playwright/test';

// Smoke test del Assembly Planner: la app estática carga, el catálogo tiene
// todos los ejemplos y cargar uno renderiza piezas y actualiza el resumen.
test.describe('Assembly Planner (estático)', () => {
  test('carga el selector con el catálogo completo', async ({ page }) => {
    await page.goto('/');
    const options = page.locator('#example-selector option');
    await expect(options.count()).resolves.toBeGreaterThanOrEqual(40);
    await expect(page.locator('#btn-load-example')).toBeVisible();
  });

  test('cargar un ejemplo renderiza piezas y actualiza el resumen', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('#example-selector', './data/ejemplo-estanteria.csv');
    await page.click('#btn-load-example');

    // El resumen de piezas deja de ser 0...
    await expect(page.locator('#summary-pieces')).not.toHaveText('0', { timeout: 10_000 });
    // ...y la vista activa tiene contenido renderizado.
    await expect(page.locator('#view-container').first().innerHTML()).resolves.not.toBe('');
    await expect(page.locator('#status-message')).not.toContainText('Importa un CSV para comenzar');
  });
});
