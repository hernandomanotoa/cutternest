import { describe, it, expect } from 'vitest';

import {
  ACABADOS,
  COMBINACIONES,
  getAcabado,
  getCombinacion,
  analizarAlcanceModulos,
  raizDeModulo,
  MM_POR_TILE,
  calcularRepeat,
  mulberry32,
  hexA,
  generarParametrosVeta,
  direccionVetaPieza,
  tipoMetalPieza,
  METAL_CROMO,
  METAL_ALUMINIO_GOLA,
  esInteriorCaja,
  calcularTablaContinua,
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

  it('repisas, zócalo, tapas y frentes → horizontal (los fondos de MÓDULO son verticales)', () => {
    expect(direccionVetaPieza({ nombre: 'Repisa 1 M1' })).toBe('horizontal');
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

describe('direccionVetaPieza — reglas del spec (sección 3)', () => {
  it('VERTICAL: costados del módulo, divisiones, puertas y FONDO TRASERO', () => {
    expect(direccionVetaPieza({ nombre: 'Lateral izquierdo M1' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Costado derecho' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Montante central M3' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Divisor 1 M1' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Puerta vitrina' })).toBe('vertical');
    // El fondo del módulo lleva la MISMA veta que los laterales:
    expect(direccionVetaPieza({ nombre: 'Fondo modulo M1' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Fondo trasero' })).toBe('vertical');
    expect(direccionVetaPieza({ nombre: 'Panel posterior estanteria' })).toBe('vertical');
  });

  it('HORIZONTAL: frentes, repisas, tapas, zócalo', () => {
    expect(direccionVetaPieza({ nombre: 'Frente cajon 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Frente zapatera extraible 2 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Repisa 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Tapa modulo M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Zocalo marco frente' })).toBe('horizontal');
  });

  it('laterales de caja, caras, traseras y fondos de cajón → horizontal', () => {
    expect(direccionVetaPieza({ nombre: 'Lateral cajon 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Lateral zapatera extraible 1 izq M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Cara cajon 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Fondo cajon 1 M1' })).toBe('horizontal');
    expect(direccionVetaPieza({ nombre: 'Base zapatera extraible 1 M1' })).toBe('horizontal');
  });
});

describe('metales (sin veta)', () => {
  it('barra → cromo; perfil gola → aluminio; resto → null', () => {
    expect(tipoMetalPieza({ nombre: 'Barra colgadora M1' })).toBe('cromo');
    expect(tipoMetalPieza({ nombre: 'Frente cajon gola' }) ?? tipoMetalPieza({ id: 'm1gola-c1-fondo' })).toBe('aluminioGola');
    expect(tipoMetalPieza({ nombre: 'Repisa 1 M1' })).toBeNull();
    expect(METAL_CROMO.metalness).toBe(0.9);
    expect(METAL_ALUMINIO_GOLA.roughness).toBe(0.4);
  });
});

describe('esInteriorCaja — interiores en blanco (spec sección 5)', () => {
  it('cajas de cajón/zapatera son interiores; los frentes no', () => {
    for (const nombre of ['Lateral cajon 1 M1', 'Cara cajon 1 M1', 'Fondo cajon 1 M1', 'Base cajon 1 M1',
      'Lateral zapatera extraible 1 izq M1', 'Fondo zapatera extraible 1 M1', 'Base zapatera extraible 1 M1',
      'Division zapatera extraible 1 M1']) {
      expect(esInteriorCaja({ nombre }), nombre).toBe(true);
    }
    for (const nombre of ['Frente cajon 1 M1', 'Frente zapatera extraible 1 M1',
      'Lateral izquierdo M1', 'Fondo modulo M1', 'Repisa 1 M1']) {
      expect(esInteriorCaja({ nombre }), nombre).toBe(false);
    }
  });
});

describe('calcularTablaContinua — la veta cruza el gola (spec sección 4)', () => {
  const frente = (id: string, y: number, alto: number, modulo = '1') => ({
    id, nombre: `Frente cajon ${id} M1`, ancho: 800, alto, modulo, posicion: { x: 0, y, z: 0 },
  });

  it('2 frentes del mismo módulo comparten repeat y el superior lleva offset', () => {
    // frente 1: y=175 alto 227 (techo 402); gola 86; frente 2: y=488 alto 227.
    const mapa = calcularTablaContinua([frente('a', 175, 227), frente('b', 488, 227)]);
    const span = (488 + 227) - 175; // 540
    expect(mapa.get('a')).toEqual({ offsetY: 0, repeatY: span / MM_POR_TILE });
    expect(mapa.get('b')).toEqual({ offsetY: (488 - 175) / MM_POR_TILE, repeatY: span / MM_POR_TILE });
  });

  it('frentes de distinto módulo no comparten; 1 frente solo no entra', () => {
    const mapa = calcularTablaContinua([
      frente('a', 0, 200, '1'),
      frente('b', 300, 200, '2'),
      frente('c', 10, 150, '3'),
    ]);
    expect(mapa.size).toBe(0);
  });

  it('sin posición no participa', () => {
    const p = { id: 'x', nombre: 'Frente cajon x M1', ancho: 800, alto: 200, modulo: '1', posicion: null };
    expect(calcularTablaContinua([p, frente('a', 0, 200)]).size).toBe(0);
  });
});

describe('COMBINACIONES — pares exterior + interior', () => {
  it('todas referencian acabados existentes', () => {
    for (const c of Object.values(COMBINACIONES)) {
      expect(getAcabado(c.exterior), `${c.nombre} exterior`).not.toBeNull();
      expect(getAcabado(c.interior), `${c.nombre} interior`).not.toBeNull();
    }
  });

  it('getCombinacion resuelve por id y null/unknown devuelve null', () => {
    expect(getCombinacion('roble-blanco')).toEqual({
      nombre: 'Roble + Blanco',
      exterior: 'roble',
      interior: 'blanco',
    });
    expect(getCombinacion('no-existe')).toBeNull();
    expect(getCombinacion(null)).toBeNull();
  });
});

describe('analizarAlcanceModulos — módulos internos del mueble', () => {
  const pieza = (modulo: string, x: number) => ({ modulo, posicion: { x } });

  it('con <3 módulos no hay internos (los extremos son todo lo visible)', () => {
    expect(analizarAlcanceModulos([pieza('1', 0)]).internos.size).toBe(0);
    const dos = analizarAlcanceModulos([pieza('1', 0), pieza('2', 900)]);
    expect(dos.raices).toEqual(new Set(['1', '2']));
    expect(dos.internos.size).toBe(0);
  });

  it('con 3+ módulos, los internos son los que no están en los extremos (por X)', () => {
    const a = analizarAlcanceModulos([
      pieza('1', 0),
      pieza('3', 1800),
      pieza('2', 900),
      pieza('4', 2700),
    ]);
    expect(a.internos).toEqual(new Set(['2', '3']));
  });

  it('submódulos se atan a su raíz (concatenados y punteados)', () => {
    const a = analizarAlcanceModulos([
      pieza('1', 0),
      pieza('11', 0), // cajón del módulo 1
      pieza('2', 900),
      pieza('2.1', 900), // submódulo punteado del módulo 2
      pieza('3', 1800),
    ]);
    expect(a.raices).toEqual(new Set(['1', '2', '3']));
    expect(a.internos).toEqual(new Set(['2']));
    expect(raizDeModulo('11', a)).toBe('1');
    expect(raizDeModulo('2.1', a)).toBe('2');
    expect(raizDeModulo('3', a)).toBe('3');
  });
});
