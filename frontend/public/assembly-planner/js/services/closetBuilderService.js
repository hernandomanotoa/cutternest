// js/services/closetBuilderService.js — Constructor puro de piezas de closet
// abierto. Port de la geometria de scripts/lib/cajonModel.mjs (fuente del
// generador offline) devolviendo OBJETOS PIEZA (shape de csvParser.js), no
// strings CSV. Sin DOM (regla de oro: logica de negocio puro en services/).
// Todas las funciones devuelven { ok: true, pieces } o { ok: false, errors }
// y nunca lanzan: la vista muestra los errors en un toast.

import { RAIL_SIDE_HEIGHT, BANDEJA_RIM_HEIGHT, stampTipoTag, getContentType, fondoMetodoDeTipo } from '../core/contentTypes.js';
import { DRAWER_GROOVE_DEPTH } from '../core/config.js';

const ESPESORES_VALIDOS = [15, 18, 25];
const HOLGURA_CORREDERA = 12.7; // mm por lado (RAIL_TYPES.telescopica)

// Reglas de descuento según el tipo de riel elegido (definen las medidas
// de la caja del cajón/zapatera). 'catalogo' = convención histórica del
// proyecto (cajonModel); las demás siguen la spec de taller.
export const RIEL_RULES = {
  catalogo: {
    label: 'Catálogo del proyecto (vano − 25,4 mm)',
    holgura: 12.7,        // mm por lado
    fondoMm: (prof, E) => prof - 2 * E - 25, // largo del fondo/laterales
    nota: null,
  },
  telescopica26: {
    label: 'Telescópica balines (vano − 26 mm; fondo = riel, vano +10 mm)',
    holgura: 13,          // 26 mm total, 13 por lado
    fondoMm: (prof, E) => prof - E - 10,     // riel nominal; vano con +10
    nota: 'Telescópica (regla −26): fondo = riel nominal; el vano necesita +10 mm de fondo.',
  },
  oculta: {
    label: 'Oculta bajo cajón (exterior = vano − 42 + 2×grosor; fondo = riel − 10)',
    holgura: null,        // se calcula por fórmula con el grosor del lateral
    fondoMm: (prof, E) => prof - E - 10,     // riel − 10 (marca estándar)
    nota: 'Oculta: exterior = vano − 42 + 2×grosor lateral; rebajo inferior de 12,7 mm y alto máx. = vano − 23 (fijación del herraje).',
  },
  marco: {
    label: 'Marco de aluminio regulable (zapatero de catálogo, sin cajón)',
    holgura: null, fondoMm: null,
    nota: 'Herraje de catálogo: marco de aluminio regulable con rieles ocultos propios; NO se fabrica cajón. Verificar el rango del catálogo para el vano.',
  },
};
const RIEL_DEFAULT = 'catalogo';
function rielRule(riel, espLat) {
  const key = RIEL_RULES[riel] ? riel : RIEL_DEFAULT;
  const rule = RIEL_RULES[key];
  // Oculta: holgura por lado = (42 − 2×grosor lateral) / 2 (exterior = vano − 42 + 2g).
  const holgura = key === 'oculta' ? Math.max(0, (42 - 2 * espLat) / 2) : rule.holgura;
  return { key, rule, holgura };
}
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

// Espesor real del casco de un modulo a partir de sus piezas (el lateral
// primero; si falta, de la tapa o la base). Default 15 mm (catalogo). Es la
// forma de consultar E cuando solo se tienen las piezas (p. ej. al
// regenerar contenido tras editar dimensiones).
export function moduleEspesor(pieces, moduleId) {
  const casco = [`m${moduleId}-lateral-izq`, `m${moduleId}-tapa`, `m${moduleId}-base`];
  for (const id of casco) {
    const p = (pieces || []).find((x) => String(x.id) === id);
    if (p && ESPESORES_VALIDOS.includes(Number(p.espesor))) return Number(p.espesor);
  }
  return 15;
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

// Profundidad efectiva de la ranura, acotada a la mitad del espesor del
// lateral (la fresa nunca atraviesa el panel). DRAWER_GROOVE_DEPTH es la
// medida de taller versionada en core/config.js.
export function grooveDepthEfectivo(grooveDepth, espLat) {
  const pedida = Number(grooveDepth) > 0 ? Number(grooveDepth) : DRAWER_GROOVE_DEPTH;
  return Math.min(pedida, Math.max(1, Math.floor((Number(espLat) || DRAWER_GROOVE_DEPTH) / 2)));
}

// Port de cajon() de cajonModel.mjs (mismas formulas y vocabulario):
// frente + 2 laterales + base + fondo + cara + tirador. La caja queda
// CAJA_MAS_BAJA_QUE_FRENTE mm mas baja que el frente y la corredera
// telescopica descuenta HOLGURA_CORREDERA por lado. Las piezas de la
// caja viven en el submodulo `${moduleId}${index}` (concatenacion numerica,
// misma convencion que los ejemplos del catalogo; '1.2'-style tambien lo
// soporta moduleService pero el validador de torres lo trata como modulo
// independiente) para que moduleService.describeSubmodule las etiquete
// "Cajon 1"/"Zapatera 2".
//
// Método del fondo (opts.fondoMetodo, contrato del tipo):
//   - 'apoyado' (default, retrocompatible): fondo estructural interno a los
//     laterales y a piso (alto = latAlto, par trasero de la cara).
//   - 'ranurado': fondo embutido en ranura corrida fresada en la cara
//     interior de cada lateral (corrida de cara a trasera, a
//     grooveDepthEfectivo mm de profundidad). El fondo se corta MÁS ANCHO
//     (ancho = interior + 2·ranura: los cantos quedan enterrados en la
//     ranura) y MÁS ALTO que el fondo apoyado sobre la base: alto =
//     latAlto − 2·ranura, subiendo hasta ranura mm bajo la cara superior
//     del lateral (igual margen abajo: la fresa sale antes del borde y el
//     fondo esquiva la esquina trasera de la base). La base sigue apoyada
//     como en el método apoyado; frente/cara/tirador no cambian.
// El método efectivo sale de opts.fondoMetodo; si no viene, del tipo
// (opts.tipoId → DRAWER_TYPES/custom types); si tampoco, 'apoyado'.
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
  espesorModulo = 15, // espesor REAL del casco (createModule): la caja descuenta E
  riel = RIEL_DEFAULT,
  frenteLuz = 1,
  tipoId = null, // tag [tipo] en frente/cara: el contrato sobrevive al CSV
  fondoMetodo = null, // 'apoyado' | 'ranurado' | null (null → del tipo)
  grooveDepth = DRAWER_GROOVE_DEPTH,
}) {
  const errors = [];
  validateDimension(anchoModulo, 'anchoModulo', errors, { min: 100 });
  validateDimension(profundidadModulo, 'profundidadModulo', errors, { min: 100 });
  validateDimension(altoVano, 'altoVano', errors, { min: 50 });
  validateEspesor(espesorModulo, errors);
  if (!['corredera', 'volquete'].includes(tipo)) errors.push(`tipo: "${tipo}" no soportado (corredera|volquete)`);
  if (riel === 'marco') errors.push('riel "marco" solo aplica a zapateras (herraje de catálogo)');
  if (!['cajon', 'zapatera'].includes(vocabulario)) errors.push(`vocabulario: "${vocabulario}" no soportado (cajon|zapatera)`);
  const metodoFondo = fondoMetodo ?? (tipoId ? fondoMetodoDeTipo(tipoId) : 'apoyado');
  if (!['apoyado', 'ranurado'].includes(metodoFondo)) {
    errors.push(`fondoMetodo: "${metodoFondo}" no soportado (apoyado|ranurado)`);
  }
  const cf = validateColor(colorFrente, errors, 'colorFrente');
  const cl = validateColor(colorLateral, errors, 'colorLateral');
  if (errors.length) return { ok: false, errors };

  const E = espesorModulo; // espesor del MODULO: W/D y caja descuentan E
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho = nPorFila === 1 ? W - 2 * frenteLuz : Math.floor((W - (nPorFila - 1) * 3) / nPorFila) - 1;
  const frenteAlto = altoVano - 3;
  const volquete = tipo === 'volquete';
  // El tipo de riel define las medidas de la caja (spec del taller).
  const { rule: rielRegla, holgura: rielHolgura } = rielRule(riel, E);
  const profCajon = volquete ? D - 15 : rielRegla.fondoMm(profundidadModulo, E);
  const latAlto = volquete
    ? Math.min(frenteAlto - 2 * E, altBandeja)
    : frenteAlto - 2 * E;
  const interior = volquete
    ? frenteAncho - 2 * E
    : Math.round((nPorFila === 1 ? W : frenteAncho + 2) - 2 * rielHolgura) - 2 * E;

  if (interior <= 0) {
    return { ok: false, errors: [`cajon: vano de ${anchoModulo} mm demasiado estrecho para ${nPorFila} cajon/cajones`] };
  }

  const sub = `${moduleId}${index}`;
  const esZapatera = vocabulario === 'zapatera';
  // Keyword del riel en el nombre del frente: el hardware y el render lo
  // infieren de aquí (railService.inferRailType).
  const rielTag = !volquete && riel === 'oculta' ? ' oculta' : riel === 'telescopica26' ? ' telescopica 26' : '';
  const frenteVocab = `${esZapatera ? 'zapatera extraible' : `cajon${volquete ? ' abatible' : ''}`}${rielTag}`;
  const vocab = esZapatera ? 'zapatera extraible' : 'cajon';
  const idp = esZapatera ? 'zapatera' : 'cajon';
  const ladoIzq = esZapatera ? ' izq' : '';
  const ladoDer = esZapatera ? ' der' : '';

  // El indice de insercion va en el nombre para distinguir frentes en la
  // tabla de offsets y en el manual (antes todos decian "Frente cajon M1").
  const num = ` ${index}`;
  // Fondo: según el método. 'apoyado' (default): estructural, interno a los
  // laterales y a piso (par trasero de la cara). 'ranurado': embutido en
  // ranura corrida — se corta MÁS ANCHO (cantos enterrados ranura mm en
  // cada lateral) y sube hasta ranura mm bajo la cara superior del lateral
  // (alto = lateral − 2·ranura; ver JSDoc del método).
  const ranura = metodoFondo === 'ranurado' && !volquete ? grooveDepthEfectivo(grooveDepth, E) : 0;
  const fondoAncho = interior + 2 * ranura;
  const fondoAlto = Math.max(0, latAlto - 2 * ranura);
  const pieces = [
    piece(`m${moduleId}${idp}${index}-frente`, stampTipoTag(`Frente ${frenteVocab}${num} M${moduleId}`, tipoId), frenteAncho, frenteAlto, { rotate: 'si', color: cf, espesor: espesorFrente, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-izq`, `Lateral ${vocab}${num}${ladoIzq} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: E, cantos: 'T,B,L', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-der`, `Lateral ${vocab}${num}${ladoDer} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: E, cantos: 'T,B,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-fondo`, `Fondo ${vocab}${num} M${moduleId}`, fondoAncho, fondoAlto, { color: '#F2F2F2', espesor: E, cantos: '', modulo: sub }),
  ];
  if (!volquete) {
    pieces.push(piece(`m${moduleId}${idp}${index}-cara`, stampTipoTag(`Cara ${vocab}${num} M${moduleId}`, tipoId), interior, latAlto, { color: cl, espesor: E, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    // Convención perimetral (auditoría estructural): la base queda confinada
    // entre la cara y el fondo → largo = lateral − 2·espLat. El volquete
    // conserva su bandeja clásica.
    piece(`m${moduleId}${idp}${index}-base`, `Base ${vocab}${num} M${moduleId}`, interior, volquete ? profCajon : profCajon - 2 * E, { rotate: 'si', color: cl, espesor: E, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-tirador`, `Tirador ${vocab}${num} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }),
  );
  const warnings = [];
  if (!volquete && rielRegla.nota) warnings.push(rielRegla.nota);
  return { ok: true, pieces, submodulo: sub, frente: { ancho: frenteAncho, alto: frenteAlto }, warnings };
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
//   - conFrente (default TRUE): la zapatera lleva frente decorativo + tirador
//     (el tirador va atornillado al frente: sin frente, no va). Con
//     conFrente=false la bandeja va abierta: la cara (tablero del cuerpo)
//     queda como frente visible y de agarre. El riel 'marco' es la
//     excepción: el herraje es solo frente + tirador, así que siempre lleva
//     frente. El tipo 'bandeja a la vista' impone sin frente por defecto
//     (conFrenteDefault: false — su razón de ser es verse).
//   - ladosIguales (tipo 'bandeja a la vista'): solo cuando va SIN frente,
//     la cara, los laterales, el fondo y la división quedan al MISMO alto —
//     un borde apenas más alto que la riel (BANDEJA_RIM_HEIGHT) — para que
//     la bandeja se vea completa y la cara no sobresalga del lateral.
//   - modoFrente: 'completo' (frente decorativo + tirador, cara alta detrás),
//     'abierta' (bandeja sin frente, cara alta de agarre), 'borde' (sin frente
//     ni tirador: la -cara se emite BAJA, como borde frontal de `bordeFrontal`
//     mm) o 'personalizado' (frente según conFrente + alturas independientes:
//     altoFrente, bordeFrontal para la cara, altoLateral, altoFondo para el
//     borde trasero y altoDivision). Default: se resuelve de conFrente
//     (true → 'completo', false → 'abierta') para no romper callers previos.
//     Prioridad: frenteCompleto (botas) fuerza frente con CUALQUIER modo.
//     ladosIguales aplica su rim en modos 'abierta'/'borde' sin frente; en
//     'borde' el borde manda sobre la cara (la cara mide bordeFrontal) pero
//     los laterales siguen la lógica del rim. El riel 'marco' es herraje de
//     catálogo (siempre frente + tirador): el modo no aplica.
// Mismas fórmulas de vano/corredera que addDrawer (W, holgura 12.7 mm/lado).
export function addShoeTray(moduleId, index, {
  anchoModulo,
  profundidadModulo,
  altoVano,
  frenteCompleto = false,
  conFrente = true, // por defecto la zapatera lleva frente decorativo + tirador
  modoFrente = null, // 'completo'|'borde'|'abierta'|'personalizado' (null => hereda de conFrente)
  bordeFrontal = 40, // alto del borde frontal bajo (modos 'borde'/'personalizado')
  altoFondo = null, // borde trasero independiente (default: alto del lateral)
  altoDivision = null, // división independiente (default: alto del lateral)
  altoFrente = null, // frente completo independiente (default: altoVano − 3)
  altoLateral = RAIL_SIDE_HEIGHT,
  ladosIguales = false,
  rim = BANDEJA_RIM_HEIGHT, // borde de la bandeja a la vista (contrato: tipo.rim)
  tipoId = null, // tag [tipo] en frente/cara: el contrato sobrevive al CSV
  espesorFrente = 15,
  colorFrente = '#8B5A2B',
  colorLateral = '#D9C2A3',
  division = true,
  riel = RIEL_DEFAULT,
  frenteLuz = 1,
  espesorModulo = 15, // espesor REAL del casco (createModule): la bandeja descuenta E
}) {
  const errors = [];
  validateDimension(anchoModulo, 'anchoModulo', errors, { min: 100 });
  validateDimension(profundidadModulo, 'profundidadModulo', errors, { min: 100 });
  validateDimension(altoVano, 'altoVano', errors, { min: 50 });
  validateDimension(altoLateral, 'altoLateral', errors, { min: 40 });
  validateEspesor(espesorModulo, errors);
  const cf = validateColor(colorFrente, errors, 'colorFrente');
  const cl = validateColor(colorLateral, errors, 'colorLateral');
  // Modo de construcción del frente (3 modos del Constructor). Sin modo
  // explícito se preserva el comportamiento histórico vía conFrente.
  const modo = modoFrente == null ? (conFrente ? 'completo' : 'abierta') : String(modoFrente);
  if (!['completo', 'borde', 'abierta', 'personalizado'].includes(modo)) {
    errors.push(`modoFrente: debe ser completo|borde|abierta|personalizado (recibido "${modoFrente}")`);
  }
  if (modo === 'borde' || modo === 'personalizado') {
    if (!isFiniteNumber(bordeFrontal) || bordeFrontal < 20 || bordeFrontal > 300) {
      errors.push(`bordeFrontal: debe estar entre 20 y 300 mm (recibido ${bordeFrontal})`);
    }
  }
  if (altoFrente != null && (!isFiniteNumber(altoFrente) || altoFrente < 50 || altoFrente > altoVano - 1)) {
    errors.push(`altoFrente: debe estar entre 50 y ${altoVano - 1} mm (recibido ${altoFrente})`);
  }
  if (errors.length) return { ok: false, errors };

  const E = espesorModulo; // espesor del MODULO: W/D y bandeja descuentan E
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho = W - 2 * frenteLuz;
  const frenteAlto = altoVano - 3;
  const profBandeja = D - 25; // corredera telescópica
  const latAlto = Math.min(altoLateral, frenteAlto - 2 * E); // lateral bajo
  const interior = Math.round((W - 2 * HOLGURA_CORREDERA)) - 2 * E;

  if (interior <= 0) {
    return { ok: false, errors: [`zapatera: vano de ${anchoModulo} mm demasiado estrecho`] };
  }

  const sub = `${moduleId}${index}`;
  const num = ` ${index}`;
  // Herraje de catálogo: marco de aluminio regulable con rieles propios —
  // no se fabrica cajón; solo el frente (va atornillado al marco) y tirador.
  // El herraje ES frente + tirador: conFrente no aplica (siempre lleva frente).
  if (riel === 'marco') {
    return {
      ok: true,
      submodulo: sub,
      conFrente: true,
      frente: { ancho: frenteAncho, alto: frenteAlto },
      warnings: [`${RIEL_RULES.marco.nota} Vano de ${anchoModulo} mm (p. ej. marco regulable 800–900).`],
      pieces: [
        piece(`m${moduleId}zapatera${index}-frente`, stampTipoTag(`Frente zapatera marco regulable${num} M${moduleId}`, tipoId), frenteAncho, frenteAlto, { rotate: 'si', color: cf, espesor: espesorFrente, cantos: 'T,B,L,R', modulo: sub }),
        piece(`m${moduleId}zapatera${index}-tirador`, `Tirador zapatera marco regulable${num} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }),
      ],
    };
  }
  const { rule: rielRegla, holgura: rielHolgura } = rielRule(riel, E);
  const profBandeja2 = rielRegla.fondoMm(profundidadModulo, E);
  const interior2 = Math.round(W - 2 * rielHolgura) - 2 * E;
  const rielTagZ = riel === 'oculta' ? ' oculta' : riel === 'telescopica26' ? ' telescopica 26' : '';
  // Frente completo (botas): el frente ES el cierre estructural de la bandeja
  // (no hay cara) — se fuerza aunque conFrente=false y con CUALQUIER modo
  // (prioridad sobre 'borde'/'abierta'). Los modos 'borde' y 'abierta' imponen
  // bandeja SIN frente decorativo ni tirador; 'completo' y 'personalizado'
  // respetan conFrente (default true).
  const llevaFrente = frenteCompleto || (conFrente && modo !== 'borde' && modo !== 'abierta');
  const frenteAltoEf = altoFrente ?? frenteAlto; // 'personalizado': alto propio
  // Bandeja a la vista (ladosIguales) SIN frente: laterales, fondo y
  // división al alto del rim (borde apenas más alto que la riel). Solo aplica
  // en modos 'abierta'/'borde'; en 'borde' el borde manda sobre la CARA (la
  // cara mide bordeFrontal) pero los laterales siguen el rim. Con frente (o
  // en 'personalizado') aplica la geometría de cajón habitual (la cara queda
  // detrás del frente, más baja que él).
  const altoLado = ladosIguales && !llevaFrente && (modo === 'abierta' || modo === 'borde')
    ? Math.max(40, Math.min(rim, frenteAlto - 2 * E))
    : latAlto;
  // Alturas independientes ('personalizado'): clamp razonable 20..frenteAlto.
  const altoFondoEf = Math.max(20, Math.min(altoFondo ?? altoLado, frenteAlto));
  const altoDivisionEf = Math.max(20, Math.min(altoDivision ?? altoLado, frenteAlto));
  const pieces = [];
  if (llevaFrente) {
    pieces.push(piece(`m${moduleId}zapatera${index}-frente`, stampTipoTag(`Frente zapatera extraible${rielTagZ}${num} M${moduleId}`, tipoId), frenteAncho, frenteAltoEf, { rotate: 'si', color: cf, espesor: espesorFrente, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    piece(`m${moduleId}zapatera${index}-lateral-izq`, `Lateral zapatera extraible${num} izq M${moduleId}`, profBandeja2, altoLado, { color: cl, espesor: E, cantos: 'T,B,L', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-lateral-der`, `Lateral zapatera extraible${num} der M${moduleId}`, profBandeja2, altoLado, { color: cl, espesor: E, cantos: 'T,B,R', modulo: sub }),
    piece(`m${moduleId}zapatera${index}-fondo`, `Fondo zapatera extraible${num} M${moduleId}`, interior2, altoFondoEf, { color: '#F2F2F2', espesor: E, cantos: '', modulo: sub }),
  );
  if (!frenteCompleto) {
    // Frente bajo (o bandeja abierta): la cara cierra la abertura sobre la
    // bandeja (como cajón). Sin frente decorativo, la cara ES la cara
    // visible de la bandeja y por donde se jala. Modos 'borde' y
    // 'personalizado': la cara se emite BAJA (borde frontal de `bordeFrontal`
    // mm) — sustitución geométrica real, no ocultamiento; el id/nombre se
    // conservan para el apilado (pos_z), el emparejamiento cara↔frente y el
    // re-parseo del CSV. En 'abierta' (y en 'completo'/'personalizado' con
    // frente) la cara queda alta, detrás del frente.
    const altoCara = (modo === 'borde' || modo === 'personalizado')
      ? Math.max(20, Math.min(bordeFrontal, frenteAlto - 2 * E))
      : (ladosIguales && !llevaFrente ? altoLado : Math.max(20, frenteAlto - 2 * E));
    pieces.push(piece(`m${moduleId}zapatera${index}-cara`, stampTipoTag(`Cara zapatera extraible${num} M${moduleId}`, tipoId), interior2, altoCara, { color: cl, espesor: E, cantos: 'T,B,L,R', modulo: sub }));
  }
  if (division) {
    // División central (por defecto): apoyo paralelo al fondo a media
    // profundidad de la bandeja. Sirve de respaldo para la fila delantera
    // de zapatos; la fila trasera se apoya en el fondo. El renderer la
    // posiciona centrada (rol drawer_divider).
    pieces.push(piece(`m${moduleId}zapatera${index}-division`, `Division zapatera extraible${num} M${moduleId}`, interior2, altoDivisionEf, { color: cl, espesor: E, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    // Base confinada (perimetral): entre la cara y el fondo.
    piece(`m${moduleId}zapatera${index}-base`, `Base zapatera extraible${num} M${moduleId}`, interior2, Math.max(50, profBandeja2 - 2 * E), { rotate: 'si', color: cl, espesor: E, cantos: 'T,B,L,R', modulo: sub }),
  );
  if (llevaFrente) {
    // El tirador va atornillado al frente decorativo: sin frente, no va.
    pieces.push(piece(`m${moduleId}zapatera${index}-tirador`, `Tirador zapatera extraible${num} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }));
  }
  const warnings = [];
  if (rielRegla.nota) warnings.push(rielRegla.nota);
  return {
    ok: true,
    pieces,
    submodulo: sub,
    frenteCompleto,
    conFrente: llevaFrente,
    modoFrente: modo,
    bordeFrontal,
    frente: llevaFrente ? { ancho: frenteAncho, alto: frenteAltoEf } : null,
    warnings,
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
// modules: [{ ancho, alto, prof, espesor?, colorCuerpo?, colorFrente?, contenido:
// [{ kind: 'zocalo', alto? } | { kind: 'shelf', index? } |
//   { kind: 'drawer', index?, altoVano, tipo?, vocabulario? } |
//   { kind: 'shoeRack', altoVano?, tipo? (id de SHOE_RACK_TYPES), conFrente? } |
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
        if (item.kind === 'shoeRack') {
          // Bandeja zapatera real (con división y contrato de tipo), no un
          // cajón con vocabulario 'zapatera': el tipo del contenido fija
          // frenteCompleto/conFrente/rim (default: con frente, división).
          const tipoZap = item.tipo ? getContentType('shoeRack', item.tipo) : null;
          result = addShoeTray(moduleId, drawerIndex, {
            anchoModulo: mod.ancho, profundidadModulo: mod.prof,
            altoVano: tipoZap?.altoVano ?? item.altoVano ?? 200,
            frenteCompleto: tipoZap ? !!tipoZap.frenteCompleto : !!item.frenteCompleto,
            conFrente: item.conFrente ?? tipoZap?.conFrenteDefault,
            ladosIguales: tipoZap ? !!tipoZap.ladosIguales : !!item.ladosIguales,
            rim: tipoZap?.rim,
            tipoId: item.tipo ?? null,
            espesorModulo: mod.espesor ?? 15,
            colorFrente: mod.colorFrente ?? '#8B5A2B', colorLateral: mod.colorCuerpo ?? '#D9C2A3',
          });
        } else {
          result = addDrawer(moduleId, drawerIndex, {
            anchoModulo: mod.ancho, profundidadModulo: mod.prof, altoVano: item.altoVano ?? 200,
            tipo: item.tipo ?? 'corredera',
            vocabulario: item.vocabulario ?? 'cajon',
            espesorModulo: mod.espesor ?? 15,
            colorFrente: mod.colorFrente ?? '#8B5A2B', colorLateral: mod.colorCuerpo ?? '#D9C2A3',
          });
        }
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
