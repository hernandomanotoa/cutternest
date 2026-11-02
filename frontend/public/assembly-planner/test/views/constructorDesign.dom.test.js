// test/views/constructorDesign.dom.test.js — Tests DOM del rediseño visual
// "taller nocturno" del Constructor (spec: prototipo Diseño UI_UX muebles).
// Verifica la estructura del sistema visual: wrapper acotado, secciones
// numeradas 01-04 y controles con las clases del nuevo diseño. NO corre en
// el runner puro: usar pnpm test:dom.

import './setup.mjs';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createStore, setStore } from '../../js/core/store.js';
import { createConstructorView } from '../../js/views/constructorView.js';
import { isGolaEnabled } from '../../js/services/golaService.js';
import { createContainer, resetDocument } from './setup.mjs';

beforeEach(() => {
  resetDocument();
  setStore(createStore());
});
afterEach(resetDocument);

function mountView() {
  const store = createStore();
  setStore(store);
  const view = createConstructorView(store);
  const container = createContainer();
  view.mount(container);
  return { store, view, container };
}

test('diseño: wrapper .cn-constructor acota el sistema visual', () => {
  const { view, container } = mountView();
  const wrapper = container.querySelector(':scope > .cn-constructor');
  assert.ok(wrapper, 'el Constructor renderiza dentro del wrapper .cn-constructor');
  assert.ok(wrapper.querySelector('[data-action="add-module"]'), 'acciones dentro del wrapper');
  assert.ok(wrapper.querySelector('[data-action="save-version"]'), 'versiones dentro del wrapper');
  view.destroy();
});

test('diseño: secciones numeradas 01-02 en la columna principal', () => {
  const { view, container } = mountView();
  const indexes = [...container.querySelectorAll('.cn-constructor__main .cn-section-head__index')].map((el) => el.textContent);
  assert.deepEqual(indexes, ['01', '02']);
  const titulos = [...container.querySelectorAll('.cn-constructor__main .card__title')].map((el) => el.textContent);
  assert.deepEqual(titulos, [
    'Datos generales del mueble',
    'Módulos y contenido',
  ]);
  view.destroy();
});

test('diseño: secciones usan elemento <section> y aside de cabecera', () => {
  const { view, container } = mountView();
  const secciones = container.querySelectorAll('.cn-constructor__main > section.card');
  assert.equal(secciones.length, 2, 'la columna principal tiene 2 secciones numeradas');
  assert.ok(container.querySelector('.cn-section-head__aside [data-resumen]'), 'resumen en aside 01');
  view.destroy();
});

test('diseño: riel izquierdo con módulos, zócalo y versiones', () => {
  const { view, container } = mountView();
  const rail = container.querySelector(':scope .cn-rail');
  assert.ok(rail, 'existe el riel izquierdo');
  const labels = [...rail.querySelectorAll('.cn-rail__head .t-label')].map((el) => el.textContent);
  assert.deepEqual(labels, ['Módulos', 'Zócalo y obra', 'Versiones guardadas']);
  assert.ok(rail.querySelector('[data-action="rail-add-module"]'), 'botón Añadir del riel');
  assert.match(rail.textContent, /Sin módulos todavía/, 'empty-state del riel con store vacío');
  assert.ok(rail.querySelector('[data-plinth-resumen]'), 'resumen del zócalo en el riel');
  assert.ok(rail.querySelector('[data-obra="tipo"]'), 'tipo de zócalo en el riel');
  assert.ok(rail.querySelector('[data-version-name]'), 'formulario de versiones en el riel');
  assert.ok(rail.querySelector('[data-action="save-version"]'), 'guardar versión en el riel');
  view.destroy();
});

test('diseño: controles segmentados mantienen el select real (mismo contrato)', () => {
  const { view, container } = mountView();
  const seg = container.querySelector('[data-cfg="espesor"]').closest('.cn-segmented');
  assert.ok(seg, 'espesor es un control segmentado');
  assert.equal(seg.querySelectorAll('.cn-segmented__opt').length, 3, '3 píldoras (15/18/25)');
  const opt = [...seg.querySelectorAll('.cn-segmented__opt')].find((b) => b.dataset.segValue === '18');
  opt.click();
  assert.equal(container.querySelector('[data-cfg="espesor"]').value, '18', 'el click escribe el select oculto');
  assert.ok(container.querySelector('[data-obra="tipo"]'), 'select de tipo de zócalo presente (oculto)');
  container.querySelector('[data-action="add-module"]').click();
  const mec = container.querySelector('[data-module-scoped="1"] [data-mecanismo]');
  assert.ok(mec, 'select de mecanismo presente (oculto) tras agregar módulo');
  const segMec = mec.closest('.cn-segmented');
  segMec.querySelector('[data-seg-value="volquete"]').click();
  assert.equal(mec.value, 'volquete', 'segmentado de mecanismo escribe el select');
  view.destroy();
});

test('diseño: steppers ajustan el input y disparan change', () => {
  const { view, container } = mountView();
  const wrap = container.querySelector('[data-cfg="ancho"]').closest('.cn-field-num');
  wrap.querySelector('[data-step="1"]').click();
  assert.equal(container.querySelector('[data-cfg="ancho"]').value, '860', 'stepper + sube un step (10)');
  wrap.querySelector('[data-step="-1"]').click();
  wrap.querySelector('[data-step="-1"]').click();
  assert.equal(container.querySelector('[data-cfg="ancho"]').value, '840', 'stepper − baja un step');
  view.destroy();
});

test('diseño: esquema frontal en vivo por módulo', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  const scheme = container.querySelector('[data-module-scoped="1"] .cn-scheme svg');
  assert.ok(scheme, 'la tarjeta del módulo renderiza el esquema frontal');
  assert.match(scheme.getAttribute('viewBox'), /^0 0 200 230$/);
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  assert.ok(container.querySelector('[data-module-scoped="1"] .cn-scheme__glyph--drawer'), 'glifo de cajón en el esquema');
  view.destroy();
});

test('diseño: tarjeta de módulo agrupada en Contenido/Cajón/Zapatera/Módulo', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  const card = container.querySelector('[data-module-scoped="1"]');
  const legends = [...card.querySelectorAll('.cn-pref-group legend')].map((el) => el.textContent);
  assert.deepEqual(legends, ['Contenido', 'Cajón', 'Zapatera', 'Módulo']);
  assert.ok(card.querySelector('.cn-module-actions [data-action="edit-module"]'), 'acciones como iconos');
  assert.equal(card.querySelector('.cn-module-actions [data-action="remove-module"]').textContent.trim(), '🗑');
  assert.ok(card.querySelector('.cn-pref-group [data-alto-vano]'), 'vano en el grupo Contenido');
  assert.ok(card.querySelector('.cn-pref-group [data-mecanismo]'), 'mecanismo en el grupo Cajón');
  assert.ok(card.querySelector('.cn-pref-group [data-modo-zapatera]'), 'modo zapatera en su grupo');
  const contFields = card.querySelector('.cn-pref-group [data-alto-vano]').closest('.cn-pref-group');
  assert.ok(contFields.textContent.includes('Contenido'), 'el grupo del vano es Contenido');
  assert.ok(contFields.querySelector('[data-color-cuerpo]'), 'Color cuerpo en el grupo Contenido');
  const addBtns = contFields.querySelectorAll('[data-action="add-content"]');
  assert.equal(addBtns.length, 7, 'los 7 botones de alta viven en Contenido');
  assert.ok(card.querySelector('.cn-pref-group__actions'), 'fila de alta a ancho completo del grupo');
  contFields.querySelector('[data-action="add-content"][data-kind="zocalo"]').click();
  const card2 = container.querySelector('[data-module-scoped="1"]');
  const chip = card2.querySelector('.cn-chip--zocalo');
  assert.ok(chip, 'chip de zócalo renderizado tras agregarlo');
  assert.ok(card2.querySelector('.cn-constructor__module-main').contains(chip), 'el chip vive en el área principal de la tarjeta');
  const modulo = [...card2.querySelectorAll('.cn-pref-group')].find((g) => g.querySelector('legend')?.textContent === 'Módulo');
  assert.ok(modulo.querySelector('.cn-scheme svg'), 'el esquema frontal vive dentro del grupo Módulo');
  // Con ≥2 unidades-cajón el toggle gola aparece en Contenido (regla de la
  // UI: gola reservado a pilas).
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  const card3 = container.querySelector('[data-module-scoped="1"]');
  const cont3 = card3.querySelector('.cn-pref-group [data-alto-vano]').closest('.cn-pref-group');
  assert.ok(cont3.querySelector('[data-action="toggle-gola"]'), 'toggle gola en Contenido (≥2 unidades)');
  view.destroy();
});

test('diseño: sección 01 agrupada en Mueble / Nuevo módulo / Acciones', () => {
  const { view, container } = mountView();
  // Solo el nodo de texto del título (el de "Nuevo módulo" lleva un botón).
  const titles = [...container.querySelectorAll('.cn-form-section__title')].map((el) => el.childNodes[0].textContent.trim());
  assert.deepEqual(titles, ['Mueble', 'Nuevo módulo', 'Acciones del mueble']);
  assert.ok(container.querySelector('[data-furniture-name]').closest('.cn-form-section').textContent.includes('Mueble'));
  assert.ok(container.querySelector('[data-cfg="ancho"]').closest('.cn-form-section').textContent.includes('Nuevo módulo'));
  assert.ok(container.querySelector('[data-action="undo"]').closest('.cn-form-section').textContent.includes('Acciones'));
  view.destroy();
});

test('diseño: sección 02 oculta hasta elegir módulo (placeholder) y el add-module lo revela', () => {
  const { view, container } = mountView();
  // Sin módulos: empty-state habitual.
  assert.ok(container.querySelector('.cn-modulos-view__placeholder') === null, 'sin módulos no hay placeholder de selección');
  container.querySelector('[data-action="add-module"]').click();
  // Tras agregar: el módulo creado queda seleccionado → sin placeholder y
  // tarjeta revelada.
  assert.ok(!container.querySelector('.cn-modulos-view__placeholder'), 'el módulo agregado se muestra (sin placeholder)');
  const card = container.querySelector('[data-module-scoped="1"]');
  assert.ok(!card.classList.contains('cn-constructor__module--concealed'), 'tarjeta del módulo 1 visible');
  view.destroy();
});

test('diseño: clic en módulo del riel revela solo ese módulo y lo marca activo', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  container.querySelector('[data-action="add-module"]').click();
  const rail2 = container.querySelector('[data-action="rail-focus-module"][data-module="2"]');
  rail2.click();
  const card1 = container.querySelector('[data-module-scoped="1"]');
  const card2 = container.querySelector('[data-module-scoped="2"]');
  assert.ok(card1.classList.contains('cn-constructor__module--concealed'), 'módulo 1 oculto');
  assert.ok(!card2.classList.contains('cn-constructor__module--concealed'), 'módulo 2 revelado');
  assert.ok(container.querySelector('.cn-rail__module--active[data-module="2"]'), 'riel marca el módulo activo');
  assert.ok(!container.querySelector('.cn-modulos-view__placeholder'), 'sin placeholder con selección');
  view.destroy();
});

test('diseño: la selección PERSISTE al re-montar la vista (volver de otra pestaña)', () => {
  // Regresión: cambiar de pestaña destruye y recrea la vista; sin persistencia
  // el módulo en edición "desaparecía" (placeholder) al volver al Constructor.
  localStorage.removeItem('cn-constructor-selected-module');
  const store = createStore();
  setStore(store);
  const v1 = createConstructorView(store);
  const c1 = createContainer();
  v1.mount(c1);
  c1.querySelector('[data-action="add-module"]').click();
  c1.querySelector('[data-action="rail-focus-module"][data-module="1"]').click();
  assert.ok(!c1.querySelector('[data-module-scoped="1"]').classList.contains('cn-constructor__module--concealed'));
  v1.destroy();
  // Segunda vista sobre la MISMA store (las piezas siguen ahí): simula volver
  // de la pestaña Isométrica con la vista recién creada.
  const v2 = createConstructorView(store);
  const c2 = createContainer();
  v2.mount(c2);
  const card = c2.querySelector('[data-module-scoped="1"]');
  assert.ok(card, 'la tarjeta existe tras re-montar');
  assert.ok(!card.classList.contains('cn-constructor__module--concealed'), 'el módulo seleccionado sigue visible (selección persistida)');
  assert.ok(!c2.querySelector('.cn-modulos-view__placeholder'), 'sin placeholder');
  v2.destroy();
  localStorage.removeItem('cn-constructor-selected-module');
});

test('diseño: «+ Añadir» expande el grupo Nuevo módulo y mantiene la selección visible', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  // Tras agregar: el grupo "Nuevo módulo" queda colapsado.
  const grupo = () => [...container.querySelectorAll('.cn-form-section')].find((g) => g.textContent.includes('Nuevo módulo'));
  assert.ok(grupo().classList.contains('is-collapsed'), 'grupo Nuevo módulo colapsado tras agregar');
  assert.ok(!container.querySelector('[data-module-scoped="1"]').classList.contains('cn-constructor__module--concealed'), 'el módulo agregado se ve');
  // «+ Añadir» del riel: expande el grupo y conserva la selección visible.
  container.querySelector('[data-action="rail-add-module"]').click();
  assert.ok(!grupo().classList.contains('is-collapsed'), '«+ Añadir» expande el grupo para el siguiente alta');
  assert.ok(!container.querySelector('[data-module-scoped="1"]').classList.contains('cn-constructor__module--concealed'), 'el módulo en edición sigue visible');
  // La chevron del grupo lo colapsa manualmente.
  grupo().querySelector('[data-action="toggle-nuevo-modulo"]').click();
  assert.ok(grupo().classList.contains('is-collapsed'), 'toggle manual colapsa de nuevo');
  view.destroy();
});

test('diseño E6.1: zoom del esquema (+/−/ajustar) sobre el viewBox', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  const svg = () => container.querySelector('[data-module-scoped="1"] .cn-scheme svg');
  assert.equal(svg().getAttribute('viewBox'), '0 0 200 230', 'ajustado por defecto');
  container.querySelector('[data-action="scheme-zoom"][data-dir="in"]').click();
  const vb = svg().getAttribute('viewBox').split(' ').map(Number);
  assert.ok(vb[2] < 200 && vb[3] < 230, `zoom in: viewBox más pequeño (${vb})`);
  assert.equal(svg().dataset.schemeZoom, '1.5');
  container.querySelector('[data-action="scheme-zoom"][data-dir="out"]').click();
  assert.equal(svg().getAttribute('viewBox'), '0 0 200 230', 'zoom out vuelve a ajustar');
  container.querySelector('[data-action="scheme-zoom"][data-dir="in"]').click();
  container.querySelector('[data-action="scheme-zoom"][data-dir="reset"]').click();
  assert.equal(svg().getAttribute('viewBox'), '0 0 200 230', 'reset ajusta a pantalla');
  view.destroy();
});

test('diseño E6.2: hover en el esquema resalta el chip del mismo contenido (y viceversa)', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  const row = container.querySelector('.cn-scheme__row');
  row.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  const ref = row.dataset.ref;
  const chip = container.querySelector(`.cn-chip[data-ref="${ref}"]`);
  assert.ok(chip.classList.contains('is-highlighted'), 'hover en glifo → chip resaltado');
  assert.ok(row.classList.contains('is-highlighted'), 'el glifo también se resalta');
  // En sentido contrario: hover en el chip resalta el glifo.
  container.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
  chip.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
  assert.ok(container.querySelector(`.cn-scheme__row[data-ref="${ref}"]`).classList.contains('is-highlighted'),
    'hover en chip → glifo resaltado');
  view.destroy();
});

test('diseño E7: el panel derecho agrega Materiales/Piezas/Alertas con datos del store', () => {
  // Chrome extendido con los ids nuevos del panel (updateSummary es tolerante
  // a DOM parcial: sin ellos no falla).
  for (const id of ['pieces-list', 'materials-list', 'alerts-list']) {
    const d = document.createElement('div');
    d.id = id;
    document.body.appendChild(d);
  }
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  assert.match(document.getElementById('materials-list').textContent, /#c19a6b · 15 mm/, 'material del casco listado');
  assert.match(document.getElementById('pieces-list').textContent, /Laterales/, 'piezas por rol listadas');
  assert.match(document.getElementById('alerts-list').textContent, /Sin alertas|mm/, 'panel de alertas renderizado');
  view.destroy();
  for (const id of ['pieces-list', 'materials-list', 'alerts-list']) {
    document.getElementById(id).remove();
  }
});

test('diseño: error de gola con fixes aplicables — «Subir la repisa» ajusta y activa el gola', () => {
  const { store, view, container } = mountView();
  // 3 cajones (vano 250) + repisa justo sobre la pila: el gola no cabe.
  container.querySelector('[data-action="add-module"]').click();
  for (let i = 0; i < 3; i++) {
    const scoped = '[data-module-scoped="1"]';
    // Vano libre fijado a mano (los tipos de catálogo se eliminaron del UI).
    container.querySelector(`${scoped} [data-alto-vano]`).value = '250';
    container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  }
  container.querySelector('[data-action="add-content"][data-kind="shelf"]').click();
  const repisaAntes = store.get().pieces.find((p) => String(p.id) === 'm1-repisa-1');
  // Ancla la repisa justo sobre la pila (posición determinista, independiente
  // de prefs acumuladas de otros tests): techo del último cajón + 2.5.
  const frentes = store.get().pieces.filter((p) => String(p.id).endsWith('-frente'));
  const techoPila = Math.max(...frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)));
  repisaAntes.pos_z = Math.round((techoPila + 2.5) * 10) / 10;
  const zAntes = Number(repisaAntes.pos_z);

  container.querySelector('[data-action="toggle-gola"]').click();

  // Panel de error con el fix aplicable en la tarjeta.
  const panelError = container.querySelector('.cn-pref-group__gola-error');
  assert.ok(panelError, 'panel de error con fixes visible');
  const btnFix = panelError.querySelector('[data-action="apply-gola-fix"][data-fix-id="subir-repisa"]');
  assert.ok(btnFix, 'botón «Subir la repisa» presente');
  assert.match(btnFix.textContent, /Subir la repisa \+\d+ mm/);

  btnFix.click();

  // La repisa subió el déficit y el gola quedó activo.
  const repisaDespues = store.get().pieces.find((p) => String(p.id) === String(repisaAntes.id));
  assert.ok(Number(repisaDespues.pos_z) > zAntes, `repisa subida (${zAntes} → ${repisaDespues.pos_z})`);
  assert.equal(isGolaEnabled(store.get().pieces, '1'), true, 'gola activada tras el ajuste');
  assert.ok(!container.querySelector('.cn-pref-group__gola-error'), 'el panel de error se cierra al aplicar');
  view.destroy();
});

test('diseño: validación de diseño con ítems por nivel', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  const panel = container.querySelector('.cn-constructor__warnings');
  assert.ok(panel, 'panel de validación visible con módulos');
  assert.ok(panel.querySelector('.cn-warnings__head .t-label'), 'cabecera con etiqueta técnica');
  const ok = panel.querySelector('.cn-warnings__item--ok');
  assert.ok(ok, 'ítem ok cuando no hay avisos');
  assert.match(ok.textContent, /Sin avisos/);
  view.destroy();
});

test('diseño: con más de 3 módulos el seleccionado se muestra y el resto arranca colapsado y oculto', () => {
  const { view, container } = mountView();
  container.querySelector('[data-cfg="cantidad"]').value = '4';
  container.querySelector('[data-action="add-module"]').click();
  const cards = [...container.querySelectorAll('[data-module-scoped]')];
  assert.equal(cards.length, 4, 'se crearon 4 módulos');
  const sel = container.querySelector('[data-module-scoped="1"]');
  assert.ok(!sel.classList.contains('cn-constructor__module--concealed'), 'el módulo seleccionado (1) se muestra');
  // Módulos 3 y 4: sin overrides previos → colapsados por default y ocultos
  // (no seleccionados). (1 y 2 pueden tener override de tests anteriores.)
  for (const id of ['3', '4']) {
    const c = container.querySelector(`[data-module-scoped="${id}"]`);
    assert.ok(c.classList.contains('is-collapsed'), `módulo ${id} colapsado por default`);
    assert.ok(c.classList.contains('cn-constructor__module--concealed'), `módulo ${id} oculto (no seleccionado)`);
  }
  const third = container.querySelector('[data-module-scoped="3"] [data-action="toggle-collapse"]');
  third.click();
  assert.ok(!container.querySelector('[data-module-scoped="3"]').classList.contains('is-collapsed'), 'expandir uno lo abre');
  view.destroy();
});

test('diseño: plegado de tarjetas (toggle manual)', () => {
  const { view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  const card = container.querySelector('[data-module-scoped="1"]');
  assert.ok(!card.classList.contains('is-collapsed'), 'con 1 módulo la tarjeta arranca expandida');
  const chevron = card.querySelector('[data-action="toggle-collapse"]');
  assert.equal(chevron.getAttribute('aria-expanded'), 'true');
  chevron.click();
  const card2 = container.querySelector('[data-module-scoped="1"]');
  assert.ok(card2.classList.contains('is-collapsed'), 'clic en la chevron colapsa la tarjeta');
  assert.equal(card2.querySelector('[data-action="toggle-collapse"]').textContent.trim(), '▸');
  card2.querySelector('[data-action="toggle-collapse"]').click();
  assert.ok(!container.querySelector('[data-module-scoped="1"]').classList.contains('is-collapsed'), 'segundo clic expande');
  view.destroy();
});

test('diseño: esquema interactivo — quitar elemento y añadir desde el menú', () => {
  const { store, view, container } = mountView();
  container.querySelector('[data-action="add-module"]').click();
  container.querySelector('[data-action="add-content"][data-kind="drawer"]').click();
  const before = store.get().pieces.length;
  const row = container.querySelector('.cn-scheme__row');
  assert.ok(row, 'la fila del esquema es clicable');
  row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(store.get().pieces.length < before, 'clic en el glifo elimina el contenido');
  // Zona ＋ abre el menú y la opción añade con las prefs de la tarjeta.
  const addZone = container.querySelector('.cn-scheme__add');
  addZone.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(container.querySelector('.cn-scheme-menu'), 'menú de alta visible tras el ＋');
  const n = store.get().pieces.length;
  container.querySelector('.cn-scheme-menu [data-kind="shelf"]').click();
  assert.ok(store.get().pieces.length > n, 'la opción del menú añade la repisa');
  assert.ok(store.get().pieces.some((p) => String(p.id).includes('-repisa-')), 'la repisa llegó al store');
  view.destroy();
});

test('diseño: segmentados navegables con flechas de teclado', () => {
  const { view, container } = mountView();
  const seg = container.querySelector('[data-cfg="espesor"]').closest('.cn-segmented');
  const opts = [...seg.querySelectorAll('.cn-segmented__opt')];
  opts[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(container.querySelector('[data-cfg="espesor"]').value, '18', 'flecha derecha activa la siguiente píldora');
  view.destroy();
});

test('diseño: los campos conservan sus data-attributes (mismo contrato funcional)', () => {
  const { view, container } = mountView();
  for (const sel of [
    '[data-cfg="ancho"]', '[data-cfg="alto"]', '[data-cfg="prof"]', '[data-cfg="espesor"]',
    '[data-cfg="color"]', '[data-cfg="zocalo"]', '[data-cfg="altura-zocalo"]',
    '[data-obra="tipo"]', '[data-obra="altoZocalo"]', '[data-obra="retraso"]',
    '[data-furniture-name]', '[data-version-name]',
  ]) {
    assert.ok(container.querySelector(sel), `existe ${sel}`);
  }
  view.destroy();
});
