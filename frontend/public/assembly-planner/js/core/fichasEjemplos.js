// js/core/fichasEjemplos.js — Ficha técnica asignada a cada CSV de ejemplo
// Datos puros (S3): mapea el nombre de archivo de data/*.csv al tipo de
// mueble de la taxonomía (js/core/furnitureTaxonomy.js → AMBIENTES/FICHAS).
// El uso es S4 (UI de ficha técnica); aquí solo vive la tabla de asignación.
//
// Criterio de asignación: el mapa cubre EXACTAMENTE los CSV de data/, que a
// su vez son solo los ejemplos redefinidos sobre S1–S4: regenerables por
// scripts/generar-ejemplos-assembly.mjs o scripts/generar-ejemplos-catalogo.py
// (modelo de cajón de 6 piezas) y con ficha de tipo exacta. Las demos legacy
// no regenerables (universal-*, fondo-*, básico, global, cabecero, etc.) se
// retiraron del catálogo y por tanto de este mapa.

export const FICHAS_EJEMPLOS = {
  // ── Dormitorio ───────────────────────────────────────────────────────────
  'ejemplo-closet-zocalo-cajon.csv': { tipo: 'closet' },
  'ejemplo-base-cama-cajones.csv': { tipo: 'cama_base' },
  'ejemplo-armario.csv': { tipo: 'closet' },
  'ejemplo-comoda.csv': { tipo: 'cajonera' },
  'ejemplo-comoda-zocalo-cajon.csv': { tipo: 'cajonera' },
  'ejemplo-cajonera-correderas-ocultas.csv': { tipo: 'cajonera' },
  'ejemplo-mesa-noche.csv': { tipo: 'buro' },
  'ejemplo-buro-3-cajones.csv': { tipo: 'buro' },
  'ejemplo-buro-flotante.csv': { tipo: 'buro' },
  'ejemplo-comoda-baja.csv': { tipo: 'cajonera' },
  'ejemplo-cajonera-alturas-mixtas.csv': { tipo: 'cajonera' },
  'ejemplo-tocador.csv': { tipo: 'tocador' },
  'ejemplo-tocador-espejo.csv': { tipo: 'tocador' },
  'ejemplo-closet-interior.csv': { tipo: 'closet' },
  'ejemplo-closet-abierto-modular.csv': { tipo: 'closet' },
  'ejemplo-closet-zapatera-mixta.csv': { tipo: 'zapatera' },

  // ── Cocina / comedor ─────────────────────────────────────────────────────
  'ejemplo-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-isla-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-columna-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-aparador.csv': { tipo: 'alacena' },
  'ejemplo-bufetero.csv': { tipo: 'alacena' },
  'ejemplo-vitrina.csv': { tipo: 'alacena' },
  'ejemplo-mesa-extensible.csv': { tipo: 'mesa_comedor' },
  'ejemplo-banco-comedor.csv': { tipo: 'silla_banco' },
  'ejemplo-botellero.csv': { tipo: 'bar_cantina' },

  // ── Sala ─────────────────────────────────────────────────────────────────
  'ejemplo-mueble-tv.csv': { tipo: 'rack_entretenimiento' },
  'ejemplo-mueble-tv-zocalo-cajon.csv': { tipo: 'rack_entretenimiento' },
  'ejemplo-panel-tv.csv': { tipo: 'panel_tv' },
  'ejemplo-estanteria.csv': { tipo: 'estanteria_librero' },
  'ejemplo-separador-ambientes.csv': { tipo: 'estanteria_librero' },

  // ── Oficina ──────────────────────────────────────────────────────────────
  'ejemplo-escritorio.csv': { tipo: 'escritorio' },
  'ejemplo-archivador.csv': { tipo: 'archivador' },
  'ejemplo-estacion-trabajo.csv': { tipo: 'estacion_trabajo' },
  'ejemplo-recepcion.csv': { tipo: 'recepcion' },
  'ejemplo-estanteria-oficina.csv': { tipo: 'estanteria_oficina' },

  // ── Entrada ──────────────────────────────────────────────────────────────
  'ejemplo-zapatera-repisa.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-banco.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-compartimentos.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-extraible.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-volquete.csv': { tipo: 'zapatera' },
  'ejemplo-recibidor-lineal.csv': { tipo: 'recibidor_consola' },
  'ejemplo-consola.csv': { tipo: 'recibidor_consola' },

  // ── Baño ─────────────────────────────────────────────────────────────────
  'ejemplo-vanitory.csv': { tipo: 'bajo_lavatorio' },
  'ejemplo-espejo-modulo.csv': { tipo: 'botiquin_espejo' },
  'ejemplo-columna-auxiliar-bano.csv': { tipo: 'mueble_alto_banio' },
};
