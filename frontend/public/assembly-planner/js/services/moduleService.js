// js/services/moduleService.js — Lógica pura de agrupación y filtrado de módulos
// Sin DOM.

import { normalizeName } from '../utils/normalize.js';

export const GLOBAL_MODULE_ID = 'global';
export const GLOBAL_MODULE_LABEL = 'Global / Estructura';

export function isGlobalPiece(piece) {
  if (!piece) return false;
  const modulo = String(piece.modulo || '').trim().toLowerCase();
  if (modulo === 'estructura' || modulo === 'global') return true;
  if (piece.id.toLowerCase().startsWith('glb-')) return true;
  return false;
}

export function getModuleGroups(pieces) {
  const modules = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    modules.add(String(p.modulo || '1').trim());
  });

  const sorted = Array.from(modules).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function hasParent(h) {
    for (const p of sorted) {
      if (p !== h && h.startsWith(p)) return true;
    }
    return false;
  }

  const roots = sorted.filter((m) => !hasParent(m));

  return roots.map((m) => ({
    id: m,
    label: `Módulo ${m}`,
    modules: [m],
  }));
}

export function getModules(pieces) {
  const hasGlobal = pieces.some((p) => isGlobalPiece(p));
  const groups = getModuleGroups(pieces);
  const ids = groups.map((g) => g.id);
  return hasGlobal ? [GLOBAL_MODULE_ID, ...ids] : ids;
}

export function getModuleGroup(pieces, groupId) {
  if (groupId === GLOBAL_MODULE_ID) {
    return { id: GLOBAL_MODULE_ID, label: GLOBAL_MODULE_LABEL, modules: [] };
  }

  const allModules = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    allModules.add(String(p.modulo || '1').trim());
  });

  const target = String(groupId).trim();
  const roots = getModuleGroups(pieces).map((g) => g.id);

  // Determine the root prefix that matches the requested group id.
  const root = roots.find((r) => target === r || target.startsWith(r + '.'));
  const prefix = root ?? target;

  if (!allModules.has(prefix) && roots.length > 0) {
    return { id: roots[0], label: `Módulo ${roots[0]}`, modules: [roots[0]] };
  }

  const descendants = Array.from(allModules)
    .filter((m) => m === prefix || m.startsWith(prefix + '.'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (descendants.length === 0) {
    return roots[0] ? { id: roots[0], label: `Módulo ${roots[0]}`, modules: [roots[0]] } : { id: '1', label: 'Módulo 1', modules: ['1'] };
  }

  const label = descendants.length > 1 ? `Módulo ${prefix} + submódulos` : `Módulo ${prefix}`;
  return { id: descendants.join('+'), label, modules: descendants };
}

export function getModulePieces(pieces, moduleId) {
  if (moduleId === GLOBAL_MODULE_ID) {
    return pieces.filter((p) => isGlobalPiece(p));
  }
  const group = getModuleGroup(pieces, moduleId);
  const moduleSet = new Set(group.modules.map((m) => String(m).trim()));
  return pieces.filter((p) => {
    if (isGlobalPiece(p)) return true;
    return moduleSet.has(String(p.modulo || '1').trim());
  });
}

export function getModuleDependencies(dependencies, pieces) {
  const visibleIds = new Set(pieces.map((p) => p.id));
  return dependencies.filter((d) => visibleIds.has(d.from) && visibleIds.has(d.to));
}

export function getModuleLabel(moduleId, pieces = []) {
  if (moduleId === GLOBAL_MODULE_ID) return GLOBAL_MODULE_LABEL;
  const group = getModuleGroup(pieces, moduleId);
  return group.label;
}
