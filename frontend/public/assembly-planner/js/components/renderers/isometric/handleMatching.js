/**
 * Emparejamiento de tiradores con sus frentes (puertas/cajones).
 * Heurísticas puras sin estado: por prefijo de id o inclusión del nombre normalizado.
 */

import { inferRole } from '../../../services/classifierService.js';
import { normalizeName } from '../../../utils/normalize.js';

export function isHandlePiece(p) {
  // Tirador reconocido por rol o por nombre. Necesario porque inferRole
  // clasifica "Tirador puerta ..." como 'door' (la regla 'puerta' gana antes
  // que 'tirador' en classifierService, que es capa cerrada).
  if (inferRole(p) === 'handle') return true;
  return normalizeName(p?.nombre || '').includes('tirador') ||
    normalizeName(p?.id || '').includes('tirador');
}

export function findPairedHandle(piece, candidates) {
  // Empareja un frente (puerta o cajón) con su tirador: por prefijo de id
  // (m1-puerta-izq → m1-puerta) o por inclusión del nombre normalizado
  // ('Tirador puerta izq' incluye 'puerta izq'). Misma heurística que usa el
  // emparejamiento de tiradores de cajón en buildDrawerGeometries.
  const parts = String(piece.id || '').split('-');
  const prefix = parts.slice(0, -1).join('-');
  const name = normalizeName(piece.nombre || '');
  if (!prefix && !name) return null;
  return candidates.find((p) => {
    if (!isHandlePiece(p)) return false;
    if (prefix && String(p.id).startsWith(prefix)) return true;
    return Boolean(name) && normalizeName(p.nombre || '').includes(name);
  });
}

export function handleBelongsToDoor(handleGeo, doorGeo) {
  const parts = String(doorGeo.id || '').split('-');
  const prefix = parts.slice(0, -1).join('-');
  const doorName = normalizeName(doorGeo.name || '');
  if (prefix && String(handleGeo.id).startsWith(prefix)) return true;
  return Boolean(doorName) && normalizeName(handleGeo.name || '').includes(doorName);
}
