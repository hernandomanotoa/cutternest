import { test, expect } from '@playwright/test';

// E2E del flujo de acceso temporal (Guest PIN) de la app React.
// A diferencia de planner-smoke/planner-examples (planner estático en :8931),
// este spec apunta contra la pila Docker local (`docker compose up`):
//   - frontend nginx en :3000 (sirve la SPA)
//   - backend FastAPI en :8000 (necesario para el rechazo de PIN inválido)
// Las URLs se pueden sobreescribir con E2E_FRONTEND_URL / E2E_BACKEND_URL (CI).
//
// SEGURIDAD: no hay backdoors ni usuarios de prueba. El PIN de 6 dígitos se
// genera solo autenticado (endpoint /auth/guest/pin), fuera del alcance E2E;
// aquí solo se valida la UI del formulario y el rechazo de un PIN inválido.

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:3000';
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000';

/** Ping HTTP mínimo con timeout para decidir test.skip() condicionales. */
async function isReachable(url: string, timeoutMs = 3_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

test.describe('Acceso temporal (Guest PIN)', () => {
  test.beforeAll(async () => {
    test.skip(
      !(await isReachable(FRONTEND_URL)),
      `Frontend no disponible en ${FRONTEND_URL} (levanta la pila Docker o define E2E_FRONTEND_URL)`,
    );
  });

  test('la página /guest renderiza el formulario del PIN', async ({ page }) => {
    const response = await page.goto(`${FRONTEND_URL}/guest`);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Acceso temporal' })).toBeVisible();
    const group = page.getByRole('group', { name: 'Código de verificación' });
    await expect(group).toBeVisible();
    await expect(group.locator('input[inputmode="numeric"]')).toHaveCount(6);
    // Botón deshabilitado hasta completar los 6 dígitos.
    await expect(page.getByRole('button', { name: 'Acceder' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Volver al login' })).toBeVisible();
  });

  test('PIN inválido se rechaza y muestra error', async ({ page }) => {
    test.skip(
      !(await isReachable(`${BACKEND_URL}/api/v1/health`)),
      `Backend no disponible en ${BACKEND_URL} (necesario para validar el rechazo del PIN)`,
    );

    await page.goto(`${FRONTEND_URL}/guest`);
    // Completar 6 dígitos dispara el envío automático (onComplete de OtpInput).
    await page
      .getByRole('group', { name: 'Código de verificación' })
      .locator('input[inputmode="numeric"]')
      .first()
      .fill('000000');
    await expect(page.locator('div.bg-red-50').first()).toBeVisible({ timeout: 10_000 });
    // Permanece en /guest tras el rechazo.
    await expect(page).toHaveURL(/\/guest$/);
  });

  test('"Volver al login" navega a /login', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/guest`);
    await page.getByRole('link', { name: 'Volver al login' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
