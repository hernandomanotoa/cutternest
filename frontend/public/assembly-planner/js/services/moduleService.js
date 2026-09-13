// js/services/moduleService.js — Lógica pura de agrupación y filtrado de módulos
// Sin DOM.
//
// Convención de nombres de submódulos:
// - Notación con punto: '1.1' es submódulo de '1'.
// - Notación concatenada (usada en los CSV de ejemplo): '11' es el submódulo 1
//   del módulo 1 (concatenación de índices numéricos, sin separador).
// El helper isChildModule implementa ambas, restringiendo la concatenación a
// prefijos puramente numéricos para que nombres como '1global' no sean
// absorbidos por el módulo '1'. Debe usarse SIEMPRE para decidir jerarquía,
// de modo que raíces (hasParent) y descendientes (getModuleGroup) sean
// consistentes entre sí.

import { normalizeName } from '../utils/normalize.js';

// Devuelve true si m es el propio prefix o un descendiente suyo, según la
// convención descrita arriba (punto o concatenación numérica).
function isChildModule(m, prefix) {
  if (m === prefix) return true;
  if (m.startsWith(prefix + '.')) return true;
  if (/^\d+$/.test(prefix) && m.startsWith(prefix) && /^\d+$/.test(m.slice(prefix.length))) return true;
  return false;
}

export const ALL_MODULE_ID = 'all';
export const ALL_MODULE_LABEL = 'Vista completa';
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
      if (p !== h && isChildModule(h, p)) return true;
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
  const result = hasGlobal ? [GLOBAL_MODULE_ID, ...ids] : ids;
  if (pieces.length > 0 && result.length > 1) {
    result.push(ALL_MODULE_ID);
  }
  return result;
}

export function getModuleGroup(pieces, groupId) {
  if (groupId === GLOBAL_MODULE_ID) {
    return { id: GLOBAL_MODULE_ID, label: GLOBAL_MODULE_LABEL, modules: [] };
  }

  if (groupId === ALL_MODULE_ID) {
    const roots = getModuleGroups(pieces).map((g) => g.id);
    return { id: ALL_MODULE_ID, label: ALL_MODULE_LABEL, modules: roots };
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
    .filter((m) => isChildModule(m, prefix))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (descendants.length === 0) {
    return roots[0] ? { id: roots[0], label: `Módulo ${roots[0]}`, modules: [roots[0]] } : { id: '1', label: 'Módulo 1', modules: ['1'] };
  }

  const label = descendants.length > 1 ? `Módulo ${prefix} + submódulos` : `Módulo ${prefix}`;
  return { id: descendants.join('+'), label, modules: descendants };
}

export function getModulePieces(pieces, moduleId) {
  if (moduleId === ALL_MODULE_ID) {
    return pieces;
  }
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
  if (moduleId === ALL_MODULE_ID) return ALL_MODULE_LABEL;
  const group = getModuleGroup(pieces, moduleId);
  return group.label;
}

/**
 * Etiqueta descriptiva de un submódulo a partir de sus piezas: tipo (Zapatera,
 * Cajón, Puerta…) + índice relativo a su módulo raíz ('22' de '2' → 2; '1.2'
 * de '1' → 2). El índice sale del id (no del nombre), que es único por raíz;
 * el nombre solo aporta el tipo ("Frente cajon inferior M2" → Cajón).
 */
export function describeSubmodule(pieces, moduleId, rootId = '') {
  const mod = String(moduleId).trim();
  const own = pieces.filter((p) => !isGlobalPiece(p) && String(p.modulo || '1').trim() === mod);
  const face = own.find((p) => /frente/i.test(p.nombre || '')) || own[0];
  const text = normalizeName(face ? `${face.nombre} ${face.id}` : '');
  let type = 'Submódulo';
  if (text.includes('zapater')) type = 'Zapatera';
  else if (text.includes('cajonera')) type = 'Cajonera';
  else if (text.includes('cajon')) type = 'Cajón';
  else if (text.includes('puerta')) type = 'Puerta';
  else if (text.includes('zocalo')) type = 'Zócalo';
  else if (text.includes('repisa') || text.includes('estante')) type = 'Repisa';
  let index = '';
  const rel = rootId && mod.startsWith(rootId) ? mod.slice(rootId.length).replace(/^\.+/, '') : '';
  if (/^\d+(\.\d+)*$/.test(rel)) {
    index = rel.split('.').map((part) => String(parseInt(part, 10))).join('.');
  }
  if (!index) {
    const digits = mod.match(/\d+$/);
    if (digits) index = String(parseInt(digits[0], 10));
  }
  return index ? `${type} ${index}` : type;
}

/**
 * Lista plana de opciones para un selector de módulo: entrada global (si hay
 * piezas globales), cada módulo raíz y sus submódulos anidados (depth ≥ 1,
 * ordenados numéricamente) y la vista completa al final. El consumidor usa
 * `depth` para sangrar las entradas.
 */
export function getModuleOptions(pieces) {
  const hasGlobal = pieces.some((p) => isGlobalPiece(p));
  const roots = getModuleGroups(pieces);
  const rootIds = new Set(roots.map((r) => r.id));
  const all = new Set();
  pieces.forEach((p) => {
    if (isGlobalPiece(p)) return;
    all.add(String(p.modulo || '1').trim());
  });

  // Profundidad de un submódulo = nº de ancestros en la jerarquía de ids.
  const depthOf = (m) => {
    let depth = 0;
    for (const other of all) {
      if (other !== m && isChildModule(m, other)) depth += 1;
    }
    return depth;
  };

  const options = [];
  if (hasGlobal) options.push({ id: GLOBAL_MODULE_ID, label: GLOBAL_MODULE_LABEL, depth: 0 });
  for (const root of roots) {
    options.push({ id: root.id, label: getModuleLabel(root.id, pieces), depth: 0 });
    const children = Array.from(all)
      .filter((m) => m !== root.id && isChildModule(m, root.id) && depthOf(m) >= 1)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const child of children) {
      options.push({ id: child, label: describeSubmodule(pieces, child, root.id), depth: depthOf(child) });
    }
  }
  const ids = roots.map((g) => g.id);
  if (pieces.length > 0 && (hasGlobal ? ids.length + 1 : ids.length) > 1) {
    options.push({ id: ALL_MODULE_ID, label: ALL_MODULE_LABEL, depth: 0 });
  }
  return options;
}
