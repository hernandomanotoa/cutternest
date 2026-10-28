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
    text: 'Con el gola activo, este panel permite ajustar el alto del perfil, el gap de agarre, la profundidad de las tiras y la fijación. Los valores se guardan por módulo.',
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
    text: 'El botón “Aplicar gola” ejecuta el cambio: se eliminan los tiradores, se crean las tiras de melamina y la caja del cajón superior se rebaja para pasar bajo el canal L. Reversible con Deshacer (Ctrl+Z).',
    position: 'top',
  },
];
