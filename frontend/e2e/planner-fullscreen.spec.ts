import { test, expect } from '@playwright/test';

test('planner: pantalla completa en vista 3D crece el lienzo, no los controles', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#example-selector', './data/ejemplo-closet-abierto-modular.csv');
  await page.click('#btn-load-example');
  await page.waitForTimeout(400);
  await page.click('[data-view="renderer3d"]');
  await page.waitForTimeout(600);

  const antes = await page.evaluate(() => {
    const r = document.querySelector('#r3d-canvas')!.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  await page.click('#r3d-fullscreen');
  await page.waitForTimeout(1200);
  const despues = await page.evaluate(() => {
    const r = document.querySelector('#r3d-canvas')!.getBoundingClientRect();
    const svg = document.querySelector('#r3d-canvas svg');
    const viewBox = svg?.getAttribute('viewBox');
    const parts = viewBox?.split(' ').map(Number);
    const polygons = document.querySelectorAll('#r3d-canvas svg polygon').length;
    return { w: Math.round(r.width), h: Math.round(r.height), viewBox, polygons,
      lienzoSvgCoincide: parts ? Math.abs(parts[2] - r.width) < 3 && Math.abs(parts[3] - r.height) < 3 : false };
  });
  console.log('ANTES:', JSON.stringify(antes), 'DESPUES:', JSON.stringify(despues));
  expect(despues.h).toBeGreaterThan(antes.h * 1.3);
  expect(despues.lienzoSvgCoincide).toBe(true);
  expect(despues.polygons).toBeGreaterThan(10);
});
