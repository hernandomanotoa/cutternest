// js/services/userConfigService.js — Persistencia de offsets y correcciones
// Sin DOM. Lógica pura testeable.

import { VERTICAL_POSITIONS } from '../core/config.js';

const STORAGE_KEY = 'cn-assembly-config';

// Preset activo del mueble cargado (js/core/gapPresets.js). El diff persistido
// se calcula contra los defaults efectivos (VERTICAL_POSITIONS + preset), así
// el usuario puede revertir un valor al default del mueble, no solo al global.
let activePreset = {};

export function setActivePreset(preset = {}) {
  activePreset = { ...preset };
}

export function getActivePreset() {
  return { ...activePreset };
}

function effectiveDefaults() {
  const base = { ...VERTICAL_POSITIONS };
  for (const key of Object.keys(VERTICAL_POSITIONS)) {
    const value = Number(activePreset[key]);
    if (Number.isFinite(value)) base[key] = value;
  }
  return base;
}

function getStorage() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadUserConfig() {
  const defaults = effectiveDefaults();
  const config = { ...defaults, pieceOffsets: {}, fichaCorrections: {} };
  const storage = getStorage();
  if (!storage) return config;

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const key of Object.keys(VERTICAL_POSITIONS)) {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            const value = Number(parsed[key]);
            if (Number.isFinite(value)) {
              config[key] = value;
            }
          }
        }
        if (parsed.pieceOffsets && typeof parsed.pieceOffsets === 'object') {
          config.pieceOffsets = { ...parsed.pieceOffsets };
        }
        // Correcciones manuales de la ficha técnica ({ambiente, tipo, nivel}
        // parciales). Se copian tal cual; la validación ocurre al aplicarlas
        // (applyFichaCorrections en furnitureClassifier.js).
        if (parsed.fichaCorrections && typeof parsed.fichaCorrections === 'object') {
          config.fichaCorrections = { ...parsed.fichaCorrections };
        }
        for (const key of STRING_PREFS) {
          if (typeof parsed[key] === 'string') config[key] = parsed[key];
        }
      }
    }
  } catch {
    // En entornos restringidos (jsdom, tests, iframes sin storage) cae a defaults.
  }

  return config;
}

// Preferencias de texto persistibles (selects del formulario de contenido
// del Constructor). Se guardan tal cual; loadUserConfig las rehidrata.
export const STRING_PREFS = ['contentTipoCajon', 'contentTipoZapatera', 'contentRiel', 'golaFijacion', 'contentModoZapatera'];

export function saveUserConfig(overrides) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const defaults = effectiveDefaults();
    const diff = {};
    for (const key of Object.keys(VERTICAL_POSITIONS)) {
      const value = overrides?.[key];
      if (
        Object.prototype.hasOwnProperty.call(overrides || {}, key) &&
        Number.isFinite(value) &&
        value !== defaults[key]
      ) {
        diff[key] = value;
      }
    }
    if (
      overrides?.pieceOffsets &&
      typeof overrides.pieceOffsets === 'object' &&
      Object.keys(overrides.pieceOffsets).length > 0
    ) {
      diff.pieceOffsets = overrides.pieceOffsets;
    }
    // Mismo patrón que pieceOffsets: solo se persiste si no está vacío.
    if (
      overrides?.fichaCorrections &&
      typeof overrides.fichaCorrections === 'object' &&
      Object.keys(overrides.fichaCorrections).length > 0
    ) {
      diff.fichaCorrections = overrides.fichaCorrections;
    }
    for (const key of STRING_PREFS) {
      if (typeof overrides?.[key] === 'string' && overrides[key]) {
        diff[key] = overrides[key];
      }
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(diff));
  } catch {
    // Falla silenciosa en entornos sin localStorage.
  }
}

export function resetUserConfig() {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Falla silenciosa.
  }
}
