// js/services/stepApertureService.js — Apertura automática sincronizada con el modo paso 3D
// Lógica pura, sin DOM. Decide qué apertura (0..1) le corresponde a cada pieza
// MÓVIL (puerta/cajón/zapatera, vía motionService.motionConfigFor) según el paso
// actual de la secuencia de ensamblaje (assemblyStepService), con prioridad para
// overrides manuales del usuario.

import { motionConfigFor } from './motionService.js';

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Mapa piezaId -> paso (1-based) a partir de la secuencia de ensamblaje.
 * @param {{ steps: Array<{paso:number, piezas:string[]}> }} sequence
 * @returns {Map<string, number>}
 */
export function stepIndexByPiece(sequence) {
  const map = new Map();
  for (const step of sequence?.steps ?? []) {
    for (const id of step.piezas ?? []) map.set(id, step.paso);
  }
  return map;
}

/**
 * Apertura efectiva de cada pieza móvil en el paso `currentStep`.
 * Reglas:
 *  - Pieza móvil del paso ACTUAL → 1 (abierta).
 *  - Pieza móvil de paso ANTERIOR → 0 (cerrada).
 *  - Pieza móvil de paso POSTERIOR → se omite del resultado (setAssemblyStep
 *    ya la oculta; no se abre nada del futuro).
 *  - Pieza sin movimiento → se omite (no apertura que decidir).
 *  - Override manual (Map piezaId → 0..1) gana sobre la regla automática y
 *    persiste al navegar pasos.
 *
 * @param {Array} pieces piezas del módulo activo
 * @param {{ steps: Array<{paso:number, piezas:string[]}> }} sequence secuencia
 *   de buildAssemblySequence()
 * @param {number} currentStep paso actual (1-based)
 * @param {Map<string, number>} [overrides] aperturas manuales del usuario
 * @returns {Map<string, number>} piezaId -> apertura 0..1
 */
export function computeStepApertures(pieces, sequence, currentStep, overrides = new Map()) {
  const step = Number(currentStep);
  const stepOf = stepIndexByPiece(sequence);
  const result = new Map();
  for (const piece of pieces ?? []) {
    if (!motionConfigFor(piece)) continue;
    const paso = stepOf.get(piece.id);
    if (!paso || paso > step) continue;
    let valor = paso === step ? 1 : 0;
    if (overrides.has(piece.id)) valor = clamp01(overrides.get(piece.id));
    result.set(piece.id, valor);
  }
  return result;
}
