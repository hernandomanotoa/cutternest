import { describe, it, expect } from 'vitest';

import {
  ACABADOS,
  getAcabado,
  MM_POR_TILE,
  calcularRepeat,
  mulberry32,
  hexA,
  generarParametrosVeta,
  direccionVetaPieza,
  crearTexturaMadera,
  SEMILLA_DEFAULT,
} from './texturasMadera';

describe('ACABADOS — paleta de acabados comerciales', () => {
  it('define los 7 acabados del spec con todos los campos', () => {
    const nombres = Object.values(ACABADOS).map((a) => a.nombre);
    expect(nombres).toEqual([
      'Roble Claro', 'Nogal', 'Wengué', 'Caoba', 'Blanco Liso', 'Gris Grafito', 'Negro Mate',
    ]);
    for (const a of Object.values(ACABADOS)) {
      expect(a.colorBase).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.colorVeta).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.colorPoros).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.intensidad).toBeGreaterThanOrEqual(0.3);
      expect(a.intensidad).toBeLessThanOrEqual(1.5);
      expect(a.roughness).toBeGreaterThan(0);
      expect(a.roughness).toBeLessThanOrEqual(1);
    }
  });

  it('getAcabado resuelve por id y por nombre; desconocido → null', () => {
    expect(getAcabado('roble')?.nombre).toBe('Roble Claro');
    expect(getAcabado('Wengué')?.nombre).toBe('Wengué');
    expect(getAcabado('nope')).toBeNull();
    expect(getAcabado(null)).toBeNull();
  });
});

describe('mulberry32 — generador con semilla', () => {
  it('misma semilla → misma secuencia; distinta semilla → distinta', () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b = mulberry32(43);
    const seqA1 = Array.from({ length: 8 }, () => a1());
    const seqA2 = Array.from({ length: 8 }, () => a2());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA1).toEqual(seqA2);
    expect(seqA1).not.toEqual(seqB);
  });

  it('produce valores en [0, 1)', () => {
    const rng = mulberry32(SEMILLA_DEFAULT);
    for (let i = 0; i < 500; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hexA — color con alpha', () => {
  it('convierte #rrggbb a rgba con el alpha dado', () => {
    expect(hexA('#c9a876', 0.5)).toBe('rgba(201,168,118,0.5)');
    expect(hexA('#000000', 1)).toBe('rgba(0,0,0,1)');
  });

  it('tolerante a mayúsculas y sin #; inválido cae a negro', () => {
    expect(hexA('C9A876', 0.25)).toBe('rgba(201,168,118,0.25)');
    expect(hexA('mal', 0.5)).toBe('rgba(0,0,0,0.5)');
  });
});

describe('calcularRepeat — escala real (MM_POR_TILE = 600)', () => {
  it('repeat = tamaño de pieza / 600', () => {
    expect(MM_POR_TILE).toBe(600);
    const r = calcularRepeat(850, 600);
    expect(r.x).toBeCloseTo(850 / 600, 5);
    expect(r.y).toBeCloseTo(1, 5);
  });

  it('protege contra piezas de tamaño 0', () => {
    const r = calcularRepeat(0, 0);
    expect(r.x).toBeGreaterThan(0);
    expect(r.y).toBeGreaterThan(0);
  });
});

describe('direccionVetaPieza — veta por tipo de pieza', () => {
  it('costados, laterales, montantes y puertas → vertical', () => {
    expect(direccionVetaPieza({ nombre: 'Lateral izquierdo M1' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Costado derecho' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Montante central M3' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Puerta vitrina' })).toBe('vertical');
  });

  it('repisas, fondos, zócalo, tapas y frentes → horizontal', () => {
    expect(direccionVetaPieza({ nombre: 'Repisa 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Fondo modulo M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Zocalo marco frente' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Tapa modulo M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Frente cajon 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Frente zapatera extraible 2 M1' })).toBe('horizontal');
  });

  it('pieza desconocida → horizontal (default seguro)', () => {
    expect(direccionVetaPieza({ nombre: 'Pieza rara' })).toBe('horizontal');
  });
});

describe('generarParametrosVeta — determinismo y rangos del spec', () => {
  const roble = getAcabado('roble')!;

  it('misma semilla → mismos parámetros (textura repetible en cada recarga)', () => {
    const a = generarParametrosVeta(7, 'vertical', roble);
    const b = generarParametrosVeta(7, 'vertical', roble);
    expect(a).toEqual(b);
    const c = generarParametrosVeta(8, 'vertical', roble);
    expect(a).not.toEqual(c);
  });

  it('respeta los rangos: 6–10 bandas, 80–100 vetas, 300–400 poros', () => {
    for (const semilla of [1, 7, 99, SEMILLA_DEFAULT]) {
      const p = generarParametrosVeta(semilla, 'horizontal', roble);
      expect(p.bandas.length).toBeGreaterThanOrEqual(6);
      expect(p.bandas.length).toBeLessThanOrEqual(10);
      expect(p.vetas.length).toBeGreaterThanOrEqual(80);
      expect(p.vetas.length).toBeLessThanOrEqual(100);
      expect(p.poros.length).toBeGreaterThanOrEqual(300);
      expect(p.poros.length).toBeLessThanOrEqual(400);
      for (const v of p.vetas) {
        expect(v.amplitud1).toBeGreaterThanOrEqual(2);
        expect(v.amplitud1).toBeLessThanOrEqual(11);
        expect(v.frecuencia1).toBeGreaterThanOrEqual(0.004);
        expect(v.frecuencia1).toBeLessThanOrEqual(0.019);
        expect(v.grosor).toBeGreaterThanOrEqual(0.4);
        expect(v.grosor).toBeLessThanOrEqual(2);
      }
    }
  });

  it('la intensidad del acabado escala el alpha de las vetas', () => {
    const suave = generarParametrosVeta(5, 'horizontal', getAcabado('blanco')!);
    const fuerte = generarParametrosVeta(5, 'horizontal', getAcabado('wengue')!);
    // Misma semilla → mismos valores base; solo cambia el alpha (× intensidad).
    expect(suave.vetas[0].amplitud1).toBe(fuerte.vetas[0].amplitud1);
    expect(suave.vetas[0].alpha).toBeCloseTo(fuerte.vetas[0].alpha * (0.3 / 1.2), 5);
  });
});

describe('crearTexturaMadera — canvas offscreen', () => {
  it('devuelve un canvas del tamaño pedido (512 por defecto) sin lanzar sin Canvas 2D', () => {
    const canvas = crearTexturaMadera({ acabado: 'roble' });
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    const chico = crearTexturaMadera({ acabado: 'nogal', tamanoPx: 256 });
    expect(chico.width).toBe(256);
  });

  it('acabado desconocido devuelve canvas en blanco sin lanzar', () => {
    const canvas = crearTexturaMadera({ acabado: 'no-existe' });
    expect(canvas.width).toBe(512);
  });
});
