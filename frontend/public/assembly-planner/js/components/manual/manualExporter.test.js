import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneHtml } from './manualExporter.js';
import { classifyFurniture, applyFichaCorrections } from '../../services/furnitureClassifier.js';
import { getModuleDimensions } from '../../services/geometryService.js';
import { buildAssemblySequence } from '../../services/assemblyStepService.js';

const piecesById = {
  'lat-izq': { nombre: 'Lateral izquierdo M5' },
  'lat-der': { nombre: 'Lateral derecho M5' },
  'base': { nombre: 'Base M5' },
  'tapa': { nombre: 'Tapa M5' },
  'div': { nombre: 'Division vertical M5' },
  'est-izq': { nombre: 'Estante regulable izquierdo 1 M5' },
  'est-der': { nombre: 'Estante regulable derecho 1 M5' },
};

const steps = [
  { paso: 1, piezas: ['lat-izq', 'lat-der'], tiempo: 10 },
  { paso: 2, piezas: ['base', 'tapa'], tiempo: 15 },
  { paso: 3, piezas: ['est-izq'], tiempo: 10 },
  { paso: 4, piezas: ['div'], tiempo: 10 },
  { paso: 5, piezas: ['est-der'], tiempo: 10 },
];

describe('manualExporter', () => {
  it('builds a standalone HTML manual with all steps', () => {
    const html = buildStandaloneHtml(steps, piecesById, 'Módulo 5');
    assert.ok(html.includes('<!DOCTYPE html>'), 'should be a complete HTML document');
    assert.ok(html.includes('Manual de Ensamblaje — Módulo 5'), 'should include module label');
    assert.ok(html.includes('Paso 1'), 'should include step 1');
    assert.ok(html.includes('Paso 5'), 'should include step 5');
    assert.ok(html.includes('Lateral izquierdo M5'), 'should include piece names');
  });

  it('orders left shelf before divider before right shelf', () => {
    const html = buildStandaloneHtml(steps, piecesById, 'M5');
    const leftIdx = html.indexOf('izquierdo 1');
    const divIdx = html.indexOf('Division vertical');
    const rightIdx = html.indexOf('derecho 1');
    assert.ok(leftIdx < divIdx, 'left shelf should appear before divider');
    assert.ok(divIdx < rightIdx, 'divider should appear before right shelf');
  });

  it('no incluye sección de ficha técnica sin clasificación', () => {
    const html = buildStandaloneHtml(steps, piecesById, 'M5');
    assert.equal(html.includes('Ficha técnica'), false);
    const htmlNull = buildStandaloneHtml(steps, piecesById, 'M5', { clasificacion: { tipo: null } });
    assert.equal(htmlNull.includes('Ficha técnica'), false);
  });

  it('incluye ficha técnica con el tipo inferido de las piezas de ejemplo', () => {
    const piezasZapatera = [
      { id: 'm1-base', nombre: 'Base zapatero', ancho: 800, alto: 300, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-tapa', nombre: 'Tapa zapatero', ancho: 800, alto: 300, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-lat-izq', nombre: 'Lateral izquierdo', ancho: 300, alto: 1200, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-lat-der', nombre: 'Lateral derecho', ancho: 300, alto: 1200, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-estante', nombre: 'Estante zapatero 1', ancho: 770, alto: 280, espesor: 15, color: '#8B5A2B', modulo: '1' },
    ];
    const clasificacion = applyFichaCorrections(
      classifyFurniture(piezasZapatera),
      {},
    );
    assert.equal(clasificacion.tipo, 'zapatera');
    const medidasProyecto = getModuleDimensions(piezasZapatera, 15);
    const html = buildStandaloneHtml(steps, piecesById, 'Zapatero', {
      clasificacion,
      medidasProyecto,
    });
    assert.ok(html.includes('Ficha técnica'), 'debe incluir la sección');
    assert.ok(html.includes('Mueble: zapatera'), 'debe contener el tipo inferido');
    assert.ok(html.includes('entrada'), 'debe contener el ambiente inferido');
    assert.ok(html.includes('Estándar:'), 'debe incluir las medidas estándar del tipo');
    assert.ok(html.includes('Proyecto:'), 'debe incluir las medidas del proyecto');
    assert.ok(html.includes('Herrajes típicos:'), 'debe incluir la lista de herrajes');
    assert.ok(html.includes('Tiempo estimado:'), 'debe incluir el tiempo estimado');
  });

  it('la ficha técnica refleja correcciones manuales aplicadas', () => {
    const clasificacion = applyFichaCorrections(
      classifyFurniture([{ id: 'p1', nombre: 'Pieza suelta', ancho: 100, alto: 100 }]),
      { ambiente: 'sala', tipo: 'estanteria_librero', nivel: 'basico' },
    );
    const html = buildStandaloneHtml(steps, piecesById, 'Genérico', { clasificacion });
    assert.ok(html.includes('Mueble: estanteria librero'));
    assert.ok(html.includes('sala'));
  });

  it('acepta steps de buildAssemblySequence con tiempo default (wiring del panel)', () => {
    // Replica lo que construye buildFichaExport en furnitureFicha.js:
    // secuencia real de assemblyStepService + tiempo 10 por paso (default de
    // buildSteps) + ficha con clasificación corregida y medidas del proyecto.
    const piezas = [
      { id: 'm1-base', nombre: 'Base zapatero', ancho: 800, alto: 300, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-tapa', nombre: 'Tapa zapatero', ancho: 800, alto: 300, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-lat-izq', nombre: 'Lateral izquierdo', ancho: 300, alto: 1200, espesor: 15, color: '#8B5A2B', modulo: '1' },
      { id: 'm1-lat-der', nombre: 'Lateral derecho', ancho: 300, alto: 1200, espesor: 15, color: '#8B5A2B', modulo: '1' },
    ];
    const piecesByIdZapatera = Object.fromEntries(piezas.map((p) => [p.id, p]));
    const { steps: sequenceSteps } = buildAssemblySequence(piezas);
    const stepsConTiempo = sequenceSteps.map((s) => ({ ...s, tiempo: 10 }));
    const clasificacion = applyFichaCorrections(
      classifyFurniture(piezas),
      { nivel: 'medio' },
    );
    const ficha = {
      clasificacion,
      medidasProyecto: getModuleDimensions(piezas, 15),
    };
    const html = buildStandaloneHtml(stepsConTiempo, piecesByIdZapatera, 'Zapatero 1', ficha);
    assert.ok(html.includes('Ficha técnica'), 'la sección de ficha debe aparecer');
    assert.ok(html.includes('Mueble: zapatera'), 'debe contener el tipo inferido');
    assert.ok(html.includes('Nivel: Medio'), 'debe reflejar la corrección de nivel');
    assert.ok(html.includes('Paso 1'), 'los pasos de la secuencia real deben aparecer');
    assert.ok(html.includes('Tiempo estimado: 10 min'), 'cada paso debe traer su tiempo default');
  });

  it('incluye sección "Perfiles gola" con tiras y frente L cuando hay gola', () => {
    const piezasGola = {
      'm1-gola-1': { id: 'm1-gola-1', nombre: 'Perfil gola', ancho: 766, alto: 30, cantidad: 1, espesor: 15, color: '#C19A6B', modulo: '1', pos_z: 232.5 },
      'm1cajon1-frente': { id: 'm1cajon1-frente', nombre: 'Frente cajon 1 M1', ancho: 770, alto: 197, cantidad: 1, espesor: 15, color: '#C19A6B', modulo: '11', pos_z: 25 },
      'm1cajon2-frente': { id: 'm1cajon2-frente', nombre: 'Frente cajon 2 M1', ancho: 770, alto: 197, cantidad: 1, espesor: 15, color: '#C19A6B', modulo: '12', pos_z: 277.5 },
    };
    const html = buildStandaloneHtml(steps, piezasGola, 'Cajonera');
    assert.ok(html.includes('Perfiles gola'), 'debe incluir la sección');
    assert.ok(html.includes('m1-gola-1'), 'identificador de la tira');
    assert.ok(html.includes('Entre cajón 1 e 2'), 'ubicación relativa a los frentes');
    assert.ok(html.includes('766 mm'), 'longitud de corte = ancho de la tira');
    assert.ok(html.includes('L-gola: bajo la repisa'), 'ubicación del frente L');
    assert.ok(html.includes('m1cajon2-frente'), 'identificador del frente L (unidad superior)');
    assert.ok(html.includes('Melamina (#C19A6B)'), 'material/acabado');
    assert.ok(html.includes('Tornillos 3.5×16'), 'observaciones de fijación (default PROVISIONAL)');
  });

  it('respeta golaFijacion del userConfig y omite la sección sin gola', () => {
    const piezasGola = {
      'm1-gola-1': { id: 'm1-gola-1', nombre: 'Perfil gola', ancho: 766, alto: 30, cantidad: 1, espesor: 15, color: '#C19A6B', modulo: '1', pos_z: 232.5 },
    };
    const html = buildStandaloneHtml(steps, piezasGola, 'Cajonera', null, null, {
      userConfig: { golaFijacion: 'Cola blanca + tarugos' },
    });
    assert.ok(html.includes('Cola blanca + tarugos'), 'fijación del userConfig');
    const htmlSinGola = buildStandaloneHtml(steps, piecesById, 'M5');
    assert.equal(htmlSinGola.includes('Perfiles gola'), false, 'sin gola no hay sección');
  });
});
