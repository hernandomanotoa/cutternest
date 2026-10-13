import { test, expect } from '@playwright/test';

// Spec E2E del flujo crítico NO-autenticado del producto completo.
// A diferencia del planner-smoke (app estática servida en :8931), este spec
// apunta contra la pila Docker local (`docker compose up`):
//   - frontend nginx en :3000 (sirve la SPA y /assembly-planner/)
//   - backend FastAPI en :8000 (health directo; /api/ también va proxificado
//     por nginx en :3000)
// Las URLs se pueden sobreescribir con E2E_FRONTEND_URL / E2E_BACKEND_URL (CI).
//
// SEGURIDAD: no hay backdoors ni usuarios de prueba. Todo flujo autenticado
// (login real → verificación TOTP con semilla, registro, acceso guest) queda
// FUERA de alcance.
// TODO(futuro): cubrir el flujo autenticado con seeding controlado de un
// usuario de prueba + semilla TOTP conocida (p. ej. fixture de backend activada
// solo en entorno de pruebas), verificando la redirección /verify → '/' y el
// acceso a rutas protegidas. Prohibido crear bypasses de auth en producción.

const FRONTEND_URL = process.env.E2E_FRONTEND_URL ?? 'http://localhost:3000';
const BACKEND_URL = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000';

test.describe('Flujo crítico no-autenticado (pila Docker)', () => {
  test('la app carga y muestra la pantalla de login/registro', async ({ page }) => {
    const response = await page.goto(`${FRONTEND_URL}/`);
    expect(response?.status()).toBe(200);

    // Sin sesión, la ruta protegida '/' redirige a /login (AuthInit + guard).
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'CutterNest' })).toBeVisible();
    // Accesos a registro y acceso temporal (PIN) visibles.
    await expect(page.getByRole('link', { name: 'Crear cuenta' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Acceso temporal (PIN)' })).toBeVisible();
  });

  test('la página de login renderiza usuario y contraseña', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await expect(page.getByRole('heading', { name: 'Iniciar sesion' })).toBeVisible();
    await expect(page.getByLabel('Usuario')).toBeVisible();
    await expect(page.getByLabel('Contrasena')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
  });

  test('la verificación TOTP muestra las 6 casillas del OtpInput', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/verify`);
    await expect(
      page.getByRole('heading', { name: 'Verificacion de dos factores' }),
    ).toBeVisible();
    const group = page.getByRole('group', { name: 'Código de verificación' });
    await expect(group).toBeVisible();
    const digits = group.locator('input[inputmode="numeric"]');
    await expect(digits).toHaveCount(6);
    // Código incorrecto → el backend lo rechaza y se muestra el bloque de error.
    await digits.first().fill('000000');
    await expect(page.locator('div.bg-red-50').first()).toBeVisible({ timeout: 10_000 });
  });

  test('API backend sana: GET /api/v1/health responde { status: ok }', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/api/v1/health`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('Assembly Planner estático: carga, título y 4 tabs de vistas', async ({ page }) => {
    const response = await page.goto(`${FRONTEND_URL}/assembly-planner/`);
    expect(response?.status()).toBe(200);

    // Las 4 vistas: CSV, Estructural, Isométrica y 3D.
    const tabs = page.locator('[role="tablist"][aria-label="Vistas"] [role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toHaveText('CSV');
    await expect(tabs.nth(1)).toHaveText('Estructural');
    await expect(tabs.nth(2)).toContainText('Isométrica');
    await expect(tabs.nth(3)).toContainText('3D');

    // Selector de ejemplos del catálogo (la carga de un CSV ya la cubre el smoke).
    await expect(page.locator('#example-selector')).toBeVisible();
    await expect(page.locator('#btn-load-example')).toBeVisible();
  });

  test('rutas protegidas redirigen a /login sin sesión', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/optimizer`);
    await expect(page).toHaveURL(/\/login$/);
    await page.goto(`${FRONTEND_URL}/inventory`);
    await expect(page).toHaveURL(/\/login$/);
  });
});
