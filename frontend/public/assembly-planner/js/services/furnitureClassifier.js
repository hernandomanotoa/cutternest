// js/services/furnitureClassifier.js — Clasificación a nivel mueble (S2)
// Lógica pura, sin DOM. Toma el listado de piezas del proyecto y devuelve
// ambiente, tipo, estructura constructiva, uso de tablero, nivel de
// complejidad (score) y confianza por criterio, según la guía de taller del
// usuario (5 criterios, datos en js/core/furnitureTaxonomy.js).
// La clasificación por pieza (rol) sigue en classifierService.js.

import { inferRole, detectFamily } from './classifierService.js';
import { AMBIENTES, COMPLEXITY_SCORE_RANGES } from '../core/furnitureTaxonomy.js';
import { normalizeName } from '../utils/normalize.js';

// Reglas de keyword → { ambiente, tipo }. El ORDEN importa: las reglas más
// específicas van primero para no ser absorbidas por reglas genéricas
// (p.ej. 'panel tv' antes que 'tv' → rack).
const REGLAS_TIPO = [
  { keys: ['perchero'], ambiente: 'entrada', tipo: 'perchero_zapatera' },
  { keys: ['zapatera', 'zapatero'], ambiente: 'entrada', tipo: 'zapatera' },
  { keys: ['recibidor', 'consola'], ambiente: 'entrada', tipo: 'recibidor_consola' },
  { keys: ['lavabo', 'lavatorio', 'vanitory', 'vanitorio'], ambiente: 'banio', tipo: 'bajo_lavatorio' },
  { keys: ['botiquin'], ambiente: 'banio', tipo: 'botiquin_espejo' },
  { keys: ['buro', 'velador', 'mesa de noche', 'mesita de noche', 'mesa noche'], ambiente: 'dormitorio', tipo: 'buro' },
  { keys: ['cajonera', 'comoda', 'chiffonier'], ambiente: 'dormitorio', tipo: 'cajonera' },
  { keys: ['closet', 'ropero', 'armario'], ambiente: 'dormitorio', tipo: 'closet' },
  { keys: ['tocador'], ambiente: 'dormitorio', tipo: 'tocador' },
  { keys: ['cabecero', 'cama'], ambiente: 'dormitorio', tipo: 'cama_base' },
  { keys: ['alacena', 'despensero'], ambiente: 'cocina_comedor', tipo: 'alacena' },
  { keys: ['aparador', 'bufetero'], ambiente: 'cocina_comedor', tipo: 'alacena' },
  { keys: ['isla cocina', 'kitchenette', 'cocina'], ambiente: 'cocina_comedor', tipo: 'cocina_modular' },
  { keys: ['mesa comedor', 'mesa extensible', 'mesa de comedor'], ambiente: 'cocina_comedor', tipo: 'mesa_comedor' },
  { keys: ['silla', 'banco'], ambiente: 'cocina_comedor', tipo: 'silla_banco' },
  { keys: ['botellero', 'cantina', 'bar'], ambiente: 'cocina_comedor', tipo: 'bar_cantina' },
  { keys: ['panel tv', 'panel de tv'], ambiente: 'sala', tipo: 'panel_tv' },
  { keys: ['rack', 'entretenimiento', 'mueble tv', 'mueble de tv'], ambiente: 'sala', tipo: 'rack_entretenimiento' },
  { keys: ['mesa centro', 'mesa de centro', 'mesa lateral', 'mesa de canto'], ambiente: 'sala', tipo: 'mesa_centro_lateral' },
  { keys: ['librero', 'estanteria', 'estante', 'repisa', 'vitrina', 'separador de ambientes', 'separador ambientes'], ambiente: 'sala', tipo: 'estanteria_librero' },
  { keys: ['escritorio'], ambiente: 'oficina', tipo: 'escritorio' },
  { keys: ['archivador'], ambiente: 'oficina', tipo: 'archivador' },
  { keys: ['estacion de trabajo', 'estacion trabajo', 'estación de trabajo'], ambiente: 'oficina', tipo: 'estacion_trabajo' },
  { keys: ['recepcion'], ambiente: 'oficina', tipo: 'recepcion' },
  { keys: ['tv'], ambiente: 'sala', tipo: 'rack_entretenimiento' },
];

const ROLES_CUERPO = ['side_panel', 'bottom_panel', 'top_panel', 'back_panel'];
const ROLES_FRENTE = ['drawer_face', 'door', 'front_panel'];

// Keywords cortas (≤3 caracteres) se acotan a palabra completa para no
// matchear por subcadena ('bar' no debe activarse con 'barra colgadora',
// 'tv' no con 'actividad').
function casarKeyword(texto, key) {
  const k = normalizeName(key);
  if (k.length <= 3) return new RegExp(`\\b${k}\\b`).test(texto);
  return texto.includes(k);
}

// Cuenta las reglas que casan contra el texto del proyecto/piezas.
function contarEvidencia(texto) {
  let hits = 0;
  for (const regla of REGLAS_TIPO) {
    if (regla.keys.some((k) => casarKeyword(texto, k))) hits += 1;
  }
  return hits;
}

function inferirEstructura(pieces, roles, texto) {
  const hayDrawer = roles.some((r) => r.startsWith('drawer'));
  const hayDoor = roles.some((r) => r === 'door');
  if (texto.includes('volquete') || texto.includes('abatible')) {
    return { estructura: 'frentes_abatibles', nota: texto.includes('volquete') ? 'volquete' : 'abatible' };
  }
  if (hayDrawer && hayDoor) return { estructura: 'mixto', nota: null };
  if (hayDrawer) return { estructura: 'cajones', nota: null };
  if (hayDoor) {
    return {
      estructura: 'puertas',
      nota: texto.includes('corrediza') || texto.includes('corredizo') ? 'puerta corrediza' : null,
    };
  }
  return { estructura: 'abierto', nota: null };
}

function inferirUsoTablero(pieces, roles) {
  const coloresCuerpo = new Set();
  const coloresFrente = new Set();
  pieces.forEach((p, i) => {
    const color = String(p.color || '').trim();
    if (!color) return;
    if (ROLES_FRENTE.includes(roles[i])) coloresFrente.add(color);
    if (ROLES_CUERPO.includes(roles[i])) coloresCuerpo.add(color);
  });
  // Cuerpo/frente: hay colores de frente definidos y ninguno coincide con
  // los del cuerpo. Un solo color estructural (o sin frentes con color
  // distinto) → unicolor.
  if (coloresFrente.size > 0 && coloresCuerpo.size > 0) {
    const todosDistintos = [...coloresFrente].every((c) => !coloresCuerpo.has(c));
    return { usoTablero: todosDistintos ? 'cuerpo_frente' : 'unicolor', nota: null };
  }
  return { usoTablero: 'unicolor', nota: null };
}

function calcularScore(pieces, roles, texto) {
  let score = 0;
  // Cada familia de cajón distinta (frentes con color/módulo distintos) +2.
  const familias = new Set();
  pieces.forEach((p, i) => {
    if (roles[i] === 'drawer_face') {
      familias.add(`${String(p.modulo || '')}|${String(p.color || '')}|${String(p.ancho || '')}`);
    }
  });
  score += familias.size * 2;
  // Puertas: abatibles +1, corredizas +2.
  const hayPuertaCorrediza = pieces.some((p, i) => {
    if (roles[i] !== 'door') return false;
    return normalizeName(p.nombre).includes('corrediza') || normalizeName(p.nombre).includes('corredizo');
  });
  if (roles.includes('door')) score += hayPuertaCorrediza ? 2 : 1;
  // Volquetes/abatibles +1.
  if (texto.includes('volquete') || texto.includes('abatible')) score += 1;
  // Más de 2 módulos +1 (excluyendo el módulo global/estructura).
  const modulos = new Set(
    pieces
      .map((p) => String(p.modulo || '').trim())
      .filter((m) => m && m !== 'estructura' && m !== 'global'),
  );
  if (modulos.size > 2) score += 1;
  // Más de 25 piezas +1.
  const totalPiezas = pieces.reduce((acc, p) => acc + (Number(p.cantidad) || 1), 0);
  if (totalPiezas > 25) score += 1;
  return score;
}

function nivelDesdeScore(score) {
  for (const [nivel, [min, max]] of Object.entries(COMPLEXITY_SCORE_RANGES)) {
    if (score >= min && score <= max) return nivel;
  }
  return 'alto';
}

/**
 * Clasifica el mueble completo a partir de sus piezas.
 * Devuelve { ambiente, tipo, estructura, usoTablero, nivel, score,
 * familia, confianza: { ambiente, tipo, estructura, usoTablero }, notas }.
 * Si ninguna keyword casa, ambiente/tipo quedan en null y la confianza es
 * 'baja'; la familia detectada (classifierService.js) queda en `familia`.
 */
export function classifyFurniture(pieces) {
  const list = Array.isArray(pieces) ? pieces : [];
  const roles = list.map((p) => inferRole(p));
  // Texto de evidencia: nombres e ids de piezas + proyecto si existe.
  const texto = normalizeName(
    list.map((p) => `${p.nombre || ''} ${p.id || ''} ${p.proyecto || ''}`).join(' '),
  );

  // Ambiente/tipo por keywords (regla más específica primero).
  let match = null;
  for (const regla of REGLAS_TIPO) {
    if (regla.keys.some((k) => casarKeyword(texto, k))) {
      match = { ambiente: regla.ambiente, tipo: regla.tipo };
      break;
    }
  }
  // Estantería de oficina: estantería/librero con contexto de oficina.
  if (match && match.tipo === 'estanteria_librero' &&
      (texto.includes('oficina') || texto.includes('archivador'))) {
    match = { ambiente: 'oficina', tipo: 'estanteria_oficina' };
  }

  const evidencia = contarEvidencia(texto);
  const confianzaTipo = match ? (evidencia >= 2 ? 'alta' : 'media') : 'baja';

  const { estructura, nota: notaEstructura } = inferirEstructura(list, roles, texto);
  const { usoTablero } = inferirUsoTablero(list, roles);
  const score = calcularScore(list, roles, texto);
  const familia = detectFamily(list);

  const confianzaEstructura = (roles.some((r) => r.startsWith('drawer')) || roles.includes('door') ||
    texto.includes('volquete') || texto.includes('abatible')) ? 'alta' : 'media';
  const confianzaTablero = (roles.includes('drawer_face') || roles.includes('door')) ? 'alta' : 'media';

  return {
    ambiente: match ? match.ambiente : null,
    tipo: match ? match.tipo : null,
    estructura,
    usoTablero,
    nivel: nivelDesdeScore(score),
    score,
    familia,
    confianza: {
      ambiente: confianzaTipo,
      tipo: confianzaTipo,
      estructura: confianzaEstructura,
      usoTablero: confianzaTablero,
    },
    notas: {
      estructura: notaEstructura,
    },
  };
}

/**
 * Aplica correcciones manuales del taller sobre una clasificación inferida.
 * `corrections` es un objeto parcial { ambiente, tipo, nivel } (el campo
 * `fichaCorrections` de userConfig). Reglas de saneado:
 * - corrections null/undefined o sin campos aplicables → no-op.
 * - ambiente solo se aplica si existe en AMBIENTES.
 * - tipo solo se aplica si existe dentro del ambiente resultante (el
 *   corregido, o el ya inferido si no hay corrección de ambiente). Si el
 *   tipo corregido es inválido para el ambiente, la corrección de tipo se
 *   IGNORA (queda la inferida). Si el ambiente corregido deja al tipo
 *   vigente fuera de sus tipos, el tipo se sanea a null.
 * - nivel solo se aplica si es 'basico' | 'medio' | 'alto'.
 * Los campos corregidos pasan a confianza 'alta' (decisión humana, no
 * inferencia), para que la UI no los marque como "(inferido)".
 */
export function applyFichaCorrections(clasificacion, corrections) {
  if (!clasificacion || !corrections || typeof corrections !== 'object') {
    return clasificacion;
  }

  const next = { ...clasificacion, confianza: { ...clasificacion.confianza } };
  const tipoValidoEn = (tipo, ambiente) =>
    !!ambiente && Array.isArray(AMBIENTES[ambiente]) && AMBIENTES[ambiente].includes(tipo);

  if (corrections.ambiente && Object.prototype.hasOwnProperty.call(AMBIENTES, corrections.ambiente)) {
    next.ambiente = corrections.ambiente;
    next.confianza.ambiente = 'alta';
  }

  const ambienteResultante = next.ambiente;
  if (corrections.tipo && typeof corrections.tipo === 'string') {
    if (tipoValidoEn(corrections.tipo, ambienteResultante)) {
      next.tipo = corrections.tipo;
      next.confianza.tipo = 'alta';
    }
    // Tipo inválido para el ambiente resultante: se ignora la corrección.
  }
  // Saneo de consistencia: el tipo vigente debe pertenecer al ambiente.
  if (next.tipo && !tipoValidoEn(next.tipo, next.ambiente)) {
    next.tipo = null;
    next.confianza.tipo = 'baja';
  }

  if (['basico', 'medio', 'alto'].includes(corrections.nivel)) {
    next.nivel = corrections.nivel;
  }

  return next;
}
