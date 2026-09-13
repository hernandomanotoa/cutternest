// js/utils/fullscreen.js — Alternar pantalla completa del contenedor de una vista
// Helper DOM reutilizable por las vistas (isométrico, 3D). Conmuta entre
// requestFullscreen/exitFullscreen en `target` al pulsar `button`, actualiza
// el texto del botón según el estado y devuelve una función de limpieza que
// la vista debe invocar en su destroy().

const LABEL_ENTER = '⛶ Pantalla completa';
const LABEL_EXIT = 'Salir pantalla completa';

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function isSupported() {
  return typeof document !== 'undefined' &&
    !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
}

/**
 * @param {HTMLElement|null} button Botón que conmuta el estado.
 * @param {HTMLElement|null} target Elemento que ocupa la pantalla (la `.card`).
 * @returns {Function} detach: quita listeners del botón y del documento.
 */
export function attachFullscreenToggle(button, target) {
  if (!button || !target) return () => {};
  if (!isSupported()) {
    button.style.display = 'none';
    return () => {};
  }

  function updateLabel() {
    button.textContent = fullscreenElement() ? LABEL_EXIT : LABEL_ENTER;
  }

  function toggle() {
    if (fullscreenElement()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else if (target.requestFullscreen) {
      target.requestFullscreen();
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    }
  }

  button.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', updateLabel);
  document.addEventListener('webkitfullscreenchange', updateLabel);
  updateLabel();

  return () => {
    button.removeEventListener('click', toggle);
    document.removeEventListener('fullscreenchange', updateLabel);
    document.removeEventListener('webkitfullscreenchange', updateLabel);
  };
}
