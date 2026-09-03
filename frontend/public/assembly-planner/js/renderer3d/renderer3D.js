// js/renderer3d/renderer3D.js — Motor 3D SVG orbital principal
// Reutiliza el posicionamiento de IsometricRenderer y aplica proyección
// orbital, explode, transparencia selectiva e interacción.

import { generateVertices, CUBOID_FACES } from './geometry.js';
import { applyExplode, lerp, projectVertexCentered, faceAverageZ } from './transform.js';
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

    this.geometries = [];
    this.moduleW = 0;
    this.moduleD = 0;
    this.moduleH = 0;
    this.moduleCenter = { x: 0, y: 0, z: 0 };

    this.selectedId = null;
    this.hoveredId = null;

    this.needsRender = true;

    // Instancia auxiliar de IsometricRenderer para reutilizar su lógica de
    // posicionamiento. No se usa para renderizar, solo para computeGeometries.
    this.isoRenderer = new IsometricRenderer(document.createElement('div'), {
      scale: 0.12,
      showDimensions: false,
      showAxes: false,
      moduleGapMode: 'projected',
      labelMode: 'none',
      verticalPositionOverrides: options.verticalPositionOverrides || {},
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
      },
    });
  }

  load(moduleId, pieces) {
    this.moduleId = moduleId;
    const filtered = getModulePieces(pieces, moduleId);
    const { geometries, moduleW, moduleD, moduleH, thickness, moduleLabel } =
      this.isoRenderer.computeGeometries(moduleId, pieces);

    this.moduleW = moduleW;
    this.moduleD = moduleD;
    this.moduleH = moduleH;
    this.thickness = thickness;
    this.moduleLabel = moduleLabel;
    this.moduleCenter = {
      x: moduleW / 2,
      y: moduleD / 2,
      z: moduleH / 2,
    };

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
      };
    });

    this.needsRender = true;
  }

  setGlobalOpacity(value) {
    this.globalOpacity = value;
    this.needsRender = true;
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

    const dimsText = `${Math.round(this.moduleW)} × ${Math.round(this.moduleD)} × ${Math.round(this.moduleH)} mm`;

    const svg = buildSVG(pieces, this.controls.getState(), {
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
    });

    this.container.innerHTML = svg;
  }

  destroy() {
    this._cancelAnimation();
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
