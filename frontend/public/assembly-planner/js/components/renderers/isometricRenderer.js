/**
 * IsometricRenderer — Renderizador SVG isométrico 3D para CutterNest Assembly Planner
 * Tecnología: SVG puro, sin librerías externas.
 *
 * Única entrada pública del renderizador isométrico. La implementación está
 * dividida en módulos cohesivos bajo `./isometric/`:
 *   - isoProjection.js     proyección 3D→2D y polígonos de cuboides
 *   - pieceStyling.js      colores de caras, z-index, trazos y etiquetas
 *   - pieceSvg.js          SVG por pieza (polígonos + etiqueta)
 *   - svgAssembly.js       ensamblado del SVG completo
 *   - dimensions.js        cotas y líneas de dimensión
 *   - axesLegend.js        leyenda de ejes X/Y/Z
 *   - viewport.js          cálculo de viewBox y origen
 *   - depthSort.js         ordenación painter's algorithm (sortByDepth)
 *   - apertures.js         apertura de puertas/cajones y transform de tiradores
 *   - handleMatching.js    emparejamiento de tiradores con frentes
 *   - moduleGeometry.js    carcasa del módulo + agrupación/orden de módulos
 *   - frontPanelGeometry.js paneles frontales (puertas/vidrios)
 *   - drawerGeometry.js    cajones (pilas por zonas, cajas, rieles)
 *   - dividerGeometry.js   divisores (montantes y paneles intermedios)
 *   - seatingGeometry.js   asientos (familia 'seating')
 *   - globalGeometry.js    piezas globales (zócalo, tapa, fondo, espejo...)
 */

import { getModuleDimensions } from '../../services/geometryService.js';
import { getModuleDepth, inferThickness } from '../../services/isoGeometryService.js';
import { detectFamily, inferRole } from '../../services/classifierService.js';
import { applyExplode } from '../../services/isoGeometryService.js';
import { isGlobalPiece, getModuleLabel, ALL_MODULE_ID } from '../../services/moduleService.js';
import { aperturaEfectivaGlobal, applyAperturas } from './isometric/apertures.js';
import { sortByDepth } from './isometric/depthSort.js';
import {
  buildModuleGeometries,
  computeModuleBounds,
  groupByModule,
  sortModuleIds,
} from './isometric/moduleGeometry.js';
import { buildGlobalGeometries } from './isometric/globalGeometry.js';
import { MODULE_GAP_MM } from '../../core/config.js';
import { buildSeatingGeometries } from './isometric/seatingGeometry.js';
import { buildFrontPanelGeometries } from './isometric/frontPanelGeometry.js';
import { buildDrawerGeometries } from './isometric/drawerGeometry.js';
import { buildDividerGeometries } from './isometric/dividerGeometry.js';
import { calculateViewport } from './isometric/viewport.js';
import { buildSVG } from './isometric/svgAssembly.js';
import { makeLabel } from './isometric/pieceStyling.js';
import {
  dimensionDefs,
  drawDimensionLine,
  drawDimensions,
  drawExplodedDimensions,
  drawMainDimensions,
  drawPieceDimensions,
  drawVerticalOffsetDimensions,
} from './isometric/dimensions.js';
import { drawAxes } from './isometric/axesLegend.js';
import { isoProject, polygonArea, projectCuboid } from './isometric/isoProjection.js';
import { getFaceColors, getStroke } from './isometric/pieceStyling.js';
import { findPairedHandle, handleBelongsToDoor, isHandlePiece } from './isometric/handleMatching.js';

export { sortByDepth };

export class IsometricRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.scale = options.scale || 0.12;
    this.baseScale = options.baseScale || 0.12;
    this.textScale = Math.max(0.6, Math.min(2.5, this.scale / this.baseScale));
    this.isoDepth = options.isoDepth || 0.5;
    this.padding = options.padding || 100;
    this.showDimensions = options.showDimensions !== false;
    this.showAxes = options.showAxes === true;
    this.drawerGap = options.drawerGap || 15;
    this.warnings = [];
    this.doorAngle = options.doorAngle || 0;
    // Apertura interactiva: aperturaGlobal null = sin valor explícito (se
    // conserva el legacy doorAngle como apertura global = doorAngle/105).
    this.aperturaGlobal = options.aperturaGlobal ?? null;
    this.aperturas = options.aperturas || {};
    this.angulos = options.angulos || {};
    this._lastComputeArgs = null;
    this.explodeFactor = options.explodeFactor || 0;
    this.moduleGapMode = options.moduleGapMode || 'projected';
    this.labelMode = options.labelMode || 'auto';
    this.isoFlip = options.isoFlip || false;
    this.verticalPositionOverrides = options.verticalPositionOverrides || {};
  }

  /**
   * Calcula las geometrías posicionadas del módulo sin aplicar proyección ni
   * renderizar. Útil para vistas 3D externas que reutilizan el mismo
   * posicionamiento.
   */
  computeGeometries(moduleId, pieces) {
    this._lastComputeArgs = [moduleId, pieces];
    // Avisos de posicionamiento detectados en esta pasada (p. ej. pilas de
    // cajones que exceden su zona y se dibujan escaladas). La UI puede leer
    // `renderer.warnings` tras renderizar/computar.
    this.warnings = [];
    const family = detectFamily(pieces, moduleId);
    const globalPieces = pieces.filter((p) => isGlobalPiece(p));
    const globalBottoms = globalPieces.filter((p) => inferRole(p) === 'bottom_panel');
    const globalTops = globalPieces.filter((p) => inferRole(p) === 'top_panel');
    const zocaloHeight = globalBottoms.length ? Math.max(...globalBottoms.map((p) => Number(p.alto) || 0)) : 0;
    const coronaHeight = globalTops.length ? Math.max(...globalTops.map((p) => Number(p.alto) || 0)) : 0;
    // Modelo de zócalo: si el zócalo global incluye laterales (rol
    // 'plinth_side', p. ej. `glb-zocalo-lateral-izq`), es un cajón de zócalo
    // completo (frente + laterales, sin base global): los laterales de los
    // módulos arrancan en su cara superior (z = zocaloHeight) en lugar de
    // llegar al suelo. Sin laterales se conserva el patín retranqueado
    // clásico (frente solo, dibujado bajo el suelo) y todo queda como antes.
    const zocaloDrawerHeight = globalPieces.some((p) => inferRole(p) === 'plinth_side') ? zocaloHeight : 0;
    const isGlobalModule = String(moduleId).toLowerCase() === 'estructura' || String(moduleId).toLowerCase() === 'global';
    const target = String(moduleId).trim();

    const exactPieces = isGlobalModule
      ? []
      : pieces.filter(
          (p) => !isGlobalPiece(p) && String(p.modulo || '').trim() === target
        );

    const hasCarcass = (pts) =>
      pts.some((p) => ['bottom_panel', 'top_panel', 'side_panel', 'back_panel'].includes(inferRole(p)));
    const isDrawerSubModule = (pts) =>
      pts.some((p) => {
        const r = inferRole(p);
        return r.startsWith('drawer_') || r === 'handle';
      });
    const allModuleIds = new Set(
      pieces.filter((p) => !isGlobalPiece(p)).map((p) => String(p.modulo || '').trim())
    );
    const subInsertPieces = [];
    for (const m of allModuleIds) {
      if (m === target || !m.startsWith(target)) continue;
      const sub = pieces.filter((p) => !isGlobalPiece(p) && String(p.modulo || '').trim() === m);
      if (sub.length && (!hasCarcass(sub) || isDrawerSubModule(sub))) {
        subInsertPieces.push(...sub);
      }
    }

    const allPieces = isGlobalModule
      ? globalPieces
      : target === ALL_MODULE_ID
        ? pieces
        : [...exactPieces, ...subInsertPieces];

    if (!allPieces.length) {
      return { geometries: [], moduleW: 0, moduleD: 0, moduleH: 0, thickness: 0, moduleLabel: '' };
    }

    const dims = getModuleDimensions(allPieces, inferThickness(allPieces), family);
    const moduleW = dims.width;
    const moduleH = dims.height;
    const moduleD = getModuleDepth(pieces);
    const thickness = dims.thickness;

    const moduleLabel = getModuleLabel(moduleId, pieces);

    // Tiradores emparejados a puertas (módulo o global): quedan excluidos del
    // emparejamiento de cajones para no duplicar geos, y reciben el transform
    // de su puerta en la pasada final de apertura.
    this._doorHandleIds = new Set();
    pieces.forEach((p) => {
      if (inferRole(p) !== 'door' || isHandlePiece(p)) return;
      const handle = findPairedHandle(p, pieces);
      if (handle) this._doorHandleIds.add(handle.id);
    });

    let geometries = [];

    if (isGlobalModule) {
      geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, true, zocaloHeight));
    } else if (target === ALL_MODULE_ID) {
      const nonGlobalPieces = allPieces.filter((p) => !isGlobalPiece(p));
      const moduleGroups = this._groupByModule(nonGlobalPieces);
      const sortedIds = this._sortModuleIds(Object.keys(moduleGroups));
      let offsetX = 0;
      // Spans reales→visuales por módulo: el zócalo global se posiciona con
      // este mapa (cada módulo ocupa `width` mm reales desde `base` visual),
      // no con una escala global — el ancho visual de la vista completa
      // incluye skew isométrico y gaps que la escala mezclaba mal.
      const moduleSpans = [];
      sortedIds.forEach((mid, idx) => {
        const group = moduleGroups[mid];
        const dims = getModuleDimensions(group, inferThickness(group), family);
        const subGeometries = this._buildModuleGeometries(
          group, dims.width, moduleD, dims.height, dims.thickness, family, zocaloHeight, coronaHeight, zocaloDrawerHeight
        );
        const useProjection = this.moduleGapMode === 'projected';
        const bounds = this._computeModuleBounds(subGeometries, useProjection);
        const moduleVisualWidth = bounds.max - bounds.min;
        subGeometries.forEach((g) => { g.x += offsetX; });
        subGeometries.forEach((g) => { g.moduleSeq = idx; });
        geometries.push(...subGeometries);
        moduleSpans.push({ base: offsetX, width: dims.width });
        // En 'compact' los módulos quedaban pegados (gap 0); se aplica el
        // mismo gap mínimo de 20 mm que la vista 3D (MODULE_GAP_MM).
        const extraGap = useProjection ? dims.thickness : MODULE_GAP_MM;
        offsetX += moduleVisualWidth + extraGap;
      });
      if (globalPieces.length) {
        const globalGeoms = this._buildGlobalGeometries(globalPieces, offsetX, moduleD, moduleH, thickness, true, zocaloHeight, moduleSpans);
        globalGeoms.forEach((g) => { g.moduleSeq = sortedIds.length; });
        geometries.push(...globalGeoms);
      }
    } else {
      geometries.push(...this._buildModuleGeometries(allPieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight, coronaHeight, zocaloDrawerHeight));
      if (globalPieces.length) {
        geometries.push(...this._buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, false, zocaloHeight));
      }
    }

    return { geometries: this._applyAperturas(geometries), moduleW, moduleD, moduleH, thickness, moduleLabel };
  }

  /**
   * Apertura interactiva (0..1). Actualiza el estado y, si ya hay geometrías
   * calculadas, las recalcula con los últimos argumentos de computeGeometries.
   * Devuelve el nuevo resultado de computeGeometries o null si no había nada.
   */
  setApertura(aperturaGlobal, aperturas, angulos) {
    this.aperturaGlobal = aperturaGlobal == null ? null : Math.min(1, Math.max(0, Number(aperturaGlobal) || 0));
    this.aperturas = aperturas || {};
    this.angulos = angulos || {};
    if (this._lastComputeArgs) {
      return this.computeGeometries(this._lastComputeArgs[0], this._lastComputeArgs[1]);
    }
    return null;
  }

  /**
   * Apertura global efectiva: la explícita (setApertura/opciones) gana; si no
   * hay, el doorAngle legacy se convierte a fracción de apertura (105° = 1).
   */
  _aperturaEfectivaGlobal() {
    return aperturaEfectivaGlobal(this.aperturaGlobal, this.doorAngle);
  }

  /**
   * Aplica la apertura a las puertas y propaga el transform a su tirador
   * emparejado: la MISMA rotation (bisagra: mismo pivote/ángulo, las esquinas
   * rotan alrededor del mismo eje) o la MISMA traslación x (corrediza). Las
   * piezas de cajón y sus tiradores se mueven con el frente en
   * _buildDrawerGeometries (rail +y) y aquí se ignoran para no duplicar.
   */
  _applyAperturas(geometries) {
    return applyAperturas(this, geometries);
  }

  _handleBelongsToDoor(handleGeo, doorGeo) {
    return handleBelongsToDoor(handleGeo, doorGeo);
  }

  render(moduleId, pieces, _dependencies) {
    let { geometries, moduleW, moduleD, moduleH, thickness, moduleLabel } = this.computeGeometries(moduleId, pieces);

    if (!geometries.length) {
      this.container.innerHTML =
        '<p class="empty-state">No hay piezas para renderizar en vista isométrica.</p>';
      return;
    }

    if (this.explodeFactor > 0) {
      geometries = applyExplode(geometries, moduleW, moduleD, moduleH, this.explodeFactor);
    }

    const xFactor = this.isoFlip ? -this.isoDepth : this.isoDepth;
    const sorted = sortByDepth(geometries, xFactor);
    const isAllView = String(moduleId).trim() === ALL_MODULE_ID;
    const { viewBox, originX, originY, axesSpace } = this._calculateViewport(geometries, isAllView);

    const svg = this._buildSVG(sorted, viewBox, originX, originY, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView, thickness);
    this.container.innerHTML = svg;
  }

  // ═══════════════════════════════════════════════════════════
  // GEOMETRÍA 3D (delegan en los módulos de ./isometric/)
  // ═══════════════════════════════════════════════════════════

  _buildModuleGeometries(pieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight = 0, coronaHeight = 0, zocaloDrawerHeight = 0) {
    return buildModuleGeometries(this, pieces, moduleW, moduleD, moduleH, thickness, family, zocaloHeight, coronaHeight, zocaloDrawerHeight);
  }

  _buildFrontPanelGeometries(panels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset = 0, topPanelOffset = null, allRoles = []) {
    return buildFrontPanelGeometries(this, panels, moduleW, moduleD, moduleH, thickness, family, bottomPanelOffset, topPanelOffset, allRoles);
  }

  _buildDrawerGeometries(roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions = [], bottomPanelOffset = 0, topPanelOffset = null) {
    return buildDrawerGeometries(this, roles, moduleW, moduleD, moduleH, thickness, family, shelfPositions, bottomPanelOffset, topPanelOffset);
  }

  _buildDividerGeometries(dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness = 0, bottomPanelOffset = 0, topPanelOffset = null) {
    return buildDividerGeometries(this, dividers, moduleW, moduleD, moduleH, thickness, shelfPositions, top, bottom, backThickness, bottomPanelOffset, topPanelOffset);
  }

  _buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness) {
    return buildSeatingGeometries(roles, moduleW, moduleD, moduleH, thickness);
  }

  _groupByModule(pieces) {
    return groupByModule(pieces);
  }

  _sortModuleIds(ids) {
    return sortModuleIds(ids);
  }

  _computeModuleBounds(geometries, includeDepth = true) {
    return computeModuleBounds(this, geometries, includeDepth);
  }

  _buildGlobalGeometries(globalPieces, moduleW, moduleD, moduleH, thickness, includeDoors = true, zocaloHeight = 0, moduleSpans = null) {
    return buildGlobalGeometries(this, globalPieces, moduleW, moduleD, moduleH, thickness, includeDoors, zocaloHeight, moduleSpans);
  }

  // ═══════════════════════════════════════════════════════════
  // PROYECCIÓN ISOMÉTRICA Y SVG (delegan en ./isometric/)
  // ═══════════════════════════════════════════════════════════

  _isoProject(x, y, z, ox, oy) {
    return isoProject(this, x, y, z, ox, oy);
  }

  _polygonArea(projected, indices) {
    return polygonArea(projected, indices);
  }

  _projectionCtx() {
    return {
      s: this.textScale,
      projection: this,
      overrides: this.verticalPositionOverrides,
      explodeFactor: this.explodeFactor,
      labelMode: this.labelMode,
      showAxes: this.showAxes,
      showDimensions: this.showDimensions,
      padding: this.padding,
    };
  }

  _buildSVG(geometries, viewBox, ox, oy, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView = false, thickness = 15) {
    return buildSVG(this._projectionCtx(), geometries, viewBox, ox, oy, axesSpace, moduleLabel, moduleW, moduleD, moduleH, isAllView, thickness);
  }

  _projectCuboid(geo, ox, oy) {
    return projectCuboid(this, geo, ox, oy);
  }

  _getStroke(role) {
    return getStroke(role);
  }

  _calculateViewport(geometries, isAllView = false) {
    return calculateViewport(this, geometries, isAllView);
  }

  _makeLabel(geo) {
    return makeLabel(geo);
  }

  // ═══════════════════════════════════════════════════════════
  // EJES Y DIMENSIONES (delegan en ./isometric/)
  // ═══════════════════════════════════════════════════════════

  _drawAxes(viewW, viewH, axesSpace) {
    return drawAxes(this.padding, this.textScale, viewW, viewH, axesSpace);
  }

  _drawDimensions(ox, oy, moduleW, moduleD, moduleH) {
    return drawDimensions(this._projectionCtx(), ox, oy, moduleW, moduleD, moduleH);
  }

  _drawMainDimensions(ox, oy, moduleW, moduleD, moduleH) {
    return drawMainDimensions(this._projectionCtx(), ox, oy, moduleW, moduleD, moduleH);
  }

  _drawVerticalOffsetDimensions(geometries, ox, oy, moduleW, moduleD, moduleH, thickness) {
    return drawVerticalOffsetDimensions(this._projectionCtx(), geometries, ox, oy, moduleW, moduleD, moduleH, thickness);
  }

  _dimensionDefs() {
    return dimensionDefs(this.textScale);
  }

  _drawExplodedDimensions(geometries, ox, oy) {
    return drawExplodedDimensions(this._projectionCtx(), geometries, ox, oy);
  }

  _drawPieceDimensions(geo, ox, oy) {
    return drawPieceDimensions(this._projectionCtx(), geo, ox, oy);
  }

  _drawDimensionLine(a, b, value, offX, offY, color, markerId = 'dimArrow') {
    return drawDimensionLine(this.textScale, a, b, value, offX, offY, color, markerId);
  }

  _getFaceColors(baseColor) {
    return getFaceColors(baseColor);
  }
}
