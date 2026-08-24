// js/components/manual/manualSupportWarnings.js — Cálculo de advertencias de soporte para el manual
// Sin DOM.

import { normalizeName } from '../../utils/normalize.js';

function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function calculateSupportWarnings(modulePieces, moduleHeight) {
  if (!modulePieces || modulePieces.length === 0) return [];

  const hasSoporteVertical = modulePieces.some((p) => {
    const n = norm(p.nombre);
    return n.includes('montante') || n.includes('tirante') || n.includes('pata') || n.includes('soporte vertical') || n.includes('pie derecho');
  });

  const hasSoporteIntermedio = modulePieces.some((p) => {
    const n = norm(p.nombre);
    return n.includes('travesano') || n.includes('travesaño') || n.includes('refuerzo') || n.includes('soporte intermedio') || n.includes('cantonera');
  });

  const wideRepisas = modulePieces.filter((p) => {
    const n = norm(p.nombre);
    return (n.includes('repisa') || n.includes('estante')) && (parseInt(p.ancho) || 0) > 1000;
  });

  const warnings = [];
  if (moduleHeight > 1800 && !hasSoporteVertical) {
    warnings.push('Este módulo supera los 1800 mm de alto y no tiene soporte vertical (montante, tirante, pata o pie derecho). Verifica estabilidad.');
  }
  if (wideRepisas.length > 0 && !hasSoporteIntermedio) {
    warnings.push(`Repisa(s) de ${wideRepisas.map((p) => `${p.ancho}x${p.alto}`).join(', ')} mm sin soporte intermedio. Considera un travesaño, refuerzo o cantonera.`);
  }

  return warnings;
}
