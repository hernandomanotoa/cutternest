// js/core/store.js — Store central con EventEmitter para el Assembly Planner
// Patrón: estado inmutable-ish + suscripciones. Las vistas reciben el store
// y se suscriben; nunca mutan el estado directamente.

import { loadUserConfig } from '../services/userConfigService.js';

export const EVENTS = {
  PIECES_CHANGED: 'pieces:changed',
  DEPENDENCIES_CHANGED: 'dependencies:changed',
  MODULE_CHANGED: 'module:changed',
  VIEW_CHANGED: 'view:changed',
  STEPS_CHANGED: 'steps:changed',
  CYCLE_CHANGED: 'cycle:changed',
  ALERTS_CHANGED: 'alerts:changed',
  HARDWARE_CHANGED: 'hardware:changed',
  STATUS_CHANGED: 'status:changed',
  STATE_CHANGED: 'state:changed',
  USER_CONFIG_CHANGED: 'userConfig:changed',
};

const DEFAULT_STATE = {
  pieces: [],
  dependencies: [],
  modules: [],
  currentModule: 'global',
  levels: [],
  sorted: [],
  cycle: null,
  steps: [],
  alerts: [],
  hardware: [],
  currentStep: 0,
  simulationMode: 'paused',
  currentView: 'csv',
  manualZoom: 1,
  warnings: [],
  userConfig: loadUserConfig(),
};

export function createStore(initialState = {}) {
  let state = Object.freeze({ ...DEFAULT_STATE, ...initialState });
  const listeners = new Map();

  function emit(eventName, payload) {
    const set = listeners.get(eventName);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload, eventName);
      } catch (err) {
        console.error(`[store] error en listener de ${eventName}:`, err);
      }
    });
  }

  return {
    get: () => state,

    set: (updater) => {
      const prev = state;
      const next = typeof updater === 'function' ? updater(state) : { ...state, ...updater };
      state = Object.freeze({ ...next });
      emit(EVENTS.STATE_CHANGED, { prev, state });
      if (next.userConfig !== undefined && next.userConfig !== prev.userConfig) {
        emit(EVENTS.USER_CONFIG_CHANGED, state.userConfig);
      }
      return state;
    },

    setField: (field, value) => {
      if (state[field] === value) return state;
      state = Object.freeze({ ...state, [field]: value });
      emit(EVENTS.STATE_CHANGED, { prev: state, state });
      const eventName = EVENTS[`${field.toUpperCase()}_CHANGED`];
      if (eventName) emit(eventName, value);
      return state;
    },

    subscribe: (eventName, fn) => {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName).add(fn);
      return () => {
        listeners.get(eventName)?.delete(fn);
      };
    },

    subscribeAll: (fn) => {
      return subscribe(EVENTS.STATE_CHANGED, fn);
    },
  };
}

// Store singleton de la aplicación. Se inicializa desde main.js/app.js.
let appStore = null;

export function getStore() {
  if (!appStore) appStore = createStore();
  return appStore;
}

export function setStore(store) {
  appStore = store;
}

function subscribe(eventName, fn) {
  return getStore().subscribe(eventName, fn);
}
