// js/utils/normalize.js — Normalización de nombres de piezas y módulos
// Única fuente de verdad para comparaciones de texto en todo el assembly planner.

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function nameIncludes(pieceName, keywords) {
  const n = normalizeName(pieceName);
  if (Array.isArray(keywords)) {
    return keywords.some((k) => n.includes(normalizeName(k)));
  }
  return n.includes(normalizeName(keywords));
}

export function nameMatchesAny(pieceName, keywords) {
  return nameIncludes(pieceName, keywords);
}
