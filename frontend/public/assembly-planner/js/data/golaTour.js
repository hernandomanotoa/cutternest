// js/data/golaTour.js — Pasos del tour guiado del sistema gola (Constructor).
// Los selectores están verificados contra js/views/constructorView.js: si la
// vista renombra esos atributos, hay que actualizarlos aquí.
// Capa data: solo datos, sin DOM ni lógica.

export const GOLA_TOUR_STEPS = [
  {
    selector: '[data-action="add-content"][data-kind="drawer"]',
    title: 'Agregar cajones',
    text: 'Cada módulo se llena desde sus botones de contenido. Agregá al menos dos cajones apilados: el sistema gola necesita una pila de frentes para crear los canales de agarre.',
    position: 'top',
  },
  {
    selector: '[data-action="toggle-gola"]',
    title: 'Activar el sistema gola',
    text: 'Con dos o más cajones en el módulo, marcá “Gola” para previsualizar la conversión a apertura sin tiradores.',
    position: 'bottom',
  },
  {
    selector: '[data-gola-panel]',
    title: 'Ajustar parámetros',
    text: 'Con el gola activo, este panel permite ajustar el alto del perfil, el gap de agarre, el retranqueo del canal y la fijación. Los valores se guardan por módulo.',
    position: 'top',
  },
  {
    selector: '[data-gola-preview]',
    title: 'Vista previa de la activación',
    text: 'Antes de aplicar, el Constructor muestra un resumen: canales tipo C y L creados, gap resultante y cómo quedan los frentes reescalados.',
    position: 'bottom',
  },
  {
    selector: '[data-action="confirm-gola"]',
    title: 'Confirmar la aplicación',
    text: 'El botón “Aplicar gola” ejecuta el cambio: se eliminan los tiradores y se crean los canales C de melamina entre los frentes (retranqueados, con su agarre detrás de los frentes). Reversible con Deshacer (Ctrl+Z).',
    position: 'top',
  },
];
