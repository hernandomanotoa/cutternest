// js/core/gapPresets.js — Defaults de offsets/gaps por mueble (ejemplo CSV)
// Los presets se versionan en el repo: un rebuild NO los pierde. El usuario
// puede editarlos aquí en vez de re-ingresarlos en la UI tras cada deploy.
// Jerarquía de valores: VERTICAL_POSITIONS (config.js) ← preset del mueble
// ← ediciones del usuario (localStorage, vía userConfigService).
// Servicio puro sin DOM (regla de oro: no vive en views/ ni components/).

// Clave: nombre del archivo CSV en data/ (ej. 'ejemplo-closet-abierto-modular.csv').
// Valor: parciales de VERTICAL_POSITIONS que ese mueble usa como default.
export const GAP_PRESETS = {
  'ejemplo-closet-abierto-modular.csv': {
    hangerRailHeight: 1800,   // barra camisera estándar del vestidor
    stackGap: 25,             // doblado apretado de prenda en repisas
    topInset: 60,             // alzamiento superior en closet abierto
  },
  'ejemplo-estanteria.csv': {
    stackGap: 30,             // libros/aprovechamiento de entrepaños
  },
};

// Resuelve el preset para una URL/ruta de ejemplo (./data/xxx.csv) o nombre.
// Sin coincidencia → {} (los defaults de config.js mandan solos).
export function getGapPreset(urlOrName) {
  const name = String(urlOrName || '').split('/').pop();
  return GAP_PRESETS[name] || {};
}
