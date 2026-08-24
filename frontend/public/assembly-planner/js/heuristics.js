// heuristics.js — reglas de sugerencia de dependencias de ensamblaje

import { isGlobalPiece } from './utils.js';
import { normalizeName } from './utils/normalize.js';

export const DEPENDENCY_TYPES = {
  estructural: { label: 'Estructural', color: '#4ECDC4', width: 2, dash: 'none' },
  fondo: { label: 'Fondo', color: '#94a3b8', width: 1.5, dash: '4,4' },
  interior: { label: 'Interior', color: '#DDA0DD', width: 1.5, dash: 'none' },
  soporte: { label: 'Soporte', color: '#f97316', width: 3, dash: 'none' },
  accesorio: { label: 'Accesorio', color: '#3b82f6', width: 1, dash: 'none' },
  acabado: { label: 'Acabado', color: '#fbbf24', width: 1, dash: 'none' },
  bloqueo: { label: 'Bloqueo', color: '#ef4444', width: 3, dash: '8,4' },
};

function normalize(s) {
  return normalizeName(s);
}

function sameModule(a, b) {
  // Las piezas globales (modulo = 'estructura') se conectan solo entre si,
  // no con las piezas de modulos numericos. Esto evita el grafo global saturado.
  if (a.modulo === 'estructura' && b.modulo === 'estructura') return true;
  if (a.modulo === 'estructura' || b.modulo === 'estructura') return false;
  return a.modulo === b.modulo;
}

export function sugerirDependencias(piezas) {
  const deps = [];

  function add(from, to, type, mensaje = '') {
    if (!from || !to || from === to) return;
    if (deps.some((d) => d.from === from && d.to === to)) return;
    deps.push({ from, to, type, mensaje });
  }

  const laterales = piezas.filter((p) => normalize(p.nombre).includes('lateral') && !normalize(p.nombre).includes('cajon'));
  const bases = piezas.filter((p) => normalize(p.nombre).includes('base') && !normalize(p.nombre).includes('cajon'));
  const tapas = piezas.filter(
    (p) => (normalize(p.nombre).includes('tapa') || normalize(p.nombre).includes('techo')) && !normalize(p.nombre).includes('cajon')
  );
  const fondos = piezas.filter(
    (p) => (normalize(p.nombre).includes('fondo') || normalize(p.nombre).includes('trasera')) && !normalize(p.nombre).includes('cajon')
  );
  const interiores = piezas.filter((p) =>
    ['repisa', 'estante', 'divisor', 'division', 'particion', 'partición'].some((k) =>
      normalize(p.nombre).includes(k)
    ) && !normalize(p.nombre).includes('cajon')
  );
  const puertas = piezas.filter((p) => normalize(p.nombre).includes('puerta') && !normalize(p.nombre).includes('tirador'));
  const cajones = piezas.filter(
    (p) => normalize(p.nombre).includes('cajon') && !normalize(p.nombre).includes('cajonera') && !normalize(p.nombre).includes('tirador')
  );
  const tiradores = piezas.filter((p) => normalize(p.nombre).includes('tirador'));
  const barras = piezas.filter((p) => normalize(p.nombre).includes('barra'));
  const soportes = piezas.filter((p) =>
    ['soporte', 'montante', 'travesano', 'travesaño', 'refuerzo', 'tirante', 'pata', 'cantonera'].some((k) =>
      normalize(p.nombre).includes(k)
    ) && !normalize(p.nombre).includes('cajon')
  );
  const zocalos = piezas.filter((p) => normalize(p.nombre).includes('zocalo'));

  // Paso 1: Laterales raíces (no dependen de nadie)

  // Paso 2: Base y Tapa dependen de los laterales del mismo módulo
  laterales.forEach((lat) => {
    bases.filter((b) => sameModule(lat, b)).forEach((b) => add(lat.id, b.id, 'estructural'));
    tapas.filter((t) => sameModule(lat, t)).forEach((t) => add(lat.id, t.id, 'estructural'));
  });

  // Paso 3: Divisores verticales dependen de base + tapa
  interiores
    .filter((p) => normalize(p.nombre).includes('divisor') || normalize(p.nombre).includes('division') || normalize(p.nombre).includes('particion'))
    .forEach((div) => {
      [...bases, ...tapas].filter((p) => sameModule(p, div)).forEach((p) => add(p.id, div.id, 'interior'));
    });

  // Paso 4: Fondos dependen de estructura cerrada (base + laterales + divisores).
  // No incluimos tapa para evitar ciclos con piezas globales y porque el fondo
  // se instala antes de colocar la tapa.
  fondos.forEach((fondo) => {
    [...bases, ...laterales, ...interiores.filter((i) => normalize(i.nombre).includes('divisor') || normalize(i.nombre).includes('division'))]
      .filter((p) => sameModule(p, fondo))
      .forEach((p) => add(p.id, fondo.id, 'fondo'));
  });

  // Paso 5: Repisas/estantes dependen de fondo + laterales (suben de nivel con el fondo)
  interiores
    .filter((p) => normalize(p.nombre).includes('repisa') || normalize(p.nombre).includes('estante'))
    .forEach((rep) => {
      [...bases, ...tapas, ...fondos, ...laterales]
        .filter((p) => sameModule(p, rep))
        .forEach((p) => add(p.id, rep.id, 'interior'));
    });

  // Paso 6: Zócalos dependen de fondo + laterales
  zocalos.forEach((zoc) => {
    [...bases, ...laterales, ...fondos]
      .filter((p) => sameModule(p, zoc))
      .forEach((p) => add(p.id, zoc.id, 'acabado'));
  });

  // Paso 6b: Soportes de refuerzo dependen de la estructura cerrada del mismo modulo (base, tapa, laterales)
  soportes.forEach((sop) => {
    [...bases, ...tapas, ...laterales]
      .filter((p) => sameModule(p, sop))
      .forEach((p) => add(p.id, sop.id, 'soporte', 'Refuerzo estructural'));
  });

  // Paso 7: Puertas dependen de estructura cerrada + fondo + repisas
  puertas.forEach((pue) => {
    [...bases, ...tapas, ...laterales, ...fondos, ...interiores.filter((i) => normalize(i.nombre).includes('repisa') || normalize(i.nombre).includes('estante'))]
      .filter((p) => sameModule(p, pue))
      .forEach((p) => add(p.id, pue.id, 'accesorio'));
  });

  const repisas = interiores.filter((p) => normalize(p.nombre).includes('repisa') || normalize(p.nombre).includes('estante'));

  // Paso 8: Cajones dependen de la base/repisa del mismo módulo
  cajones.forEach((caj) => {
    const baseModulo = bases.find((b) => sameModule(b, caj));
    const repisaModulo = repisas.find((r) => sameModule(r, caj));
    if (baseModulo) add(baseModulo.id, caj.id, 'interior');
    if (repisaModulo) add(repisaModulo.id, caj.id, 'interior');
    add(caj.id, `${caj.id}-confirmar-corredera`, 'bloqueo', 'Confirmar corredera antes de cortar');
  });

  // Paso 9: Tiradores dependen de puertas/cajones
  tiradores.forEach((tir) => {
    const target = [...puertas, ...cajones].find((p) => sameModule(p, tir));
    if (target) add(target.id, tir.id, 'accesorio');
  });

  // Paso 10: Barras de ropa dependen de laterales + tapa
  barras.forEach((bar) => {
    [...laterales, ...tapas]
      .filter((l) => sameModule(l, bar))
      .forEach((l) => add(l.id, bar.id, 'accesorio'));
  });

  // Paso 11: Secuencializar repisas, puertas, cajones y tiradores dentro de cada módulo
  function chainByModule(list, type) {
    const byModule = {};
    list.forEach((p) => {
      byModule[p.modulo] = byModule[p.modulo] || [];
      byModule[p.modulo].push(p);
    });
    Object.values(byModule).forEach((group) => {
      group.sort((a, b) => a.nombre.localeCompare(b.nombre));
      for (let i = 1; i < group.length; i++) {
        add(group[i - 1].id, group[i].id, type);
      }
    });
  }
  chainByModule(repisas, 'interior');
  chainByModule(puertas, 'accesorio');
  chainByModule(cajones, 'interior');
  chainByModule(tiradores, 'accesorio');

  // Paso 12: Sub-modulos dependen de la estructura de su modulo padre
  // Un modulo h es hijo de p si h empieza con p, p existe y h !== p.
  const moduleIds = Array.from(new Set(piezas.filter((p) => !isGlobalPiece(p)).map((p) => String(p.modulo).trim()))).sort((a, b) => b.length - a.length || a.localeCompare(b));
  function findParentModule(h) {
    for (const p of moduleIds) {
      if (p !== h && h.startsWith(p)) return p;
    }
    return null;
  }
  const anclasPadre = [...bases, ...tapas, ...laterales, ...fondos];
  piezas.filter((p) => !isGlobalPiece(p)).forEach((hijo) => {
    const padreMod = findParentModule(String(hijo.modulo).trim());
    if (!padreMod) return;
    const ancla = anclasPadre.find((p) => String(p.modulo).trim() === padreMod);
    if (ancla) add(ancla.id, hijo.id, 'estructural', `Requiere estructura del módulo ${padreMod}`);
  });

  // Paso 13: Las piezas globales (tapa corrida, tablero, corona, espejo, etc.)
  // deben ensamblarse al final, despues de que todos los modulos numericos
  // (estructura + interiores + accesorios) esten armados. Esto evita que la
  // tapa aparezca en el primer paso del manual/grafo por estar aislada por
  // sameModule de las piezas de modulo.
  const globales = piezas.filter((p) => isGlobalPiece(p));
  const nonGlobalPieces = piezas.filter((p) => !isGlobalPiece(p));
  globales.forEach((g) => {
    nonGlobalPieces.forEach((p) => add(p.id, g.id, 'acabado'));
  });

  return deps;
}
