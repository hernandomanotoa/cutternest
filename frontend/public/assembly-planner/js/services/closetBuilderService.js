// js/services/closetBuilderService.js — Constructor puro de piezas de closet
// abierto. Port de la geometria de scripts/lib/cajonModel.mjs (fuente del
// generador offline) devolviendo OBJETOS PIEZA (shape de csvParser.js), no
// strings CSV. Sin DOM (regla de oro: logica de negocio puro en services/).
// Todas las funciones devuelven { ok: true, pieces } o { ok: false, errors }
// y nunca lanzan: la vista muestra los errors en un toast.

import { RAIL_SIDE_HEIGHT } from '../core/contentTypes.js';

const ESPESORES_VALIDOS = [15, 18, 25];
const HOLGURA_CORREDERA = 12.7; // mm por lado (RAIL_TYPES.telescopica)
const CAJA_MAS_BAJA_QUE_FRENTE = 30; // la caja queda 30 mm mas baja que el frente
const LUZ_PARA_REFUERZO = 600; // repisas con luz >= 600 llevan refuerzo de 100 mm
                               // (el parser exige soporte a partir de 600 mm)

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateColor(color, errors, field = 'color') {
  if (color == null) return null;
  const value = String(color).trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
    errors.push(`${field}: color invalido "${value}" (esperado #RRGGBB)`);
    return null;
  }
  return value;
}

function validateDimension(value, nombre, errors, { min = 1 } = {}) {
  if (!isFiniteNumber(value)) {
    errors.push(`${nombre}: debe ser un numero`);
    return false;
  }
  if (value < min) {
    errors.push(`${nombre}: debe ser >= ${min} mm (recibido ${value})`);
    return false;
  }
  return true;
}

function validateEspesor(value, errors) {
  if (!ESPESORES_VALIDOS.includes(value)) {
    errors.push(`espesor: debe ser uno de ${ESPESORES_VALIDOS.join('/') } mm (recibido ${value})`);
    return false;
  }
  return true;
}

// El shape de pieza del store usa rotate BOOLEANO (validatePiece de
// csvParser.js lo normaliza a boolean); 'si'/true → true, resto → false.
function piece(id, nombre, ancho, alto, opts = {}) {
  return {
    id,
    nombre,
    ancho,
    alto,
    cantidad: 1,
    rotate: opts.rotate === true || opts.rotate === 'si',
    color: opts.color || '#C19A6B',
    espesor: opts.espesor ?? 15,
    cantos: opts.cantos || '',
    modulo: opts.modulo,
    ...(opts.pos_z != null ? { pos_z: opts.pos_z } : {}),
  };
}

// ── Módulo (casco) ────────────────────────────────────────────────

// Casco completo: base + tapa + 2 laterales + fondo (modelo
// baseTapaLateralesFondo de cajonModel.mjs). Las piezas interiores
// (repisas/cajones) usan el ancho util = ancho - 2*espesor.
// `baseInterna: true` genera la base de ancho/prof internos (ancho−2E ×
// prof−2E): el renderer (classifyTopBottomMount → 'internal') la apoya
// sobre el zocalo (bottomPanelOffset = altura del zocalo) en vez de en el
// suelo — modelo zocalo-cajon del catalogo (cascoZocaloCajon). Usar SOLO
// cuando el modulo lleva zocalo.
// `alturaZocalo` (con baseInterna) descuenta el zócalo del fondo: el alto
// del mueble es FIJO (incluye el zócalo) y el fondo se apoya sobre la base
// interior, sin invadir la zona del zócalo.
export function createModule({ ancho, alto, prof, espesor = 15, colorCuerpo = '#C19A6B', modulo, baseInterna = false, alturaZocalo = 0 }) {
  const errors = [];
  validateDimension(ancho, 'ancho', errors, { min: 100 });
  validateDimension(alto, 'alto', errors, { min: 100 });
  validateDimension(prof, 'prof', errors, { min: 100 });
  validateEspesor(espesor, errors);
  const color = validateColor(colorCuerpo, errors, 'colorCuerpo');
  if (!modulo) errors.push('modulo: es requerido');
  if (errors.length) return { ok: false, errors };

  const E = espesor;
  const baseW = baseInterna ? ancho - 2 * E : ancho;
  // Base con zócalo: entre laterales (ancho−2E) y hasta la pared (prof−E,
  // 'front_flush': trasero contra el fondo/zócalo-trasero, sellando el
  // cajón del zócalo por arriba; el frente queda oculto tras el retraso).
  const baseD = baseInterna ? prof - E : prof;
  // Fondo: embutido (alto − 2E); con zócalo se descuenta además la zona del
  // zócalo para apoyarse sobre la base interior (altura total fija).
  const plinthDrop = baseInterna ? Math.max(0, Number(alturaZocalo) || 0) : 0;
  const fondoH = Math.max(100, alto - 2 * E - plinthDrop);
  const pieces = [
    piece(`m${modulo}-base`, `Base modulo M${modulo}`, baseW, baseD, { rotate: 'si', color, espesor: E, cantos: 'T,B,L,R', modulo }),
    piece(`m${modulo}-tapa`, `Tapa modulo M${modulo}`, ancho, prof, { rotate: 'si', color, espesor: E, cantos: 'T,B,L,R', modulo }),
    piece(`m${modulo}-lateral-izq`, `Lateral izquierdo M${modulo}`, prof, alto, { color, espesor: E, cantos: 'T,B,L', modulo }),
    piece(`m${modulo}-lateral-der`, `Lateral derecho M${modulo}`, prof, alto, { color, espesor: E, cantos: 'T,B,R', modulo }),
    piece(`m${modulo}-fondo`, `Fondo modulo M${modulo}`, ancho - 2 * E, fondoH, { color: '#F2F2F2', espesor: E, cantos: '', modulo }),
  ];
  return { ok: true, pieces, interiorWidth: ancho - 2 * E, interiorDepth: prof - 2 * E };
}

// Zócalo frontal INTERNO (embutido entre laterales): frente de
// ancho - 2*espesor. El renderer lo clasifica 'plinth' con montaje
// 'internal' (classifyPlinthMount) igual que zocaloModulo().
export function addZocalo(moduleId, { ancho, alto = 150, espesor = 15, color = '#C19A6B' }) {
  const errors = [];
  validateDimension(ancho, 'ancho', errors, { min: 100 });
  validateDimension(alto, 'alto', errors, { min: 50 });
  const c = validateColor(color, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pieces: [
      piece(`m${moduleId}-zocalo`, `Zocalo M${moduleId}`, ancho - 2 * espesor, alto, { rotate: 'si', color: c, espesor, cantos: 'T,B,L,R', modulo: moduleId }),
    ],
  };
}

// Repisa/entrepaño interior. Luz = anchoUtil; si la luz es >= 600 mm se
// agrega refuerzo interior de 100 mm (el parser exige soporte intermedio a
// partir de 600 mm de luz con espesor <= 15, ver validatePiece de csvParser).
export function addShelf(moduleId, { anchoUtil, profReal, espesor = 15, color = '#D9C2A3', index = 1 }) {
  const errors = [];
  validateDimension(anchoUtil, 'anchoUtil', errors, { min: 50 });
  validateDimension(profReal, 'profReal', errors, { min: 50 });
  const c = validateColor(color, errors);
  if (errors.length) return { ok: false, errors };

  const pieces = [
    piece(`m${moduleId}-repisa-${index}`, `Repisa ${index} M${moduleId}`, anchoUtil, profReal, { rotate: 'si', color: c, espesor, cantos: 'T,B,L,R', modulo: moduleId }),
  ];
  if (anchoUtil >= LUZ_PARA_REFUERZO) {
    pieces.push(piece(`m${moduleId}-refuerzo-repisa-${index}`, `Refuerzo repisa ${index} M${moduleId}`, anchoUtil, 100, { rotate: 'si', color: c, espesor, cantos: 'T,B,L,R', modulo: moduleId }));
  }
  return { ok: true, pieces, conRefuerzo: anchoUtil >= LUZ_PARA_REFUERZO };
}

// Barra colgadora (riel). index numera la barra dentro del modulo.
export function addHangerRail(moduleId, { anchoUtil, index = 1, color = '#A0A0A0', pos_z = null } = {}) {
  const errors = [];
  validateDimension(anchoUtil, 'anchoUtil', errors, { min: 50 });
  const c = validateColor(color, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pieces: [
      piece(`m${moduleId}-barra-${index}`, `Barra colgadora ${index} M${moduleId}`, anchoUtil, 25, { rotate: 'si', color: c, espesor: 25, cantos: '', modulo: moduleId, ...(pos_z != null ? { pos_z } : {}) }),
    ],
  };
}

// Doble colgado: barra alta (pos_z 2100, colgado corto) + barra baja
// (pos_z 1000). pos_z ancla explicitamente la barra (columna 11 del CSV).
export function addDoubleRail(moduleId, { anchoUtil, index = 1, color = '#A0A0A0' } = {}) {
  const errors = [];
  validateDimension(anchoUtil, 'anchoUtil', errors, { min: 50 });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pieces: [
      piece(`m${moduleId}-barra-alta-${index}`, `Barra alta ${index} M${moduleId}`, anchoUtil, 25, { rotate: 'si', color: validateColor(color, errors) || '#A0A0A0', espesor: 25, cantos: '', modulo: moduleId, pos_z: 2100 }),
      piece(`m${moduleId}-barra-baja-${index}`, `Barra baja ${index} M${moduleId}`, anchoUtil, 25, { rotate: 'si', color: validateColor(color, errors) || '#A0A0A0', espesor: 25, cantos: '', modulo: moduleId, pos_z: 1000 }),
    ],
  };
}

// Duplica las piezas de un modulo (casco + contenido + submodulos) con un
// id de modulo nuevo. Renombra ids y modulos aplicando el prefijo
// m{old}→m{new} (submodulos '11'→'22' incluidos). Puro: el caller fija el
// id destino con nextModuleId().
export function duplicateModulePieces(pieces, moduleId, newModuleId) {
  const oldPref = `m${moduleId}`;
  const newPref = `m${newModuleId}`;
  const renames = [];
  for (const p of pieces || []) {
    const mod = String(p?.modulo || '');
    const esDelModulo = mod === String(moduleId)
      || (/^\d+$/.test(moduleId) && (mod.startsWith(String(moduleId)) || mod.startsWith(`${moduleId}.`)));
    if (!esDelModulo) continue;
    const nuevoModulo = mod.split('.').length > 1
      ? mod.replace(/^\d+/, String(newModuleId))
      : String(newModuleId) + mod.slice(String(moduleId).length);
    let nuevoId = String(p.id);
    if (nuevoId.startsWith(oldPref)) nuevoId = newPref + nuevoId.slice(oldPref.length);
    renames.push([String(p.id), nuevoId]);
  }
  const idMap = new Map(renames);
  const resultado = [];
  for (const p of pieces || []) {
    if (!idMap.has(String(p.id))) continue;
    resultado.push({ ...p, id: idMap.get(String(p.id)), modulo: moduloDestino(p, moduleId, newModuleId) });
  }
  return resultado;
}

function moduloDestino(pieceObj, moduleId, newModuleId) {
  const mod = String(pieceObj.modulo || '');
  if (mod === String(moduleId)) return String(newModuleId);
  // Submodulo concatenado ('11') o dotted ('1.2').
  return String(newModuleId) + mod.slice(String(moduleId).length);
}

// ── Cajón / zapatera ──────────────────────────────────────────────

// Port de cajon() de cajonModel.mjs (mismas formulas y vocabulario):
// frente + 2 laterales + base + fondo + cara + tirador. La caja queda
// CAJA_MAS_BAJA_QUE_FRENTE mm mas baja que el frente y la corredera
// telescopica descuenta HOLGURA_CORREDERA por lado. Las piezas de la
// caja viven en el submodulo `${moduleId}${index}` (concatenacion numerica,
// misma convencion que los ejemplos del catalogo; '1.2'-style tambien lo
// soporta moduleService pero el validador de torres lo trata como modulo
// independiente) para que moduleService.describeSubmodule las etiquete
// "Cajon 1"/"Zapatera 2".
export function addDrawer(moduleId, index, {
  anchoModulo,
  profundidadModulo,
  altoVano,
  tipo = 'corredera',
  vocabulario = 'cajon',
  colorFrente = '#8B5A2B',
  colorLateral = '#D9C2A3',
  nPorFila = 1,
  altBandeja = 150,
  espesorFrente = 15,
}) {
  const errors = [];
  validateDimension(anchoModulo, 'anchoModulo', errors, { min: 100 });
  validateDimension(profundidadModulo, 'profundidadModulo', errors, { min: 100 });
  validateDimension(altoVano, 'altoVano', errors, { min: 50 });
  if (!['corredera', 'volquete'].includes(tipo)) errors.push(`tipo: "${tipo}" no soportado (corredera|volquete)`);
  if (!['cajon', 'zapatera'].includes(vocabulario)) errors.push(`vocabulario: "${vocabulario}" no soportado (cajon|zapatera)`);
  const cf = validateColor(colorFrente, errors, 'colorFrente');
  const cl = validateColor(colorLateral, errors, 'colorLateral');
  if (errors.length) return { ok: false, errors };

  const E = 15; // espesor laterales/fondo del MODULO (mismo modelo que cajonModel)
  const ESP_LAT = 15;
  const ESP_BASE = 15;
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho = nPorFila === 1 ? W - 2 : Math.floor((W - (nPorFila - 1) * 3) / nPorFila) - 1;
  const frenteAlto = altoVano - 3;
  const volquete = tipo === 'volquete';
  const profCajon = D - (volquete ? 15 : 25);
  const latAlto = volquete
    ? Math.min(frenteAlto - 2 * ESP_BASE, altBandeja)
    : frenteAlto - 2 * ESP_BASE;
  const interior = volquete
    ? frenteAncho - 2 * ESP_LAT
    : Math.round((nPorFila === 1 ? W : frenteAncho + 2) - 2 * HOLGURA_CORREDERA) - 2 * ESP_LAT;

  if (interior <= 0) {
    return { ok: false, errors: [`cajon: vano de ${anchoModulo} mm demasiado estrecho para ${nPorFila} cajon/cajones`] };
  }

  const sub = `${moduleId}${index}`;
  const esZapatera = vocabulario === 'zapatera';
  const frenteVocab = esZapatera ? 'zapatera extraible' : `cajon${volquete ? ' abatible' : ''}`;
  const vocab = esZapatera ? 'zapatera extraible' : 'cajon';
  const idp = esZapatera ? 'zapatera' : 'cajon';
  const ladoIzq = esZapatera ? ' izq' : '';
  const ladoDer = esZapatera ? ' der' : '';

  // El indice de insercion va en el nombre para distinguir frentes en la
  // tabla de offsets y en el manual (antes todos decian "Frente cajon M1").
  const num = ` ${index}`;
  const pieces = [
    piece(`m${moduleId}${idp}${index}-frente`, `Frente ${frenteVocab}${num} M${moduleId}`, frenteAncho, frenteAlto, { rotate: 'si', color: cf, espesor: espesorFrente, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-izq`, `Lateral ${vocab}${num}${ladoIzq} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,L', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-der`, `Lateral ${vocab}${num}${ladoDer} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-fondo`, `Fondo ${vocab}${num} M${moduleId}`, interior, latAlto - ESP_BASE, { color: '#F2F2F2', espesor: 15, cantos: '', modulo: sub }),
  ];
  if (!volquete) {
    pieces.push(piece(`m${moduleId}${idp}${index}-cara`, `Cara ${vocab}${num} M${moduleId}`, interior, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    piece(`m${moduleId}${idp}${index}-base`, `Base ${vocab}${num} M${moduleId}`, interior, profCajon, { rotate: 'si', color: cl, espesor: ESP_BASE, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-tirador`, `Tirador ${vocab}${num} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }),
  );
  return { ok: true, pieces, submodulo: sub, frente: { ancho: frenteAncho, alto: frenteAlto } };
}

// ── Utilidades ────────────────────────────────────────────────────

// Raices de modulos: ids de modulo que NO son submodulos de otro. Soporta
// ambas convenciones: concatenada ('11' es hijo de '1') y dotted ('1.2' de
// '1'). Los globales ('estructura'/'global') quedan fuera.
export function rootModuleIds(pieces) {
  const mods = new Set();
  for (const p of pieces || []) {
    const mod = String(p?.modulo || '').trim();
    if (!mod || mod === 'estructura' || mod === 'global') continue;
    mods.add(mod);
  }
  const roots = new Set();
  for (const m of mods) {
    if (m.includes('.')) {
      // Dotted: hijo si su raiz existe; si es huerfano, se trata como raiz.
      const head = m.split('.')[0];
      if (mods.has(head)) continue;
      roots.add(head);
      continue;
    }
    // Concatenado: hijo si OTRO modulo numerico es prefijo suyo ('1' de '11').
    let esHijo = false;
    for (const other of mods) {
      if (other !== m && /^\d+$/.test(other) && m.startsWith(other)) { esHijo = true; break; }
    }
    if (!esHijo) roots.add(m);
  }
  return roots;
}

// Bandeja zapatera extraíble: laterales BAJOS que solo cubren la riel
// (RAIL_SIDE_HEIGHT, ver js/core/contentTypes.js) para ver y sacar el
// calzado, y frente VARIABLE:
//   - frenteCompleto=false (planos/tenis/tacones): frente bajo + cara
//     (frente interior) + gaps de apilado, como el cajón.
//   - frenteCompleto=true (botas): el frente cubre todo el vano y va SIN
//     cara ni gaps: se integra a la bandeja y cierra la abertura entera.
// Mismas fórmulas de vano/corredera que addDrawer (W, holgura 12.7 mm/lado).
export function addShoeTray(moduleId, index, {
  anchoModulo,
  profundidadModulo,
  altoVano,
  frenteCompleto = false,
  altoLateral = RAIL_SIDE_HEIGHT,
  espesorFrente = 15,
  colorFrente = '#8B5A2B',
  colorLateral = '#D9C2A3',
}) {
  const errors = [];
  validateDimension(anchoModulo, 'anchoModulo', errors, { min: 100 });
  validateDimension(profundidadModulo, 'profundidadModulo', errors, { min: 100 });
  validateDimension(altoVano, 'altoVano', errors, { min: 50 });
  validateDimension(altoLateral, 'altoLateral', errors, { min: 40 });
  const cf = validateColor(colorFrente, errors, 'colorFrente');
  const cl = validateColor(colorLateral, errors, 'colorLateral');
  if (errors.length) return { ok: false, errors };

  const E = 15;
  const ESP_LAT = 15;
  const ESP_BASE = 15;
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho = W - 2;
  const frenteAlto = altoVano - 3;
  const profBandeja = D - 25; // corredera telescópica
  const latAlto = Math.min(altoLateral, frenteAlto - 2 * ESP_BASE); // lateral bajo
  const interior = Math.round((W - 2 * HOLGURA_CORREDERA)) - 2 * ESP_LAT;

  if (interior <= 0) {
    return { ok: false, errors: [`zapatera: vano de ${anchoModulo} mm demasiado estrecho`] };
  }

  const sub = `${moduleId}${index}`;
  const num = ` ${index}`;
  const pieces = [
    piece(`m${moduleId}zapatera${index}-frente`, `Frente zapatera extraible${num} M${moduleId}`, frenteAncho, frenteAlto, { rotate: 'si', color: cf, espesor: espesorFrente, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-lateral-izq`, `Lateral zapatera extraible${num} izq M${moduleId}`, profBandeja, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,L', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-lateral-der`, `Lateral zapatera extraible${num} der M${moduleId}`, profBandeja, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,R', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-fondo`, `Fondo zapatera extraible${num} M${moduleId}`, interior, Math.max(20, latAlto - ESP_BASE), { color: '#F2F2F2', espesor: 15, cantos: '', modulo: sub }),
  ];
  if (!frenteCompleto) {
    // Frente bajo: la cara cierra la abertura sobre la bandeja (como cajón).
    pieces.push(piece(`m${moduleId}zapatera${index}-cara`, `Cara zapatera extraible${num} M${moduleId}`, interior, Math.max(20, frenteAlto - 2 * ESP_BASE), { color: cl, espesor: ESP_LAT, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    piece(`m${moduleId}zapatera${index}-base`, `Base zapatera extraible${num} M${moduleId}`, interior, profBandeja, { rotate: 'si', color: cl, espesor: ESP_BASE, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-tirador`, `Tirador zapatera extraible${num} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }),
  );
  return {
    ok: true,
    pieces,
    submodulo: sub,
    frenteCompleto,
    frente: { ancho: frenteAncho, alto: frenteAlto },
  };
}


// Divisor vertical entre bahias (convencion del catalogo: la pieza guarda
// ancho=espesor y alto=alto util; el renderer lo clasifica 'divider' y lo
// dibuja como panel vertical entre repisas). Span completo del vano.
export function addDivider(moduleId, { altoUtil, espesor = 15, color = '#C19A6B', index = 1 } = {}) {
  const errors = [];
  validateDimension(altoUtil, 'altoUtil', errors, { min: 100 });
  const c = validateColor(color, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pieces: [
      piece(`m${moduleId}-divisor-${index}`, `Divisor ${index} M${moduleId}`, espesor, altoUtil, { color: c, espesor, cantos: 'T,B,L,R', modulo: moduleId }),
    ],
  };
}

// Siguiente id de modulo libre: maximo id RAIZ numerico + 1. Los submodulos
// ('11', '1.2') y globales no consumen numeros de modulo.
export function nextModuleId(pieces) {
  let max = 0;
  for (const root of rootModuleIds(pieces)) {
    if (/^\d+$/.test(root)) max = Math.max(max, Number(root));
  }
  return String(max + 1);
}

// Cuenta modulos raiz (para decidir default 'Vista completa' y el resumen).
export function countRootModules(pieces) {
  return rootModuleIds(pieces).size;
}

// Siguiente indice libre de contenido dentro de un modulo (repisa 1, 2...;
// cajon/zapatera 1, 2...; barra; zocalo). Cuenta prefijos de ids existentes
// del mismo modulo; sin coincidencias devuelve 1.
export function nextContentIndex(pieces, moduleId, kind) {
  const prefixes = {
    shelf: `m${moduleId}-repisa-`,
    drawer: `m${moduleId}cajon`,
    shoeRack: `m${moduleId}zapatera`,
    rail: `m${moduleId}-barra-`,
    zocalo: `m${moduleId}-zocalo`,
    divider: `m${moduleId}-divisor-`,
  };
  const prefix = prefixes[kind];
  if (!prefix) return 1;
  let max = 0;
  for (const p of pieces || []) {
    const id = String(p?.id || '');
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length).split('-')[0];
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return max + 1;
}

// Atajo de alto nivel: construye un closet completo desde una config.
// modules: [{ ancho, alto, prof, espesor?, colorCuerpo?, contenido:
// [{ kind: 'zocalo', alto? } | { kind: 'shelf', index? } |
//   { kind: 'drawer', index?, altoVano, tipo?, vocabulario? } |
//   { kind: 'rail', index? }] }]. Los modulos se numeran secuencialmente
// salvo que vengan con moduleId explícito.
export function buildCloset(config) {
  const errors = [];
  const modules = config?.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    return { ok: false, errors: ['buildCloset: config.modules debe ser un array no vacio'] };
  }

  const allPieces = [];
  let autoId = 1;
  modules.forEach((mod, i) => {
    const moduleId = String(mod.moduleId ?? autoId++);
    // Con zocalo en el contenido, la base debe ser INTERNA (apoyada sobre
    // el) igual que addModuleFromBuilder(conZocalo); si no, la base externa
    // quedaria a nivel del suelo pisando el plinth.
    const conZocalo = (mod.contenido || []).some((item) => item.kind === 'zocalo');
    const casco = createModule({
      ancho: mod.ancho, alto: mod.alto, prof: mod.prof,
      espesor: mod.espesor ?? 15, colorCuerpo: mod.colorCuerpo ?? '#C19A6B', modulo: moduleId,
      baseInterna: conZocalo,
    });
    if (!casco.ok) {
      errors.push(...casco.errors.map((e) => `modulo ${i + 1}: ${e}`));
      return;
    }
    allPieces.push(...casco.pieces);
    const interiorW = casco.interiorWidth;
    const interiorD = casco.interiorDepth;

    let shelfIndex = 0;
    let drawerIndex = 0;
    let railIndex = 0;
    for (const item of mod.contenido || []) {
      let result = null;
      if (item.kind === 'zocalo') {
        result = addZocalo(moduleId, { ancho: mod.ancho, alto: item.alto ?? 150, espesor: mod.espesor ?? 15, color: mod.colorCuerpo ?? '#C19A6B' });
      } else if (item.kind === 'shelf') {
        shelfIndex += 1;
        result = addShelf(moduleId, { anchoUtil: interiorW, profReal: interiorD, espesor: mod.espesor ?? 15, index: shelfIndex });
      } else if (item.kind === 'drawer' || item.kind === 'shoeRack') {
        drawerIndex += 1;
        result = addDrawer(moduleId, drawerIndex, {
          anchoModulo: mod.ancho, profundidadModulo: mod.prof, altoVano: item.altoVano ?? 200,
          tipo: item.tipo ?? 'corredera',
          vocabulario: item.kind === 'shoeRack' ? 'zapatera' : (item.vocabulario ?? 'cajon'),
          colorFrente: mod.colorFrente ?? '#8B5A2B', colorLateral: mod.colorCuerpo ?? '#D9C2A3',
        });
      } else if (item.kind === 'rail') {
        railIndex += 1;
        result = addHangerRail(moduleId, { anchoUtil: interiorW, index: railIndex });
      } else {
        errors.push(`modulo ${i + 1}: contenido kind "${item?.kind}" no soportado`);
        continue;
      }
      if (!result.ok) {
        errors.push(...result.errors.map((e) => `modulo ${i + 1}: ${e}`));
        continue;
      }
      allPieces.push(...result.pieces);
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, pieces: allPieces };
}
