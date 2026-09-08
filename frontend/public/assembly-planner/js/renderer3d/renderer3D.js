// js/renderer3d/renderer3D.js — Motor 3D SVG orbital principal
// Reutiliza el posicionamiento de IsometricRenderer y aplica proyección
// orbital, explode, transparencia selectiva e interacción.

import { pieceVertices, computeBoundingBox } from './geometry.js';
import { applyExplode, lerp, lerpAperturaState, rotateVertex, projectVertexCentered } from './transform.js';
import { classifyPiece } from './classifier3d.js';
import { buildSVG } from './svgBuilder.js';
import { OrbitControls, DEFAULT_CAMERA } from './camera.js';
import { createInteraction } from './interaction.js';
import { IsometricRenderer } from '../isometricRenderer.js';
import { getModulePieces, getModuleLabel } from '../utils.js';

export class Renderer3D {
  constructor(container, options = {}) {
    this.container = container;
    this.width = options.width || 900;
    this.height = options.height || 600;
    this.showDimensions = options.showDimensions ?? false;

    this.globalOpacity = options.globalOpacity ?? 0.85;
    this.xrayMode = options.xrayMode ?? false;
    this.explodeFactor = options.explodeFactor ?? 0;
    this.targetExplodeFactor = this.explodeFactor;
    this.animationFrameId = null;
    this.animationStartExplode = 0;
    this.animationFromExplode = 0;
    this.aperturaAnim = null;
    this.aperturaFrameId = null;

    this.moduleGapMode = options.moduleGapMode ?? 'compact';
    this.verticalPositionOverrides = options.verticalPositionOverrides || {};

    this.geometries = [];
    this.moduleW = 0;
    this.moduleD = 0;
    this.moduleH = 0;
    this.moduleCenter = { x: 0, y: 0, z: 0 };

    this.selectedId = null;
    this.hoveredId = null;
    this.onPieceSelect = options.onPieceSelect || null;

    // Plano de sección: { axis: 'x'|'y'|'z', value: mm } | null
    this.section = null;

    // Modo ensamblaje paso a paso: paso visible (1-based) o null
    this.assemblyStep = null;
    this.assemblyLevels = new Map(); // pieceId -> paso

    this.needsRender = true;

    // Instancia auxiliar de IsometricRenderer para reutilizar su lógica de
    // posicionamiento. No se usa para renderizar, solo para computeGeometries.
    this.isoRenderer = new IsometricRenderer(document.createElement('div'), {
      scale: 0.12,
      showDimensions: false,
      showAxes: false,
      moduleGapMode: this.moduleGapMode,
      labelMode: 'none',
      verticalPositionOverrides: this.verticalPositionOverrides,
    });

    this.controls = new OrbitControls(container, {
      ...DEFAULT_CAMERA,
      onChange: () => {
        this.needsRender = true;
      },
    });

    this.interaction = createInteraction(container, {
      onHover: (id) => {
        if (this.hoveredId !== id) {
          this.hoveredId = id;
          this.needsRender = true;
        }
      },
      onSelect: (id) => {
        this.selectedId = this.selectedId === id ? null : id;
        this.needsRender = true;
        if (this.onPieceSelect) this.onPieceSelect(this.selectedId);
      },
    });
  }

  load(moduleId, pieces, opts = {}) {
    this.moduleId = moduleId;
    this._lastPieces = pieces;
    const filtered = getModulePieces(pieces, moduleId);
    const { geometries, moduleW, moduleD, moduleH, thickness, moduleLabel } =
      this.isoRenderer.computeGeometries(moduleId, pieces);

    this.moduleW = moduleW;
    this.moduleD = moduleD;
    this.moduleH = moduleH;
    this.thickness = thickness;
    this.moduleLabel = moduleLabel;
    // Distancia focal para proyección en perspectiva (~2.5× la dimensión mayor)
    this.perspDistance = Math.max(moduleW, moduleD, moduleH, 1) * 2.5;

    // Enriquecer geometrías con datos de las piezas originales para tooltip/cantos
    const piecesById = new Map(filtered.map((p) => [p.id, p]));
    this.geometries = geometries.map((g) => {
      const raw = piecesById.get(g.id) || {};
      return {
        ...g,
        raw,
        cantos: parseCantos(raw.cantos),
        cantidad: Number(raw.cantidad) || 1,
        modulo: String(raw.modulo || (g.moduleSeq ?? moduleId)),
        cx: g.x + g.w / 2,
        cy: g.y + g.d / 2,
        cz: g.z + g.h / 2,
        assemblyLevel: this.assemblyLevels.get(g.id) ?? null,
      };
    });

    // Centro de rotación/explode = centro de la caja envolvente real de todas
    // las geometrías visibles. En vista completa ('all') los módulos se
    // desplazan en X (offsetX acumulado en computeGeometries) y moduleW/2
    // quedaría sobre el primer módulo en vez del centro global de la escena.
    this.moduleCenter = computeBoundingBox(this.geometries).center;

    this.needsRender = true;
    if (!opts.keepCamera) this._fitCameraToModule();
  }

  _fitCameraToModule() {
    // Ajustar el offset y escala de la cámara para que la unión de todos los
    // módulos/piezas quede centrada en el viewport SVG.
    if (!this.geometries.length) return;

    const pieces = applyExplode(this.geometries, 0, this.moduleCenter, classifyPiece);
    const camera = { ...this.controls.getState(), perspDistance: this.perspDistance };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    pieces.forEach((piece) => {
      const baseVerts = pieceVertices(piece);
      baseVerts.forEach((v) => {
        const p = projectVertexCentered(v, this.moduleCenter, camera);
        minX = Math.min(minX, p.x - camera.offsetX);
        maxX = Math.max(maxX, p.x - camera.offsetX);
        minY = Math.min(minY, p.y - camera.offsetY);
        maxY = Math.max(maxY, p.y - camera.offsetY);
      });
    });

    if (!isFinite(minX)) return;

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const targetScale = Math.min(
      (this.width * 0.75) / Math.max(contentW, 1),
      (this.height * 0.75) / Math.max(contentH, 1)
    );
    const scale = Math.min(DEFAULT_CAMERA.scale * 1.5, Math.max(0.03, targetScale));

    this.controls.setState({
      offsetX: this.width / 2 - (minX + maxX) / 2,
      offsetY: this.height / 2 - (minY + maxY) / 2,
      scale,
    });
  }

  applyViewPreset(name) {
    const presets = {
      iso: { rotX: 30, rotY: 45, label: 'Isométrica' },
      front: { rotX: 0, rotY: 0, label: 'Frontal' },
      side: { rotX: 0, rotY: 90, label: 'Lateral' },
      top: { rotX: -60, rotY: 0, label: 'Superior' },
    };
    const preset = presets[name];
    if (!preset) return;
    this.controls.setState({ rotX: preset.rotX, rotY: preset.rotY });
    this._fitCameraToModule();
    return preset;
  }

  setSelectedId(id) {
    this.selectedId = id;
    this.needsRender = true;
  }

  setHoveredId(id) {
    this.hoveredId = id;
    this.needsRender = true;
  }

  /**
   * Configura el mapa pieza → paso de ensamblaje (desde niveles topológicos).
   * @param {Map<string, number>|Object} levels pieceId -> paso (1-based)
   */
  setAssemblyLevels(levels) {
    this.assemblyLevels = levels instanceof Map ? levels : new Map(Object.entries(levels || {}));
    if (this.geometries.length) {
      this.geometries = this.geometries.map((g) => ({
        ...g,
        assemblyLevel: this.assemblyLevels.get(g.id) ?? null,
      }));
    }
    this.needsRender = true;
  }

  /**
   * Activa/mueve el paso de ensamblaje visible.
   * @param {number|null} step paso 1-based, o null para salir del modo
   */
  setAssemblyStep(step) {
    if (step === null || step === undefined) {
      this.assemblyStep = null;
    } else {
      const n = Math.floor(Number(step));
      this.assemblyStep = Number.isFinite(n) && n >= 1 ? n : null;
    }
    this.needsRender = true;
  }

  /**
   * Activa/mueve un plano de sección.
   * @param {'x'|'y'|'z'|null} axis eje del corte (null desactiva)
   * @param {number} t fracción 0..1 del tamaño del módulo en ese eje
   */
  setSection(axis, t = 1) {
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      this.section = null;
      this.needsRender = true;
      return;
    }
    const size = axis === 'x' ? this.moduleW : axis === 'y' ? this.moduleD : this.moduleH;
    const frac = Math.max(0, Math.min(1, Number(t)));
    this.section = { axis, value: size * frac };
    this.needsRender = true;
  }

  setProjection(mode) {
    if (mode !== 'ortho' && mode !== 'persp') return;
    this.controls.setState({ projection: mode });
    this._fitCameraToModule();
  }

  setRotX(value) {
    this.controls.setState({ rotX: Number(value) });
  }

  setRotY(value) {
    this.controls.setState({ rotY: Number(value) });
  }

  setGlobalOpacity(value) {
    this.globalOpacity = value;
    this.needsRender = true;
  }

  setModuleGapMode(mode) {
    if (this.moduleGapMode === mode) return;
    this.moduleGapMode = mode;
    this.isoRenderer = new IsometricRenderer(document.createElement('div'), {
      scale: 0.12,
      showDimensions: false,
      showAxes: false,
      moduleGapMode: this.moduleGapMode,
      labelMode: 'none',
      verticalPositionOverrides: this.verticalPositionOverrides,
      aperturaGlobal: this.isoRenderer.aperturaGlobal,
      aperturas: this.isoRenderer.aperturas,
    });
    this.needsRender = true;
    this.load(this.moduleId, this._lastPieces || []);
  }

  setVerticalPositionOverrides(overrides) {
    if (this.verticalPositionOverrides === overrides) return;
    this.verticalPositionOverrides = overrides || {};
    this.isoRenderer = new IsometricRenderer(document.createElement('div'), {
      scale: 0.12,
      showDimensions: false,
      showAxes: false,
      moduleGapMode: this.moduleGapMode,
      labelMode: 'none',
      verticalPositionOverrides: this.verticalPositionOverrides,
      aperturaGlobal: this.isoRenderer.aperturaGlobal,
      aperturas: this.isoRenderer.aperturas,
    });
    this.needsRender = true;
    this.load(this.moduleId, this._lastPieces || []);
  }

  setApertura(aperturaGlobal, aperturas) {
    const to = {
      global: Math.min(1, Math.max(0, Number(aperturaGlobal) || 0)),
      overrides: { ...(aperturas || {}) },
    };
    const from = this._currentAperturaState();
    if (from.global === to.global && JSON.stringify(from.overrides) === JSON.stringify(to.overrides)) {
      this._applyAperturaState(to);
      return;
    }
    // Un setApertura nuevo cancela la animación anterior y arranca desde el
    // valor en vuelo (patrón del explode, ~300 ms con lerp/raf).
    this._cancelAperturaAnimation();
    this.aperturaAnim = { from, to, start: performance.now(), duration: 300 };
    this._scheduleAperturaAnimation();
  }

  _currentAperturaState() {
    return {
      global: this.isoRenderer.aperturaGlobal ?? 0,
      overrides: { ...(this.isoRenderer.aperturas || {}) },
    };
  }

  _applyAperturaState(state) {
    this.isoRenderer.setApertura(state.global, state.overrides);
    if (this.moduleId !== undefined && this._lastPieces) {
      // keepCamera: la apertura no debe re-encuadrar la cámara en cada frame.
      this.load(this.moduleId, this._lastPieces, { keepCamera: true });
    }
  }

  _scheduleAperturaAnimation() {
    this.aperturaFrameId = requestAnimationFrame(() => this._animateApertura());
  }

  _cancelAperturaAnimation() {
    if (this.aperturaFrameId !== null) {
      cancelAnimationFrame(this.aperturaFrameId);
      this.aperturaFrameId = null;
    }
    this.aperturaAnim = null;
  }

  _animateApertura() {
    const anim = this.aperturaAnim;
    if (!anim) return;
    const t = Math.min(1, (performance.now() - anim.start) / anim.duration);
    this._applyAperturaState(lerpAperturaState(anim.from, anim.to, t));
    if (t < 1) {
      this._scheduleAperturaAnimation();
    } else {
      this.aperturaAnim = null;
      this.aperturaFrameId = null;
      this._applyAperturaState(anim.to); // valor final exacto
    }
  }

  setXrayMode(value) {
    this.xrayMode = value;
    this.needsRender = true;
  }

  setExplodeFactor(value) {
    if (this.targetExplodeFactor === value) return;
    this.targetExplodeFactor = value;
    this.animationFromExplode = this.explodeFactor;
    this.animationStartExplode = performance.now();
    this._cancelAnimation();
    this._scheduleAnimation();
  }

  _scheduleAnimation() {
    this.animationFrameId = requestAnimationFrame(() => this._animateExplode());
  }

  _cancelAnimation() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  _animateExplode() {
    const now = performance.now();
    const duration = 300;
    const t = Math.min(1, (now - this.animationStartExplode) / duration);
    this.explodeFactor = lerp(this.animationFromExplode, this.targetExplodeFactor, t);
    this.needsRender = true;

    if (t < 1) {
      this._scheduleAnimation();
    }
  }

  setShowDimensions(value) {
    this.showDimensions = value;
    this.needsRender = true;
  }

  toggleDimensions() {
    this.showDimensions = !this.showDimensions;
    this.needsRender = true;
  }

  render() {
    if (!this.needsRender) return;
    this.needsRender = false;

    if (!this.geometries.length) {
      this.container.innerHTML = '<p class="empty-state">No hay piezas para renderizar.</p>';
      return;
    }

    const pieces = applyExplode(this.geometries, this.explodeFactor, this.moduleCenter, classifyPiece);

    // Líneas de ruta: centroide ensamblado -> despiezado
    const cameraState = { ...this.controls.getState(), perspDistance: this.perspDistance };
    let explodeLines = [];
    if (this.explodeFactor > 0.001) {
      const originals = new Map(this.geometries.map((g) => [g.id, { x: g.cx, y: g.cy, z: g.cz }]));
      explodeLines = pieces.map((p) => {
        const orig = originals.get(p.id);
        if (!orig) return null;
        const from = projectVertexCentered(orig, this.moduleCenter, cameraState);
        const to = projectVertexCentered({ x: p.cx, y: p.cy, z: p.cz }, this.moduleCenter, cameraState);
        return { id: p.id, from, to };
      }).filter(Boolean);
    }

    const dimsText = `${Math.round(this.moduleW)} × ${Math.round(this.moduleD)} × ${Math.round(this.moduleH)} mm`;

    const svg = buildSVG(pieces, cameraState, {
      globalOpacity: this.globalOpacity,
      xrayMode: this.xrayMode,
      showDimensions: this.showDimensions,
      selectedId: this.selectedId,
      hoveredId: this.hoveredId,
      width: this.width,
      height: this.height,
      title: this.moduleLabel,
      dimsText,
      moduleCenter: this.moduleCenter,
      explodeLines,
      section: this.section,
      moduleSize: { w: this.moduleW, d: this.moduleD, h: this.moduleH },
      assemblyStep: this.assemblyStep,
    });

    this.container.innerHTML = svg;
  }

  destroy() {
    this._cancelAnimation();
    this._cancelAperturaAnimation();
    this.controls.destroy();
    this.interaction.destroy();
    this.container.innerHTML = '';
  }
}

function parseCantos(cantos) {
  if (!cantos || String(cantos).trim() === '') return [];
  return String(cantos)
    .split(/[,;]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}
