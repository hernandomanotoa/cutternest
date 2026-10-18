// js/services/closetBuilderService.js — Constructor puro de piezas de closet
// abierto. Port de la geometria de scripts/lib/cajonModel.mjs (fuente del
// generador offline) devolviendo OBJETOS PIEZA (shape de csvParser.js), no
// strings CSV. Sin DOM (regla de oro: logica de negocio puro en services/).
// Todas las funciones devuelven { ok: true, pieces } o { ok: false, errors }
// y nunca lanzan: la vista muestra los errors en un toast.

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
export function createModule({ ancho, alto, prof, espesor = 15, colorCuerpo = '#C19A6B', modulo }) {
  const errors = [];
  validateDimension(ancho, 'ancho', errors, { min: 100 });
  validateDimension(alto, 'alto', errors, { min: 100 });
  validateDimension(prof, 'prof', errors, { min: 100 });
  validateEspesor(espesor, errors);
  const color = validateColor(colorCuerpo, errors, 'colorCuerpo');
  if (!modulo) errors.push('modulo: es requerido');
  if (errors.length) return { ok: false, errors };

  const E = espesor;
  const pieces = [
    piece(`m${modulo}-base`, `Base modulo M${modulo}`, ancho, prof, { rotate: 'si', color, espesor: E, cantos: 'T,B,L,R', modulo }),
    piece(`m${modulo}-tapa`, `Tapa modulo M${modulo}`, ancho, prof, { rotate: 'si', color, espesor: E, cantos: 'T,B,L,R', modulo }),
    piece(`m${modulo}-lateral-izq`, `Lateral izquierdo M${modulo}`, prof, alto, { color, espesor: E, cantos: 'T,B,L', modulo }),
    piece(`m${modulo}-lateral-der`, `Lateral derecho M${modulo}`, prof, alto, { color, espesor: E, cantos: 'T,B,R', modulo }),
    piece(`m${modulo}-fondo`, `Fondo modulo M${modulo}`, ancho - 2 * E, alto - 2 * E, { color: '#F2F2F2', espesor: E, cantos: '', modulo }),
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
export function addHangerRail(moduleId, { anchoUtil, index = 1, color = '#A0A0A0' }) {
  const errors = [];
  validateDimension(anchoUtil, 'anchoUtil', errors, { min: 50 });
  const c = validateColor(color, errors);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pieces: [
      piece(`m${moduleId}-barra-${index}`, `Barra colgadora ${index} M${moduleId}`, anchoUtil, 25, { rotate: 'si', color: c, espesor: 25, cantos: '', modulo: moduleId }),
    ],
  };
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

  const pieces = [
    piece(`m${moduleId}${idp}${index}-frente`, `Frente ${frenteVocab} M${moduleId}`, frenteAncho, frenteAlto, { rotate: 'si', color: cf, espesor: 15, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-izq`, `Lateral ${vocab}${ladoIzq} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,L', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-lateral-der`, `Lateral ${vocab}${ladoDer} M${moduleId}`, profCajon, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-fondo`, `Fondo ${vocab} M${moduleId}`, interior, latAlto - ESP_BASE, { color: '#F2F2F2', espesor: 15, cantos: '', modulo: sub }),
  ];
  if (!volquete) {
    pieces.push(piece(`m${moduleId}${idp}${index}-cara`, `Cara ${vocab} M${moduleId}`, interior, latAlto, { color: cl, espesor: ESP_LAT, cantos: 'T,B,L,R', modulo: sub }));
  }
  pieces.push(
    piece(`m${moduleId}${idp}${index}-base`, `Base ${vocab} M${moduleId}`, interior, profCajon, { rotate: 'si', color: cl, espesor: ESP_BASE, cantos: 'T,B,L,R', modulo: sub }),
    piece(`m${moduleId}${idp}${index}-tirador`, `Tirador ${vocab} M${moduleId}`, 2, 20, { color: '#A0A0A0', espesor: 5, cantos: '', modulo: sub }),
  );
  return { ok: true, pieces, submodulo: sub, frente: { ancho: frenteAncho, alto: frenteAlto } };
}

// ── Utilidades ────────────────────────────────────────────────────

// Siguiente id de modulo libre: maximo id raiz numerico + 1. Los
// submodulos ('1.2') y globales ('estructura'/'global', ids glb-*) no
// consumen numeros de modulo.
export function nextModuleId(pieces) {
  let max = 0;
  for (const p of pieces || []) {
    const mod = String(p?.modulo || '').trim();
    if (!mod || mod === 'estructura' || mod === 'global') continue;
    const root = mod.split('.')[0];
    if (/^\d+$/.test(root)) max = Math.max(max, Number(root));
  }
  return String(max + 1);
}

// Cuenta piezas por modulo raiz (para decidir default 'Vista completa').
export function countRootModules(pieces) {
  const roots = new Set();
  for (const p of pieces || []) {
    const mod = String(p?.modulo || '').trim();
    if (!mod || mod === 'estructura' || mod === 'global') continue;
    roots.add(mod.split('.')[0]);
  }
  return roots.size;
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
    const casco = createModule({
      ancho: mod.ancho, alto: mod.alto, prof: mod.prof,
      espesor: mod.espesor ?? 15, colorCuerpo: mod.colorCuerpo ?? '#C19A6B', modulo: moduleId,
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
