// js/core/furnitureTaxonomy.js — Taxonomía de muebles del taller (datos puros)
//
// Implementa S1 de la guía de clasificación de muebles del dueño del taller
// (5 criterios: ambiente, tipo de mueble, método de producción, estructura
// constructiva y uso de tablero). Aquí viven SOLO los datos: rangos de
// medidas, espesores, herrajes típicos, niveles de complejidad y tiempos.
// La inferencia sobre piezas reales está en js/services/furnitureClassifier.js.
//
// IMPORTANTE: los tiempos (tiempoMinutos) y las medidas estándar son
// DEFAULTS AJUSTABLES del taller, no cotizaciones cerradas. El dueño puede
// (y debe) recalibrarlos con sus propios tiempos reales de producción.

// ── Criterio 1: Ambiente → tipos de mueble ─────────────────────────────────
export const AMBIENTES = {
  dormitorio: ['closet', 'cama_base', 'buro', 'cajonera', 'tocador'],
  cocina_comedor: ['cocina_modular', 'alacena', 'mesa_comedor', 'silla_banco', 'bar_cantina'],
  sala: ['rack_entretenimiento', 'estanteria_librero', 'mesa_centro_lateral', 'panel_tv'],
  oficina: ['escritorio', 'archivador', 'estacion_trabajo', 'recepcion', 'estanteria_oficina'],
  entrada: ['zapatera', 'recibidor_consola', 'perchero_zapatera'],
  banio: ['bajo_lavatorio', 'mueble_alto_banio', 'botiquin_espejo'],
};

// ── Métodos de producción (catálogo de referencia del taller) ──────────────
export const METODOS_PRODUCCION = {
  serie: { label: 'Serie (lote repetitivo)' },
  a_medida: { label: 'A medida (proyecto único)' },
  modular: { label: 'Modular (configuración por módulos)' },
};

// ── Criterio 4: Estructuras constructivas ──────────────────────────────────
export const ESTRUCTURAS_CONSTRUCTIVAS = {
  cajones: { label: 'Con cajones' },
  puertas: { label: 'Con puertas' },
  mixto: { label: 'Puertas y cajones' },
  abierto: { label: 'Abierto (entrepaños)' },
  frentes_abatibles: { label: 'Frentes abatibles / volquetes' },
};

// ── Criterio 5: Uso del tablero ────────────────────────────────────────────
export const USO_TABLERO = {
  cuerpo_frente: { label: 'Cuerpo y frente en colores distintos' },
  unicolor: { label: 'Un solo color de tablero' },
  tapacanto_visible: { label: 'Tapacanto como acento visible' },
};

// ── Nivel de complejidad (score → nivel) ───────────────────────────────────
export const COMPLEXITY_SCORE_RANGES = {
  basico: [0, 2],
  medio: [3, 5],
  alto: [6, Infinity],
};

export const NIVELES_COMPLEJIDAD = {
  basico: { label: 'Básico', scoreRange: COMPLEXITY_SCORE_RANGES.basico },
  medio: { label: 'Medio', scoreRange: COMPLEXITY_SCORE_RANGES.medio },
  alto: { label: 'Alto', scoreRange: COMPLEXITY_SCORE_RANGES.alto },
};

// ── Criterios 2+3: Ficha técnica por tipo de mueble ────────────────────────
// medidasEstandar en mm. tiempos en minutos de mano de obra del taller
// (defaults ajustables, ver nota de cabecera del módulo).
export const FICHAS = {
  closet: {
    medidasEstandar: { ancho: [1200, 3000], alto: [1800, 2400], prof: [550, 650] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Puertas corredizas con riel superior/inferior',
      'Bisagras de cazoleta con cierre suave (puertas abatibles)',
      'Tubo colgador con soportes (área de colgado)',
      'Correderas telescópicas para cajoneras internas',
      'Tiradores o jaladeras de perfil',
    ],
    nivel: 'alto',
    tiempoMinutos: [480, 720],
  },
  cama_base: {
    medidasEstandar: { ancho: [900, 1800], alto: [250, 450], prof: [1900, 2000] },
    espesoresTipicos: [15, 18],
    herrajesTipicos: [
      'Pistones a gas o bisagras abatibles (cama con baúl)',
      'Soportes centrales de refuerzo (tarima)',
      'Zapatas o patas niveladoras',
      'Esquineros metálicos de unión',
    ],
    nivel: 'medio',
    tiempoMinutos: [240, 360],
  },
  buro: {
    medidasEstandar: { ancho: [400, 600], alto: [450, 700], prof: [350, 450] },
    espesoresTipicos: [15, 16],
    herrajesTipicos: [
      'Corredera telescópica de cajón',
      'Tirador o jaladera',
      'Tapones de plástico para tornillos',
    ],
    nivel: 'basico',
    tiempoMinutos: [90, 150],
  },
  cajonera: {
    medidasEstandar: { ancho: [600, 1200], alto: [700, 1400], prof: [400, 500] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Correderas telescópicas o correderas ocultas (cajones)',
      'Tiradores o jaladeras',
      'Fondo de cajón en HDF/MDF 3–5 mm con ranura',
      'Tope y amortiguador de cajón (opcional)',
    ],
    nivel: 'medio',
    tiempoMinutos: [180, 300],
  },
  tocador: {
    medidasEstandar: { ancho: [1000, 1600], alto: [750, 1650], prof: [400, 500] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Correderas de cajón con cierre suave',
      'Bisagras de cazoleta (puertas de espejo)',
      'Espejo con marco o bisel',
      'Tiradores decorativos',
    ],
    nivel: 'medio',
    tiempoMinutos: [240, 360],
  },
  cocina_modular: {
    medidasEstandar: { ancho: [1800, 3600], alto: [2100, 2400], prof: [350, 600] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Bisagras de cazoleta con cierre suave (puertas)',
      'Correderas ocultas de cajón (tandem)',
      'Jaladeras de perfil Gola o tirador',
      'Mensulas y soportes para tarja/estufa',
      'Zócalo de PVC o melamina con clip',
    ],
    nivel: 'alto',
    tiempoMinutos: [720, 1440],
  },
  alacena: {
    medidasEstandar: { ancho: [800, 2000], alto: [700, 2100], prof: [300, 450] },
    espesoresTipicos: [15, 16],
    herrajesTipicos: [
      'Bisagras de cazoleta',
      'Puertas de cristal con clips (opcional)',
      'Soporte de repisa metálico regulable',
      'Tiradores',
    ],
    nivel: 'medio',
    tiempoMinutos: [180, 300],
  },
  mesa_comedor: {
    medidasEstandar: { ancho: [1200, 2200], alto: [720, 780], prof: [800, 1100] },
    espesoresTipicos: [18, 25, 30],
    herrajesTipicos: [
      'Esquineros metálicos de unión',
      'Tacos y tornillos de ensamble',
      'Tapones decorativos',
      'Soporte de centro para tableros largos',
    ],
    nivel: 'basico',
    tiempoMinutos: [120, 240],
  },
  silla_banco: {
    medidasEstandar: { ancho: [400, 1800], alto: [450, 900], prof: [400, 500] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Tarugos y pegamento de ensamble',
      'Soportes de refuerzo en patas',
      'Tapicería o cojín (opcional, banco)',
    ],
    nivel: 'basico',
    tiempoMinutos: [60, 120],
  },
  bar_cantina: {
    medidasEstandar: { ancho: [1000, 2000], alto: [1000, 1100], prof: [400, 600] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Portacopas metálico bajo repisa',
      'Correderas para cajón de barra',
      'Soportes de refuerzo para tope',
      'Jaladera de perfil',
    ],
    nivel: 'medio',
    tiempoMinutos: [180, 300],
  },
  rack_entretenimiento: {
    medidasEstandar: { ancho: [1200, 2400], alto: [450, 600], prof: [400, 500] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Correderas telescópicas de cajón',
      'Jaladeras de perfil oculto',
      'Pasacables plástico (gestión de cables)',
      'Soporte de TV opcional (brazo o base)',
    ],
    nivel: 'medio',
    tiempoMinutos: [180, 300],
  },
  estanteria_librero: {
    medidasEstandar: { ancho: [800, 1800], alto: [1800, 2200], prof: [280, 400] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Soporte de repisa metálico regulable o perno',
      'Taco de muro con tarugo (anclaje a pared)',
      'Tapones para tornillos',
    ],
    nivel: 'basico',
    tiempoMinutos: [60, 90],
  },
  mesa_centro_lateral: {
    medidasEstandar: { ancho: [500, 1200], alto: [350, 550], prof: [500, 600] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Esquineros metálicos de unión',
      'Niveladores en patas',
      'Corredera ligera (cajón ocasional)',
    ],
    nivel: 'basico',
    tiempoMinutos: [60, 120],
  },
  panel_tv: {
    medidasEstandar: { ancho: [1200, 2400], alto: [1200, 1800], prof: [200, 350] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Soporte de TV con brazo articulado',
      'Pasacables plástico',
      'Taco de muro con tarugo (anclaje a pared)',
      'Soporte de repisa flotante oculto',
    ],
    nivel: 'medio',
    tiempoMinutos: [180, 300],
  },
  escritorio: {
    medidasEstandar: { ancho: [1000, 1600], alto: [730, 780], prof: [500, 800] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Corredera telescópica (cajón)',
      'Pasacables de escritorio',
      'Patas metálicas o niveladores',
    ],
    nivel: 'basico',
    tiempoMinutos: [90, 150],
  },
  archivador: {
    medidasEstandar: { ancho: [400, 900], alto: [700, 1400], prof: [400, 500] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Correderas telescópicas reforzadas (peso de carpetas)',
      'Bisagras de cazoleta (puertas abatibles)',
      'Tirador tipo cajón o jaladera',
    ],
    nivel: 'medio',
    tiempoMinutos: [120, 240],
  },
  estacion_trabajo: {
    medidasEstandar: { ancho: [1400, 3200], alto: [730, 780], prof: [600, 800] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Pasacables múltiple (canaleta)',
      'Correderas telescópicas de cajón',
      'Divisor acústico con soportes',
      'Canaleta porta-cables bajo tablero',
    ],
    nivel: 'medio',
    tiempoMinutos: [240, 420],
  },
  recepcion: {
    medidasEstandar: { ancho: [1800, 3000], alto: [1000, 1150], prof: [600, 800] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Bisagras de cazoleta (gabinete interior)',
      'Correderas telescópicas de cajón',
      'Iluminación LED con perfil de aluminio',
      'Pasacables doble altura',
    ],
    nivel: 'alto',
    tiempoMinutos: [360, 600],
  },
  estanteria_oficina: {
    medidasEstandar: { ancho: [900, 1800], alto: [1800, 2200], prof: [300, 450] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Soporte de repisa metálico regulable',
      'Taco de muro con tarugo (anclaje anti-volcadura)',
      'Tapones para tornillos',
    ],
    nivel: 'basico',
    tiempoMinutos: [60, 120],
  },
  zapatera: {
    medidasEstandar: { ancho: [600, 1200], alto: [800, 1200], prof: [250, 350] },
    espesoresTipicos: [15, 16],
    herrajesTipicos: [
      'Corredera ligera o telescópica (zapatero extraíble)',
      'Pistón a gas o bisagra abatible (frente volquete)',
      'Tiradores',
    ],
    nivel: 'basico',
    tiempoMinutos: [90, 150],
  },
  recibidor_consola: {
    medidasEstandar: { ancho: [800, 1600], alto: [750, 900], prof: [250, 400] },
    espesoresTipicos: [15, 18, 25],
    herrajesTipicos: [
      'Corredera telescópica de cajón',
      'Taco de muro con tarugo (anclaje a pared)',
      'Tirador o jaladera',
    ],
    nivel: 'basico',
    tiempoMinutos: [90, 150],
  },
  perchero_zapatera: {
    medidasEstandar: { ancho: [600, 1000], alto: [1700, 1900], prof: [300, 400] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Ganchos metálicos para perchero',
      'Corredera ligera (zapatero inferior)',
      'Taco de muro con tarugo (anclaje a pared)',
    ],
    nivel: 'medio',
    tiempoMinutos: [150, 240],
  },
  bajo_lavatorio: {
    medidasEstandar: { ancho: [600, 1200], alto: [500, 850], prof: [450, 550] },
    espesoresTipicos: [15, 16, 18],
    herrajesTipicos: [
      'Bisagras de cazoleta resistentes a humedad',
      'Correderas con cierre suave (vanitory con cajón)',
      'Jaladera de perfil (evita golpes en lavabo)',
      'Tapones de plástico (tornillería oculta)',
    ],
    nivel: 'medio',
    tiempoMinutos: [150, 240],
  },
  mueble_alto_banio: {
    medidasEstandar: { ancho: [300, 600], alto: [1200, 2000], prof: [300, 400] },
    espesoresTipicos: [15, 16],
    herrajesTipicos: [
      'Bisagras de cazoleta resistentes a humedad',
      'Taco de muro con tarugo (anclaje a pared obligatorio)',
      'Tiradores',
    ],
    nivel: 'medio',
    tiempoMinutos: [120, 240],
  },
  botiquin_espejo: {
    medidasEstandar: { ancho: [500, 900], alto: [600, 800], prof: [120, 180] },
    espesoresTipicos: [15, 16],
    herrajesTipicos: [
      'Bisagras especiales para espejo',
      'Soporte de repisa de vidrio con clips',
      'Taco de muro con tarugo (anclaje a pared)',
    ],
    nivel: 'basico',
    tiempoMinutos: [60, 120],
  },
};
