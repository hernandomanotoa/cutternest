// js/services/__tests__/motionService.test.js — contrato de apertura interactiva

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  motionConfigFor,
  applyApertureToGeo,
  boxCorners,
  rotateCorners,
  opennessFor,
  decideAperturaToggle,
  targetAngleDeg,
  HINGE_ANGLE_MAX_DEG,
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
    // La cara (drawer_part) hereda rail: mismo tooltip de doble-click que el
    // resto de la caja; el movimiento real lo aplica el transform del grupo.
    assert.deepEqual(motionConfigFor(piece('c7', 'Cara cajon 1')), { kind: 'rail', side: null });
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

  it('rail: traslada hacia el frente en y (extracción completa, 1.0·d)', () => {
    const out = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1);
    assert.equal(out.y, GEO.y + GEO.d * 1);
    assert.equal(out.x, GEO.x);
  });

  it('rail: extracción parcial según tipo (ruedas/ligera 0,75; telescópica/oculta 1,0)', () => {
    const ruedas = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1, undefined, 'ruedas');
    assert.equal(ruedas.y, GEO.y + GEO.d * 0.75);
    const ligera = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1, undefined, 'ligera');
    assert.equal(ligera.y, GEO.y + GEO.d * 0.75);
    const oculta = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1, undefined, 'oculta');
    assert.equal(oculta.y, GEO.y + GEO.d * 1);
    // Apertura intermedia: el recorrido escala con la extracción del tipo.
    const half = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 0.5, undefined, 'ruedas');
    assert.equal(half.y, GEO.y + 0.5 * GEO.d * 0.75);
    // Tipo desconocido: fallback telescópico (extracción total).
    const fallback = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1, undefined, 'inventado');
    assert.equal(fallback.y, GEO.y + GEO.d * 1);
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

  it('hinge trampilla: pivot en z y ángulo según sup/inf (apertura hacia +y)', () => {
    const sup = applyApertureToGeo(GEO, { kind: 'hinge', side: 'sup' }, 1);
    assert.equal(sup.rotation.axis, 'x');
    assert.equal(sup.rotation.angleDeg, 105);
    assert.deepEqual(sup.rotation.pivot, { z: GEO.z + GEO.h });

    const inf = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1);
    assert.equal(inf.rotation.axis, 'x');
    assert.equal(inf.rotation.angleDeg, -105);
    assert.deepEqual(inf.rotation.pivot, { z: GEO.z });
  });

  it('hinge inferior (volquete): el lado libre bascula hacia +y y baja de z', () => {
    const out = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1);
    // Esquina superior-frontal (x, y+d, z+h): debe avanzar en +y y quedar
    // por debajo del pivote (bascular hacia adelante-abajo).
    const rotated = rotateCorners(boxCorners(GEO), out.rotation);
    const topFront = rotated[7]; // (x, y+d, z+h)
    assert.ok(topFront.y > GEO.y + GEO.d, `top edge should swing +y, got ${topFront.y}`);
    assert.ok(topFront.z < GEO.z, `top edge should drop below pivot z, got ${topFront.z}`);
  });

  it('volquete/abatible: config hinge inf para toda la familia del cajón', () => {
    assert.deepEqual(motionConfigFor(piece('v1', 'Frente cajon abatible 1')), { kind: 'hinge', side: 'inf' });
    assert.deepEqual(motionConfigFor(piece('v2', 'Lateral cajon abatible 1')), { kind: 'hinge', side: 'inf' });
    assert.deepEqual(motionConfigFor(piece('v3', 'Fondo cajon abatible 1')), { kind: 'hinge', side: 'inf' });
    assert.deepEqual(motionConfigFor(piece('v4', 'Tirador cajon abatible 1')), { kind: 'hinge', side: 'inf' });
    // cajón corriente sigue en rail
    assert.deepEqual(motionConfigFor(piece('c1', 'Frente cajon 1')), { kind: 'rail', side: null });
    assert.deepEqual(motionConfigFor(piece('t1', 'Tirador cajon 1')), { kind: 'rail', side: null });
  });

  it('no muta el geo original y openness 0 devuelve copia sin rotation', () => {
    const copy = { ...GEO };
    const out = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 0);
    assert.deepEqual(GEO, copy);
    assert.equal(out.rotation, undefined);
    assert.notEqual(out, GEO);
  });
});

describe('targetAngleDeg (override de ángulo por pieza)', () => {
  const HINGE = { kind: 'hinge', side: 'izq' };

  it('hinge: acepta override y lo clamp a 0–120° por magnitud', () => {
    assert.equal(targetAngleDeg(HINGE, 45), 45);
    assert.equal(targetAngleDeg(HINGE, 120), 120);
    assert.equal(targetAngleDeg(HINGE, 150), HINGE_ANGLE_MAX_DEG, 'clamp superior 120°');
    assert.equal(targetAngleDeg(HINGE, -30), 30, 'el signo lo pone el lado de la bisagra');
    assert.equal(targetAngleDeg(HINGE, -150), HINGE_ANGLE_MAX_DEG);
    assert.equal(targetAngleDeg(HINGE, 0), 0);
  });

  it('hinge: sin override o inválido queda el default 105°', () => {
    assert.equal(targetAngleDeg(HINGE, undefined), 105);
    assert.equal(targetAngleDeg(HINGE, null), 105);
    assert.equal(targetAngleDeg(HINGE, NaN), 105);
    assert.equal(targetAngleDeg(HINGE, 'abc'), 105);
  });

  it('slide y rail ignoran el ángulo (apertura por recorrido)', () => {
    assert.equal(targetAngleDeg({ kind: 'slide', side: 'izq' }, 45), null);
    assert.equal(targetAngleDeg({ kind: 'rail', side: null }, 45), null);
    assert.equal(targetAngleDeg(null, 45), null);
  });

  it('applyApertureToGeo aplica el override proporcional a la apertura', () => {
    const izq = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 1, 45);
    assert.equal(izq.rotation.angleDeg, 45);
    const der = applyApertureToGeo(GEO, { kind: 'hinge', side: 'der' }, 1, 45);
    assert.equal(der.rotation.angleDeg, -45, 'el lado fija el signo del override');
    const half = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 0.5, 90);
    assert.equal(half.rotation.angleDeg, 45);
    const volquete = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1, 90);
    assert.equal(volquete.rotation.angleDeg, -90);
    const clamped = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1, -150);
    assert.equal(clamped.rotation.angleDeg, -HINGE_ANGLE_MAX_DEG, 'volquete clamp −120°');
  });

  it('applyApertureToGeo ignora el override en slide/rail', () => {
    const slide = applyApertureToGeo(GEO, { kind: 'slide', side: 'izq' }, 1, 45);
    assert.equal(slide.x, GEO.x - GEO.w * 0.95);
    assert.equal(slide.rotation, undefined);
    const rail = applyApertureToGeo(GEO, { kind: 'rail', side: null }, 1, 45);
    assert.equal(rail.y, GEO.y + GEO.d);
    assert.equal(rail.rotation, undefined);
  });

  it('regresión: sin 4º argumento el comportamiento no cambia (105°)', () => {
    const izq = applyApertureToGeo(GEO, { kind: 'hinge', side: 'izq' }, 1);
    assert.equal(izq.rotation.angleDeg, 105);
    const inf = applyApertureToGeo(GEO, { kind: 'hinge', side: 'inf' }, 1);
    assert.equal(inf.rotation.angleDeg, -105);
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

describe('decideAperturaToggle (doble-click)', () => {
  it('cualquier valor no abierto va a 1 (0, intermedio o sin override)', () => {
    assert.equal(decideAperturaToggle(undefined), 1);
    assert.equal(decideAperturaToggle(null), 1);
    assert.equal(decideAperturaToggle(0), 1);
    assert.equal(decideAperturaToggle(0.4), 1);
  });

  it('override ya en 1 cierra (0)', () => {
    assert.equal(decideAperturaToggle(1), 0);
  });
});
