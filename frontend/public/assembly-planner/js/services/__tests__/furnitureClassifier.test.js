// js/services/__tests__/furnitureClassifier.test.js — Tests de classifyFurniture (S2)
// Clasificación a nivel mueble: ambiente/tipo por keywords, estructura
// constructiva, uso de tablero, score → nivel y confianza por criterio.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFurniture } from '../furnitureClassifier.js';

const piece = (nombre, overrides = {}) => ({
  id: overrides.id ?? `P-${nombre}`,
  nombre,
  ancho: overrides.ancho ?? 500,
  alto: overrides.alto ?? 300,
  espesor: overrides.espesor ?? 15,
  color: overrides.color ?? '#C19A6B',
  modulo: overrides.modulo ?? '1',
  cantidad: overrides.cantidad ?? 1,
  ...overrides,
});

// Cuerpo mínimo de un módulo (base/tapa/laterales) con nombre de prefijo.
const cuerpo = (prefijo, color = '#C19A6B', modulo = '1') => [
  piece(`${prefijo} Base`, { color, modulo }),
  piece(`${prefijo} Tapa`, { color, modulo }),
  piece(`${prefijo} Lateral izquierdo`, { color, modulo }),
  piece(`${prefijo} Lateral derecho`, { color, modulo }),
];

const frenteCajon = (nombre, color = '#fbbf24', modulo = '1', ancho = 500) =>
  piece(`Frente Cajón ${nombre}`, { color, modulo, ancho });

describe('classifyFurniture: ambiente y tipo por keywords', () => {
  const casos = [
    // [prefijo de piezas, ambiente esperado, tipo esperado]
    ['Zapatero 2 puertas', 'entrada', 'zapatera'],
    ['Buro con cajon', 'dormitorio', 'buro'],
    ['Velador de noche', 'dormitorio', 'buro'],
    ['Cajonera 3 cajones', 'dormitorio', 'cajonera'],
    ['Comoda con espejo', 'dormitorio', 'cajonera'],
    ['Closet puertas corredizas', 'dormitorio', 'closet'],
    ['Ropero 2 puertas', 'dormitorio', 'closet'],
    ['Tocador con luz', 'dormitorio', 'tocador'],
    ['Cama base matrimonial', 'dormitorio', 'cama_base'],
    ['Cocina modular lineal', 'cocina_comedor', 'cocina_modular'],
    ['Kitchenette economica', 'cocina_comedor', 'cocina_modular'],
    ['Alacena despensero', 'cocina_comedor', 'alacena'],
    ['Aparador comedor', 'cocina_comedor', 'alacena'],
    ['Mesa comedor 6 personas', 'cocina_comedor', 'mesa_comedor'],
    ['Banco zapatero entrada', 'entrada', 'zapatera'],
    ['Silla comedor madera', 'cocina_comedor', 'silla_banco'],
    ['Botellero bar cantina', 'cocina_comedor', 'bar_cantina'],
    ['Rack entretenimiento TV', 'sala', 'rack_entretenimiento'],
    ['Mueble TV flotante', 'sala', 'rack_entretenimiento'],
    ['Panel TV sala', 'sala', 'panel_tv'],
    ['Librero alto 5 niveles', 'sala', 'estanteria_librero'],
    ['Repisa de pared', 'sala', 'estanteria_librero'],
    ['Mesa centro sala', 'sala', 'mesa_centro_lateral'],
    ['Escritorio ejecutivo', 'oficina', 'escritorio'],
    ['Archivador 2 gavetas', 'oficina', 'archivador'],
    ['Estacion de trabajo doble', 'oficina', 'estacion_trabajo'],
    ['Recepcion recepcionista', 'oficina', 'recepcion'],
    ['Estanteria oficina archivadora', 'oficina', 'estanteria_oficina'],
    ['Mueble bajo lavatorio', 'banio', 'bajo_lavatorio'],
    ['Vanitory doble tarja', 'banio', 'bajo_lavatorio'],
    ['Botiquin con espejo', 'banio', 'botiquin_espejo'],
    ['Recibidor consola entrada', 'entrada', 'recibidor_consola'],
    ['Perchero zapatera entrada', 'entrada', 'perchero_zapatera'],
  ];

  for (const [prefijo, ambiente, tipo] of casos) {
    it(`${prefijo} → ${ambiente}/${tipo}`, () => {
      const result = classifyFurniture(cuerpo(prefijo));
      assert.equal(result.ambiente, ambiente);
      assert.equal(result.tipo, tipo);
    });
  }

  it('confianza alta con 2+ keywords convergentes', () => {
    const result = classifyFurniture(cuerpo('Rack entretenimiento TV'));
    assert.equal(result.confianza.ambiente, 'alta');
    assert.equal(result.confianza.tipo, 'alta');
  });

  it('confianza media con 1 keyword', () => {
    const result = classifyFurniture(cuerpo('Buro'));
    assert.equal(result.confianza.ambiente, 'media');
  });

  it('fallback con confianza baja cuando nada casa', () => {
    const result = classifyFurniture(cuerpo('Pieza generica'));
    assert.equal(result.ambiente, null);
    assert.equal(result.tipo, null);
    assert.equal(result.confianza.ambiente, 'baja');
    assert.equal(result.confianza.tipo, 'baja');
    assert.ok(result.familia, 'el fallback debe reportar la familia detectada');
  });

  it("'bar' no matchea con 'barra colgadora' (palabra completa)", () => {
    const pieces = [
      ...cuerpo('Closet con barra colgadora'),
      piece('Barra colgadora', { modulo: '1' }),
    ];
    const result = classifyFurniture(pieces);
    assert.equal(result.tipo, 'closet');
    assert.equal(result.ambiente, 'dormitorio');
  });
});

describe('classifyFurniture: estructura constructiva', () => {
  it('volquete/abatible → frentes_abatibles', () => {
    const result = classifyFurniture([...cuerpo('Zapatero volquete'), piece('Frente volquete')]);
    assert.equal(result.estructura, 'frentes_abatibles');
  });

  it('hay drawer_face → cajones', () => {
    const result = classifyFurniture([...cuerpo('Cajonera'), frenteCajon('1')]);
    assert.equal(result.estructura, 'cajones');
  });

  it('door + drawer → mixto', () => {
    const pieces = [
      ...cuerpo('Closet'),
      piece('Puerta izquierda'),
      frenteCajon('1'),
    ];
    assert.equal(classifyFurniture(pieces).estructura, 'mixto');
  });

  it('solo door → puertas, con nota si es corrediza', () => {
    const pieces = [...cuerpo('Closet puertas corredizas'), piece('Puerta corrediza izquierda')];
    const result = classifyFurniture(pieces);
    assert.equal(result.estructura, 'puertas');
    assert.equal(result.notas.estructura, 'puerta corrediza');
  });

  it('solo shelves/panels → abierto', () => {
    const result = classifyFurniture([
      piece('Estante 1'), piece('Estante 2'), piece('Lateral izquierdo'), piece('Tapa'),
    ]);
    assert.equal(result.estructura, 'abierto');
  });
});

describe('classifyFurniture: uso de tablero', () => {
  it('frentes de color distinto al cuerpo → cuerpo_frente', () => {
    const pieces = [
      ...cuerpo('Cajonera', '#C19A6B'),
      frenteCajon('1', '#fbbf24'),
    ];
    assert.equal(classifyFurniture(pieces).usoTablero, 'cuerpo_frente');
  });

  it('un solo color estructural → unicolor', () => {
    const pieces = [
      ...cuerpo('Cajonera', '#C19A6B'),
      frenteCajon('1', '#C19A6B'),
    ];
    assert.equal(classifyFurniture(pieces).usoTablero, 'unicolor');
  });

  it('sin frentes → unicolor', () => {
    assert.equal(classifyFurniture(cuerpo('Estanteria')).usoTablero, 'unicolor');
  });
});

describe('classifyFurniture: score → nivel de complejidad', () => {
  it('mueble abierto simple → basico (score 0-2)', () => {
    const result = classifyFurniture([
      piece('Estante 1'), piece('Estante 2'), piece('Lateral izquierdo'), piece('Tapa'),
    ]);
    assert.equal(result.score <= 2, true);
    assert.equal(result.nivel, 'basico');
  });

  it('una familia de cajón + 3 módulos → medio', () => {
    const pieces = [
      ...cuerpo('Buro', '#C19A6B', '1'),
      frenteCajon('1', '#C19A6B', '1'),
      ...cuerpo('Modulo 2', '#C19A6B', '2'),
      ...cuerpo('Modulo 3', '#C19A6B', '3'),
    ];
    const result = classifyFurniture(pieces);
    assert.equal(result.score, 3); // 1 familia (2) + >2 módulos (1)
    assert.equal(result.nivel, 'medio');
  });

  it('dos familias de cajón + puerta corrediza → alto', () => {
    const pieces = [
      ...cuerpo('Closet'),
      frenteCajon('A', '#C19A6B', '1', 500),
      frenteCajon('B', '#C19A6B', '1', 700),
      piece('Puerta corrediza', { modulo: '1' }),
    ];
    const result = classifyFurniture(pieces);
    assert.equal(result.score, 6); // 2 familias (4) + corrediza (2)
    assert.equal(result.nivel, 'alto');
  });

  it('más de 25 piezas suma +1 al score', () => {
    const pieces = [];
    for (let i = 0; i < 30; i += 1) {
      pieces.push(piece(`Estante ${i}`, { id: `E-${i}` }));
    }
    const result = classifyFurniture(pieces);
    assert.equal(result.score, 1);
  });
});
