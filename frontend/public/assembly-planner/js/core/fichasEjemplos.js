// js/core/fichasEjemplos.js — Ficha técnica asignada a cada CSV de ejemplo
// Datos puros (S3): mapea el nombre de archivo de data/*.csv al tipo de
// mueble de la taxonomía (js/core/furnitureTaxonomy.js → AMBIENTES/FICHAS).
// El uso es S4 (UI de ficha técnica); aquí solo vive la tabla de asignación.
//
// Criterio de asignación: nombre del archivo cuando es inequívoco; por
// contenido del CSV (comentario de cabecera / nombres de piezas) cuando el
// nombre es genérico. Las entradas con `nota: 'clasificación aproximada'`
// son casos donde el tipo se eligió por contenido y conviene revisarlo.

export const FICHAS_EJEMPLOS = {
  // ── Dormitorio ───────────────────────────────────────────────────────────
  'ejemplo-closet.csv': { tipo: 'closet' },
  'ejemplo-closet-modular-abierto.csv': { tipo: 'closet' },
  'ejemplo-closet-zocalo-cajon.csv': { tipo: 'closet' },
  'ejemplo-armario.csv': { tipo: 'closet' },
  'ejemplo-universal-ropero.csv': { tipo: 'closet' },
  'ejemplo-comoda.csv': { tipo: 'cajonera' },
  'ejemplo-comoda-zocalo-cajon.csv': { tipo: 'cajonera' },
  'ejemplo-cajonera.csv': { tipo: 'cajonera' },
  'ejemplo-cajonera-correderas-ocultas.csv': { tipo: 'cajonera' },
  'ejemplo-universal-cajonera.csv': { tipo: 'cajonera' },
  'ejemplo-mesa-noche.csv': { tipo: 'buro' },
  'ejemplo-cabecero.csv': { tipo: 'cama_base', nota: 'clasificación aproximada' },

  // ── Cocina / comedor ─────────────────────────────────────────────────────
  'ejemplo-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-isla-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-columna-cocina.csv': { tipo: 'cocina_modular' },
  'ejemplo-aparador.csv': { tipo: 'alacena' },
  'ejemplo-bufetero.csv': { tipo: 'alacena' },
  'ejemplo-vitrina.csv': { tipo: 'alacena', nota: 'clasificación aproximada' },
  'ejemplo-mesa-extensible.csv': { tipo: 'mesa_comedor' },
  'ejemplo-botellero.csv': { tipo: 'bar_cantina' },

  // ── Sala ─────────────────────────────────────────────────────────────────
  'ejemplo-mueble-tv.csv': { tipo: 'rack_entretenimiento' },
  'ejemplo-mueble-tv-zocalo-cajon.csv': { tipo: 'rack_entretenimiento' },
  'ejemplo-estanteria.csv': { tipo: 'estanteria_librero' },
  'ejemplo-librero-alto.csv': { tipo: 'estanteria_librero' },
  'ejemplo-universal-librero.csv': { tipo: 'estanteria_librero' },
  'ejemplo-separador-ambientes.csv': { tipo: 'estanteria_librero' },

  // ── Oficina ──────────────────────────────────────────────────────────────
  'ejemplo-escritorio.csv': { tipo: 'escritorio' },
  'ejemplo-archivador.csv': { tipo: 'archivador' },

  // ── Entrada ──────────────────────────────────────────────────────────────
  'ejemplo-zapatera-repisa.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-banco.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-compartimentos.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-extraible.csv': { tipo: 'zapatera' },
  'ejemplo-zapatero-volquete.csv': { tipo: 'zapatera' },
  'ejemplo-universal-zapatero.csv': { tipo: 'zapatera' },
  'ejemplo-recibidor-lineal.csv': { tipo: 'recibidor_consola' },
  'ejemplo-consola.csv': { tipo: 'recibidor_consola' },

  // ── Baño ─────────────────────────────────────────────────────────────────
  'ejemplo-vanitory.csv': { tipo: 'bajo_lavatorio' },
  'ejemplo-espejo-modulo.csv': { tipo: 'botiquin_espejo' },
  'ejemplo-columna-auxiliar-bano.csv': { tipo: 'mueble_alto_banio' },

  // ── Casos genéricos / de técnica (clasificación por contenido) ───────────
  'ejemplo-basico.csv': { tipo: 'estanteria_librero', nota: 'clasificación aproximada' },
  'ejemplo-global.csv': { tipo: 'estanteria_librero', nota: 'clasificación aproximada' },
  'ejemplo-fondo-custom.csv': { tipo: 'estanteria_librero', nota: 'clasificación aproximada' },
  'ejemplo-fondo-externo.csv': { tipo: 'estanteria_librero', nota: 'clasificación aproximada' },
  'ejemplo-fondo-interno.csv': { tipo: 'estanteria_librero', nota: 'clasificación aproximada' },
};
