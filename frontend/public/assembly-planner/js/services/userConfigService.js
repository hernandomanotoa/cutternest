// js/services/userConfigService.js — Persistencia de offsets de posición vertical
// Sin DOM. Lógica pura testeable.

import { VERTICAL_POSITIONS } from '../core/config.js';

const STORAGE_KEY = 'cn-assembly-config';

function getStorage() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export function loadUserConfig() {
  const config = { ...VERTICAL_POSITIONS };
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
      }
    }
  } catch {
    // En entornos restringidos (jsdom, tests, iframes sin storage) cae a defaults.
  }

  return config;
}

export function saveUserConfig(overrides) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const diff = {};
    for (const key of Object.keys(VERTICAL_POSITIONS)) {
      const value = overrides?.[key];
      if (
        Object.prototype.hasOwnProperty.call(overrides || {}, key) &&
        Number.isFinite(value) &&
        value !== VERTICAL_POSITIONS[key]
      ) {
        diff[key] = value;
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
