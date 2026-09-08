// js/services/__tests__/motionService.test.js — contrato de apertura interactiva

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  motionConfigFor,
  applyApertureToGeo,
  boxCorners,
  rotateCorners,
  opennessFor,
} from '../../services/motionService.js';

const piece = (id, nombre, overrides = {}) => ({
  id,
  nombre,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 400,
  modulo: overrides.modulo ?? '1',
});

const GEO = { x: 10, y: 20, z: 30, w: 400, d: 18, h: 500 };

describe('motionConfigFor', () => {
  it('puerta bisagra: detecta lado por keywords', () => {
    assert.deepEqual(motionConfigFor(piece('p1', 'Puerta izquierda')), { kind: 'hinge', side: 'izq' });
    assert.deepEqual(motionConfigFor(piece('p2', 'Puerta derecha')), { kind: 'hinge', side: 'der' });
    assert.deepEqual(motionConfigFor(piece('p3', 'Puerta superior')), { kind: 'hinge', side: 'sup' });
    assert.deepEqual(motionConfigFor(piece('p4', 'Puerta inferior')), { kind: 'hinge', side: 'inf' });
    assert.deepEqual(motionConfigFor(piece('p5', 'Puerta izq')), { kind: 'hinge', side: 'izq' });
    assert.deepEqual(motionConfigFor(piece('p6', 'Puerta der')), { kind: 'hinge', side: 'der' });
    assert.deepEqual(motionConfigFor(piece('p7', 'Puerta sup')), { kind: 'hinge', side: 'sup' });
    assert.deepEqual(motionConfigFor(piece('p8', 'Puerta inf')), { kind: 'hinge', side: 'inf' });
  });

  it('puerta bisagra: default der sin keyword lateral', () => {
    assert.deepEqual(motionConfigFor(piece('p1', 'Puerta alacena')), { kind: 'hinge', side: 'der' });
  });

  it('puerta corrediza: slide con lado izq/der y default izq', () => {
    assert.deepEqual(motionConfigFor(piece('p1', 'Puerta corrediza izquierda')), { kind: 'slide', side: 'izq' });
    assert.deepEqual(motionConfigFor(piece('p2', 'Puerta corrediza derecha')), { kind: 'slide', side: 'der' });
    assert.deepEqual(motionConfigFor(piece('p3', 'Puerta corrediza')), { kind: 'slide', side: 'izq' });
  });

  it('cajón: rail para todas las piezas de la familia', () => {
    assert.deepEqual(motionConfigFor(piece('c1', 'Frente cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('c2', 'Lateral cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('c3', 'Base cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('c4', 'Fondo cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('c5', 'Cajon pie suelto')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('c6', 'Frente zapatera extraible 1')), { kind: 'rail', side: null });
  });

  it('tirador: rail solo si pertenece a cajón/zapatera', () => {
    assert.deepEqual(motionConfigFor(piece('t1', 'Tirador cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('t2', 'Tirador zapatera extraible 1')), { kind: 'rail', side: null });
    assert.equal(motionConfigFor(piece('t3', 'Tirador puerta')), null);
  });

  it('piezas sin movimiento devuelven null', () => {
    assert.equal(motionConfigFor(piece('e1', 'Estante 1')), null);
    assert.equal(motionConfigFor(piece('e2', 'Lateral izquierdo')), null);
    assert.equal(motionConfigFor(piece('e3', 'Base')), null);
    assert.equal(motionConfigFor(null), null);
  });
});

describe('applyApertureToGeo', () => {
  it('slide: traslada en x según lado (0.95·w)', () => {
    const izq = applyApertureToGeo(GEO, { kind: 'slide', side: 'izq' }, 1);
    assert.equal(izq.x, GEO.x - GEO.w * 0.95);
    const der = applyApertureToGeo(GEO, { kind: 'slide', side: 'der' }, 0.5);
    assert.equal(der.x, GEO.x + 0.5 * GEO.w * 0.95);
    assert.equal(der.y, GEO.y);
    assert.equal(der.w, GEO.w);
  });

  it('rail: traslada hacia el frente en y (0.85·d)', () => {
    const out = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1);
    assert.equal(out.y, GEO.y + GEO.d * 0.85);
    assert.equal(out.x, GEO.x);
  });

  it('hinge lateral: adjunta rotation sin cambiar la caja', () => {
    const izq = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 1);
    assert.deepEqual(
      { x: izq.x, y: izq.y, z: izq.z, w: izq.w, d: izq.d, h: izq.h },
      GEO
    );
    assert.equal(izq.rotation.axis, 'z');
    assert.equal(izq.rotation.angleDeg, 105);
    assert.deepEqual(izq.rotation.pivot, { x: GEO.x });

    const der = applyApertureToGeo(GEO, { kind: 'hinge', side: 'der' }, 0.5);
    assert.equal(der.rotation.axis, 'z');
    assert.equal(der.rotation.angleDeg, -52.5);
    assert.deepEqual(der.rotation.pivot, { x: GEO.x + GEO.w });
  });

  it('hinge trampilla: pivot en z y ángulo según sup/inf', () => {
    const sup = applyApertureToGeo(GEO, { kind: 'hinge', side: 'sup' }, 1);
    assert.equal(sup.rotation.axis, 'x');
    assert.equal(sup.rotation.angleDeg, -105);
    assert.deepEqual(sup.rotation.pivot, { z: GEO.z + GEO.h });

    const inf = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1);
    assert.equal(inf.rotation.axis, 'x');
    assert.equal(inf.rotation.angleDeg, 105);
    assert.deepEqual(inf.rotation.pivot, { z: GEO.z });
  });

  it('no muta el geo original y openness 0 devuelve copia sin rotation', () => {
    const copy = { ...GEO };
    const out = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 0);
    assert.deepEqual(GEO, copy);
    assert.equal(out.rotation, undefined);
    assert.notEqual(out, GEO);
  });
});

describe('boxCorners', () => {
  it('devuelve las 8 esquinas de la caja en orden', () => {
    const corners = boxCorners({ x: 0, y: 0, z: 0, w: 100, d: 50, h: 20 });
    assert.equal(corners.length, 8);
    assert.deepEqual(corners[0], { x: 0, y: 0, z: 0 });
    assert.deepEqual(corners[1], { x: 100, y: 0, z: 0 });
    assert.deepEqual(corners[2], { x: 100, y: 50, z: 0 });
    assert.deepEqual(corners[3], { x: 0, y: 50, z: 0 });
    assert.deepEqual(corners[4], { x: 0, y: 0, z: 20 });
    assert.deepEqual(corners[5], { x: 100, y: 0, z: 20 });
    assert.deepEqual(corners[6], { x: 100, y: 50, z: 20 });
    assert.deepEqual(corners[7], { x: 0, y: 50, z: 20 });
  });
});

describe('rotateCorners', () => {
  it('rotación z 90°: la esquina libre pasa a +y (bisagra izq)', () => {
    const geo = { x: 0, y: 0, z: 0, w: 100, d: 18, h: 500 };
    const rotated = rotateCorners(boxCorners(geo), {
      axis: 'z',
      angleDeg: 90,
      pivot: { x: 0 },
    });
    const free = rotated[1]; // (x+w, y, z)
    assert.ok(Math.abs(free.x) < 1e-9, `x≈0, obtenido ${free.x}`);
    assert.ok(Math.abs(free.y - 100) < 1e-9, `y≈100, obtenido ${free.y}`);
    assert.equal(free.z, 0);
  });

  it('rotación z -90° (bisagra der): la esquina libre abre hacia +y', () => {
    const geo = { x: 0, y: 0, z: 0, w: 100, d: 18, h: 500 };
    const rotated = rotateCorners(boxCorners(geo), {
      axis: 'z',
      angleDeg: -90,
      pivot: { x: 100 },
    });
    const free = rotated[0]; // (x, y, z) — libre respecto al pivot en x+w
    assert.ok(Math.abs(free.x - 100) < 1e-9, `x≈100, obtenido ${free.x}`);
    assert.ok(Math.abs(free.y - 100) < 1e-9, `y≈+100 (abre al frente), obtenido ${free.y}`);
  });

  it('rotación x mueve el plano y-z (trampilla)', () => {
    const geo = { x: 0, y: 0, z: 0, w: 100, d: 18, h: 500 };
    const rotated = rotateCorners(boxCorners(geo), {
      axis: 'x',
      angleDeg: 90,
      pivot: { z: 0 },
    });
    // Con 90° toda la cara superior bascula hacia −y (rotación rígida sobre z=0).
    const frontTop = rotated[4]; // (x, y, z+h)
    assert.ok(Math.abs(frontTop.y + 500) < 1e-9, `y≈-500, obtenido ${frontTop.y}`);
    assert.ok(Math.abs(frontTop.z) < 1e-9, `z≈0, obtenido ${frontTop.z}`);
    const backTop = rotated[7]; // (x, y+d, z+h)
    assert.ok(Math.abs(backTop.y + 500) < 1e-9, `y≈-500, obtenido ${backTop.y}`);
    assert.ok(Math.abs(backTop.z - 18) < 1e-9, `z≈18, obtenido ${backTop.z}`);
  });

  it('sin rotation devuelve copia idéntica', () => {
    const corners = boxCorners(GEO);
    const copy = rotateCorners(corners, null);
    assert.deepEqual(copy, corners);
    assert.notEqual(copy[0], corners[0]);
  });
});

describe('opennessFor', () => {
  it('prioriza el override por pieza sobre el global', () => {
    assert.equal(opennessFor('p1', { p1: 0.8 }, 0.3), 0.8);
    assert.equal(opennessFor('p2', { p1: 0.8 }, 0.3), 0.3);
  });

  it('fallback a 0 sin overrides', () => {
    assert.equal(opennessFor('p1', undefined, undefined), 0);
    assert.equal(opennessFor('p1', null, null), 0);
    assert.equal(opennessFor('p1', {}, 0), 0);
  });
});
