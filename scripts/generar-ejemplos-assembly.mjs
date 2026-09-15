import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './lib/logger.mjs';
import { recordMetric } from './lib/metrics.mjs';
import {
  line,
  fondo,
  tirador,
  cajon,
  baseTapaLateralesFondo,
  header,
  zocaloCajon,
  cascoZocaloCajon,
} from './lib/cajonModel.mjs';

const logger = getLogger('generar-ejemplos-assembly');

// Rutas relativas al repo (este archivo vive en <repo>/scripts/): el
// generador es ejecutable desde cualquier CWD, no solo desde /workspace.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(REPO_ROOT, 'docs');
const DATA_DIR = path.join(REPO_ROOT, 'frontend', 'public', 'assembly-planner', 'data');

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
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 600, altoVano: 300, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3' }));

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

// 30. Buró 3 cajones (dormitorio)
{
  const lines = [];
  lines.push(header('Ejemplo de buro 3 cajones', 'Buro a piso 500×720×400 (base + tapa + 2 laterales + fondo de 15 mm) con 3 vanos apilados iguales y un cajon de 6 piezas por vano (modelo cajon()). Herrajes: 3 pares de correderas telescopicas 400 mm y 3 tiradores.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 500, 720, 400, '#C19A6B'));
  // Vano util: (720 − 2·15)/3 = 230 → frente 468×227
  lines.push(...cajon(1, 1, { anchoModulo: 500, profundidadModulo: 400, altoVano: 230, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 500, profundidadModulo: 400, altoVano: 230, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'medio' }));
  lines.push(...cajon(1, 3, { anchoModulo: 500, profundidadModulo: 400, altoVano: 230, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Buro_3_Cajones.csv', dataName: 'ejemplo-buro-3-cajones.csv', lines });
}

// 31. Buró flotante 2 cajones (dormitorio): colgado a pared, sin base inferior.
// El tablero superior se nombra 'Tablero' (rol top_panel) para marcar el
// módulo como no-casco rectangular (exención del parser: sin base inferior
// intencional); el travesaño inferior queda en rol brace.
{
  const lines = [];
  lines.push(header('Ejemplo de buro flotante', 'Buro colgado 600×420×350 fijado a pared con escuadras (herraje, no pieza): tablero superior, 2 laterales, fondo y travesano inferior (rol brace), sin base inferior. 2 cajones en fila (2 columnas) de 6 piezas con cajon(). Herrajes: escuadras de pared, 2 pares de correderas telescopicas 300 mm y 2 tiradores.'));
  lines.push(line('m1-tablero', 'Tablero buro flotante', 600, 350, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-lateral-izq', 'Lateral izquierdo M1', 350, 420, 1, 'no', '#C19A6B', 15, 'T,B,L', 1));
  lines.push(line('m1-lateral-der', 'Lateral derecho M1', 350, 420, 1, 'no', '#C19A6B', 15, 'T,B,R', 1));
  lines.push(fondo('m1-fondo', 'Fondo buro flotante', 600, 420, '#F2F2F2', 1));
  lines.push(line('m1-travesano-inferior', 'Travesano inferior buro flotante', 570, 80, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 1));
  // Vano util: 420 − 15 (tablero) − 80 (travesano) = 325 → altoVano 320
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 350, altoVano: 320, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'izquierdo' }));
  lines.push(...cajon(1, 2, { anchoModulo: 600, profundidadModulo: 350, altoVano: 320, nPorFila: 2, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'derecho' }));

  examples.push({ name: 'Ejemplo_CSV_Buro_Flotante.csv', dataName: 'ejemplo-buro-flotante.csv', lines });
}

// 32. Cómoda baja 3 cajones sobre 4 patas niveladoras (dormitorio)
{
  const lines = [];
  lines.push(header('Ejemplo de comoda baja', 'Comoda baja 1200×600×450 (base + tapa + 2 laterales + fondo + travesano trasero) sobre 4 patas niveladoras de panel 80×80 (rol leg). 3 cajones apilados de 6 piezas con cajon(). Herrajes: 3 pares de correderas telescopicas 450 mm, 3 tiradores y 4 patas niveladoras.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 1200, 600, 450, '#C19A6B'));
  lines.push(line('m1-travesano-trasero', 'Travesano trasero comoda', 1170, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-pata-delantera-izq', 'Pata niveladora delantera izquierda comoda', 80, 80, 1, 'no', '#8B5A2B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-pata-delantera-der', 'Pata niveladora delantera derecha comoda', 80, 80, 1, 'no', '#8B5A2B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-pata-trasera-izq', 'Pata niveladora trasera izquierda comoda', 80, 80, 1, 'no', '#8B5A2B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-pata-trasera-der', 'Pata niveladora trasera derecha comoda', 80, 80, 1, 'no', '#8B5A2B', 15, 'T,B,L,R', 1));
  // Vano util: (600 − 2·15)/3 = 190 → frente 1168×187
  lines.push(...cajon(1, 1, { anchoModulo: 1200, profundidadModulo: 450, altoVano: 190, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 1200, profundidadModulo: 450, altoVano: 190, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'medio' }));
  lines.push(...cajon(1, 3, { anchoModulo: 1200, profundidadModulo: 450, altoVano: 190, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  examples.push({ name: 'Ejemplo_CSV_Comoda_Baja.csv', dataName: 'ejemplo-comoda-baja.csv', lines });
}

// 33. Tocador con alzada de espejo (dormitorio): módulo bajo con zócalo
// corrido (mismo modelo que ejemplo-tocador #24) + alzada con montantes,
// respaldo (marca el módulo como no-casco rectangular: sin base ni fondo
// de casco) y 2 puertas de espejo de 4 mm.
{
  const lines = [];
  lines.push(header('Ejemplo de tocador con espejo', 'Modulo bajo 1200×800×480 con zocalo corrido y 3 cajones apilados de 6 piezas (mismo modelo que ejemplo-tocador) + alzada de espejo con 2 montantes, tapa, respaldo y 2 puertas de espejo con cristal de 4 mm pegado. Herrajes: bisagras de cazoleta 26 mm (2 por puerta), espejos 4 mm pegados y 3 pares de correderas telescopicas.'));
  lines.push('# --- Estructura global ---');
  lines.push(line('glb-zocalo', 'Zocalo corrido tocador espejo', 1200, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: tocador bajo con 3 cajones (mismo modelo que ejemplo-tocador) ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 1200, 800, 480, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'superior' }));
  lines.push(...cajon(1, 2, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'medio' }));
  lines.push(...cajon(1, 3, { anchoModulo: 1200, profundidadModulo: 480, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'inferior' }));

  lines.push('# --- Modulo 2: alzada de espejo (montantes + respaldo, no es casco rectangular) ---');
  lines.push(line('m2-tapa', 'Tapa alzada M2', 1200, 300, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 2));
  lines.push(line('m2-montante-izq', 'Montante alzada izquierdo M2', 300, 900, 1, 'no', '#C19A6B', 15, 'T,B,L', 2));
  lines.push(line('m2-montante-der', 'Montante alzada derecho M2', 300, 900, 1, 'no', '#C19A6B', 15, 'T,B,R', 2));
  lines.push(fondo('m2-respaldo', 'Respaldo alzada M2', 1200, 900, '#F2F2F2', 2));
  lines.push(line('m2-puerta-espejo-izq', 'Puerta espejo izquierda M2', 570, 860, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 2));
  lines.push(line('m2-puerta-espejo-der', 'Puerta espejo derecha M2', 570, 860, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 2));
  lines.push(line('m2-espejo-izq', 'Espejo izquierdo alzada M2', 500, 790, 1, 'no', '#E8F4F8', 4, '', 2));
  lines.push(line('m2-espejo-der', 'Espejo derecho alzada M2', 500, 790, 1, 'no', '#E8F4F8', 4, '', 2));

  examples.push({ name: 'Ejemplo_CSV_Tocador_Espejo.csv', dataName: 'ejemplo-tocador-espejo.csv', lines });
}

// 34. Clóset interior abierto (dormitorio): zócalo-cajón corrido + tapa
// corrida (patrones de ejemplo-closet-zocalo-cajon) y 3 módulos de 600 con
// base propia: doble colgado, cajonera interior y zapatera interior.
{
  const lines = [];
  lines.push(header('Ejemplo de closet interior', 'Closet abierto 1800×2200×550 sin puertas (perchero), compatible con sistema de puertas corredizas: zocalo-cajon corrido 150 (patron ejemplo-closet-zocalo-cajon) + tapa corrida y 3 modulos de 600 con base propia: M1 doble colgado (2 barras cromadas a dos alturas + repisa superior), M2 cajonera interior (6 cajones de frentes mixtos: delgado 130 accesorios, 4 estandar 200, profundo 280 sueteres) y M3 zapatera interior (bandeja zapatero fija inferior + 4 bandejas zapatera extraibles de 6 piezas + repisa superior). Herrajes: barras cromadas Ø25 y correderas telescopicas.'));
  lines.push('# --- Estructura global: zocalo-cajon (sin base global) ---');
  lines.push(...zocaloCajon('closet interior', 1800, 550, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida closet interior', 1800, 550, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));

  // Modulos de 600×2200×550 (altura TOTAL incluye zocalo de 150), base propia
  // interna apoyada sobre el zocalo (cascoZocaloCajon).

  lines.push('# --- Modulo 1: doble colgado (2 barras a dos alturas + repisa superior) ---');
  lines.push(...cascoZocaloCajon(1, 1, 600, 2200, 550, '#C19A6B'));
  lines.push(line('m1-barra-alta', 'Barra colgadora alta M1', 570, 25, 1, 'si', '#A0A0A0', 25, '', 1));
  lines.push(line('m1-barra-baja', 'Barra colgadora baja M1', 570, 25, 1, 'si', '#A0A0A0', 25, '', 1));
  lines.push(line('m1-repisa-superior', 'Repisa superior M1', 570, 450, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));

  lines.push('# --- Modulo 2: cajonera interior con frentes mixtos (delgado 130, estandar 200, profundo 280) ---');
  lines.push(...cascoZocaloCajon(2, 2, 600, 2200, 550, '#8B5A2B'));
  lines.push(...cajon(2, 1, { anchoModulo: 600, profundidadModulo: 550, altoVano: 130, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'accesorios' }));
  lines.push(...cajon(2, 2, { anchoModulo: 600, profundidadModulo: 550, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'camisetas' }));
  lines.push(...cajon(2, 3, { anchoModulo: 600, profundidadModulo: 550, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'camisas' }));
  lines.push(...cajon(2, 4, { anchoModulo: 600, profundidadModulo: 550, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'pantalones' }));
  lines.push(...cajon(2, 5, { anchoModulo: 600, profundidadModulo: 550, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'ropa doblada' }));
  lines.push(...cajon(2, 6, { anchoModulo: 600, profundidadModulo: 550, altoVano: 280, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'sueteres' }));

  lines.push('# --- Modulo 3: zapatera interior (bandeja fija + repisa superior + 4 bandejas extraibles) ---');
  lines.push(...cascoZocaloCajon(3, 3, 600, 2200, 550, '#C19A6B'));
  // Bandeja fija inferior (patron ejemplo-zapatero-extraible): al ser pieza de
  // zapatero ('fixed-bottom') abajo y la repisa superior arriba, las 4 bandejas
  // extraibles quedan en la zona media para el apilado sin solapes.
  lines.push(line('m3-bandeja-zapatero', 'Bandeja zapatero M3', 570, 450, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-repisa-superior', 'Repisa superior M3', 570, 300, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  // Vano util ≈ 2020: bandeja fija ≈150 + 4 bandejas de 330 (1320) + repisa 300.
  for (let i = 1; i <= 4; i++) {
    lines.push(...cajon(3, i, { anchoModulo: 600, profundidadModulo: 550, altoVano: 330, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: `${i}`, vocabulario: 'zapatera' }));
  }

  examples.push({ name: 'Ejemplo_CSV_Closet_Interior.csv', dataName: 'ejemplo-closet-interior.csv', lines });
}

// 35. Base de cama matrimonial con cajones (dormitorio): dos cajoneras
// largas de 2 cajones (M1 izq / M2 der) + estructura global (cabecero,
// montantes, tablero frontal y tarima con láminas de somier). El marco va
// en 'estructura' porque no es un casco rectangular (el parser exigiría
// base/tapa/laterales/fondo, piezas que una cama no tiene).
{
  const lines = [];
  lines.push(header('Ejemplo de base de cama con cajones', 'Base de cama matrimonial 1500×1900×350 de melamina 18 mm (mueble que soporta carga): estructura global con cabecero 1500×600, 2 montantes de cabecero, tablero frontal 1500×300, tarima de somier 1500×1850 y 10 láminas de somier transversales de 130×25×8 mm con separación 60 mm, y dos cajoneras largas de 400×350×1850 con 2 cajones de 6 piezas cada una. Herrajes: 4 pares de correderas telescópicas, 8 esquineros metálicos de unión, soporte central de tarima y zapatas niveladoras.'));
  lines.push('# --- Estructura global: cabecero, montantes, tablero frontal, tarima y láminas ---');
  lines.push(line('glb-cabecero', 'Cabecero cama', 1500, 600, 1, 'no', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-montante-izq', 'Montante cabecero izquierdo', 350, 600, 1, 'no', '#C19A6B', 18, 'T,B,L', 'estructura'));
  lines.push(line('glb-montante-der', 'Montante cabecero derecho', 350, 600, 1, 'no', '#C19A6B', 18, 'T,B,R', 'estructura'));
  lines.push(line('glb-frontal', 'Tablero frontal cama', 1500, 300, 1, 'si', '#C19A6B', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tarima', 'Tarima somier', 1500, 1850, 1, 'si', '#D9C2A3', 18, 'T,B,L,R', 'estructura'));
  for (let i = 1; i <= 10; i++) {
    lines.push(line(`glb-lamina-${i}`, `Lamina somier ${i}`, 130, 25, 1, 'no', '#D9C2A3', 8, '', 'estructura'));
  }

  // Cajonera larga 400×350×1850 (melamina 18 mm): base + tapa + 2 laterales
  // + fondo. Los cajones usan cajon() con anchoModulo 394: el vano real es
  // 400 − 2·18 = 364 y el frente de cajon() mide anchoModulo − 32 = 362
  // (cajon() asume laterales de 15 en el módulo; con 18 mm se le pasa el
  // ancho de vano real para mantener la coherencia con el validador).
  const cajoneraCama = (mod) => [
    line(`m${mod}-base`, `Base modulo M${mod}`, 400, 1850, 1, 'si', '#C19A6B', 18, 'T,B,L,R', mod),
    line(`m${mod}-tapa`, `Tapa modulo M${mod}`, 400, 1850, 1, 'si', '#C19A6B', 18, 'T,B,L,R', mod),
    line(`m${mod}-lateral-izq`, `Lateral izquierdo M${mod}`, 1850, 350, 1, 'no', '#C19A6B', 18, 'T,B,L', mod),
    line(`m${mod}-lateral-der`, `Lateral derecho M${mod}`, 1850, 350, 1, 'no', '#C19A6B', 18, 'T,B,R', mod),
    line(`m${mod}-fondo`, `Fondo modulo M${mod}`, 400, 350, 1, 'no', '#F2F2F2', 18, '', mod),
    // Vano útil: (350 − 2·18)/2 = 157 → altoVano 150
    ...cajon(mod, 1, { anchoModulo: 394, profundidadModulo: 1850, altoVano: 150, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'largo superior' }),
    ...cajon(mod, 2, { anchoModulo: 394, profundidadModulo: 1850, altoVano: 150, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'largo inferior' }),
  ];
  lines.push('# --- Modulo 1: cajonera larga izquierda (2 cajones) ---');
  lines.push(...cajoneraCama(1));
  lines.push('# --- Modulo 2: cajonera larga derecha (2 cajones) ---');
  lines.push(...cajoneraCama(2));

  examples.push({ name: 'Ejemplo_CSV_Base_Cama_Cajones.csv', dataName: 'ejemplo-base-cama-cajones.csv', lines });
}

// 36. Clóset abierto modular 3400×2400 (vestidor): zócalo-cajón corrido + tapa
// corrida y 4 módulos de 850 (3400 = 4×850, 100% modular) con base propia:
// doble colgado, cajonera, zapatera y colgador simple con repisas.
{
  const lines = [];
  lines.push(header('Ejemplo de closet abierto modular', 'Closet abierto modular 3400×2400×600 sin puertas, melamina 15 mm, 100% modular (4 modulos de 850): zocalo-cajon corrido 150 + tapa corrida y 4 modulos con base propia. Alturas ergonomicas: barras dobles a 2100/1000 mm (colgado corto por nivel) y barra camisera a 1800 mm (colgado largo). M1 doble colgado (2 barras cromadas + repisa superior), M2 cajonera con frentes mixtos (delgado 130 accesorios, 4 estandar 200, profundo 280 sueteres; caja 30 mm mas baja que el frente y holgura de rieles 12.7 mm/lado), M3 zapatera por tipo de calzado (bandejas extraibles frente 180 planos, 200 tenis y 220 tacones/botines, vano abierto 450 para botas altas) y M4 colgador camisero (barra a 1800 + 3 repisas). Todas las repisas de 820 mm de luz llevan refuerzo interior de 100 mm (melamina 15 mm). Herrajes: barras cromadas Ø25 y correderas telescopicas.'));
  lines.push('# --- Estructura global: zocalo-cajon corrido (sin base global) ---');
  lines.push(...zocaloCajon('closet abierto modular', 3400, 600, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida closet abierto modular', 3400, 600, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 'estructura'));

  // Modulos de 850×2400×600 (altura TOTAL incluye zocalo de 150), base propia
  // interna apoyada sobre el zocalo (cascoZocaloCajon). Vano util por modulo:
  // 2400 − 150 (zocalo) − 15 (tapa) = 2235.

  lines.push('# --- Modulo 1: doble colgado (2 barras a dos alturas + repisa superior) ---');
  lines.push(...cascoZocaloCajon(1, 1, 850, 2400, 600, '#C19A6B'));
  lines.push(line('m1-repisa-superior', 'Repisa superior M1', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-refuerzo-repisa', 'Refuerzo repisa superior M1', 820, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(line('m1-barra-alta', 'Barra colgadora alta M1', 820, 25, 1, 'si', '#A0A0A0', 25, '', 1));
  lines.push(line('m1-barra-baja', 'Barra colgadora baja M1', 820, 25, 1, 'si', '#A0A0A0', 25, '', 1));

  lines.push('# --- Modulo 2: cajonera con frentes mixtos por tipo de prenda ---');
  lines.push('# Alturas ergonomicas de frente: delgado 130 (accesorios/ropa interior),');
  lines.push('# estandar 200 (camisetas, camisas, pantalones), profundo 280 (sueteres,');
  lines.push('# sabanas). La caja de cada cajon queda 30 mm mas baja que el frente');
  lines.push('# (evita choque con el armazon) y usa holgura de rieles de 12.7 mm/lado.');
  lines.push(...cascoZocaloCajon(2, 2, 850, 2400, 600, '#8B5A2B'));
  lines.push(line('m2-repisa-superior', 'Repisa superior M2', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-refuerzo-repisa', 'Refuerzo repisa superior M2', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 2));
  lines.push(...cajon(2, 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 130, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'accesorios' }));
  lines.push(...cajon(2, 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'camisetas' }));
  lines.push(...cajon(2, 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'camisas' }));
  lines.push(...cajon(2, 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'pantalones' }));
  lines.push(...cajon(2, 5, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'ropa doblada' }));
  lines.push(...cajon(2, 6, { anchoModulo: 850, profundidadModulo: 600, altoVano: 280, colorFrente: '#C19A6B', colorLateral: '#D9C2A3', suffix: 'sueteres' }));

  lines.push('# --- Modulo 3: zapatera con alturas por tipo de calzado ---');
  lines.push('# Bandejas extraibles con frente 180 (luz util ~150: zapatos planos),');
  lines.push('# frente 200 (luz util ~170: tenis) y frente 220 (luz util ~190: tacones');
  lines.push('# y botines); vano abierto de 450 para botas altas (luz util 350-450).');
  lines.push(...cascoZocaloCajon(3, 3, 850, 2400, 600, '#C19A6B'));
  lines.push(line('m3-bandeja-zapatero', 'Bandeja zapatero M3', 820, 450, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-refuerzo-bandeja', 'Refuerzo bandeja zapatero M3', 820, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 3));
  lines.push(...cajon(3, 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'planos', vocabulario: 'zapatera' }));
  lines.push(...cajon(3, 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'tenis', vocabulario: 'zapatera' }));
  lines.push(...cajon(3, 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'tacones', vocabulario: 'zapatera' }));
  lines.push(...cajon(3, 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'botines', vocabulario: 'zapatera' }));
  lines.push(line('m3-repisa-botas', 'Repisa botas M3', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-refuerzo-repisa-botas', 'Refuerzo repisa botas M3', 820, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 3));
  lines.push(line('m3-repisa-superior', 'Repisa superior M3', 820, 300, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-refuerzo-repisa', 'Refuerzo repisa superior M3', 820, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 3));

  lines.push('# --- Modulo 4: colgador simple con 3 repisas ---');
  lines.push(...cascoZocaloCajon(4, 4, 850, 2400, 600, '#8B5A2B'));
  lines.push(line('m4-repisa-superior', 'Repisa superior M4', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 4));
  lines.push(line('m4-refuerzo-repisa-superior', 'Refuerzo repisa superior M4', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 4));
  lines.push(line('m4-barra', 'Barra colgadora M4', 820, 25, 1, 'si', '#A0A0A0', 25, '', 4));
  lines.push(line('m4-repisa-media', 'Repisa media M4', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 4));
  lines.push(line('m4-refuerzo-repisa-media', 'Refuerzo repisa media M4', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 4));
  lines.push(line('m4-repisa-inferior', 'Repisa inferior M4', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 4));
  lines.push(line('m4-refuerzo-repisa-inferior', 'Refuerzo repisa inferior M4', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 4));

  examples.push({ name: 'Ejemplo_CSV_Closet_Abierto_Modular.csv', dataName: 'ejemplo-closet-abierto-modular.csv', lines });
}

// 37. Zapatera de clóset con alturas por tipo de calzado (vestidor): torre
// zapatera 1700×2400×600, 100% modular (2 módulos de 850) sobre zócalo-cajón
// corrido + tapa corrida. M1 bandejas extraibles por calzado cotidiano
// (frente 180 planos/tenis, frente 220 tacones/botines) y M2 vanos abiertos
// de 450 para botas altas entre repisas fijas.
{
  const lines = [];
  lines.push(header('Ejemplo de zapatera de closet por tipo de calzado', 'Zapatera de closet abierta 1700×2400×600, melamina 15 mm, 100% modular (2 modulos de 850): zocalo-cajon corrido 150 + tapa corrida. Alturas libres por tipo de calzado: 150 mm (zapatos planos), 170-200 mm (tenis y calzado grueso), 190-220 mm (tacones y botines), 350-450 mm (botas altas). M1 calzado cotidiano: repisa superior + bandejas zapatera extraibles de frente 180 (planos), 200 (tenis) y 220 (tacones, botines). M2 botas altas: 2 vanos abiertos de 450 entre repisas fijas + repisa superior. Las bandejas extraibles mantienen costados bajos (caja 30 mm mas baja que el frente) para ver y sacar el calzado; holgura de rieles 12.7 mm/lado. Todas las repisas de 820 mm de luz llevan refuerzo interior de 100 mm. Herrajes: correderas telescopicas y tiradores.'));
  lines.push('# --- Estructura global: zocalo-cajon corrido (sin base global) ---');
  lines.push(...zocaloCajon('zapatera closet', 1700, 600, 150, '#C19A6B'));
  lines.push(line('glb-tapa', 'Tapa corrida zapatera closet', 1700, 600, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: calzado cotidiano (bandejas extraibles por altura de calzado) ---');
  lines.push(...cascoZocaloCajon(1, 1, 850, 2400, 600, '#C19A6B'));
  lines.push(line('m1-repisa-superior', 'Repisa superior M1', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-refuerzo-repisa', 'Refuerzo repisa superior M1', 820, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 1));
  lines.push(...cajon(1, 1, { anchoModulo: 850, profundidadModulo: 600, altoVano: 180, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'planos', vocabulario: 'zapatera' }));
  lines.push(...cajon(1, 2, { anchoModulo: 850, profundidadModulo: 600, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'tenis', vocabulario: 'zapatera' }));
  lines.push(...cajon(1, 3, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'tacones', vocabulario: 'zapatera' }));
  lines.push(...cajon(1, 4, { anchoModulo: 850, profundidadModulo: 600, altoVano: 220, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'botines', vocabulario: 'zapatera' }));

  lines.push('# --- Modulo 2: botas altas (2 vanos abiertos de 450 entre repisas fijas) ---');
  lines.push(...cascoZocaloCajon(2, 2, 850, 2400, 600, '#8B5A2B'));
  lines.push(line('m2-repisa-vano-1', 'Repisa vano botas 1 M2', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-refuerzo-vano-1', 'Refuerzo repisa vano botas 1 M2', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-vano-2', 'Repisa vano botas 2 M2', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-refuerzo-vano-2', 'Refuerzo repisa vano botas 2 M2', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-superior', 'Repisa superior M2', 820, 400, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-refuerzo-repisa', 'Refuerzo repisa superior M2', 820, 100, 1, 'si', '#8B5A2B', 15, 'T,B,L,R', 2));

  examples.push({ name: 'Ejemplo_CSV_Closet_Zapatera_Mixta.csv', dataName: 'ejemplo-closet-zapatera-mixta.csv', lines });
}

// 38. Cajonera/chifonier con frentes mixtos por tipo de prenda (dormitorio):
// casco 600×1300×450 de melamina 15 mm con 6 cajones en alturas ergonomicas
// (delgado 130 accesorios/ropa interior, estándar 200 camisetas/camisas/
// pantalones, profundo 280 suéteres/sábanas).
{
  const lines = [];
  lines.push(header('Ejemplo de cajonera con frentes mixtos', 'Chifonier organizador 600×1300×450 de melamina 15 mm con 6 cajones de 6 piezas en alturas ergonomicas por tipo de prenda: frente delgado 130 (accesorios y ropa interior), frentes estandar 200 (camisetas, camisas, pantalones) y frente profundo 280 (sueteres y sabanas). La caja de cada cajon queda 30 mm mas baja que el frente (evita choque con el armazon al abrir/cerrar) y la holgura de rieles telescopicos es de 12.7 mm por lado. Herrajes: 6 pares de correderas telescopicas 450 mm y 6 tiradores.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 1300, 450, '#C19A6B'));
  lines.push(...cajon(1, 1, { anchoModulo: 600, profundidadModulo: 450, altoVano: 130, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'accesorios' }));
  lines.push(...cajon(1, 2, { anchoModulo: 600, profundidadModulo: 450, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'camisetas' }));
  lines.push(...cajon(1, 3, { anchoModulo: 600, profundidadModulo: 450, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'camisas' }));
  lines.push(...cajon(1, 4, { anchoModulo: 600, profundidadModulo: 450, altoVano: 200, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'pantalones' }));
  lines.push(...cajon(1, 5, { anchoModulo: 600, profundidadModulo: 450, altoVano: 130, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'ropa interior' }));
  lines.push(...cajon(1, 6, { anchoModulo: 600, profundidadModulo: 450, altoVano: 280, colorFrente: '#8B5A2B', colorLateral: '#D9C2A3', suffix: 'sueteres' }));

  examples.push({ name: 'Ejemplo_CSV_Cajonera_Alturas_Mixtas.csv', dataName: 'ejemplo-cajonera-alturas-mixtas.csv', lines });
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
