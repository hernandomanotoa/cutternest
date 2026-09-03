// js/renderer3d/camera.js — OrbitControls para renderizador 3D SVG
// Gestiona cámara orbital con drag, zoom, pan, límites y reset.

const DEFAULT_ROT_SENSITIVITY = 0.3;
const DEFAULT_PAN_SENSITIVITY = 1.0;
const DEFAULT_ZOOM_FACTOR = 1.08;
const MIN_SCALE = 0.05;
const MAX_SCALE = 0.5;

export const DEFAULT_CAMERA = {
  rotX: 25,
  rotY: -35,
  scale: 0.14,
  offsetX: 450,
  offsetY: 350,
};

export class OrbitControls {
  constructor(container, options = {}) {
    this.container = container;
    this.rotX = options.rotX ?? DEFAULT_CAMERA.rotX;
    this.rotY = options.rotY ?? DEFAULT_CAMERA.rotY;
    this.scale = options.scale ?? DEFAULT_CAMERA.scale;
    this.offsetX = options.offsetX ?? DEFAULT_CAMERA.offsetX;
    this.offsetY = options.offsetY ?? DEFAULT_CAMERA.offsetY;

    this.rotSensitivity = options.rotSensitivity ?? DEFAULT_ROT_SENSITIVITY;
    this.panSensitivity = options.panSensitivity ?? DEFAULT_PAN_SENSITIVITY;
    this.zoomFactor = options.zoomFactor ?? DEFAULT_ZOOM_FACTOR;
    this.minScale = options.minScale ?? MIN_SCALE;
    this.maxScale = options.maxScale ?? MAX_SCALE;

    this.minRotX = options.minRotX ?? -60;
    this.maxRotX = options.maxRotX ?? 60;
    this.minRotY = options.minRotY ?? -90;
    this.maxRotY = options.maxRotY ?? 90;

    this.inertia = options.inertia ?? 0.1;
    this.velocityX = 0;
    this.velocityY = 0;

    this._callbacks = [];
    if (options.onChange) this._callbacks.push(options.onChange);
    this.onChange = () => this._callbacks.forEach((cb) => cb());

    this.isDragging = false;
    this.isPanning = false;
    this.lastX = 0;
    this.lastY = 0;

    this._needsUpdate = true;

    this._boundMouseDown = this._onMouseDown.bind(this);
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._boundWheel = this._onWheel.bind(this);
    this._boundContextMenu = this._onContextMenu.bind(this);

    this._attach();
  }

  addChangeListener(cb) {
    if (typeof cb === 'function') this._callbacks.push(cb);
  }

  removeChangeListener(cb) {
    this._callbacks = this._callbacks.filter((fn) => fn !== cb);
  }

  getState() {
    return {
      rotX: this.rotX,
      rotY: this.rotY,
      scale: this.scale,
      offsetX: this.offsetX,
      offsetY: this.offsetY,
    };
  }

  setState(state) {
    this.rotX = state.rotX ?? this.rotX;
    this.rotY = state.rotY ?? this.rotY;
    this.scale = state.scale ?? this.scale;
    this.offsetX = state.offsetX ?? this.offsetX;
    this.offsetY = state.offsetY ?? this.offsetY;
    this._clamp();
    this._needsUpdate = true;
    this.onChange();
  }

  reset() {
    this.setState({ ...DEFAULT_CAMERA });
  }

  destroy() {
    this._detach();
  }

  _attach() {
    if (!this.container) return;
    this.container.addEventListener('mousedown', this._boundMouseDown);
    this.container.addEventListener('mousemove', this._boundMouseMove);
    window.addEventListener('mouseup', this._boundMouseUp);
    this.container.addEventListener('wheel', this._boundWheel, { passive: false });
    this.container.addEventListener('contextmenu', this._boundContextMenu);
  }

  _detach() {
    if (!this.container) return;
    this.container.removeEventListener('mousedown', this._boundMouseDown);
    this.container.removeEventListener('mousemove', this._boundMouseMove);
    window.removeEventListener('mouseup', this._boundMouseUp);
    this.container.removeEventListener('wheel', this._boundWheel);
    this.container.removeEventListener('contextmenu', this._boundContextMenu);
  }

  _onMouseDown(e) {
    if (e.button === 2 || e.shiftKey) {
      this.isPanning = true;
    } else if (e.button === 0) {
      this.isDragging = true;
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.velocityX = 0;
    this.velocityY = 0;
    e.preventDefault();
  }

  _onMouseMove(e) {
    if (!this.isDragging && !this.isPanning) return;

    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.isDragging) {
      this.velocityX = dx * this.rotSensitivity;
      this.velocityY = dy * this.rotSensitivity;
      this.rotY += this.velocityX;
      this.rotX -= this.velocityY;
      this._clamp();
    } else if (this.isPanning) {
      this.offsetX += dx * this.panSensitivity;
      this.offsetY += dy * this.panSensitivity;
    }

    this._needsUpdate = true;
    this.onChange();
  }

  _onMouseUp() {
    this.isDragging = false;
    this.isPanning = false;
    // Inercia leve: se puede consumir en un loop de animación si se desea.
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const direction = e.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(
      this.maxScale,
      Math.max(this.minScale, this.scale * (direction > 0 ? this.zoomFactor : 1 / this.zoomFactor))
    );

    // Zoom centrado en el cursor
    const worldBeforeX = (mouseX - this.offsetX) / this.scale;
    const worldBeforeY = (mouseY - this.offsetY) / this.scale;

    this.scale = newScale;

    this.offsetX = mouseX - worldBeforeX * this.scale;
    this.offsetY = mouseY - worldBeforeY * this.scale;

    this._needsUpdate = true;
    this.onChange();
  }

  _onContextMenu(e) {
    e.preventDefault();
  }

  _clamp() {
    this.rotX = Math.max(this.minRotX, Math.min(this.maxRotX, this.rotX));
    this.rotY = Math.max(this.minRotY, Math.min(this.maxRotY, this.rotY));
  }

  consumeUpdate() {
    const needs = this._needsUpdate;
    this._needsUpdate = false;
    return needs;
  }
}
