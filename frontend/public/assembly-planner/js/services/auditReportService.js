// js/services/auditReportService.js — Informe de auditoría consolidado
// Lógica pura, sin DOM ni SVG. Testeable con node --test.
//
// El sistema tiene muchas validaciones dispersas (csvParser, golaService,
// stackClearanceService, shoeClearanceService, structural, collisionService,
// hardware) pero ningún informe consolidado. Este servicio EJECUTA esas
// validaciones existentes (sin reimplementar reglas) y agrega sus resultados
// en una tabla normalizada de filas:
//
//   { elemento, seccion, estado, problema, correccion, justificacion }
//
// Estados:
//   'por-corregir' — cualquier ERROR de una validación.
//   'pendiente'    — avisos (warnings) y entradas de hardware bloqueantes o
//                    marcadas '(verificar catálogo)': requieren información
//                    o confirmación del taller/proveedor.
//   'validado'     — elementos cubiertos por validaciones que pasan limpias;
//                    se genera al menos una fila 'validado' por sección con
//                    contenido relevante, con la medida real usada.
//
// El informe incluye el conteo por estado y `corteAutorizado`
// (= 0 filas 'por-corregir'): el prompt de taller exige NO autorizar el
// corte con elementos por corregir.
//
// No muta `pieces`: trabaja sobre copias y solo llama a validadores que ya
// garantizan pureza. Los duplicados exactos de problema (p. ej. una pila que
// excede el vano la reportan tanto csvParser como validateStackClearance)
// se deduplican conservando la fuente directa.

import { parseCSV, piecesToCSV } from './csvParser.js';
import { validateStackClearance } from './stackClearanceService.js';
import { validateShoeClearance } from './shoeClearanceService.js';
import { validateGola, getGolaCfg, aberturaCanalGola } from './golaService.js';
import {
  auditarLuzLibreGola,
  auditarVeta,
  auditarColisionGola,
  LUZ_MIN_MANO_MM,
  COLISION_GOLA_MIN_MM,
} from './despieceAuditService.js';
import { calculateHardware } from './hardware.js';
import { calcularVuelco, clasificarRiesgo, estimatePieceWeight, getProfundidadMueble } from './structural.js';
import { detectCollisions } from './collisionService.js';
import { inferRole, isShoeRack } from './classifierService.js';
import { railTypeFor, getRailType } from './railService.js';
import { railHardwareName } from './railHardwareService.js';
import { RAIL_TYPES, VERTICAL_POSITIONS } from '../core/config.js';

export const AUDIT_SECCIONES = ['Gola', 'Cajones', 'Zapateras', 'Estructura', 'Herrajes', 'Rieles'];
export const AUDIT_ESTADOS = ['validado', 'por-corregir', 'pendiente'];

const JUSTIFICACION = {
  csv: 'Validación estructural del parser de CSV (csvParser.js): casco completo, fondos, medidas interiores, holguras y rangos ergonómicos de taller.',
  stack: 'Chequeo estricto de cabida vertical (stackClearanceService.js): la pila de frentes no puede exceder la altura interior del vano ni resolverse por compresión.',
  shoe: 'Altura libre entre niveles calculada con las piezas reales y sus espesores (shoeClearanceService.js); mínimos de taller por tipo de calzado.',
  gola: 'Validación del sistema gola (validateGola): piezas del canal dentro del vano, sin solapes con frentes, profundidad de tiras, abertura útil de agarre y cierre del reparto vertical.',
  hardware: 'Entrada de la lista de herrajes (calculateHardware): la referencia debe confirmarse contra el catálogo del proveedor antes de cortar.',
  vuelco: 'Cálculo de vuelco con 5 escenarios de carga (calcularVuelco, structural.js); el factor de seguridad exigible es ≥ 1.5.',
  riesgo: 'Clasificación de riesgo de flexión/pandeo por luz y espesor del panel (clasificarRiesgo, structural.js).',
  collision: 'Detección de colisiones al abrir piezas móviles contra otras móviles o contra obstáculos fijos del sistema gola (collisionService.js).',
  riel: 'Holgura lateral del tipo de riel según catálogo (RAIL_TYPES, core/config.js), verificada por el validador estructural sin avisos para este tipo.',
  luz: `Regla de control estricto del taller (auditoría de despiece): la luz libre entre frentes consecutivos —el canal por donde entra la mano en la gola— debe ser ≥ ${LUZ_MIN_MANO_MM} mm; por debajo, los frentes obstruyen el agarre.`,
  veta: 'Regla de control estricto del taller (auditoría de despiece): el sentido de la veta (rotate) se audita por función de la pieza para garantizar la continuidad estética del diseño de madera: frentes y golas con veta horizontal obligatoria, laterales/caras/fondos recomendados, bases libres.',
  colision: `Regla de control estricto del taller (auditoría de despiece): la estructura interna de la caja debe quedar ≥ ${COLISION_GOLA_MIN_MM} mm por debajo del frente; con menos holgura el cajón choca la gola al cerrar.`,
  audit: 'Consolidado de la auditoría: las validaciones existentes pasan limpias sobre las piezas actuales.',
};

const CORRECCION_DEFAULT = 'Revisar el elemento señalado y revalidar antes de enviar a corte.';

// ── Atribución de sección por contenido del mensaje ────────────────────────
// Orden importa: gola > zapatera > riel > cajón/frente > herrajes > resto
// (Estructura). Las fuentes con sección fija (hardware→Herrajes,
// vuelco/riesgo→Estructura, stack→Cajones, shoe→Zapateras) se asignan
// directamente en la fila y no pasan por aquí.
function seccionDe(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.includes('gola')) return 'Gola';
  if (t.includes('zapatera') || t.includes('zapatero') || t.includes('calzado')) return 'Zapateras';
  if (t.includes('riel') || t.includes('corredera') || t.includes('holgura')) return 'Rieles';
  if (t.includes('cajón') || t.includes('cajon') || t.includes('frente') || t.includes('volquete') || t.includes('abatible')) return 'Cajones';
  if (t.includes('herraje') || t.includes('tornillo') || t.includes('bisagra') || t.includes('escuadra') || t.includes('nivelador') || t.includes('tarugo') || t.includes('canto') || t.includes('barra') || t.includes('tirador') || t.includes('pistón') || t.includes('piston')) return 'Herrajes';
  return 'Estructura';
}

// Etiqueta corta de elemento: conserva el prefijo de módulo si existe y
// trunca la descripción a una frase manejable para la tabla.
function elementoDe(mensaje) {
  let t = String(mensaje || '').replace(/^Gola:\s*/, '').trim();
  const mod = t.match(/^(Módulo\s+[^:→]+(?:\s*→\s*[^:]+)?)\s*:\s*/);
  let prefijo = '';
  if (mod) {
    prefijo = mod[1].trim();
    t = t.slice(mod[0].length);
  }
  const corto = t.length > 80 ? `${t.slice(0, 80).replace(/\s+\S*$/, '')}…` : t;
  return prefijo ? `${prefijo}: ${corto}` : corto;
}

// Sugerencia de corrección: lo que sigue a ' — ' o a la primera oración
// descriptiva cuando la trae; si no, corrección genérica.
function correccionDe(mensaje) {
  const t = String(mensaje || '').trim();
  const dash = t.split(' — ');
  if (dash.length > 1) return dash[dash.length - 1].trim();
  const oraciones = t.split(/(?<=\.)\s+/).filter(Boolean);
  if (oraciones.length > 1) return oraciones.slice(1).join(' ').trim();
  return CORRECCION_DEFAULT;
}

function filaDeMensaje(mensaje, estado, fuente, seccionFija = null) {
  return {
    elemento: elementoDe(mensaje),
    seccion: seccionFija || seccionDe(mensaje),
    estado,
    problema: String(mensaje),
    correccion: correccionDe(mensaje),
    justificacion: JUSTIFICACION[fuente],
    fuente,
  };
}

// Número con coma decimal (formato de taller en español).
const fmtMm = (v) => String(v).replace('.', ',');

function filaValidada({ elemento, seccion, medida = null, justificacion, fuente = 'audit' }) {
  return {
    elemento,
    seccion,
    estado: 'validado',
    problema: medida ? `Sin incidencias. Medida/solución actual: ${medida}.` : 'Sin incidencias.',
    correccion: 'Ninguna: mantener la medida/solución actual.',
    justificacion,
    fuente,
    medida,
  };
}

// Deduplica por problema conservando la fuente directa: si llega primero la
// fila genérica ('csv') y después la directa ('stack'/'shoe'), la directa
// reemplaza a la genérica (mismo problema, mejor atribución).
const FUENTES_DIRECTAS = new Set(['stack', 'shoe', 'gola']);
function deduplicar(filas) {
  const porProblema = new Map();
  for (const f of filas) {
    const prev = porProblema.get(f.problema);
    if (!prev) {
      porProblema.set(f.problema, f);
    } else if (f.fuente !== prev.fuente) {
      if (FUENTES_DIRECTAS.has(f.fuente) && !FUENTES_DIRECTAS.has(prev.fuente)) {
        porProblema.set(f.problema, f);
      }
    }
  }
  return [...porProblema.values()];
}

/**
 * Construye el informe de auditoría consolidado del mueble.
 *
 * @param {Array} pieces Piezas del mueble completo.
 * @param {object} [userConfig] Config de usuario (gola, mínimos zapatera…).
 * @param {object} [opts] Opcional: `dependencies` (para el BOM de herrajes),
 *   `geometries` + `movingIds` (para detectCollisions; sin ellas la
 *   validación de colisiones se omite — con apertura 0 no hay móviles).
 * @returns {{rows: Array, conteo: {validado:number, 'por-corregir':number,
 *   pendiente:number}, corteAutorizado: boolean}}
 */
export function buildAuditReport(pieces, userConfig = {}, opts = {}) {
  const lista = Array.isArray(pieces) ? pieces.slice() : [];
  const filas = [];

  const correr = (fn, fuente, elemento) => {
    try {
      return fn();
    } catch (err) {
      // La auditoría nunca debe impedir trabajar: un fallo de validación se
      // expone como pendiente en vez de abortar el informe.
      filas.push({
        elemento,
        seccion: 'Estructura',
        estado: 'pendiente',
        problema: `La validación no pudo ejecutarse: ${err?.message || err}`,
        correccion: 'Revisar el diseño y reintentar; si persiste, reportar el error.',
        justificacion: 'El informe de auditoría es robusto: los fallos de ejecución se muestran como pendientes en lugar de ocultarse o abortar.',
        fuente,
      });
      return null;
    }
  };

  if (!lista.length) {
    return {
      rows: [],
      conteo: { validado: 0, 'por-corregir': 0, pendiente: 0 },
      corteAutorizado: true,
    };
  }

  // ── 1) Validación estructural (csvParser re-parsea el mueble en silencio;
  //       ya agrega internamente validateStackClearance como errors y
  //       validateShoeClearance como warnings) ──────────────────────────────
  const csv = correr(() => parseCSV(piecesToCSV(lista)), 'csv', 'Integridad del CSV');
  if (csv) {
    for (const e of csv.errors || []) filas.push(filaDeMensaje(e, 'por-corregir', 'csv'));
    for (const w of csv.warnings || []) filas.push(filaDeMensaje(w, 'pendiente', 'csv'));
  }

  // ── 2) Cabida vertical de pilas (directa, con el userConfig si aplica) ──
  const stack = correr(() => validateStackClearance(lista), 'stack', 'Pila de frentes');
  if (stack) {
    for (const e of stack.errors || []) filas.push(filaDeMensaje(e.mensaje ?? e, 'por-corregir', 'stack', 'Cajones'));
  }

  // ── 3) Altura libre de zapateras (directa, respeta mínimos del usuario) ─
  const shoe = correr(() => validateShoeClearance(lista, userConfig || {}), 'shoe', 'Altura libre de zapateras');
  if (shoe) {
    for (const w of shoe.warnings || []) filas.push(filaDeMensaje(w.mensaje ?? w, 'pendiente', 'shoe', 'Zapateras'));
  }

  // ── 4) Sistema gola, por módulo con tiras aplicadas ─────────────────────
  const tiras = lista.filter((p) => inferRole(p) === 'gola_strip');
  const golaRoots = [...new Set(tiras.map((p) => String(p.modulo)))];
  for (const rootId of golaRoots) {
    const res = correr(() => validateGola(lista, rootId, userConfig || {}), 'gola', `Sistema gola M${rootId}`);
    if (!res) continue;
    for (const e of res.errors || []) filas.push(filaDeMensaje(e, 'por-corregir', 'gola', 'Gola'));
    for (const w of res.warnings || []) filas.push(filaDeMensaje(w, 'pendiente', 'gola', 'Gola'));
  }

  // ── 4b) Auditoría estricta de despiece (luz libre de la mano, veta por
  //        función y colisión gola) — reglas de control del taller ──────────
  const luz = correr(() => auditarLuzLibreGola(lista), 'despiece', 'Luz libre del canal de la mano');
  for (const f of luz || []) {
    filas.push({
      elemento: `M${f.modulo}: luz libre ${f.luzMm} mm`,
      seccion: 'Gola',
      estado: 'por-corregir',
      problema: f.mensaje,
      correccion: f.correccion,
      justificacion: JUSTIFICACION.luz,
      fuente: 'despiece',
    });
  }
  const veta = correr(() => auditarVeta(lista), 'despiece', 'Sentido de veta (rotate)');
  if (veta) {
    for (const v of veta.incumplimientos) {
      filas.push({
        elemento: `${v.etiqueta} "${v.nombre}"`,
        seccion: v.rol === 'gola_strip' ? 'Gola' : 'Cajones',
        estado: v.nivel === 'error' ? 'por-corregir' : 'pendiente',
        problema: v.mensaje,
        correccion: `Cortar la pieza con rotate 'no' (veta ${v.etiqueta === 'Lateral' ? 'a lo largo de la profundidad' : 'horizontal a lo largo del ancho'}) y rehacer el despiece.`,
        justificacion: JUSTIFICACION.veta,
        fuente: 'despiece',
      });
    }
    for (const b of veta.basesLibres) {
      filas.push({
        elemento: `M${b.modulo}: bases de cajón (×${b.cantidad})`,
        seccion: 'Cajones',
        estado: 'validado',
        problema: b.mensaje,
        correccion: 'Ninguna: el rotate de las bases es libre; el optimizador puede rotarlas para ahorrar material.',
        justificacion: JUSTIFICACION.veta,
        fuente: 'despiece',
      });
    }
  }
  const colision = correr(() => auditarColisionGola(lista), 'despiece', 'Colisión de caja con la gola');
  for (const f of colision || []) {
    filas.push({
      elemento: `M${f.modulo}: holgura caja-frente ${f.holguraMm} mm`,
      seccion: 'Gola',
      estado: 'por-corregir',
      problema: f.mensaje,
      correccion: f.correccion,
      justificacion: JUSTIFICACION.colision,
      fuente: 'despiece',
    });
  }

  // ── 5) Lista de herrajes: bloqueantes / 'verificar catálogo' → pendiente ─
  const hardware = correr(
    () => calculateHardware(lista, opts.dependencies || [], userConfig || {}),
    'hardware',
    'Lista de herrajes',
  ) || [];
  const pendientesHardware = [];
  for (const h of hardware) {
    const requiereCatalogo = !!h.bloqueante || /verificar (el )?catálogo/i.test(String(h.especificacion || ''));
    if (!requiereCatalogo) continue;
    const problema = `Herraje pendiente de confirmación: ${h.nombre} (×${h.cantidad}) — ${h.especificacion}`;
    pendientesHardware.push({
      elemento: `Confirmar en catálogo: ${h.nombre}`,
      seccion: 'Herrajes',
      estado: 'pendiente',
      problema,
      correccion: 'Confirmar la referencia exacta y el rango de ajuste con el catálogo del proveedor antes de cortar.',
      justificacion: JUSTIFICACION.hardware,
      fuente: 'hardware',
    });
  }
  filas.push(...pendientesHardware);

  // ── 6) Vuelco (5 escenarios, FS ≥ 1.5) ───────────────────────────────────
  const repisas = lista.filter((p) => /repisa|estante|entrepano|entrepaño/i.test(String(p.nombre || '')));
  const pesoTotal = lista.reduce((sum, p) => sum + estimatePieceWeight(p), 0);
  const vuelco = correr(
    () => calcularVuelco({ pesoVacio: pesoTotal, cargaMaxima: repisas.length * 25, profundidad: getProfundidadMueble(lista) }),
    'vuelco',
    'Estabilidad frente al vuelco',
  );
  if (vuelco) {
    const inseguros = vuelco.filter((e) => !e.seguro);
    if (inseguros.length) {
      filas.push({
        elemento: 'Estabilidad frente al vuelco',
        seccion: 'Estructura',
        estado: 'por-corregir',
        problema: `Factor de seguridad < 1.5 en ${inseguros.length} escenario(s): ${inseguros.map((e) => `${e.nombre} (FS ${e.fs})`).join(', ')}.`,
        correccion: 'Anclar el mueble a la pared (tornillos/tarugos a estructura, no solo al tablero trasero) antes de cargarlo.',
        justificacion: JUSTIFICACION.vuelco,
        fuente: 'vuelco',
      });
    } else {
      const fsMin = Math.min(...vuelco.map((e) => e.fs));
      filas.push(filaValidada({
        elemento: 'Estabilidad frente al vuelco',
        seccion: 'Estructura',
        medida: `FS mínimo ${fsMin} ≥ 1.5 en los 5 escenarios`,
        justificacion: JUSTIFICACION.vuelco,
        fuente: 'vuelco',
      }));
    }
  }

  // ── 7) Riesgo estructural por panel ──────────────────────────────────────
  let hayRiesgoAlto = false;
  for (const p of lista) {
    const riesgo = correr(() => clasificarRiesgo(p), 'riesgo', `Riesgo: ${p.nombre}`);
    if (!riesgo) continue;
    if (riesgo.level === 'danger') {
      hayRiesgoAlto = true;
      const luz = Math.max(Number(p.ancho) || 0, Number(p.alto) || 0);
      filas.push({
        elemento: `${p.nombre} (M${p.modulo})`,
        seccion: 'Estructura',
        estado: 'por-corregir',
        problema: `Riesgo crítico: ${riesgo.label} — luz ${luz} mm con espesor ${p.espesor} mm.`,
        correccion: `${riesgo.accion}.`,
        justificacion: JUSTIFICACION.riesgo,
        fuente: 'riesgo',
      });
    } else if (riesgo.level === 'warning') {
      hayRiesgoAlto = true;
      const luz = Math.max(Number(p.ancho) || 0, Number(p.alto) || 0);
      filas.push({
        elemento: `${p.nombre} (M${p.modulo})`,
        seccion: 'Estructura',
        estado: 'pendiente',
        problema: `Riesgo alto: ${riesgo.label} — luz ${luz} mm con espesor ${p.espesor} mm.`,
        correccion: `${riesgo.accion}.`,
        justificacion: JUSTIFICACION.riesgo,
        fuente: 'riesgo',
      });
    }
  }
  if (!hayRiesgoAlto) {
    filas.push(filaValidada({
      elemento: 'Riesgo estructural de paneles',
      seccion: 'Estructura',
      medida: `${lista.length} pieza(s) clasificadas, ninguna en nivel alto/crítico`,
      justificacion: JUSTIFICACION.riesgo,
      fuente: 'riesgo',
    }));
  }

  // ── 8) Colisiones al abrir (solo si la vista aporta geometrías) ──────────
  if (Array.isArray(opts.geometries) && Array.isArray(opts.movingIds) && opts.movingIds.length) {
    const pares = correr(() => detectCollisions(opts.geometries, opts.movingIds), 'collision', 'Colisiones al abrir') || [];
    for (const par of pares) {
      const contraGola = !!par.contraObstaculoFijo;
      filas.push({
        elemento: `Colisión al abrir: ${par.aName} ↔ ${par.bName}`,
        seccion: contraGola ? 'Gola' : 'Cajones',
        estado: 'por-corregir',
        problema: `Las piezas "${par.aName}" y "${par.bName}" se solapan al abrirse (volumen ≈ ${par.volume.toFixed(0)} mm³).`,
        correccion: 'Reducir la apertura máxima, revisar el sentido de apertura o reubicar la pieza interferida.',
        justificacion: JUSTIFICACION.collision,
        fuente: 'collision',
      });
    }
  }

  // ── Deduplicación antes de las filas 'validado' (dependen de secciones
  //    ya limpias) ─────────────────────────────────────────────────────────
  const unicas = deduplicar(filas);
  const hay = (seccion, estado = null) => unicas.some((f) => f.seccion === seccion && (!estado || f.estado === estado));

  // ── 9) Filas 'validado' por sección con contenido relevante ─────────────
  // Fila de MEDIDA del sistema gola: se emite siempre que haya gola (reporta
  // el perfil y la abertura útil configurados), aunque otras validaciones
  // tengan errores en la sección.
  if (golaRoots.length) {
    const cfg = getGolaCfg(userConfig || {});
    const tiposCanal = new Set(tiras.map((t) => (/gola-c\d+-/i.test(String(t.id)) ? 'C' : 'L')));
    const aberturas = [...tiposCanal]
      .map((tipo) => `canal ${tipo}: ${aberturaCanalGola(tipo, cfg).aberturaUtilMm} mm útiles`)
      .join(' · ');
    filas.push(filaValidada({
      elemento: `Sistema gola M${golaRoots.join(', M')} (${golaRoots.length} módulo(s))`,
      seccion: 'Gola',
      medida: `perfil ${cfg.golaPerfilHeight} mm + pasos de ${cfg.golaPaso} mm; ${aberturas}`,
      justificacion: JUSTIFICACION.gola,
      fuente: 'gola',
    }));
  }

  const frentesCajon = lista.filter((p) => inferRole(p) === 'drawer_face');
  if (frentesCajon.length && !hay('Cajones', 'por-corregir')) {
    filas.push(filaValidada({
      elemento: 'Cabida vertical de la pila de frentes',
      seccion: 'Cajones',
      medida: `gap real de ${VERTICAL_POSITIONS.drawerFrontGap} mm entre frentes; pila dentro del vano interior`,
      justificacion: JUSTIFICACION.stack,
      fuente: 'stack',
    }));
  }

  const hayZapateras = lista.some((p) => isShoeRack(p));
  if (hayZapateras && !hay('Zapateras')) {
    filas.push(filaValidada({
      elemento: 'Altura libre entre niveles de zapatera',
      seccion: 'Zapateras',
      medida: 'altura libre ≥ mínimo del tipo de calzado en todos los niveles anclados',
      justificacion: JUSTIFICACION.shoe,
      fuente: 'shoe',
    }));
  }

  if (!hay('Estructura', 'por-corregir') && !hay('Estructura', 'pendiente')) {
    filas.push(filaValidada({
      elemento: 'Casco y medidas estructurales',
      seccion: 'Estructura',
      medida: 'casco completo (base, tapa, laterales, fondo) y medidas interiores coherentes',
      justificacion: JUSTIFICACION.csv,
      fuente: 'csv',
    }));
  }

  if (hardware.length) {
    const noBloqueantes = hardware.length - pendientesHardware.length;
    filas.push(filaValidada({
      elemento: 'Herrajes estándar calculados',
      seccion: 'Herrajes',
      medida: `${noBloqueantes} de ${hardware.length} entradas del BOM sin confirmación pendiente`,
      justificacion: 'Cantidades derivadas del conteo de piezas, cajones y módulos (calculateHardware, hardware.js).',
      fuente: 'hardware',
    }));
  }

  if (frentesCajon.length && !hay('Rieles')) {
    const tipos = [...new Set(frentesCajon.map((f) => railTypeFor(f)))].filter((t) => RAIL_TYPES[t]);
    for (const tipo of tipos) {
      const def = getRailType(tipo);
      const medida = def.sideClearance > 0
        ? `${fmtMm(def.sideClearance)} mm/lado (caja = vano − ${fmtMm(Math.round(def.sideClearance * 2 * 10) / 10)} mm)`
        : `deducción interior ${def.interiorDeduction} mm (ver especificación)`;
      filas.push(filaValidada({
        elemento: `Holguras de riel — ${railHardwareName(tipo)}`,
        seccion: 'Rieles',
        medida,
        justificacion: JUSTIFICACION.riel,
        fuente: 'riel',
      }));
    }
  }

  // ── Orden: sección (orden fijo) y dentro de ella por gravedad ────────────
  const ordenEstado = { 'por-corregir': 0, pendiente: 1, validado: 2 };
  const ordenSeccion = new Map(AUDIT_SECCIONES.map((s, i) => [s, i]));
  const rows = deduplicar(filas)
    .map((f) => {
      const { fuente, ...fila } = f;
      return fila;
    })
    .sort((a, b) => {
      const ds = (ordenSeccion.get(a.seccion) ?? 99) - (ordenSeccion.get(b.seccion) ?? 99);
      return ds !== 0 ? ds : ordenEstado[a.estado] - ordenEstado[b.estado];
    });

  const conteo = {
    validado: rows.filter((r) => r.estado === 'validado').length,
    'por-corregir': rows.filter((r) => r.estado === 'por-corregir').length,
    pendiente: rows.filter((r) => r.estado === 'pendiente').length,
  };

  return {
    rows,
    conteo,
    corteAutorizado: conteo['por-corregir'] === 0,
  };
}
