import fs from 'fs';
import path from 'path';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';

const logger = getLogger('generar-ejemplos-assembly');

const DOCS_DIR = '/workspace/cutternest-kit/docs';
const DATA_DIR = '/workspace/cutternest-kit/frontend/public/assembly-planner/data';

function line(id, nombre, ancho, alto, cantidad, rotate, color, espesor, cantos, modulo) {
  return `${id},${nombre},${ancho},${alto},${cantidad},${rotate},${color},${espesor},"${cantos}",${modulo}`;
}

function fondo(id, nombre, ancho, alto, color, modulo) {
  return line(id, nombre, ancho, alto, 1, 'no', color, 15, '', modulo);
}

function tirador(id, nombre, color, modulo) {
  return line(id, nombre, 2, 20, 1, 'no', color, 5, '', modulo);
}

// Genera un cajón de 6 piezas coherente con el vano del módulo padre:
// frente decorativo + 2 laterales + base + fondo + cara (frente interior de
// la caja, entre los laterales) + tirador.
// Reglas (las mismas que valida js/csvParser.js):
//   W = anchoModulo − 2E · D = profundidadModulo − E − E (fondo y lateral de 15)
//   frente.ancho = N===1 ? W−2 : floor((W − (N−1)×3)/N) − 1  (debe ser ≤ W−2)
//   frente.alto = altoVano − 3
//   profCajon = D − 25 (corredera telescópica) o D − 15 (volquete/abatible)
//   lateral = profCajon × (frente.alto − 2×espBase)
//   fondo = interior × (latAlto − espBase): va apoyado sobre la base
// Caja telescópica (RAIL_TYPES.telescopica, holgura 12,7 mm por lado):
//   vanoCajon = N===1 ? W : frente.ancho + 2 (vano individual del cajón)
//   boxExterior = round(vanoCajon − 25,4) · interior = boxExterior − 2×espLat
//   base/fondo/cara miden el INTERIOR de la caja (no el ancho del frente
//   decorativo: éste es ~24 mm más ancho que lo que permite la corredera).
// opts.vocabulario 'zapatera' nombra "zapatera extraible" en vez de "cajon"
// (zapatera-cajón: se desliza en rieles sin la palabra "cajon" en el nombre).
function cajon(parent, index, opts) {
  const {
    anchoModulo,
    profundidadModulo,
    altoVano,
    nPorFila = 1,
    colorFrente,
    colorLateral,
    suffix = '',
    tipo = 'corredera',
    altBandeja = 150,
    vocabulario = 'cajon'
  } = opts;
  const E = 15; // espesor de laterales y fondo del módulo en estos ejemplos
  const ESP_LAT = 15; // espesor laterales del cajón
  const ESP_BASE = 15; // espesor base del cajón
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho =
    nPorFila === 1 ? W - 2 : Math.floor((W - (nPorFila - 1) * 3) / nPorFila) - 1;
  const frenteAlto = altoVano - 3;
  const volquete = tipo === 'volquete';
  const profCajon = D - (volquete ? 15 : 25);
  // En el volquete la bandeja es baja: el lateral/fondo miden lo alto de la
  // bandeja, no del frente (el frente alto es el que pivota hacia adelante).
  const latAlto = volquete
    ? Math.min(frenteAlto - 2 * ESP_BASE, altBandeja)
    : frenteAlto - 2 * ESP_BASE;
  // El volquete/abatible queda fuera del modelo de corredera: mantiene el
  // cálculo clásico derivado del frente decorativo y sin pieza de cara.
  const interior = volquete
    ? frenteAncho - 2 * ESP_LAT
    : Math.round((nPorFila === 1 ? W : frenteAncho + 2) - 2 * 12.7) - 2 * ESP_LAT;
  const sm = `${parent}${index}`;
  const label = suffix ? ` ${suffix}` : '';
  const tipoNombre = volquete ? ' abatible' : '';
  const esZapatera = vocabulario === 'zapatera';
  // En el volquete el calificativo 'abatible' va solo en el frente (es el que
  // pivota); laterales/fondo/base/tirador mantienen el nombre plano "cajon".
  const frenteVocab = esZapatera ? 'zapatera extraible' : `cajon${tipoNombre}`;
  const vocab = esZapatera ? 'zapatera extraible' : 'cajon';
  const idp = esZapatera ? 'zapatera' : 'cajon';
  const ladoIzq = esZapatera ? ' izq' : '';
  const ladoDer = esZapatera ? ' der' : '';
  const rows = [
    `m${sm}-${idp}-frente,Frente ${frenteVocab}${label} M${parent},${frenteAncho},${frenteAlto},1,si,${colorFrente},15,"T,B,L,R",${sm}`,
    `m${sm}-${idp}-lateral-izq,Lateral ${vocab}${label}${ladoIzq} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,L",${sm}`,
    `m${sm}-${idp}-lateral-der,Lateral ${vocab}${label}${ladoDer} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,R",${sm}`
  ];
  if (!volquete) {
    // Fondo y cara: piezas de la caja que miden el interior entre laterales.
    rows.push(`m${sm}-${idp}-fondo,Fondo ${vocab}${label} M${parent},${interior},${latAlto - ESP_BASE},1,no,#F2F2F2,15,,${sm}`);
    rows.push(`m${sm}-${idp}-cara,Cara ${vocab}${label} M${parent},${interior},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,L,R",${sm}`);
  } else {
    // Volquete/abatible: se conserva el fondo clásico derivado del frente.
    rows.push(`m${sm}-${idp}-fondo,Fondo ${vocab}${label} M${parent},${interior},${latAlto - ESP_BASE},1,no,#F2F2F2,15,,${sm}`);
  }
  rows.push(
    `m${sm}-${idp}-base,Base ${vocab}${label} M${parent},${interior},${profCajon},1,si,${colorLateral},${ESP_BASE},"T,B,L,R",${sm}`,
    `m${sm}-${idp}-tirador,Tirador ${vocab}${label} M${parent},2,20,1,no,#A0A0A0,5,,${sm}`
  );
  return rows;
}

function baseTapaLateralesFondo(mod, parent, ancho, alto, prof, colorCuerpo) {
  return [
    line(`m${mod}-base`, `Base modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-tapa`, `Tapa modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-lateral-izq`, `Lateral izquierdo M${parent}`, prof, alto, 1, 'no', colorCuerpo, 15, 'T,B,L', mod),
    line(`m${mod}-lateral-der`, `Lateral derecho M${parent}`, prof, alto, 1, 'no', colorCuerpo, 15, 'T,B,R', mod),
    fondo(`m${mod}-fondo`, `Fondo modulo M${parent}`, ancho, alto, '#F2F2F2', mod)
  ];
}

function header(titulo, desc) {
  return `# CutterNest Piezas v1\n# ${titulo}\n# ${desc}\nid,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo`;
}

const examples = [];

// 5. Cocina modular
{
  const lines = [];
  lines.push(header('Ejemplo de cocina modular', 'Estructura global + 4 modulos: bajo mesada fregadero, cajonera triple, alacena y torre horno.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido cocina', 2400, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa-trabajo', 'Tapa de trabajo corrida', 2440, 40, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior cocina', 2440, 600, '#F2F2F2', 'estructura'));
  lines.push(line('glb-cantonera-izq', 'Cantonera izquierda', 60, 60, 1, 'no', '#9CA3AF', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-cantonera-der', 'Cantonera derecha', 60, 60, 1, 'no', '#9CA3AF', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: bajo mesada fregadero con cajon ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 700, 560, '#C19A6B'));
  lines.push(line('m1-repisa-inferior', 'Repisa inferior M1', 520, 380, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 560, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 2: cajonera triple ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 600, 700, 560, '#8B5A2B'));
  lines.push(...cajon(2, 1, { anchoModulo: 600, profundidadModulo: 560, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(2, 2, { anchoModulo: 600, profundidadModulo: 560, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'medio' }));
  lines.push(...cajon(2, 3, { anchoModulo: 600, profundidadModulo: 560, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 3: alacena con estantes y puerta ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 600, 1200, 320, '#C19A6B'));
  lines.push(line('m3-estante-1', 'Estante superior M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-estante-2', 'Estante medio M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-estante-3', 'Estante inferior M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-puerta', 'Puerta alacena M3', 560, 1160, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 3));

  lines.push('# --- Modulo 4: torre horno con cajon inferior ---');
  lines.push(...baseTapaLateralesFondo(4, 4, 600, 1200, 560, '#8B5A2B'));
  lines.push(line('m4-divisor', 'Divisor horno M4', 560, 550, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 4));
  lines.push(...cajon(4, 1, { anchoModulo: 600, profundidadModulo: 560, altoVano: 180, colorFrente: '#D9C2A3', colorLateral: '#C19A6B', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Cocina_Modular.csv', dataName: 'ejemplo-cocina.csv', lines });
}

// 6. Vanitory
{
  const lines = [];
  lines.push(header('Ejemplo de vanitory', 'Estructura global + 3 modulos: vanitory doble cajon, torre auxiliar y repisa abierta.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido bano', 1800, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa-vanitory', 'Tapa vanitory corrida', 1800, 520, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-espejo', 'Espejo marco', 1200, 600, 1, 'no', '#A0A0A0', 5, '', 'estructura'));

  lines.push('# --- Modulo 1: vanitory doble cajon ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 500, 560, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 800, profundidadModulo: 560, altoVano: 180, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'izquierdo' }));
  lines.push(...cajon(1, 2, { anchoModulo: 800, profundidadModulo: 560, altoVano: 180, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'derecho' }));

  lines.push('# --- Modulo 2: torre auxiliar ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 400, 1200, 320, '#8B5A2B'));
  lines.push(line('m2-estante-1', 'Estante superior M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-2', 'Estante medio M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-3', 'Estante inferior M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-puerta', 'Puerta torre M2', 360, 1160, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 2));

  lines.push('# --- Modulo 3: repisa abierta ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 600, 400, 200, '#C19A6B'));
  lines.push(line('m3-repisa', 'Repisa abierta M3', 540, 170, 2, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));

  examples.push({ name: 'Ejemplo_CSV_Vanitory.csv', dataName: 'ejemplo-vanitory.csv', lines });
}

// 7. Comoda / chifonier
{
  const lines = [];
  lines.push(header('Ejemplo de comoda / chifonier', '5 cajones verticales en un solo modulo 900×700×450 (rango cajonera), sin estructura global.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 900, 700, 450, '#C19A6B'));
  for (let i = 1; i <= 5; i++) {
    const suffix = i === 1 ? 'superior' : i === 5 ? 'inferior' : `nivel ${i}`;
    lines.push(...cajon(1, i, { anchoModulo: 900, profundidadModulo: 450, altoVano: 132, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix }));
  }
  examples.push({ name: 'Ejemplo_CSV_Comoda_Chifonier.csv', dataName: 'ejemplo-comoda.csv', lines });
}

// 8. Mueble de TV
{
  const lines = [];
  lines.push(header('Ejemplo de mueble para TV', 'Estructura global + 3 modulos: centro abierto y dos laterales con cajones/puerta.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido TV', 1800, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa', 'Tapa corrida TV', 1800, 40, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-trasera', 'Panel posterior TV', 1800, 500, 1, 'no', '#F2F2F2', 15, '', 'estructura'));

  lines.push('# --- Modulo 1: centro abierto ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 500, 400, '#C19A6B'));
  lines.push(line('m1-estante-1', 'Estante superior M1', 740, 280, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  lines.push(line('m1-estante-2', 'Estante inferior M1', 740, 280, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));

  lines.push('# --- Modulo 2: lateral cajonera ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 500, 500, 400, '#8B5A2B'));
  lines.push(...cajon(2, 1, { anchoModulo: 500, profundidadModulo: 400, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(2, 2, { anchoModulo: 500, profundidadModulo: 400, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 3: lateral puerta ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 500, 500, 400, '#8B5A2B'));
  lines.push(line('m3-puerta', 'Puerta M3', 460, 460, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 3));

  examples.push({ name: 'Ejemplo_CSV_Mueble_TV.csv', dataName: 'ejemplo-mueble-tv.csv', lines });
}

// 9. Escritorio
{
  const lines = [];
  lines.push(header('Ejemplo de escritorio', 'Estructura global tipo tablero + cajoneras laterales y repisa superior.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-tablero', 'Tablero escritorio', 1600, 700, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-zocalo', 'Zocalo escritorio', 2400, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cajonera izquierda ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 400, 700, 560, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 400, profundidadModulo: 560, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 400, profundidadModulo: 560, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 2: cajonera derecha ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 400, 700, 560, '#8B5A2B'));
  lines.push(...cajon(2, 1, { anchoModulo: 400, profundidadModulo: 560, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(2, 2, { anchoModulo: 400, profundidadModulo: 560, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 3: repisa superior ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 1600, 300, 250, '#C19A6B'));
  lines.push(line('m3-montante-central', 'Montante central M3', 250, 300, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 3));
  lines.push(line('m3-travesano', 'Travesano trasero M3', 1540, 60, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-repisa-superior', 'Repisa superior M3', 1540, 200, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-repisa-inferior', 'Repisa inferior M3', 1540, 200, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));

  examples.push({ name: 'Ejemplo_CSV_Escritorio.csv', dataName: 'ejemplo-escritorio.csv', lines });
}

// 10. Armario con puertas corredizas
{
  const lines = [];
  lines.push(header('Ejemplo de armario con puertas corredizas', 'Estructura global + 2 modulos interiores + puertas corredizas.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido armario', 1600, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-corona', 'Corona armario', 1600, 100, 1, 'si', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior armario', 1600, 2300, '#F2F2F2', 'estructura'));
  lines.push(line('glb-puerta-izq', 'Puerta corrediza izquierda', 780, 2250, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-puerta-der', 'Puerta corrediza derecha', 780, 2250, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cuerpo izquierdo ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 2300, 550, '#C19A6B'));
  lines.push(line('m1-barra', 'Barra ropa M1', 740, 25, 1, 'si', '#A0A0A0', 25, '', 1));
  lines.push(...cajon(1, 1, { anchoModulo: 800, profundidadModulo: 550, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 2: cuerpo derecho ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 800, 2300, 550, '#8B5A2B'));
  lines.push(line('m2-repisa-superior', 'Repisa superior M2', 740, 350, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-inferior', 'Repisa inferior M2', 740, 350, 2, 'si', '#D9C2A3', 18, 'T,B,L,R', 2));
  lines.push(...cajon(2, 1, { anchoModulo: 800, profundidadModulo: 550, altoVano: 180, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Armario_Puertas_Corredizas.csv', dataName: 'ejemplo-armario.csv', lines });
}

// 13. Mesa de noche / velador
{
  const lines = [];
  lines.push(header('Ejemplo de mesa de noche / velador', 'Módulo con 1 cajón, base, tapa, laterales y fondo.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 500, 500, 400, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 500, profundidadModulo: 400, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3' }));
  examples.push({ name: 'Ejemplo_CSV_Mesa_Noche.csv', dataName: 'ejemplo-mesa-noche.csv', lines });
}

// 14. Bufetero / aparador
{
  const lines = [];
  lines.push(header('Ejemplo de bufetero / aparador', 'Módulo bajo y ancho 1600×900×450 (rango alacena) con 2 puertas y 1 repisa interna.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 1600, 900, 450, '#C19A6B'));
  lines.push(line('m1-divisor-central', 'Divisor central M1', 420, 870, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-repisa', 'Repisa interna', 1540, 420, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-puerta-izq', 'Puerta izquierda', 765, 830, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 1));
  lines.push(line('m1-puerta-der', 'Puerta derecha', 765, 830, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 1));
  lines.push(tirador('m1-tirador-izq', 'Tirador puerta izq', '#A0A0A0', 1));
  lines.push(tirador('m1-tirador-der', 'Tirador puerta der', '#A0A0A0', 1));
  examples.push({ name: 'Ejemplo_CSV_Bufetero.csv', dataName: 'ejemplo-bufetero.csv', lines });
}

// 15. Zapatero con compartimentos
{
  const lines = [];
  lines.push(header('Ejemplo de zapatero con compartimentos', '2 divisores verticales crean 3 compartimentos con 3 niveles.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 900, 1200, 350, '#8B5A2B'));
  lines.push(line('m1-divisor-izq', 'Divisor zapatero izq', 15, 1170, 1, 'no', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-divisor-der', 'Divisor zapatero der', 15, 1170, 1, 'no', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-bandeja-superior', 'Bandeja zapatero superior', 870, 15, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  lines.push(line('m1-bandeja-media', 'Bandeja zapatero media', 870, 15, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  lines.push(line('m1-bandeja-inferior', 'Bandeja zapatero inferior', 870, 15, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  examples.push({ name: 'Ejemplo_CSV_Zapatero_Compartimentos.csv', dataName: 'ejemplo-zapatero-compartimentos.csv', lines });
}

// 16. Zapatera volquete (pasillo)
{
  const lines = [];
  lines.push(header('Ejemplo de zapatera volquete', 'Zapatera vertical delgada para pasillos: fondo 300 mm y 3 cajones abatibles de apertura pivotante angular, con bandejas inclinadas para el calzado.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 1800, 300, '#8B5A2B'));
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 300, altoVano: 580, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'superior', tipo: 'volquete' }));
  lines.push(...cajon(1, 2, { anchoModulo: 600, profundidadModulo: 300, altoVano: 580, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'medio', tipo: 'volquete' }));
  lines.push(...cajon(1, 3, { anchoModulo: 600, profundidadModulo: 300, altoVano: 580, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior', tipo: 'volquete' }));
  examples.push({ name: 'Ejemplo_CSV_Zapatera_Volquete.csv', dataName: 'ejemplo-zapatero-volquete.csv', lines });
}

// 17. Módulo de clóset con zapatera-cajón (zapatero extraíble)
{
  const lines = [];
  lines.push(header('Ejemplo de módulo con zapatera-cajón (zapatero extraíble)', 'Módulo de clóset 800×1800×500 con zapatero fijo inferior y 5 zapateras-cajón extraíbles en correderas telescópicas. Zapatera-cajón: caja completa de 6 piezas (frente decorativo, 2 laterales, base, fondo y cara) que se desliza en rieles; capacidad aproximada 40-50 pares.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 1800, 500, '#8B5A2B'));
  lines.push(line('m1-bandeja-zapatero', 'Bandeja zapatero', 770, 450, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  for (let i = 1; i <= 5; i++) {
    lines.push(...cajon(1, i, { anchoModulo: 800, profundidadModulo: 500, altoVano: 250, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: `${i}`, vocabulario: 'zapatera' }));
  }
  examples.push({ name: 'Ejemplo_CSV_Zapatero_Extraible_Closet.csv', dataName: 'ejemplo-zapatero-extraible.csv', lines });
}

// 18. Banco zapatero
{
  const lines = [];
  lines.push(header('Ejemplo de banco zapatero', 'Banco de entrada 900×420×350 con asiento y 2 cajones deslizables a nivel de piso. El planner no modela ruedas: el deslizamiento se resuelve con correderas telescópicas.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 900, 420, 350, '#C19A6B'));
  lines.push(line('m1-asiento', 'Asiento banco', 900, 350, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  lines.push(...cajon(1, 1, { anchoModulo: 900, profundidadModulo: 350, altoVano: 193, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'izquierdo' }));
  lines.push(...cajon(1, 2, { anchoModulo: 900, profundidadModulo: 350, altoVano: 193, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'derecho' }));
  examples.push({ name: 'Ejemplo_CSV_Banco_Zapatero.csv', dataName: 'ejemplo-zapatero-banco.csv', lines });
}

// 19. Zapatera-repisa con riel móvil (6 bandejas extraíbles)
{
  const lines = [];
  lines.push(header('Ejemplo de zapatera-repisa con riel móvil', 'Módulo de clóset 800×1800×500 con 6 bandejas zapatera extraíbles en correderas telescópicas de extensión total. Cada bandeja: caja de 7 piezas (frente + 2 laterales + base + fondo + cara + divisor central, sin tirador).'));
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 1800, 500, '#8B5A2B'));
  // Coherencia con el vano (mismas reglas que cajon()):
  //   W=800−2·15=770 → frente 768×130 · D=500−30=470 → prof. cajón 445
  //   laterales 445×(130−2·15=100) · interior = round(770−25,4)−2·15 = 715
  //   base/fondo/cara 715 (el ancho interior entre laterales, no el frente)
  const E = 15;
  const W = 800 - 2 * E;
  const frenteAncho = W - 2;
  const frenteAlto = 130;
  const profCajon = 500 - E - E - 25;
  const latAlto = frenteAlto - 2 * 15;
  const interior = Math.round(W - 2 * 12.7) - 2 * E;
  for (let i = 1; i <= 6; i++) {
    const sm = `1${i}`;
    const label = ` ${i}`;
    lines.push(line(`m${sm}-zapatera-repisa-frente`, `Frente zapatera repisa extraible${label}`, frenteAncho, frenteAlto, 1, 'si', '#C19A6B', 15, 'T,B,L,R', sm));
    lines.push(line(`m${sm}-zapatera-repisa-lateral-izq`, `Lateral zapatera repisa extraible${label} izq`, profCajon, latAlto, 1, 'no', '#D9C2A3', 15, 'T,B,L', sm));
    lines.push(line(`m${sm}-zapatera-repisa-lateral-der`, `Lateral zapatera repisa extraible${label} der`, profCajon, latAlto, 1, 'no', '#D9C2A3', 15, 'T,B,R', sm));
    lines.push(line(`m${sm}-zapatera-repisa-fondo`, `Fondo zapatera repisa extraible${label}`, interior, latAlto - 18, 1, 'no', '#F2F2F2', 15, '', sm));
    lines.push(line(`m${sm}-zapatera-repisa-cara`, `Cara zapatera repisa extraible${label}`, interior, latAlto, 1, 'no', '#D9C2A3', 15, 'T,B,L,R', sm));
    lines.push(line(`m${sm}-zapatera-repisa-divisor`, `Divisor zapatera repisa extraible${label}`, interior, latAlto - 18, 1, 'no', '#D9C2A3', 15, 'T,B,L,R', sm));
    lines.push(line(`m${sm}-zapatera-repisa-base`, `Base bandeja zapatera extraible${label}`, interior, profCajon, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', sm));
  }
  examples.push({ name: 'Ejemplo_CSV_Zapatera_Repisa_Riel.csv', dataName: 'ejemplo-zapatera-repisa.csv', lines });
}

// 20–22. Zócalo-cajón global (patrón real: zócalo full-width SIN base global)
// El zócalo completo es un cajón sin tapa ni base: frente (ancho total × alto
// del zócalo) + laterales (profundidad × alto del zócalo). Los módulos
// conservan su propia base (interna, apoyada a z=zocaloHeight), que hace de
// tapa del cajón. Contrato: frente = suma de anchos de módulos (±2 mm, ADR-0021).

// Zócalo completo full-width: frente + 2 laterales, todo en 'estructura'.
// El renderer distingue este modelo (cajón visible) del patín retranqueado
// clásico (frente solo) por la presencia de los laterales (rol 'plinth_side').
function zocaloCajon(nombre, anchoTotal, profundidad, altoZocalo, color) {
  return [
    line('glb-zocalo', `Zocalo corrido ${nombre}`, anchoTotal, altoZocalo, 1, 'si', color, 15, 'T,B,L,R', 'estructura'),
    line('glb-zocalo-lateral-izq', `Lateral zocalo izquierdo ${nombre}`, profundidad, altoZocalo, 1, 'no', color, 15, 'T,B,L', 'estructura'),
    line('glb-zocalo-lateral-der', `Lateral zocalo derecho ${nombre}`, profundidad, altoZocalo, 1, 'no', color, 15, 'T,B,R', 'estructura'),
  ];
}

// Casco de módulo para el modelo zócalo-cajón: base INTERNA (ancho−2t × prof−2t)
// apoyada sobre el zócalo y laterales de altura TOTAL del mueble (zócalo incluido).
function cascoZocaloCajon(mod, parent, ancho, altoTotal, prof, colorCuerpo) {
  const E = 15;
  return [
    line(`m${mod}-base`, `Base modulo M${parent}`, ancho - 2 * E, prof - 2 * E, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-tapa`, `Tapa modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-lateral-izq`, `Lateral izquierdo M${parent}`, prof, altoTotal, 1, 'no', colorCuerpo, 15, 'T,B,L', mod),
    line(`m${mod}-lateral-der`, `Lateral derecho M${parent}`, prof, altoTotal, 1, 'no', colorCuerpo, 15, 'T,B,R', mod),
    fondo(`m${mod}-fondo`, `Fondo modulo M${parent}`, ancho, altoTotal, '#F2F2F2', mod),
  ];
}

// 20. Clóset con zócalo-cajón
{
  const lines = [];
  lines.push(header('Ejemplo de closet con zocalo-cajon', 'Zocalo completo full-width 1800×150 (frente + laterales, sin base global) + 2 modulos doble puerta 900×2100×550 con su propia base interna apoyada sobre el zocalo, riel colgador, repisa inferior y tapa corrida.'));
  lines.push('# --- Estructura global: zocalo-cajon (sin base global) ---');
  lines.push(...zocaloCajon('closet', 1800, 550, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida closet', 1800, 550, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior closet', 1800, 2100, '#F2F2F2', 'estructura'));

  // Modulo de cuerpo 900×2100×550 (altura TOTAL incluye zocalo de 150).
  const cuerpoCloset = (mod, colorCuerpo, colorFrente) => [
    ...cascoZocaloCajon(mod, mod, 900, 2100, 550, colorCuerpo),
    line(`m${mod}-barra`, `Barra ropa M${mod}`, 870, 25, 1, 'si', '#A0A0A0', 25, '', mod),
    line(`m${mod}-repisa-inferior`, `Repisa inferior M${mod}`, 570, 520, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', mod),
    line(`m${mod}-puerta-izq`, `Puerta izquierda M${mod}`, 433, 1920, 1, 'no', colorFrente, 18, 'T,B,L,R', mod),
    line(`m${mod}-puerta-der`, `Puerta derecha M${mod}`, 433, 1920, 1, 'no', colorFrente, 18, 'T,B,L,R', mod),
  ];
  lines.push('# --- Modulo 1: cuerpo izquierdo doble puerta ---');
  lines.push(...cuerpoCloset(1, '#C19A6B', '#FFFFFF'));
  lines.push('# --- Modulo 2: cuerpo derecho doble puerta ---');
  lines.push(...cuerpoCloset(2, '#8B5A2B', '#FFFFFF'));

  examples.push({ name: 'Ejemplo_CSV_Closet_Zocalo_Cajon.csv', dataName: 'ejemplo-closet-zocalo-cajon.csv', lines });
}

// 21. Cómoda con zócalo-cajón
{
  const lines = [];
  lines.push(header('Ejemplo de comoda con zocalo-cajon', 'Zocalo completo 1200×150 (frente + laterales, sin base global) + 2 modulos cajonera 600×900×450 con su propia base interna apoyada sobre el zocalo y tapa corrida.'));
  lines.push('# --- Estructura global: zocalo-cajon (sin base global) ---');
  lines.push(...zocaloCajon('comoda', 1200, 450, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida comoda', 1200, 450, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));

  // Vano util sobre la base: 165..585 → 3 cajones de altoVano 235 (frente 232).
  const cajonera = (mod, colorCuerpo, colorFrente) => [
    ...cascoZocaloCajon(mod, mod, 600, 900, 450, colorCuerpo),
    ...cajon(mod, 1, { anchoModulo: 600, profundidadModulo: 450, altoVano: 235, colorFrente, colorLateral: '#D9C2A3', suffix: 'superior' }),
    ...cajon(mod, 2, { anchoModulo: 600, profundidadModulo: 450, altoVano: 235, colorFrente, colorLateral: '#D9C2A3', suffix: 'medio' }),
    ...cajon(mod, 3, { anchoModulo: 600, profundidadModulo: 450, altoVano: 235, colorFrente, colorLateral: '#D9C2A3', suffix: 'inferior' }),
  ];
  lines.push('# --- Modulo 1: cajonera izquierda ---');
  lines.push(...cajonera(1, '#C19A6B', '#8B5A2B'));
  lines.push('# --- Modulo 2: cajonera derecha ---');
  lines.push(...cajonera(2, '#8B5A2B', '#C19A6B'));

  examples.push({ name: 'Ejemplo_CSV_Comoda_Zocalo_Cajon.csv', dataName: 'ejemplo-comoda-zocalo-cajon.csv', lines });
}

// 22. Mueble de TV con zócalo-cajón
{
  const lines = [];
  lines.push(header('Ejemplo de mueble para TV con zocalo-cajon', 'Zocalo completo 1800×150 (frente + laterales, sin base global) + modulo cajonera 600 y modulo de repisas 1200 (ambos 600×450, base interna propia) y tapa corrida.'));
  lines.push('# --- Estructura global: zocalo-cajon (sin base global) ---');
  lines.push(...zocaloCajon('TV', 1800, 450, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida TV', 1800, 450, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cajonera (2 cajones, vano 210 → frente 207) ---');
  lines.push(...cascoZocaloCajon(1, 1, 600, 600, 450, '#8B5A2B'));
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 450, altoVano: 210, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 600, profundidadModulo: 450, altoVano: 210, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 2: repisas con divisor central ---');
  lines.push(...cascoZocaloCajon(2, 2, 1200, 600, 450, '#C19A6B'));
  lines.push(line('m2-divisor-central', 'Divisor central M2', 15, 405, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-inf-izq', 'Repisa inferior izquierda M2', 570, 405, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-inf-der', 'Repisa inferior derecha M2', 570, 405, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-izq', 'Estante izquierdo M2', 570, 405, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-der', 'Estante derecho M2', 570, 405, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));

  examples.push({ name: 'Ejemplo_CSV_Mueble_TV_Zocalo_Cajon.csv', dataName: 'ejemplo-mueble-tv-zocalo-cajon.csv', lines });
}

// 23. Cajonera con correderas ocultas (estilo Blum Tandem / Häfele Matrix UM)
// La corredera oculta NO descuenta holgura lateral (sideClearance 0): los
// laterales del cajón van al ras del frente. Su deducción de catálogo (−42 mm)
// aplica al ancho INTERIOR de la caja (RAIL_TYPES.oculta.interiorDeduction):
// base, fondo y cara miden vano − 42. Laterales de 16 mm (rango Blum 16/19)
// con alto = vano − 23 (maxHeightDeduction). Modelo completo de 6 piezas:
// frente decorativo + 2 laterales + base + fondo + cara + tirador.
function cajonOculto(parent, index, opts) {
  const {
    anchoModulo,
    profundidadModulo,
    altoVano,
    colorFrente,
    colorLateral,
    suffix = '',
  } = opts;
  const E = 15;        // espesor de laterales y fondo del módulo
  const ESP_LAT = 16;  // laterales del cajón (rango Blum 16/19)
  const ESP_BASE = 16; // base/fondo/cara del cajón
  const W = anchoModulo - 2 * E;
  const D = profundidadModulo - E - E;
  const frenteAncho = W - 2;
  const frenteAlto = altoVano - 3;
  const profCajon = D - 20;      // oculta: desplaza menos que la telescópica (25)
  const latAlto = altoVano - 23; // maxHeightDeduction (RAIL_TYPES.oculta)
  const interior = W - 42;       // deducción de catálogo: interior = vano − 42
  const sm = `${parent}${index}`;
  const label = suffix ? ` ${suffix}` : '';
  return [
    `m${sm}-cajon-frente,Frente cajon oculto${label} M${parent},${frenteAncho},${frenteAlto},1,si,${colorFrente},16,"T,B,L,R",${sm}`,
    `m${sm}-cajon-lateral-izq,Lateral cajon oculto${label} izq M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,L",${sm}`,
    `m${sm}-cajon-lateral-der,Lateral cajon oculto${label} der M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,R",${sm}`,
    `m${sm}-cajon-fondo,Fondo cajon oculto${label} M${parent},${interior},${latAlto - ESP_BASE},1,no,#F2F2F2,${ESP_BASE},,${sm}`,
    `m${sm}-cajon-cara,Cara cajon oculto${label} M${parent},${interior},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,L,R",${sm}`,
    `m${sm}-cajon-base,Base cajon oculto${label} M${parent},${interior},${profCajon},1,si,${colorLateral},${ESP_BASE},"T,B,L,R",${sm}`,
    `m${sm}-cajon-tirador,Tirador cajon oculto${label} M${parent},2,20,1,no,#A0A0A0,5,,${sm}`
  ];
}

// 23. Cajonera 600×900×450 con 3 cajones en correderas ocultas
{
  const lines = [];
  lines.push(header('Ejemplo de cajonera con correderas ocultas', 'Cajonera 600×900×450 con 3 cajones en correderas ocultas de extensión total (estilo Blum Tandem / Häfele Matrix UM). Caja sin holgura lateral (laterales de 16 mm al ras del frente) y alto de cajón = vano − 23 mm (maxHeightDeduction); base, fondo y cara interiores = vano − 42 mm (deducción de catálogo).'));
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 900, 450, '#C19A6B'));
  // Vano útil sobre la base: 870/3 = 290 → frente 568×287, laterales 400×267
  // (= 290 − 23), base 528 (= 570 − 42) × 400, cara 528×267, fondo 528×251
  // (= 267 − 16, apoyado sobre la base).
  lines.push(...cajonOculto(1, 1, { anchoModulo: 600, profundidadModulo: 450, altoVano: 290, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: '1' }));
  lines.push(...cajonOculto(1, 2, { anchoModulo: 600, profundidadModulo: 450, altoVano: 290, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: '2' }));
  lines.push(...cajonOculto(1, 3, { anchoModulo: 600, profundidadModulo: 450, altoVano: 290, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: '3' }));

  examples.push({ name: 'Ejemplo_CSV_Cajonera_Correderas_Ocultas.csv', dataName: 'ejemplo-cajonera-correderas-ocultas.csv', lines });
}

// 24. Tocador (dormitorio): casco con espejo y 3 cajones
{
  const lines = [];
  lines.push(header('Ejemplo de tocador', 'Estructura global + modulo tocador 1200×800×480 con 3 cajones y espejo con marco.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido tocador', 1200, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa', 'Tapa corrida tocador', 1200, 480, 1, 'si', '#C19A6B', 30, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-espejo', 'Espejo tocador', 1000, 600, 1, 'no', '#E8F4F8', 4, '', 'estructura'));

  lines.push('# --- Modulo 1: tocador con 3 cajones ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 1200, 800, 480, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'medio' }));
  lines.push(...cajon(1, 3, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Tocador.csv', dataName: 'ejemplo-tocador.csv', lines });
}

// 25. Banco de comedor (cocina_comedor): asiento + 4 patas + travesaños
{
  const lines = [];
  lines.push(header('Ejemplo de banco de comedor', 'Asiento 1200×450 con 4 patas de panel y travesaños de refuerzo (ensamble de tarugo y pegamento). Sin casco: el asiento apoya directo sobre las patas.'));
  lines.push('# --- Estructura global: asiento ---');
  lines.push(line('glb-asiento', 'Asiento banco comedor', 1200, 450, 1, 'si', '#D9C2A3', 25, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: patas y travesaños ---');
  lines.push(line('m1-pata-delantera-izq', 'Pata delantera izquierda banco', 80, 425, 1, 'no', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-pata-delantera-der', 'Pata delantera derecha banco', 80, 425, 1, 'no', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-pata-trasera-izq', 'Pata trasera izquierda banco', 80, 425, 1, 'no', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-pata-trasera-der', 'Pata trasera derecha banco', 80, 425, 1, 'no', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-travesano-frontal', 'Travesano frontal banco', 1040, 80, 1, 'si', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-travesano-trasero', 'Travesano trasero banco', 1040, 80, 1, 'si', '#8B5A2B', 18, 'T,B,L,R', 1));
  lines.push(line('m1-travesano-lateral', 'Travesano lateral banco', 290, 80, 2, 'no', '#8B5A2B', 18, 'T,B,L,R', 1));

  examples.push({ name: 'Ejemplo_CSV_Banco_Comedor.csv', dataName: 'ejemplo-banco-comedor.csv', lines });
}

// 26. Panel para TV (sala): panel flotante con repisas y canal de cables
{
  const lines = [];
  lines.push(header('Ejemplo de panel para TV', 'Panel flotante 1800×1500×250 con repisas flotantes y canal de cables (anclaje a pared con tacos y tarugos).'));
  lines.push('# --- Estructura global: panel, repisas y canal ---');
  lines.push(line('glb-tablero', 'Tablero panel TV', 1800, 1500, 1, 'no', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-canal', 'Canal cables panel TV', 1800, 80, 1, 'si', '#8B5A2B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-repisa-superior', 'Repisa flotante superior panel TV', 800, 280, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-repisa-inferior', 'Repisa flotante inferior panel TV', 600, 280, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));

  examples.push({ name: 'Ejemplo_CSV_Panel_TV.csv', dataName: 'ejemplo-panel-tv.csv', lines });
}

// 27. Estación de trabajo (oficina): escritorio largo con divisor y cajonera
{
  const lines = [];
  lines.push(header('Ejemplo de estacion de trabajo', 'Escritorio largo 2400×700 con divisor acustico, canaleta de cables y cajonera interior de 2 cajones.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-tablero', 'Tablero estacion trabajo', 2400, 700, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-divisor', 'Divisor acustico estacion trabajo', 350, 500, 1, 'no', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-canaleta', 'Canaleta cables estacion trabajo', 1200, 80, 1, 'si', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-pata', 'Pata metalica estacion trabajo', 60, 700, 2, 'no', '#A0A0A0', 5, '', 'estructura'));

  lines.push('# --- Modulo 1: cajonera interior de 2 cajones ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 500, 700, 600, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 500, profundidadModulo: 600, altoVano: 280, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 500, profundidadModulo: 600, altoVano: 280, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Estacion_Trabajo.csv', dataName: 'ejemplo-estacion-trabajo.csv', lines });
}

// 28. Recepción / mostrador (oficina): frente decorativo alto + cajonera interior
{
  const lines = [];
  lines.push(header('Ejemplo de recepcion / mostrador', 'Mostrador alto 2400×1000×700 con frente decorativo continuo, tapa gruesa y cajonera interior con repisa.'));
  lines.push('# --- Estructura global: frente decorativo y tapa ---');
  lines.push(line('glb-frente', 'Frente decorativo mostrador', 2400, 1000, 1, 'no', '#8B5A2B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa', 'Tapa mostrador', 2400, 700, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cajonera interior ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 1000, 600, '#C19A6B'));
  lines.push(line('m1-repisa', 'Repisa recepcion', 540, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 600, altoVano: 400, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3' }));

  examples.push({ name: 'Ejemplo_CSV_Recepcion.csv', dataName: 'ejemplo-recepcion.csv', lines });
}

// 29. Estantería de oficina: abierta con 5 repisas y divisor vertical
{
  const lines = [];
  lines.push(header('Ejemplo de estanteria de oficina', 'Estanteria abierta 1200×1900×350 con 5 repisas regulables y divisor vertical (anclaje anti-volcadura a pared).'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo estanteria oficina', 1200, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa', 'Tapa estanteria oficina', 1200, 40, 1, 'si', '#C19A6B', 30, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior estanteria oficina', 1200, 1900, '#F2F2F2', 'estructura'));

  lines.push('# --- Modulo 1: casco con 5 repisas y divisor ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 1200, 1900, 350, '#C19A6B'));
  lines.push(line('m1-divisor-vertical', 'Divisor vertical estanteria oficina', 320, 1870, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 1));
  for (let i = 1; i <= 5; i++) {
    lines.push(line(`m1-repisa-${i}`, `Repisa ${i} estanteria oficina`, 1140, 250, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  }

  examples.push({ name: 'Ejemplo_CSV_Estanteria_Oficina.csv', dataName: 'ejemplo-estanteria-oficina.csv', lines });
}

for (const ex of examples) {
  const content = ex.lines.join('\n') + '\n';
  fs.writeFileSync(path.join(DOCS_DIR, ex.name), content, 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, ex.dataName), content, 'utf8');
  logger.info('example generated', { csv: ex.name, data: ex.dataName, pieces: ex.lines.length });
  // eslint-disable-next-line no-console
  console.log('Generado:', ex.name, '->', ex.dataName);
}
recordMetric('generar-ejemplos-assembly', 'examples_generated', { count: examples.length });
