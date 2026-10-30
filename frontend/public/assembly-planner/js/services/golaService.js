// js/services/golaService.js — Sistema de apertura gola con tiras de melamina
// (mismo material/color que el módulo), activable por módulo desde el
// Constructor. Dos mecanismos:
//   1. Tira horizontal en cada gap entre frentes de cajones apilados.
//   2. L-gola: el frente del cajón SUPERIOR se extiende hacia arriba hasta
//      dejar un espacio de agarre bajo la repisa inmediata superior (o bajo
//      el techo interior del casco). Sin tira: el propio frente forma la L.
// Al activar se ELIMINAN los tiradores del módulo; al desactivar se
// regeneran (espejo de addDrawer: 2×20 mm, espesor 5).
//
// Servicio PURO (sin DOM ni localStorage; el caller persiste `meta`):
//   applyGola(pieces, moduleId, cfg)   → { ok, pieces, warnings, meta }
//   removeGola(pieces, moduleId, cfg, meta?) → { ok, pieces, warnings }
//   validateGola(pieces, moduleId, cfg) → { errors, warnings }
//   isGolaEnabled(pieces, moduleId)     → bool (hay tiras del módulo)
//   drawerUnits(pieces, moduleId)       → unidades-cajón (para la UI/tests)
//   getGolaCfg(userConfig, moduleCfg?) → defaults + overrides (módulo gana)
//   golaReport(pieces, cfg, opts?)      → filas "Perfiles gola" para el manual
//   planFijacionCanal(fondo, canal, cfg, ctx?) → plan de fijación de 1 canal
//   fijacionGolaReport(pieces, cfg)     → planes de todos los canales + warnings
//   resumenPlanFijacion(plan)           → texto compacto del plan (manual)
//
// Convenciones: unidades ordenadas por min pos_z de sus frentes (unidad 1 =
// la más baja, unidad N = la más alta, que recibe la L). Gap gola entre
// frentes G = golaPaso + golaPerfilHeight + golaPaso: el cuerpo del perfil
// C queda centrado en el gap con 3 mm de paso arriba y abajo (los dedos
// entran por el paso superior al canal). El agarre lo genera el retranqueo
// (golaStripSetback): los frentes quedan adelantados respecto del perfil.
// Regla de la L superior: la caja del último cajón se rebaja para pasar
// bajo el cuerpo del perfil L (golaPerfilHeight + golaPaso bajo el techo).
// golaFingerClearance solo aplica a la L (aire de agarre bajo la repisa).

import { inferRole } from './classifierService.js';
import { GOLA_PERFIL_TALLER } from '../core/config.js';
import { getContentType, tipoTagDe } from '../core/contentTypes.js';

// Una unidad es de altura FIJA en el gola según su CONTRATO (tag [tipo] en el
// nombre del frente, sobrevive al CSV). Sin tag (catálogo o diseños previos),
// la regla histórica por palabra clave: 'zapatera' en nombre/id.
function esUnidadFijaGola(u) {
  const ref = u.frentes[0];
  const t = tipoTagDe(ref.nombre);
  const tipo = t ? getContentType('shoeRack', t) : null;
  return tipo ? !!tipo.fijoEnGola : /zapatera/i.test(`${ref.id} ${ref.nombre}`);
}

// Metadata del perfil de taller (origen y editabilidad de los valores).
const { fuente, editable, ...GOLA_PERFIL_TALLER_VALORES } = GOLA_PERFIL_TALLER;
export const GOLA_PERFIL_TALLER_INFO = { fuente, editable };

// Defaults del perfil de taller (fuente: 'taller-medido'; verificar contra
// catálogo antes de producción). Se derivan de GOLA_PERFIL_TALLER
// (core/config.js) para tener una sola fuente de verdad y poder llamar al
// servicio desde tests sin userConfig.
export const GOLA_DEFAULTS = { ...GOLA_PERFIL_TALLER_VALORES };

export const GOLA_NUMERIC_KEYS = [
  'golaPerfilHeight',
  'golaPaso',
  'golaFingerClearance',
  'golaStripDepth',
  'golaStripSetback',
  'golaHolguraLateral',
  'golaTornillosPorPerfil',
  'golaSoporteTraseroDesde',
  'golaMaxOverhang',
  'golaMinAperturaUtil',
];

// Altura vertical (mm) que cada pestaña horizontal invade del cuerpo del
// canal: es el espesor de la tira (15). La abertura útil del canal C parte
// de esta constante.
export const GOLA_PESTANA_ALTO_MM = 15;

// Plan de fijación: tornillo estándar del canal y herramienta de perforación
// en melamina (el tornillo 3.5×16 se atornilla con broca de 3 mm).
export const GOLA_TORNILLO_FIJACION = '3.5×16';
export const GOLA_BROCA_FIJACION = 'Ø 3 mm';
// Distancia preferida de cada punto de tornillo al borde más cercano del
// fondo, y mínimo admisible antes de avisar por riesgo de astillado.
export const GOLA_MARGEN_TORNILLO_MM = 15;
export const GOLA_MIN_DIST_BORDE_MM = 10;

/** Abertura útil de agarre de un canal, distinta de su altura exterior:
 * es el hueco libre real por donde entran y agarran los dedos.
 * Canal C: los dedos pasan por el gap entre frentes y agarran el interior
 * del canal retranqueado; el hueco libre vertical es el cuerpo del perfil
 * menos las dos pestañas (15 mm arriba y abajo) y la profundidad útil de
 * entrada es el retranqueo (golaStripSetback). Canal L: el agarre entra
 * desde arriba y la abertura es el aire bajo la repisa (golaFingerClearance).
 *
 * @returns {{tipo:string, alturaExteriorMm:number, aberturaUtilMm:number, profundidadEntradaMm:number}}
 */
export function aberturaCanalGola(tipo, cfg = GOLA_DEFAULTS) {
  const c = { ...GOLA_DEFAULTS, ...(cfg || {}) };
  if (tipo === 'C') {
    return {
      tipo: 'C',
      alturaExteriorMm: c.golaPerfilHeight,
      aberturaUtilMm: Math.max(0, c.golaPerfilHeight - 2 * GOLA_PESTANA_ALTO_MM),
      profundidadEntradaMm: c.golaStripSetback,
    };
  }
  return {
    tipo: 'L',
    alturaExteriorMm: c.golaPerfilHeight,
    aberturaUtilMm: c.golaFingerClearance,
    profundidadEntradaMm: c.golaStripSetback,
  };
}

/** Mergea defaults del perfil de taller con overrides numéricos/string persistidos.
 * Orden: `GOLA_DEFAULTS ← userConfig (global) ← moduleCfg (del módulo)`; los
 * overrides del módulo ganan sobre los globales. Mismas reglas de validación
 * en ambas capas: numéricos finitos ≥0, `golaFijacion` string no vacío. Sin
 * `moduleCfg` el comportamiento es idéntico al histórico (solo global). */
export function getGolaCfg(userConfig = {}, moduleCfg = {}) {
  const cfg = { ...GOLA_DEFAULTS };
  const aplicar = (overrides = {}) => {
    for (const key of GOLA_NUMERIC_KEYS) {
      const value = Number(overrides?.[key]);
      if (Number.isFinite(value) && value >= 0) cfg[key] = value;
    }
    if (typeof overrides?.golaFijacion === 'string' && overrides.golaFijacion.trim()) {
      cfg.golaFijacion = overrides.golaFijacion.trim();
    }
  };
  aplicar(userConfig);
  aplicar(moduleCfg);
  return cfg;
}

// Pieza del módulo raíz o de sus submódulos ('11', '1.2'...).
function perteneceAModulo(p, moduleId) {
  const mod = String(p?.modulo || '').trim();
  const id = String(moduleId);
  return mod === id || (/^\d+$/.test(id) && (mod.startsWith(id) || mod.startsWith(`${id}.`)));
}

const redondea1 = (v) => Math.round(v * 10) / 10;

function stripPrefix(moduleId) {
  return `m${moduleId}gola-`;
}

function esTiraGola(p) {
  return inferRole(p) === 'gola_strip';
}

/**
 * true cuando el módulo ya tiene tiras gola aplicadas.
 */
export function isGolaEnabled(pieces, moduleId) {
  return (pieces || []).some((p) => esTiraGola(p) && perteneceAModulo(p, moduleId));
}

/**
 * Unidades-cajón del módulo: grupos de frentes (rol drawer_face) por
 * submódulo, ordenados por min pos_z (unidad 1 = la más baja). Un cajón de
 * 2 frentes por fila cuenta como 1 unidad (mismo submódulo).
 *
 * @returns {Array<{sub: string, frentes: object[], minZ: number, latAltoCaja: number|null}>}
 */
export function drawerUnits(pieces, moduleId) {
  const porSub = new Map();
  for (const p of pieces || []) {
    if (inferRole(p) !== 'drawer_face' || !perteneceAModulo(p, moduleId)) continue;
    if (!Number.isFinite(Number(p.pos_z))) continue;
    const sub = String(p.modulo || '');
    if (!porSub.has(sub)) porSub.set(sub, []);
    porSub.get(sub).push(p);
  }
  const unidades = [];
  for (const [sub, frentes] of porSub) {
    // Alto de la caja: el lateral del cajón (rol drawer_side del submódulo).
    const lateral = (pieces || []).find((p) =>
      String(p.modulo || '') === sub && inferRole(p) === 'drawer_side');
    unidades.push({
      sub,
      frentes,
      minZ: Math.min(...frentes.map((f) => Number(f.pos_z))),
      latAltoCaja: lateral ? Number(lateral.alto) || null : null,
    });
  }
  return unidades.sort((a, b) => a.minZ - b.minZ);
}

// Dimensiones del casco desde sus piezas (mismo criterio que app.moduleDims).
function cascoDims(pieces, moduleId) {
  const delMod = (pieces || []).filter((p) => String(p.modulo || '') === String(moduleId));
  const tapa = delMod.find((p) => String(p.id) === `m${moduleId}-tapa`)
    || delMod.find((p) => inferRole(p) === 'top_panel');
  const lateral = delMod.find((p) => String(p.id) === `m${moduleId}-lateral-izq`)
    || delMod.find((p) => inferRole(p) === 'side_panel');
  if (!tapa && !lateral) return null;
  const espesor = Number((tapa || lateral).espesor) || 15;
  const anchoModulo = tapa ? Number(tapa.ancho) || 0 : 0;
  const altoModulo = lateral ? Number(lateral.alto) || 0 : 0;
  if (!anchoModulo || !altoModulo) return null;
  // Profundidad del casco: el ALTO de la tapa (se modela ancho × prof) o, en
  // su defecto, el ANCHO de un lateral (prof × alto). 0 = no derivable (p. ej.
  // CSV sin tapa reconocible): validateGola omite entonces el chequeo de
  // interferencia tira↔caja en el eje Y.
  const profundidad = (tapa && Number(tapa.alto)) || (lateral && Number(lateral.ancho)) || 0;
  return {
    anchoModulo,
    altoModulo,
    espesor,
    profundidad,
    anchoInterior: anchoModulo - 2 * espesor,
    techoInterior: altoModulo - espesor, // cara inferior de la tapa
    colorCuerpo: String((lateral || tapa).color || ''),
  };
}

// Referencia vertical superior para la L-gola: pos_z (borde inferior) de la
// repisa inmediatamente superior más cercana; si no hay, el techo interior.
function topRefDe(pieces, moduleId, techoUltimoFrente, techoInterior) {
  const repisas = (pieces || []).filter((p) =>
    inferRole(p) === 'shelf'
    && String(p.modulo || '') === String(moduleId)
    && Number.isFinite(Number(p.pos_z))
    && Number(p.pos_z) >= techoUltimoFrente - 0.5);
  if (!repisas.length) return techoInterior;
  return Math.min(...repisas.map((p) => Number(p.pos_z)));
}

function colorTira(pieces, moduleId, casco, unidades) {
  if (casco?.colorCuerpo) return casco.colorCuerpo;
  const frente = unidades[0]?.frentes[0];
  return String(frente?.color || '');
}

/**
 * Reparte `disponible` mm entre las unidades respetando el PISO de cada una
 * (mínimo para cubrir su caja). El proporcional puro puede dejar un frente
 * bajo su piso cuando el span alcanza justo (p. ej. zapateras con mucha
 * holgura + cajones sin holgura en el mismo módulo): aquí el aire
 * (disponible − Σpisos) se reparte SOLO entre las unidades con holgura
 * (orig > piso), proporcional a ella, con redondeo por mayor resto.
 * Devuelve alturas con Σ = disponible exacto y ninguna unidad bajo su piso.
 */
function reparteConPiso(orig, pisos, disponible) {
  const N = orig.length;
  const sumPisos = pisos.reduce((s, f) => s + f, 0);
  const exceso = orig.map((h, i) => Math.max(0, h - pisos[i]));
  const sumExceso = exceso.reduce((s, e) => s + e, 0);
  if (sumExceso === 0 || disponible - sumPisos <= 0) {
    // Sin holgura (o sin aire): cada una en su piso; el sobrante, si hay,
    // a la primera unidad (el piso es mínimo: cualquiera puede crecer).
    const alturas = pisos.slice();
    alturas[0] += disponible - sumPisos;
    return alturas;
  }
  const aire = disponible - sumPisos;
  const crudo = exceso.map((e) => (e * aire) / sumExceso);
  const alturas = crudo.map((c, i) => pisos[i] + Math.floor(c));
  // Mayor resto primero: lo que el floor quita se devuelve mm a mm.
  let resto = Math.round(aire) - (alturas.reduce((s, h) => s + h, 0) - sumPisos);
  const orden = crudo.map((c, i) => [c - Math.floor(c), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < resto; k += 1) alturas[orden[k % N][1]] += 1;
  // Σ exacta con decimales (invariante Σaᵢ' + (N−1)·G = H_new):
  alturas[0] += disponible - alturas.reduce((s, h) => s + h, 0);
  // Seguridad: si el ajuste decimal dejó a la unidad 0 bajo su piso, el
  // ajuste pasa a la unidad con más holgura (existe: hay aire repartido).
  if (alturas[0] < pisos[0]) {
    const iMax = alturas.reduce((best, h, j) => (h - pisos[j] > alturas[best] - pisos[best] ? j : best), 0);
    alturas[iMax] += alturas[0] - pisos[0];
    alturas[0] = pisos[0];
  }
  return alturas;
}

/**
 * Aplica el sistema gola a un módulo. Reescala SOLO los frentes (las cajas
 * no cambian), crea N−1 tiras y elimina los tiradores del módulo.
 *
 * @returns {{ok:true, pieces: object[], warnings: string[], meta: object}
 *         | {ok:false, errors: string[], warnings?: string[]}}
 */
export function applyGola(pieces, moduleId, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const modId = String(moduleId);
  const unidades = drawerUnits(pieces, modId);
  if (!unidades.length) {
    return { ok: false, errors: [`El módulo ${modId} no tiene cajones con pos_z anclado`] };
  }
  const casco = cascoDims(pieces, modId);
  if (!casco) {
    return { ok: false, errors: [`El módulo ${modId} no tiene casco (tapa/lateral) para derivar el vano`] };
  }

  const N = unidades.length;
  const bottom = unidades[0].minZ;
  const techoUltimoFrente = Math.max(...unidades[N - 1].frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)));
  const topRef = topRefDe(pieces, modId, techoUltimoFrente, casco.techoInterior);
  const H_new = topRef - cfg.golaFingerClearance - bottom;
  // Gap entre frentes = paso + perfil + paso (canal centrado).
  const G = cfg.golaPaso + cfg.golaPerfilHeight + cfg.golaPaso;
  const disponible = H_new - (N - 1) * G;
  // Piso por unidad: cada frente debe cubrir su caja (lateral + 10 mm).
  const pisos = unidades.map((u) => (u.latAltoCaja != null ? u.latAltoCaja + 10 : 30));
  // Zapateras: el frente queda FIJO en la altura de su tipo (no se reescala).
  // Si se reescalara podría quedar bajo la cara de la bandeja (cara = frente
  // − 2·ESP_BASE) y la cara asomaría por arriba del frente. Solo los cajones
  // absorben el aire del span.
  const fijas = unidades.map(esUnidadFijaGola);
  const sumFijas = fijas.reduce((s, f, i) => s + (f ? Math.max(...unidades[i].frentes.map((fr) => Number(fr.alto) || 0)) : 0), 0);
  const minSuma = sumFijas + pisos.reduce((s, p, i) => s + (fijas[i] ? 0 : p), 0);
  if (disponible < minSuma) {
    const nota = sumFijas > 0
      ? ` (incluye ${Math.round(sumFijas)} mm de zapateras a altura de tipo, sin reescalar)`
      : '';
    return {
      ok: false,
      errors: [`Gola: el vano no alcanza (span ${Math.round(H_new)} mm, ${N} cajón/cajones, gap gola ${G} mm; disponible ${Math.round(disponible)} mm < mínimo ${minSuma} mm${nota} para cubrir las cajas). Reduzca cajones, use tipos de zapatera más bajos o aumente el vano (suba la repisa).`],
    };
  }
  // Solo zapateras (nada que reescalar): la pila fija debe cuadrar el span.
  if (fijas.every(Boolean) && Math.abs(minSuma + (N - 1) * G - H_new) > 2) {
    return {
      ok: false,
      errors: [`Gola: las zapateras conservan la altura de su tipo (Σ ${Math.round(sumFijas)} mm + ${N - 1} canales × ${G} mm = ${Math.round(minSuma + (N - 1) * G)} mm) pero el span es ${Math.round(H_new)} mm. Ajuste la repisa/techo al techo de la pila (${Math.round(bottom + minSuma + (N - 1) * G + cfg.golaFingerClearance)} mm) o use tipos de zapatera más bajos.`],
    };
  }

  // meta para el round-trip (restore exacto al desactivar).
  const meta = {
    moduleId: modId,
    origSpan: redondea1(techoUltimoFrente - bottom),
    origHeights: {},
    origTops: {},
  };
  for (const u of unidades) {
    for (const f of u.frentes) {
      meta.origHeights[String(f.id)] = Number(f.alto) || 0;
      meta.origTops[String(f.id)] = Number(f.pos_z) || 0;
    }
  }

  // Reescalado con PISO por unidad (cada frente ≥ su caja + 10). Las
  // zapateras quedan fijas en su altura de tipo; el aire se reparte solo
  // entre los cajones con holgura, con Σaᵢ' + (N−1)·G = H_new exacto.
  const origHeights = unidades.map((u) => Math.max(...u.frentes.map((f) => Number(f.alto) || 0)));
  const nuevasAlturas = origHeights.slice();
  const idxMoviles = unidades.map((_, i) => i).filter((i) => !fijas[i]);
  if (idxMoviles.length) {
    const repartidas = reparteConPiso(
      idxMoviles.map((i) => origHeights[i]),
      idxMoviles.map((i) => pisos[i]),
      disponible - sumFijas,
    );
    idxMoviles.forEach((i, k) => { nuevasAlturas[i] = repartidas[k]; });
  }

  // Extensión L del último frente: su techo queda en topRef − clearance por
  // construcción; si la sobrealtura respecto a su caja supera el cap, se cap
  // y se avisa (la L queda más baja que el objetivo).
  const warnings = [];
  let capped = false;
  const latUltima = unidades[N - 1].latAltoCaja;
  if (!fijas[N - 1] && latUltima != null && nuevasAlturas[N - 1] - latUltima > cfg.golaMaxOverhang) {
    const extensionAntes = nuevasAlturas[N - 1] - latUltima;
    nuevasAlturas[N - 1] = latUltima + cfg.golaMaxOverhang;
    capped = true;
    warnings.push(
      `Gola: la repisa queda muy arriba para la L (extensión ${Math.round(extensionAntes)} mm > máx. ${cfg.golaMaxOverhang} mm): el frente superior se limitó a ${nuevasAlturas[N - 1]} mm.`
    );
  }
  for (let i = 0; i < N; i++) {
    if (nuevasAlturas[i] < origHeights[i]) {
      warnings.push(
        `Gola: frente "${unidades[i].frentes[0].nombre}" reducido a ${nuevasAlturas[i]} mm (era ${origHeights[i]} mm).`
      );
    }
  }

  // Reposicionar: z₁ = bottom, z_{i+1} = zᵢ + aᵢ' + G.
  const nuevasTops = [];
  let cursor = bottom;
  for (let i = 0; i < N; i++) {
    nuevasTops.push(redondea1(cursor));
    cursor += nuevasAlturas[i] + G;
  }

  // Alturas/pos_z nuevos por frente (todos los frentes de la unidad reciben
  // la misma altura; el pos_z de cada frente queda anclado al de su unidad).
  const alturaPorFrente = new Map();
  const topPorFrente = new Map();
  for (let i = 0; i < N; i++) {
    for (const f of unidades[i].frentes) {
      alturaPorFrente.set(String(f.id), nuevasAlturas[i]);
      topPorFrente.set(String(f.id), nuevasTops[i]);
    }
  }

  // Canales de MELAMINA (mismo material/color que el módulo). Por cada gap
  // intermedio, un canal tipo C: fondo vertical que llena el cuerpo del gap
  // (retranqueado) + dos pestañas horizontales (sup e inf) que forman el
  // canal de agarre hacia adelante. Arriba de todo, un canal tipo L: fondo +
  // pestaña inferior solamente (el agarre entra desde arriba).
  const prefijo = stripPrefix(modId);
  const anchoCanal = casco.anchoInterior - 2 * cfg.golaHolguraLateral;
  const color = colorTira(pieces, modId, casco, unidades);
  const mk = (id, nombre, ancho, alto, pos_z, rotate = false) => ({
    id, nombre, ancho, alto, cantidad: 1, rotate,
    color, espesor: 15, cantos: 'T,B', modulo: modId, pos_z,
  });
  const canales = [];
  for (let i = 1; i <= N - 1; i++) {
    const zBase = redondea1(nuevasTops[i - 1] + nuevasAlturas[i - 1] + cfg.golaPaso);
    canales.push(mk(`${prefijo}c${i}-fondo`, `Fondo de canal Gola C ${i}`, anchoCanal, cfg.golaPerfilHeight, zBase, false));
    canales.push(mk(`${prefijo}c${i}-pestana-sup`, `Pestana superior Gola C ${i}`, anchoCanal, cfg.golaStripDepth, redondea1(zBase + cfg.golaPerfilHeight - GOLA_PESTANA_ALTO_MM), true));
    canales.push(mk(`${prefijo}c${i}-pestana-inf`, `Pestana inferior Gola C ${i}`, anchoCanal, cfg.golaStripDepth, zBase, true));
  }
  // Canal L bajo el techo (la repisa es topRef; el canal va pegado arriba).
  {
    const zL = redondea1(topRef - cfg.golaPaso - cfg.golaPerfilHeight);
    canales.push(mk(`${prefijo}l${N}-fondo`, 'Fondo de canal Gola L', anchoCanal, cfg.golaPerfilHeight, zL, false));
    canales.push(mk(`${prefijo}l${N}-pestana`, 'Pestana inferior Gola L', anchoCanal, cfg.golaStripDepth, zL, true));
    // Hueco sobre el último frente: pasa cuando es de altura fija (zapatera)
    // y no llega al canal L, o cuando el cap de la L lo dejó más bajo. El
    // agarre desde arriba sigue funcionando, pero queda una ranura a la
    // vista entre el frente y el canal.
    const techoUltimoNuevo = nuevasTops[N - 1] + nuevasAlturas[N - 1];
    if (techoUltimoNuevo < zL - 0.5) {
      warnings.push(`Gola: el último frente queda ${Math.round(zL - techoUltimoNuevo)} mm por debajo del canal L: habrá un hueco visible sobre el frente; suba la repisa o use un tipo más alto.`);
    }
  }

  // Regla de la L: la caja del cajón SUPERIOR se rebaja para pasar libre
  // bajo el cuerpo del perfil L (perfil + paso bajo el techo interior). El
  // frente se mantiene (tapa la pestaña inferior del perfil). Los cambios se
  // aplican en el ensamblado (no se muta el array de entrada) y quedan en
  // meta para el round-trip.
  const alturaCajaPorPieza = new Map();
  const techo = casco.techoInterior;
  if (Number.isFinite(techo)) {
    const ult = unidades[N - 1];
    const techoCajaMax = techo - cfg.golaPerfilHeight - cfg.golaPaso;
    const cajaMax = techoCajaMax - nuevasTops[N - 1];
    for (const p of pieces || []) {
      if (String(p.modulo || '') !== ult.sub) continue;
      const rol = inferRole(p);
      if (!['drawer_side', 'drawer_back', 'drawer_part'].includes(rol)) continue;
      const altoActual = Number(p.alto) || 0;
      if (cajaMax > 40 && altoActual > cajaMax) {
        meta.origHeights[String(p.id)] = altoActual;
        alturaCajaPorPieza.set(String(p.id), Math.round(cajaMax * 10) / 10);
      }
    }
    if (alturaCajaPorPieza.size) {
      warnings.push(`Gola: la caja del cajón superior se rebajó a ${Math.round(cajaMax)} mm para pasar bajo el perfil L (${cfg.golaPerfilHeight} + ${cfg.golaPaso} mm bajo el techo).`);
    }
  }

  // Ensamblar: frentes reescalados/reposicionados, tiradores fuera, tiras
  // nuevas (reemplaza las anteriores si las hubiera), resto intacto.
  const idsFrentes = new Set(alturaPorFrente.keys());
  const tiradoresOut = new Set(
    (pieces || [])
      .filter((p) => inferRole(p) === 'handle' && perteneceAModulo(p, modId))
      .map((p) => String(p.id)),
  );
  const resultado = [];
  for (const p of pieces || []) {
    const id = String(p.id);
    if (id.startsWith(prefijo)) continue; // canales viejos (re-aplicación)
    if (tiradoresOut.has(id)) continue;   // gola sin tiradores
    if (idsFrentes.has(id)) {
      resultado.push({
        ...p,
        alto: alturaPorFrente.get(id),
        pos_z: topPorFrente.get(id),
      });
      continue;
    }
    if (alturaCajaPorPieza.has(id)) {
      resultado.push({ ...p, alto: alturaCajaPorPieza.get(id) });
      continue;
    }
    resultado.push(p);
  }
  resultado.push(...canales);

  const validacion = validateGola(resultado, modId, cfg);
  if (validacion.errors.length) {
    return { ok: false, errors: validacion.errors, warnings: [...warnings, ...validacion.warnings] };
  }
  return { ok: true, pieces: resultado, warnings: [...warnings, ...validacion.warnings], meta };
}

/**
 * Regenera los tiradores de las unidades-cajón del módulo (espejo de
 * addDrawer: 2×20 mm, espesor 5, color aluminio). Idénticos ids/nombres a
 * los que genera closetBuilderService.addDrawer.
 */
function regenerarTiradores(pieces, moduleId, unidades) {
  const existentes = new Set((pieces || []).map((p) => String(p.id)));
  const nuevos = [];
  for (const u of unidades) {
    for (const f of u.frentes) {
      const id = String(f.id).replace(/-frente$/, '-tirador');
      if (existentes.has(id)) continue;
      nuevos.push({
        id,
        nombre: String(f.nombre).replace(/^Frente/, 'Tirador'),
        ancho: 2,
        alto: 20,
        cantidad: 1,
        rotate: false,
        color: '#A0A0A0',
        espesor: 5,
        cantos: '',
        modulo: String(f.modulo),
      });
    }
  }
  return nuevos;
}

/**
 * Desactiva el gola del módulo: quita las tiras, restaura frentes y
 * regenera los tiradores.
 * - Con `meta` (persistido por app.js al activar): restaura alturas/pos_z
 *   originales exactos.
 * - Sin `meta` (fallback): reescalado proporcional para llenar el span
 *   actual con drawerFrontGap.
 */
export function removeGola(pieces, moduleId, userConfig = {}, meta = null) {
  const cfg = getGolaCfg(userConfig);
  const drawerFrontGap = Number(userConfig?.drawerFrontGap) >= 0
    ? Number(userConfig.drawerFrontGap)
    : 2.5;
  const modId = String(moduleId);
  const prefijo = stripPrefix(modId);
  const unidades = drawerUnits(pieces, modId);

  let base = (pieces || []).filter((p) => !String(p.id).startsWith(prefijo));
  const alturaPorFrente = new Map();
  const topPorFrente = new Map();

  if (meta && meta.origHeights && meta.origTops) {
    for (const [id, h] of Object.entries(meta.origHeights)) alturaPorFrente.set(id, h);
    for (const [id, z] of Object.entries(meta.origTops)) topPorFrente.set(id, z);
  } else if (unidades.length) {
    // Fallback proporcional: llenar el span ocupado actual con drawerFrontGap.
    const bottom = unidades[0].minZ;
    const techoActual = Math.max(...unidades.flatMap((u) =>
      u.frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0))));
    const span = Math.max(0, techoActual - bottom);
    const N = unidades.length;
    const disponible = span - (N - 1) * drawerFrontGap;
    if (disponible > 0) {
      const orig = unidades.map((u) => Math.max(...u.frentes.map((f) => Number(f.alto) || 0)));
      if (orig.some((h) => h > 0)) {
        // Mismo reparto que applyGola: zapateras fijas en su altura de tipo,
        // cajones con piso (cada frente ≥ su caja) repartiendo el aire.
        const pisos = unidades.map((u) => (u.latAltoCaja != null ? u.latAltoCaja + 10 : 30));
        const fijas = unidades.map(esUnidadFijaGola);
        const sumFijas = fijas.reduce((s, f, i) => s + (f ? orig[i] : 0), 0);
        const alturas = orig.slice();
        const idxMoviles = unidades.map((_, i) => i).filter((i) => !fijas[i]);
        if (idxMoviles.length && disponible - sumFijas > 0) {
          const repartidas = reparteConPiso(
            idxMoviles.map((i) => orig[i]),
            idxMoviles.map((i) => pisos[i]),
            disponible - sumFijas,
          );
          idxMoviles.forEach((i, k) => { alturas[i] = repartidas[k]; });
        }
        let cursor = bottom;
        for (let i = 0; i < N; i++) {
          for (const f of unidades[i].frentes) {
            alturaPorFrente.set(String(f.id), alturas[i]);
            topPorFrente.set(String(f.id), redondea1(cursor));
          }
          cursor += alturas[i] + drawerFrontGap;
        }
      }
    }
  }

  if (alturaPorFrente.size) {
    base = base.map((p) => {
      const id = String(p.id);
      if (!alturaPorFrente.has(id)) return p;
      return {
        ...p,
        alto: alturaPorFrente.get(id),
        pos_z: topPorFrente.has(id) ? topPorFrente.get(id) : p.pos_z,
      };
    });
  }

  const unidadesRestauradas = drawerUnits(base, modId);
  const tiradores = regenerarTiradores(base, modId, unidadesRestauradas);
  return { ok: true, pieces: [...base, ...tiradores], warnings: [] };
}

/**
 * Validaciones del estado gola aplicado: frente cubre su caja, tiras dentro
 * del vano, sin solapes frente↔tira, Σaᵢ' + (N−1)·G ≈ H_new (±2 mm, salvo
 * cap) y extensiones ≤ cap. Devuelve { errors, warnings }.
 */
export function validateGola(pieces, moduleId, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const errors = [];
  const warnings = [];
  const modId = String(moduleId);
  const unidades = drawerUnits(pieces, modId);
  if (!unidades.length) {
    return { errors: [`El módulo ${modId} no tiene cajones`], warnings };
  }
  const casco = cascoDims(pieces, modId);
  const techoInterior = casco ? casco.techoInterior : Infinity;
  const N = unidades.length;
  // Gap entre frentes = paso + perfil + paso (canal centrado).
  const G = cfg.golaPaso + cfg.golaPerfilHeight + cfg.golaPaso;

  // Frente cubre su caja (aᵢ' ≥ altoLateral + 10) y unidades ordenadas.
  for (const u of unidades) {
    const altoFrente = Math.max(...u.frentes.map((f) => Number(f.alto) || 0));
    if (u.latAltoCaja != null && altoFrente < u.latAltoCaja + 10) {
      errors.push(
        `Gola: el frente "${u.frentes[0].nombre}" (${altoFrente} mm) no cubre su caja (lateral ${u.latAltoCaja} mm).`
      );
    }
  }
  for (let i = 1; i < N; i++) {
    if (unidades[i].minZ <= unidades[i - 1].minZ) {
      errors.push('Gola: las posiciones de los frentes no son monótonas crecientes.');
      break;
    }
  }

  // Piezas del canal: dentro del vano y sin solape con frentes. La regla
  // del paso (gap = paso + cuerpo + paso) se verifica sobre el FONDO del
  // canal; las pestañas viven dentro del cuerpo del gap.
  const tiras = (pieces || []).filter((p) => esTiraGola(p) && perteneceAModulo(p, modId));
  const frentes = unidades.flatMap((u) => u.frentes);
  tiras.forEach((t) => {
    const z = Number(t.pos_z);
    // Las pestañas son horizontales: su 'alto' es la PROFUNDIDAD; su altura
    // vertical es el espesor (15).
    const esPestana = /-pestana(-sup|-inf)?$/.test(String(t.id));
    const altoZ = esPestana ? (Number(t.espesor) || 15) : (Number(t.alto) || 0);
    if (!(z >= 0) || z + altoZ > techoInterior + 0.5) {
      errors.push(`Gola: la pieza "${t.id}" queda fuera del vano (z=${z}, alto=${altoZ}).`);
    }
    // El canal L queda parcialmente TAPADO por el frente superior a propósito
    // (tapa la pestaña inferior): no es solape, es el mecanismo.
    if (!/gola-l\d+-/.test(String(t.id))) {
      for (const f of frentes) {
        const fz = Number(f.pos_z);
        const fh = Number(f.alto) || 0;
        if (z < fz + fh - 0.5 && fz < z + altoZ - 0.5) {
          errors.push(`Gola: la pieza "${t.id}" se solapa con el frente "${f.nombre}".`);
        }
      }
    }
    if (!String(t.id).endsWith('-fondo')) return; // pestañas: dentro del canal
    const paso = cfg.golaPaso;
    const inferior = frentes.find((f) => Math.abs(Number(f.pos_z) + (Number(f.alto) || 0) - (z - paso)) <= 1.5);
    const superior = frentes.find((f) => Math.abs(Number(f.pos_z) - (z + altoZ + paso)) <= 1.5);
    if (!inferior || !superior) {
      warnings.push(`Gola: el fondo de canal "${t.id}" debe quedar centrado en el gap con ${paso} mm de paso arriba y abajo respecto de los frentes.`);
    }
  });

  // Ergonomía de la abertura útil de agarre (hueco libre real para los
  // dedos, no la altura exterior del canal), por tipo de canal presente.
  const tiposCanal = new Set(tiras.map((t) => (/gola-c\d+-/.test(String(t.id)) ? 'C' : 'L')));
  for (const tipo of tiposCanal) {
    const ab = aberturaCanalGola(tipo, cfg);
    if (ab.aberturaUtilMm < cfg.golaMinAperturaUtil) {
      warnings.push(
        `Gola: la abertura útil de agarre del canal ${tipo} (${ab.aberturaUtilMm} mm) es menor que el mínimo ergonómico configurado (${cfg.golaMinAperturaUtil} mm).`
      );
    }
  }

  // Interferencia en profundidad (eje Y; y=0 en el fondo del casco y +y hacia
  // el frente, misma referencia que drawerGeometry/golaGeometry). La tira va
  // retranqueada detrás del plano de frentes (yFace = moduleD − espesor +
  // drawerGap 15) y se extiende golaStripDepth hacia el fondo. Las cajas
  // ocupan aprox. [espesor, moduleD − espesor − 10] (profundidad de caja =
  // moduleD − 2·espesor − 10). Como ambos rangos se solapan casi siempre, el
  // chequeo útil es que la tira no sobresalga por detrás de las cajas ni
  // quede retranqueada hasta detrás del plano interior del fondo.
  const DRAWER_GAP_REF = 15;
  const TOLERANCIA_PROF = 1;
  if (tiras.length && casco && casco.profundidad > 0) {
    const yTira = casco.profundidad - casco.espesor + DRAWER_GAP_REF - cfg.golaStripSetback;
    const yTraseroTira = yTira - cfg.golaStripDepth;
    if (yTira < casco.espesor) {
      errors.push(
        `Gola: retranqueo excesivo (golaStripSetback ${cfg.golaStripSetback} mm): la tira quedaría detrás del plano interior del fondo (frente de tira a ${Math.round(yTira)} mm < espesor ${casco.espesor} mm).`
      );
    } else if (yTraseroTira < casco.espesor - TOLERANCIA_PROF) {
      errors.push(
        `Gola: la tira sobresale por detrás de las cajas (golaStripDepth ${cfg.golaStripDepth} mm en módulo de ${casco.profundidad} mm de fondo: trasero de tira a ${Math.round(yTraseroTira)} mm < espesor ${casco.espesor} mm). Reduzca la profundidad de la tira o aumente el fondo del módulo.`
      );
    }
  }

  // Extensión L del último frente y span total.
  const ultima = unidades[N - 1];
  const altoUltima = Math.max(...ultima.frentes.map((f) => Number(f.alto) || 0));
  const techoUltima = Math.max(...ultima.frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)));
  const extension = ultima.latAltoCaja != null ? altoUltima - ultima.latAltoCaja : 0;
  const capped = extension >= cfg.golaMaxOverhang - 0.5;
  if (extension > cfg.golaMaxOverhang + 0.5) {
    errors.push(
      `Gola: la extensión del frente L (${Math.round(extension)} mm) supera el máximo (${cfg.golaMaxOverhang} mm).`
    );
  }
  if (!capped) {
    const topRef = topRefDe(pieces, modId, techoUltima, techoInterior);
    const bottom = unidades[0].minZ;
    const H_new = topRef - cfg.golaFingerClearance - bottom;
    const suma = unidades.reduce((s, u) => s + Math.max(...u.frentes.map((f) => Number(f.alto) || 0)), 0) + (N - 1) * G;
    if (Math.abs(suma - H_new) > 2) {
      errors.push(
        `Gola: el reparto vertical no cierra (Σ ${Math.round(suma)} mm vs span objetivo ${Math.round(H_new)} mm).`
      );
    }
  }

  // Plan de fijación calculado: soporte trasero exigido cuando la luz del
  // canal supera golaSoporteTraseroDesde y puntos de tornillo a < 10 mm de
  // un borde del fondo (riesgo de astillado).
  if (tiras.length) {
    warnings.push(...fijacionGolaReport(pieces, cfg).warnings);
  }

  return { errors, warnings };
}

// Módulo raíz de una pieza: '11' → '1', '1.2' → '1' (misma convención que
// perteneceAModulo). Sin prefijo numérico, devuelve el módulo tal cual.
function raizDe(modulo) {
  const m = String(modulo || '').trim();
  const match = m.match(/^(\d+)/);
  return match ? match[1] : m;
}

function materialDe(p) {
  const color = String(p?.color || '').trim();
  return color ? `Melamina (${color})` : 'Melamina';
}

// Posiciones Z (mm desde el borde inferior del fondo) de los tornillos de un
// lado: simétricas a GOLA_MARGEN_TORNILLO_MM de cada borde cuando el fondo da
// margen (y separación mínima entre tornillos); con fondo muy bajo, un único
// tornillo centrado.
function posicionesTornilloZ(n, altoFondo) {
  const MARGEN = GOLA_MARGEN_TORNILLO_MM;
  if (n <= 1 || altoFondo < 2 * MARGEN + GOLA_MIN_DIST_BORDE_MM) {
    return [Math.round(altoFondo / 2)];
  }
  const span = altoFondo - 2 * MARGEN;
  return Array.from({ length: n }, (_, i) => Math.round(MARGEN + (span * i) / (n - 1)));
}

// Referencia superior real de un canal L: la repisa anclada en topRef si
// existe; si no, el techo interior del casco (cara inferior de la tapa).
function anclajeSuperiorDe(pieces, raiz, techoUltimoFrente, techoInterior) {
  const topRef = topRefDe(pieces, raiz, techoUltimoFrente, techoInterior);
  const repisa = (pieces || []).find((p) =>
    inferRole(p) === 'shelf'
    && String(p.modulo || '') === String(raiz)
    && Math.abs(Number(p.pos_z) - topRef) <= 0.5);
  if (repisa) {
    return { tipo: 'repisa', id: String(repisa.id), descripcion: `repisa "${repisa.id}" (canto inferior)` };
  }
  return { tipo: 'tapa', id: `m${raiz}-tapa`, descripcion: 'techo interior del casco (cara inferior de la tapa)' };
}

// Agrupa tiras por canal (prefijo m{mod}gola-cN / m{mod}gola-lN).
function agrupaCanales(tiras) {
  const canales = new Map(); // prefijo → {tipo, indice, piezas[]}
  for (const t of tiras) {
    const m = String(t.id).match(/^(.+gola-)(c(\d+)|l(\d+))-(fondo|pestana(-sup|-inf)?)$/);
    if (!m) continue;
    const pref = m[1] + m[2];
    if (!canales.has(pref)) canales.set(pref, { tipo: m[2][0], indice: Number(m[3] || m[4]), piezas: [] });
    canales.get(pref).piezas.push(t);
  }
  return canales;
}

// Export para servicios hermanos (p. ej. golaSectionService): agrupa tiras
// gola por canal sin duplicar la convención de ids.
export { agrupaCanales as agrupaCanalesGola };

/** Plan de fijación calculado de UN canal (su fondo): dónde se atornilla,
 * con qué, a qué elemento de la estructura y con qué precauciones. El fondo
 * se fija a los LATERALES del módulo por sus extremos; en el canal L se
 * indica además el anclaje superior real (repisa o tapa, según topRefDe).
 * Las pestañas van encoladas y atornilladas desde el fondo, fuera de la zona
 * de agarre. Si la luz del canal supera `golaSoporteTraseroDesde`, el plan
 * exige un soporte trasero (listón/contrafuerte) que apoya el fondo por su
 * cara posterior. Mantiene la flexibilidad del taller: todo es información
 * orientativa derivada del cfg (editable global y por módulo).
 *
 * @param {object} piezaFondo pieza `*-fondo` del canal ({id, ancho, alto}).
 * @param {{tipo:'C'|'L', indice:number}} canal identificación del canal.
 * @param {object} cfg cfg gola mergeada (getGolaCfg).
 * @param {object} ctx `{ anclajeSuperior: {tipo, id, descripcion} }` para el
 *        canal L (lo calcula el caller con anclajeSuperiorDe/topRefDe).
 * @returns {object} plan estructurado (anfitrión, tornillos con posiciones,
 *          pestañas, anclajeSuperior, soporteTrasero, warnings).
 */
export function planFijacionCanal(piezaFondo, canal, cfg = GOLA_DEFAULTS, ctx = {}) {
  const c = { ...GOLA_DEFAULTS, ...(cfg || {}) };
  const altoFondo = Number(piezaFondo?.alto) || c.golaPerfilHeight;
  const anchoFondo = Number(piezaFondo?.ancho) || 0;
  const porLado = Math.max(1, Math.round(Number(c.golaTornillosPorPerfil) || 2));
  const posicionZmm = posicionesTornilloZ(porLado, altoFondo);
  const warnings = [];
  for (const z of posicionZmm) {
    const dist = Math.min(z, Math.round((altoFondo - z) * 10) / 10);
    if (dist < GOLA_MIN_DIST_BORDE_MM) {
      warnings.push(
        `Gola: un punto de tornillo del canal "${piezaFondo?.id}" queda a ${dist} mm del borde del fondo (< ${GOLA_MIN_DIST_BORDE_MM} mm): riesgo de astillado; centrar la broca o usar precinto.`
      );
    }
  }
  const umbralSoporte = Number(c.golaSoporteTraseroDesde) || 0;
  const soporteTrasero = umbralSoporte > 0 && anchoFondo >= umbralSoporte
    ? {
      requerido: true,
      pieza: 'Listón/contrafuerte posterior',
      anchoMm: Math.round(anchoFondo),
      tornillos: 2,
      descripcion: `listón de ${Math.round(anchoFondo)} mm apoyado contra la cara posterior del fondo y fijado a los laterales (2 tornillos ${GOLA_TORNILLO_FIJACION})`,
    }
    : null;
  if (soporteTrasero) {
    warnings.push(
      `Gola: la luz del canal "${piezaFondo?.id}" (${Math.round(anchoFondo)} mm) supera golaSoporteTraseroDesde (${umbralSoporte} mm): prever soporte trasero en la cara posterior del fondo.`
    );
  }
  const esL = canal?.tipo === 'L';
  return {
    canalId: String(piezaFondo?.id || '').replace(/-fondo$/, ''),
    tipo: esL ? 'L' : 'C',
    indice: canal?.indice ?? null,
    anfitrion: {
      tipo: 'laterales',
      descripcion: 'laterales del módulo (sus extremos se apoyan en las caras interiores)',
    },
    anclajeSuperior: esL
      ? (ctx?.anclajeSuperior || { tipo: 'tapa', id: null, descripcion: 'techo interior del casco' })
      : null,
    tornillos: {
      porLado,
      total: porLado * 2,
      diametro: GOLA_TORNILLO_FIJACION,
      broca: GOLA_BROCA_FIJACION,
      posicionZmm,
      posicionYmm: c.golaStripSetback,
      precaucion: 'Perforar desde el fondo del canal hacia el lateral (a travío de sus 15 mm de espesor); no perforar la cara visible del lateral.',
    },
    pestanas: {
      metodo: `Encolado + tornillos ${GOLA_TORNILLO_FIJACION} desde el fondo`,
      tornillosPorPestana: 2,
      precaucion: 'Atornillar por la cara posterior del fondo, fuera de la zona de agarre de los dedos.',
    },
    soporteTrasero,
    warnings,
  };
}

/** Texto compacto del plan de fijación para el manual (una línea por canal). */
export function resumenPlanFijacion(plan) {
  if (!plan) return '';
  const t = plan.tornillos;
  const partes = [
    `Fondo: ${t.porLado}×${t.diametro} por lado (${t.total} total) a ${t.posicionZmm.join(' y ')} mm del borde inferior, broca ${t.broca}, en Y a ${t.posicionYmm} mm del plano de frentes`,
    `anfitrión: ${plan.anfitrion.descripcion}`,
  ];
  if (plan.anclajeSuperior) partes.push(`anclaje superior: ${plan.anclajeSuperior.descripcion}`);
  partes.push(`pestañas: ${plan.pestanas.metodo} (evitar la zona de agarre)`);
  if (plan.soporteTrasero) partes.push(`soporte trasero: ${plan.soporteTrasero.descripcion}`);
  partes.push(`Precaución: ${t.precaucion}`);
  return partes.join(' · ');
}

/** Planes de fijación de TODOS los canales gola presentes en `pieces`,
 * agrupados por módulo raíz, con los warnings asociados (soporte trasero
 * exigido, tornillo cerca de un borde). Servicio puro: alimenta validateGola,
 * golaReport y el BOM de herrajes (hardware.js).
 *
 * @returns {{planes: object[], warnings: string[]}}
 */
export function fijacionGolaReport(pieces, userConfig = {}) {
  const cfg = getGolaCfg(userConfig);
  const lista = pieces || [];
  const tiras = lista.filter(esTiraGola);
  const porRaiz = new Map();
  for (const t of tiras) {
    const raiz = raizDe(t.modulo);
    if (!porRaiz.has(raiz)) porRaiz.set(raiz, []);
    porRaiz.get(raiz).push(t);
  }
  const planes = [];
  const warnings = [];
  for (const [raiz, ts] of porRaiz) {
    const unidades = drawerUnits(lista, raiz);
    const casco = cascoDims(lista, raiz);
    const techoInterior = casco ? casco.techoInterior : Infinity;
    const techoUlt = unidades.length
      ? Math.max(...unidades[unidades.length - 1].frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)))
      : 0;
    const anclajeL = anclajeSuperiorDe(lista, raiz, techoUlt, techoInterior);
    const canales = agrupaCanales(ts);
    const ordenados = [...canales.entries()].sort((a, b) => a[1].indice - b[1].indice);
    for (const [, canal] of ordenados) {
      const fondo = canal.piezas.find((p) => String(p.id).endsWith('-fondo'));
      if (!fondo) continue;
      const plan = planFijacionCanal(
        fondo,
        { tipo: canal.tipo === 'c' ? 'C' : 'L', indice: canal.indice },
        cfg,
        canal.tipo === 'l' ? { anclajeSuperior: anclajeL } : {},
      );
      planes.push(plan);
      warnings.push(...plan.warnings);
    }
  }
  return { planes, warnings };
}

/**
 * Reporte de perfiles gola para el manual de ensamblaje: una fila por tira
 * (ubicación relativa a los frentes, longitud de corte, material, fijación)
 * más una fila por frente L (el de la unidad superior del módulo recibe la
 * L-gola por construcción de applyGola; ids adicionales pueden pasarse en
 * opts.lFrontIds, p. ej. desde el meta persistido por app.js). La fila del
 * fondo de cada canal incluye además el plan de fijación calculado
 * (`fijacionPlan` estructurado + `fijacionPlanTxt` para el manual).
 *
 * @returns {Array<{id:string, ubicacion:string, corteMm:number, cantidad:number, material:string, fijacion:string,
 *          fijacionPlan:object|null, fijacionPlanTxt:string,
 *          abertura:{tipo:string, alturaExteriorMm:number, aberturaUtilMm:number, profundidadEntradaMm:number}|null}>}
 *          [] cuando no hay tiras ni frentes L declarados. `abertura` solo
 *          viene en la fila del fondo de cada canal (resume al canal entero).
 */
export function golaReport(pieces, userConfig = {}, opts = {}) {
  const cfg = getGolaCfg(userConfig);
  const lista = pieces || [];
  const tiras = lista.filter(esTiraGola);
  const lFrontIds = new Set((opts.lFrontIds || []).map(String));
  const porId = new Map(lista.map((p) => [String(p.id), p]));
  const raices = new Set(tiras.map((t) => String(t.modulo)));
  for (const id of lFrontIds) {
    const p = porId.get(id);
    if (p) raices.add(raizDe(p.modulo));
  }
  if (!raices.size) return [];

  // Anclaje superior real (repisa o tapa) por módulo raíz, para el canal L.
  const anclajePorRaiz = new Map();
  for (const raiz of raices) {
    const unidades = drawerUnits(lista, raiz);
    const casco = cascoDims(lista, raiz);
    const techoInterior = casco ? casco.techoInterior : Infinity;
    const techoUlt = unidades.length
      ? Math.max(...unidades[unidades.length - 1].frentes.map((f) => Number(f.pos_z) + (Number(f.alto) || 0)))
      : 0;
    anclajePorRaiz.set(raiz, anclajeSuperiorDe(lista, raiz, techoUlt, techoInterior));
  }

  // Filas por PIEZA de canal (fondo / pestañas), agrupadas por canal C o L.
  const rows = [];
  for (const raiz of raices) {
    const canales = agrupaCanales(tiras.filter((t2) => String(t2.modulo) === raiz));
    const ordenados = [...canales.entries()].sort((a, b) => a[1].indice - b[1].indice);
    for (const [pref, canal] of ordenados) {
      const base = canal.tipo === 'c'
        ? `Canal C ${canal.indice} (entre cajones)`
        : 'Canal L (bajo la repisa)';
      const abertura = aberturaCanalGola(canal.tipo === 'c' ? 'C' : 'L', cfg);
      canal.piezas
        .slice()
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .forEach((t) => {
          const rol = String(t.id).slice(pref.length + 1);
          const esFondo = rol === 'fondo';
          const plan = esFondo
            ? planFijacionCanal(
              t,
              { tipo: canal.tipo === 'c' ? 'C' : 'L', indice: canal.indice },
              cfg,
              canal.tipo === 'l' ? { anclajeSuperior: anclajePorRaiz.get(raiz) } : {},
            )
            : null;
          rows.push({
            id: String(t.id),
            ubicacion: `${base} — ${rol}`,
            corteMm: Math.round(Number(t.ancho) || 0),
            altoMm: Math.round(Number(t.alto) || 0),
            cantidad: Math.max(1, Math.round(Number(t.cantidad) || 1)),
            material: materialDe(t),
            fijacion: esFondo ? cfg.golaFijacion : 'Encolado/atornillado al fondo de canal',
            fijacionPlan: plan,
            fijacionPlanTxt: plan ? resumenPlanFijacion(plan) : '',
            abertura: esFondo ? abertura : null,
          });
        });
    }
  }
  return rows;
}

