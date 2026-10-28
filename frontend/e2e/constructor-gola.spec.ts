import { test, expect } from '@playwright/test';

// E2E del sistema gola en el Constructor del Assembly Planner (página estática
// servida por playwright.config.ts en :8931). Cubre el flujo completo:
//   1. Construir un módulo con 2 cajones (sin tiradores externos: gola).
//   2. Activar gola → la vista previa resume canales y reescalado de frentes.
//   3. Confirmar → aparecen las piezas de canal (m1gola-c1-fondo, m1gola-l2-fondo)
//      y desaparecen los tiradores.
//   4. Desactivar → las tiras desaparecen y los tiradores se regeneran.
// Las piezas se verifican en la tabla de la pestaña CSV (input[data-field="id"]
// por fila), que lista TODAS las piezas del store (tiras y tiradores incluidos).

// Fila de la tabla CSV cuyo id de pieza coincide exactamente.
const filaPieza = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`#csv-table-body input[data-field="id"][value="${id}"]`);

test.describe('Constructor: sistema gola (planner estático)', () => {
  test('activar/desactivar gola crea y elimina canales y restaura tiradores', async ({ page }) => {
    await page.goto('/');
    await page.click('#tab-constructor');

    // Módulo con los defaults del formulario (850×2400×600, con zócalo).
    await page.click('[data-action="add-module"]');
    const scope = '[data-module-scoped="1"]';
    await expect(page.locator(scope)).toBeVisible();

    // 2 cajones: el checkbox gola solo se renderiza con >= 2 unidades-cajón.
    const btnCajon = page.locator(`${scope} [data-action="add-content"][data-kind="drawer"]`);
    await btnCajon.click();
    await btnCajon.click();
    await expect(btnCajon).toContainText('(2)');

    // Estado previo: hay tiradores y aún no existen tiras de canal gola.
    await page.click('#tab-csv');
    await expect(filaPieza(page, 'm1cajon1-tirador')).toHaveCount(1);
    await expect(filaPieza(page, 'm1cajon2-tirador')).toHaveCount(1);
    await expect(filaPieza(page, 'm1gola-c1-fondo')).toHaveCount(0);
    await expect(filaPieza(page, 'm1gola-l2-fondo')).toHaveCount(0);

    // Activar: el checkbox abre la vista previa (dry-run) y hay que confirmar.
    await page.click('#tab-constructor');
    const checkGola = page.locator(`${scope} [data-action="toggle-gola"]`);
    await checkGola.check();
    const preview = page.locator('[data-gola-preview]');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Vista previa — sistema gola');
    await expect(preview).toContainText('Se eliminarán los tiradores');
    await preview.locator('[data-action="confirm-gola"]').click();
    await expect(page.locator('[data-gola-panel]')).toBeVisible();

    // Confirmado: existen el canal C entre los 2 frentes y el canal L superior;
    // los tiradores fueron eliminados.
    await page.click('#tab-csv');
    await expect(filaPieza(page, 'm1gola-c1-fondo')).toHaveCount(1);
    await expect(filaPieza(page, 'm1gola-l2-fondo')).toHaveCount(1);
    await expect(filaPieza(page, 'm1cajon1-tirador')).toHaveCount(0);
    await expect(filaPieza(page, 'm1cajon2-tirador')).toHaveCount(0);

    // Desactivar: las tiras desaparecen y los tiradores reaparecen.
    await page.click('#tab-constructor');
    await page.locator(`${scope} [data-action="toggle-gola"]`).uncheck();
    await page.click('#tab-csv');
    await expect(filaPieza(page, 'm1gola-c1-fondo')).toHaveCount(0);
    await expect(filaPieza(page, 'm1gola-l2-fondo')).toHaveCount(0);
    await expect(filaPieza(page, 'm1cajon1-tirador')).toHaveCount(1);
    await expect(filaPieza(page, 'm1cajon2-tirador')).toHaveCount(1);
  });
});
