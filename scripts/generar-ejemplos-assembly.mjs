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

// Genera un cajón coherente con el vano del módulo padre.
// Reglas (las mismas que valida js/csvParser.js):
//   W = anchoModulo − 2E · D = profundidadModulo − E − E (fondo y lateral de 15)
//   frente.ancho = N===1 ? W−2 : floor((W − (N−1)×3)/N) − 1  (debe ser ≤ W−2)
//   frente.alto = altoVano − 3
//   profCajon = D − 25 (corredera telescópica) o D − 15 (volquete/abatible)
//   lateral = profCajon × (frente.alto − 2×espBase) · fondo/base = (frente.ancho − 2×espLat)
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
    altBandeja = 150
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
  const fondoAncho = frenteAncho - 2 * ESP_LAT;
  const sm = `${parent}${index}`;
  const label = suffix ? ` ${suffix}` : '';
  const tipoNombre = volquete ? ' abatible' : '';
  return [
    `m${sm}-cajon-frente,Frente cajon${tipoNombre}${label} M${parent},${frenteAncho},${frenteAlto},1,si,${colorFrente},15,"T,B,L,R",${sm}`,
    `m${sm}-cajon-lateral-izq,Lateral cajon${label} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,L",${sm}`,
    `m${sm}-cajon-lateral-der,Lateral cajon${label} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${ESP_LAT},"T,B,R",${sm}`,
    `m${sm}-cajon-fondo,Fondo cajon${label} M${parent},${fondoAncho},${latAlto},1,no,#F2F2F2,15,,${sm}`,
    `m${sm}-cajon-base,Base cajon${label} M${parent},${fondoAncho},${profCajon},1,si,${colorLateral},${ESP_BASE},"T,B,L,R",${sm}`,
    `m${sm}-cajon-tirador,Tirador cajon${label} M${parent},2,20,1,no,#A0A0A0,5,,${sm}`
  ];
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
  lines.push(header('Ejemplo de comoda / chifonier', '5 cajones verticales en un solo modulo, sin estructura global.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 900, 600, 450, '#C19A6B'));
  for (let i = 1; i <= 5; i++) {
    const suffix = i === 1 ? 'superior' : i === 5 ? 'inferior' : `nivel ${i}`;
    lines.push(...cajon(1, i, { anchoModulo: 900, profundidadModulo: 450, altoVano: 114, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix }));
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
  lines.push(header('Ejemplo de bufetero / aparador', 'Módulo bajo y ancho con 2 puertas y 1 repisa interna.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 1600, 900, 500, '#C19A6B'));
  lines.push(line('m1-divisor-central', 'Divisor central M1', 470, 870, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-repisa', 'Repisa interna', 1540, 470, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
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

// 17. Módulo de clóset con zapatero extraíble
{
  const lines = [];
  lines.push(header('Ejemplo de módulo con zapatero extraíble', 'Módulo de clóset 800×1800×500 con zapatero fijo inferior y 5 cajones de bandeja extraíbles en correderas telescópicas (capacidad aproximada 40-50 pares).'));
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 1800, 500, '#8B5A2B'));
  lines.push(line('m1-bandeja-zapatero', 'Bandeja zapatero', 770, 450, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 1));
  for (let i = 1; i <= 5; i++) {
    lines.push(...cajon(1, i, { anchoModulo: 800, profundidadModulo: 500, altoVano: 250, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: `extraible ${i}` }));
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

for (const ex of examples) {
  const content = ex.lines.join('\n') + '\n';
  fs.writeFileSync(path.join(DOCS_DIR, ex.name), content, 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, ex.dataName), content, 'utf8');
  logger.info('example generated', { csv: ex.name, data: ex.dataName, pieces: ex.lines.length });
  // eslint-disable-next-line no-console
  console.log('Generado:', ex.name, '->', ex.dataName);
}
recordMetric('generar-ejemplos-assembly', 'examples_generated', { count: examples.length });
