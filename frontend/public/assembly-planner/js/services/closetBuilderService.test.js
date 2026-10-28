// js/services/closetBuilderService.test.js — Invariantes del builder de
// closets. Replica contra parseCSV/inferRole las propiedades que
// scripts/lib/cajonModel.test.mjs verifica para el generador offline: el
// servicio runtime y el parser siempre están de acuerdo.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createModule,
  addZocalo,
  addShelf,
  addHangerRail,
  addDoubleRail,
  addDrawer,
  addShoeTray,
  nextModuleId,
  countRootModules,
  rootModuleIds,
  nextContentIndex,
  duplicateModulePieces,
  buildCloset,
} from './closetBuilderService.js';
import { parseCSV, piecesToCSV } from './csvParser.js';
import { inferRole } from './classifierService.js';
import * as geometryService from './geometryService.js';

// Serializa piezas del builder y las re-parsea: devuelve { pieces, result }
// para verificar que el parser acepta lo que el builder produce.
function reparse(pieces) {
  const csv = piecesToCSV(pieces);
  const result = parseCSV(csv);
  return { csv, result, pieces: result.pieces };
}

// El validador de torres exige casco completo por modulo, asi que el
// re-parseo de piezas sueltas (zocalo/repisa/cajon sin casco) siempre
// advertiria "falta pieza base/tapa/...". Para verificar que el CONTENIDO
// es limpio se re-parsea casco + contenido juntos.
function reparseWithCasco(contentPieces, moduleId = '1') {
  const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: moduleId });
  assert.ok(casco.ok);
  return reparse([...casco.pieces, ...contentPieces]);
}

function rolesOf(pieces) {
  return pieces.map((p) => inferRole(p));
}

describe('createModule', () => {
  it('produce un casco de 5 piezas que parsea sin errores', () => {
    const r = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    assert.ok(r.ok);
    assert.equal(r.pieces.length, 5);
    assert.equal(r.interiorWidth, 820);
    assert.equal(r.interiorDepth, 570);
    const { result } = reparse(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
  });

  it('baseInterna genera la base de ancho/prof internos (apoyada sobre zocalo)', () => {
    const r = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1', baseInterna: true });
    assert.ok(r.ok);
    const base = r.pieces.find((p) => p.id === 'm1-base');
    const tapa = r.pieces.find((p) => p.id === 'm1-tapa');
    assert.equal(base.ancho, 820);  // 850 - 2*15 (entre laterales)
    assert.equal(base.alto, 585);   // 600 - 15 (hasta la pared: front_flush)
    assert.equal(tapa.ancho, 850);  // la tapa sigue externa
    // El renderer clasifica la base 'front_flush' en profundidad; el ancho
    // interno manda para apoyarla sobre el zócalo (bottomPanelOffset).
    // = altura del zocalo (se apoya sobre el, no en el suelo).
    const { classifyTopBottomMount } = geometryService;
    assert.equal(classifyTopBottomMount(base, 850, 600, 15), 'internal');
    const { result } = reparse(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
  });

  it('los roles estructurales son base/tapa/lateral/fondo', () => {
    const r = createModule({ ancho: 600, alto: 1300, prof: 450, modulo: '2' });
    const roles = rolesOf(r.pieces);
    assert.ok(roles.includes('bottom_panel'));
    assert.ok(roles.includes('top_panel'));
    assert.equal(roles.filter((x) => x === 'side_panel').length, 2);
    assert.ok(roles.includes('back_panel'));
  });

  it('rechaza medidas invalidas y espesores no soportados', () => {
    assert.equal(createModule({ ancho: 50, alto: 2400, prof: 600, modulo: '1' }).ok, false);
    assert.equal(createModule({ ancho: 850, alto: 2400, prof: 600, espesor: 12, modulo: '1' }).ok, false);
    assert.equal(createModule({ ancho: 850, alto: 2400, prof: 600 }).ok, false);
  });
});

describe('addZocalo', () => {
  it('frente interno = ancho - 2*espesor, clasificado como plinth', () => {
    const r = addZocalo('1', { ancho: 850, alto: 150 });
    assert.ok(r.ok);
    assert.equal(r.pieces[0].ancho, 820);
    assert.equal(r.pieces[0].alto, 150);
    assert.equal(inferRole(r.pieces[0]), 'plinth');
    const { result } = reparseWithCasco(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
  });
});

describe('addShelf', () => {
  it('luz >= 600 agrega refuerzo de 100 mm', () => {
    const r = addShelf('1', { anchoUtil: 820, profReal: 570, index: 1 });
    assert.ok(r.ok);
    assert.equal(r.pieces.length, 2);
    assert.equal(r.pieces[1].alto, 100);
    assert.ok(r.conRefuerzo);
  });

  it('luz < 600 no agrega refuerzo', () => {
    const r = addShelf('1', { anchoUtil: 570, profReal: 350, index: 1 });
    assert.ok(r.ok);
    assert.equal(r.pieces.length, 1);
    assert.equal(r.conRefuerzo, false);
  });

  it('la repisa clasifica como shelf y parsea limpia', () => {
    const r = addShelf('1', { anchoUtil: 820, profReal: 570, index: 2 });
    const { result, pieces } = reparseWithCasco(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
    assert.equal(result.warnings.length, 0, result.warnings?.join('; '));
    assert.equal(rolesOf(pieces).filter((x) => x === 'shelf').length, 1);
  });
});

describe('addHangerRail', () => {
  it('barra de 25 mm clasificada como hanger_rail', () => {
    const r = addHangerRail('1', { anchoUtil: 820 });
    assert.ok(r.ok);
    assert.equal(r.pieces[0].espesor, 25);
    assert.equal(inferRole(r.pieces[0]), 'hanger_rail');
  });
});

describe('addDrawer', () => {
  it('cajon corredera de 7 piezas coherente con el vano', () => {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    const r = addDrawer('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
    assert.ok(r.ok, r.errors?.join('; '));
    assert.equal(r.pieces.length, 7);
    assert.equal(r.submodulo, '11');
    const frente = r.pieces.find((p) => p.id.includes('-frente'));
    assert.equal(frente.ancho, 818); // W(820) - 2
    assert.equal(frente.alto, 197); // altoVano - 3
    const { result } = reparseWithCasco(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
    assert.equal(result.warnings.length, 0, result.warnings?.join('; '));
  });

  it('zapatera usa vocabulario zapatera y submodulo propio', () => {
    const r = addDrawer('2', 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 180, vocabulario: 'zapatera' });
    assert.ok(r.ok);
    assert.equal(r.submodulo, '23');
    assert.ok(r.pieces.some((p) => p.nombre.includes('zapatera extraible')));
    const { result } = reparseWithCasco(r.pieces, '2');
    assert.equal(result.ok, true, result.errors?.join('; '));
  });

  it('volquete no genera cara y la bandeja limita el lateral', () => {
    const r = addDrawer('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 280, tipo: 'volquete', altBandeja: 150 });
    assert.ok(r.ok);
    assert.ok(!r.pieces.some((p) => p.id.includes('-cara')));
    const lateral = r.pieces.find((p) => p.id.includes('lateral-izq'));
    assert.equal(lateral.alto, 150);
  });

  it('rechaza vano demasiado estrecho sin lanzar', () => {
    const r = addDrawer('1', 1, { anchoModulo: 40, profundidadModulo: 600, altoVano: 200 });
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
  });
});

describe('nextModuleId / countRootModules', () => {
  it('numera secuencialmente ignorando submodulos y globales', () => {
    const piezas = [
      { modulo: '1' }, { modulo: '1.1' }, { modulo: '2' }, { modulo: 'estructura' },
    ];
    assert.equal(nextModuleId(piezas), '3');
    assert.equal(nextModuleId([]), '1');
    assert.equal(nextModuleId([{ modulo: 'glb-zocalo' }]), '1');
  });

  it('countRootModules cuenta raices, no submodulos', () => {
    assert.equal(countRootModules([{ modulo: '1' }, { modulo: '1.1' }, { modulo: '2' }]), 2);
    assert.equal(countRootModules([{ modulo: 'estructura' }]), 0);
  });
});

describe('rootModuleIds / duplicateModulePieces / addDoubleRail', () => {
  it('rootModuleIds distingue raices de submodulos en ambas convenciones', () => {
    const piezas = [
      { modulo: '1' }, { modulo: '11' }, { modulo: '12' },
      { modulo: '2' }, { modulo: '2.1' }, { modulo: 'estructura' },
    ];
    assert.deepEqual([...rootModuleIds(piezas)].sort(), ['1', '2']);
    assert.equal(nextModuleId(piezas), '3');
    assert.equal(countRootModules(piezas), 2);
  });

  it('duplicateModulePieces renombra ids, modulos y submodulos', () => {
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    const cajon = addDrawer('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
    const copias = duplicateModulePieces([...casco.pieces, ...cajon.pieces], '1', '2');
    assert.equal(copias.length, 12);
    assert.ok(copias.every((p) => String(p.modulo) === '2' || String(p.modulo) === '21'));
    assert.ok(copias.every((p) => String(p.id).startsWith('m2')));
    // Sin colisiones con los originales.
    const origIds = new Set([...casco.pieces, ...cajon.pieces].map((p) => p.id));
    assert.ok(copias.every((p) => !origIds.has(p.id)));
    const { result } = reparse(copias);
    assert.equal(result.ok, true, result.errors?.join('; '));
  });

  it('addDoubleRail crea barra alta (2100) y baja (1000) ancladas con pos_z', () => {
    const r = addDoubleRail('1', { anchoUtil: 820 });
    assert.ok(r.ok);
    assert.equal(r.pieces.length, 2);
    assert.deepEqual(r.pieces.map((p) => p.pos_z).sort((a, b) => a - b), [1000, 2100]);
    const casco = createModule({ ancho: 850, alto: 2400, prof: 600, modulo: '1' });
    const { result } = reparse([...casco.pieces, ...r.pieces]);
    assert.equal(result.ok, true, result.errors?.join('; '));
  });
});

describe('buildCloset', () => {
  it('arma un closet de 2 modulos con contenido variado', () => {
    const r = buildCloset({
      modules: [
        { ancho: 850, alto: 2400, prof: 600, contenido: [{ kind: 'zocalo' }, { kind: 'rail' }, { kind: 'shelf' }] },
        { ancho: 850, alto: 2400, prof: 600, contenido: [{ kind: 'shelf' }, { kind: 'drawer', altoVano: 200 }, { kind: 'shoeRack', altoVano: 180 }] },
      ],
    });
    assert.ok(r.ok, r.errors?.join('; '));
    // M1: casco 5 + zocalo 1 + barra 1 + repisa(820>=600, con refuerzo) 2 = 9
    assert.equal(r.pieces.filter((p) => p.modulo === '1').length, 9);
    // M2: casco 5 + repisa 2 + cajon 6 + zapatera 6; cajon/zapatera en submodulos
    assert.equal(r.pieces.filter((p) => p.modulo === '2').length, 7);
    assert.equal(r.pieces.filter((p) => p.modulo === '21' || p.modulo === '22').length, 14);
    const { result } = reparse(r.pieces);
    assert.equal(result.ok, true, result.errors?.join('; '));
    assert.equal(result.warnings.length, 0, result.warnings?.join('; '));
  });

  it('propiedad: 100 closets aleatorios parsean sin errores ni warnings', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
    for (let i = 0; i < 100; i++) {
      const modulos = int(1, 4);
      const r = buildCloset({
        modules: Array.from({ length: modulos }, (_, m) => ({
          ancho: int(600, 1200),
          alto: int(1800, 2600),
          prof: int(400, 650),
          contenido: Array.from({ length: int(1, 5) }, () => {
            const kinds = ['shelf', 'rail', 'zocalo', 'drawer', 'shoeRack'];
            const kind = kinds[int(0, kinds.length - 1)];
            return kind === 'drawer' || kind === 'shoeRack'
              ? { kind, altoVano: int(130, 280) }
              : { kind };
          }),
        })),
      });
      if (!r.ok) {
        // medidas aleatorias pueden ser invalidas (ej. modulo demasiado
        // estrecho para cajon) — solo exigimos que falle sin lanzar.
        assert.ok(r.errors.length > 0);
        continue;
      }
      const { result } = reparse(r.pieces);
      assert.equal(result.ok, true, `iter ${i}: ${result.errors?.join('; ')}`);
      // El warning de cobertura de frentes (<35% del alto util) es una
      // heuristica de DISENO (sobra vano), no de coherencia geometrica: con
      // contenido aleatorio escaso en modulus altos es esperable. El resto
      // de warnings (rotate, soporte, coherencia caja-riel) no se toleran.
      const warnings = result.warnings.filter((w) => !w.includes('frentes de cajón suman'));
      assert.equal(warnings.length, 0, `iter ${i}: ${warnings.join('; ')}`);
    }
  });

  it('rechaza config sin modulos', () => {
    assert.equal(buildCloset({}).ok, false);
    assert.equal(buildCloset({ modules: [] }).ok, false);
  });
});

describe('zapatera: división central (apoyo de la fila delantera)', () => {
  it('por defecto genera la división paralela al fondo (rol drawer_divider)', () => {
    const r = addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
    assert.ok(r.ok);
    const div = r.pieces.find((p) => p.id === 'm1zapatera1-division');
    assert.ok(div, 'división presente por defecto');
    const fondo = r.pieces.find((p) => p.id === 'm1zapatera1-fondo');
    assert.equal(div.ancho, fondo.ancho, 'misma luz interior que el fondo');
    assert.equal(div.alto, fondo.alto, 'misma altura de apoyo que el fondo');
    assert.equal(inferRole(div), 'drawer_divider');
    assert.equal(div.modulo, '11');
  });

  it('division: false la omite', () => {
    const r = addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, division: false, conFrente: true });
    assert.ok(r.ok);
    assert.equal(r.pieces.some((p) => p.id.endsWith('-division')), false);
    // El resto del conjunto intacto (frente, laterales, fondo, cara, base, tirador).
    assert.equal(r.pieces.length, 7);
  });
});

describe('zapatera: frente opcional (bandeja abierta por defecto)', () => {
  it('por defecto (conFrente omitido) NO genera frente ni tirador; la cara queda como frente visible', () => {
    const r = addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200 });
    assert.ok(r.ok);
    assert.equal(r.conFrente, false);
    assert.equal(r.frente, null, 'sin medidas de frente: no existe');
    // laterales ×2 + fondo + cara + división + base = 6; sin frente ni tirador.
    assert.equal(r.pieces.length, 6);
    assert.equal(r.pieces.some((p) => p.id.endsWith('-frente')), false, 'sin pieza de frente');
    assert.equal(r.pieces.some((p) => p.id.endsWith('-tirador')), false, 'sin tirador (va atornillado al frente)');
    const cara = r.pieces.find((p) => p.id.endsWith('-cara'));
    assert.ok(cara, 'la cara del cuerpo queda como frente visible/de agarre');
    // division: false => 5 piezas.
    const r5 = addShoeTray('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, division: false });
    assert.equal(r5.pieces.length, 5);
  });

  it('conFrente: true genera frente decorativo + tirador (8 piezas con división)', () => {
    const r = addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, conFrente: true });
    assert.ok(r.ok);
    assert.equal(r.conFrente, true);
    assert.deepEqual(r.frente, { ancho: 818, alto: 197 });
    assert.equal(r.pieces.length, 8);
    assert.ok(r.pieces.some((p) => p.id.endsWith('-frente')));
    assert.ok(r.pieces.some((p) => p.id.endsWith('-tirador')));
  });

  it('con frente completo (botas) el frente sigue siendo obligatorio de la bandeja', () => {
    // frenteCompleto integra el frente a la bandeja (sin cara): conFrente no
    // aplica porque el propio cierre de la bandeja es el frente.
    const r = addShoeTray('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, frenteCompleto: true });
    assert.ok(r.ok);
    assert.ok(r.pieces.some((p) => p.id.endsWith('-frente')), 'el frente cierra la bandeja (botas)');
    assert.ok(r.pieces.some((p) => p.id.endsWith('-tirador')), 'con tirador para jalar');
    assert.equal(r.pieces.some((p) => p.id.endsWith('-cara')), false, 'sin cara (frente completo)');
  });

  it('riel marco siempre lleva frente + tirador (el herraje es solo el frente)', () => {
    const r = addShoeTray('1', 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, riel: 'marco', conFrente: false });
    assert.ok(r.ok);
    assert.equal(r.conFrente, true, 'marco fuerza frente aunque conFrente=false');
    assert.deepEqual(r.pieces.map((p) => p.id.split('-').pop()), ['frente', 'tirador']);
  });
});

describe('tipo de riel: define las medidas de la caja', () => {
  it('telescópica regla −26: holgura 13 por lado, fondo = prof − E − 10', () => {
    const r = addDrawer('1', 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, riel: 'telescopica26' });
    assert.ok(r.ok);
    // interior = 820 − 26 − 30 = 764; fondo/laterales = 600 − 15 − 10 = 575.
    assert.equal(r.pieces.find((p) => p.id.endsWith('-base')).ancho, 764);
    assert.equal(r.pieces.find((p) => p.id.endsWith('-lateral-izq')).ancho, 575);
    assert.ok((r.warnings || []).some((w) => w.includes('−26')));
  });

  it('oculta: exterior = vano − 42 + 2×grosor → holgura 6 por lado con laterales 15', () => {
    const r = addDrawer('1', 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, riel: 'oculta' });
    assert.ok(r.ok);
    // interior = 820 − 12 − 30 = 778.
    assert.equal(r.pieces.find((p) => p.id.endsWith('-base')).ancho, 778);
    assert.equal(r.pieces.find((p) => p.id.endsWith('-lateral-izq')).ancho, 575, 'fondo = riel − 10');
    assert.ok((r.warnings || []).some((w) => w.includes('Oculta')));
  });

  it('marco regulable (zapatera): sin cajón, solo frente + tirador, con aviso del rango', () => {
    const r = addShoeTray('1', 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, riel: 'marco' });
    assert.ok(r.ok);
    assert.deepEqual(r.pieces.map((p) => p.id.split('-').pop()), ['frente', 'tirador']);
    assert.ok((r.warnings || []).some((w) => w.includes('marco de aluminio regulable') && w.includes('850')));
  });

  it('riel inválido cae al catálogo (comportamiento por defecto intacto)', () => {
    const r = addDrawer('1', 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, riel: 'nope' });
    assert.ok(r.ok);
    assert.equal(r.pieces.find((p) => p.id.endsWith('-base')).ancho, 765, 'catálogo: 820 − 25,4 − 30');
  });
});
