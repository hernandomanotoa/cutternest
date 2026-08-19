import fs from 'fs';
import path from 'path';

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

function cajon(mod, index, parent, colorFrente, colorLateral, suffix = '') {
  const sm = `${parent}${index}`;
  const label = suffix ? ` ${suffix}` : '';
  return [
    `m${sm}-cajon-frente,Frente cajon${label} M${parent},${400},${180},1,si,${colorFrente},15,"T,B,L,R",${sm}`,
    `m${sm}-cajon-lateral-izq,Lateral cajon${label} M${parent},180,450,1,no,${colorLateral},15,"T,B,L",${sm}`,
    `m${sm}-cajon-lateral-der,Lateral cajon${label} M${parent},180,450,1,no,${colorLateral},15,"T,B,R",${sm}`,
    `m${sm}-cajon-fondo,Fondo cajon${label} M${parent},360,450,1,no,#F2F2F2,15,,${sm}`,
    `m${sm}-cajon-base,Base cajon${label} M${parent},360,450,1,si,${colorLateral},15,"T,B,L,R",${sm}`,
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
  lines.push(line('glb-zocalo', 'Zocalo corrido cocina', 2440, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-tapa-trabajo', 'Tapa de trabajo corrida', 2440, 40, 1, 'si', '#D9C2A3', 30, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior cocina', 2440, 600, '#F2F2F2', 'estructura'));
  lines.push(line('glb-cantonera-izq', 'Cantonera izquierda', 60, 60, 1, 'no', '#9CA3AF', 15, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-cantonera-der', 'Cantonera derecha', 60, 60, 1, 'no', '#9CA3AF', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: bajo mesada fregadero con cajon ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 600, 700, 560, '#C19A6B'));
  lines.push(line('m1-repisa-inferior', 'Repisa inferior M1', 520, 380, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(...cajon('1', '1', 1, '#8B5A2B', '#D9C2A3', 'inferior'));

  lines.push('# --- Modulo 2: cajonera triple ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 600, 700, 560, '#8B5A2B'));
  lines.push(...cajon('2', '1', 2, '#C19A6B', '#D9C2A3', 'superior'));
  lines.push(...cajon('2', '2', 2, '#C19A6B', '#D9C2A3', 'medio'));
  lines.push(...cajon('2', '3', 2, '#C19A6B', '#D9C2A3', 'inferior'));

  lines.push('# --- Modulo 3: alacena con estantes y puerta ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 600, 1200, 320, '#C19A6B'));
  lines.push(line('m3-estante-1', 'Estante superior M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-estante-2', 'Estante medio M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-estante-3', 'Estante inferior M3', 540, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));
  lines.push(line('m3-puerta', 'Puerta alacena M3', 560, 1160, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 3));

  lines.push('# --- Modulo 4: torre horno con cajon inferior ---');
  lines.push(...baseTapaLateralesFondo(4, 4, 600, 1200, 560, '#8B5A2B'));
  lines.push(line('m4-divisor', 'Divisor horno M4', 560, 550, 1, 'no', '#C19A6B', 15, 'T,B,L,R', 4));
  lines.push(...cajon('4', '1', 4, '#D9C2A3', '#C19A6B', 'inferior'));

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
  lines.push(...cajon('1', '1', 1, '#8B5A2B', '#D9C2A3', 'izquierdo'));
  lines.push(...cajon('1', '2', 1, '#8B5A2B', '#D9C2A3', 'derecho'));

  lines.push('# --- Modulo 2: torre auxiliar ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 400, 1200, 320, '#8B5A2B'));
  lines.push(line('m2-estante-1', 'Estante superior M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-2', 'Estante medio M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-estante-3', 'Estante inferior M2', 340, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-puerta', 'Puerta torre M2', 360, 1160, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 2));

  lines.push('# --- Modulo 3: repisa abierta ---');
  lines.push(...baseTapaLateralesFondo(3, 3, 600, 400, 200, '#C19A6B'));
  lines.push(line('m3-repisa', 'Repisa abierta M3', 540, 180, 2, 'si', '#D9C2A3', 15, 'T,B,L,R', 3));

  examples.push({ name: 'Ejemplo_CSV_Vanitory.csv', dataName: 'ejemplo-vanitory.csv', lines });
}

// 7. Comoda / chifonier
{
  const lines = [];
  lines.push(header('Ejemplo de comoda / chifonier', '5 cajones verticales en un solo modulo, sin estructura global.'));
  lines.push(...baseTapaLateralesFondo(1, 1, 900, 600, 450, '#C19A6B'));
  for (let i = 1; i <= 5; i++) {
    const suffix = i === 1 ? 'superior' : i === 5 ? 'inferior' : `nivel ${i}`;
    lines.push(...cajon('1', String(i), 1, '#8B5A2B', '#D9C2A3', suffix));
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
  lines.push(line('m1-estante-1', 'Estante superior M1', 740, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));
  lines.push(line('m1-estante-2', 'Estante inferior M1', 740, 280, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 1));

  lines.push('# --- Modulo 2: lateral cajonera ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 500, 500, 400, '#8B5A2B'));
  lines.push(...cajon('2', '1', 2, '#C19A6B', '#D9C2A3', 'superior'));
  lines.push(...cajon('2', '2', 2, '#C19A6B', '#D9C2A3', 'inferior'));

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
  lines.push(line('glb-zocalo', 'Zocalo escritorio', 1600, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cajonera izquierda ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 400, 700, 560, '#C19A6B'));
  lines.push(...cajon('1', '1', 1, '#8B5A2B', '#D9C2A3', 'superior'));
  lines.push(...cajon('1', '2', 1, '#8B5A2B', '#D9C2A3', 'inferior'));

  lines.push('# --- Modulo 2: cajonera derecha ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 400, 700, 560, '#8B5A2B'));
  lines.push(...cajon('2', '1', 2, '#C19A6B', '#D9C2A3', 'superior'));
  lines.push(...cajon('2', '2', 2, '#C19A6B', '#D9C2A3', 'inferior'));

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
  lines.push(line('glb-corona', 'Corona armario', 1600, 100, 1, 'si', '#C19A6B', 15, 'T,B,L,R', 'estructura'));
  lines.push(fondo('glb-trasera', 'Panel posterior armario', 1600, 2300, '#F2F2F2', 'estructura'));
  lines.push(line('glb-puerta-izq', 'Puerta corrediza izquierda', 780, 2250, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 'estructura'));
  lines.push(line('glb-puerta-der', 'Puerta corrediza derecha', 780, 2250, 1, 'no', '#FFFFFF', 18, 'T,B,L,R', 'estructura'));

  lines.push('# --- Modulo 1: cuerpo izquierdo ---');
  lines.push(...baseTapaLateralesFondo(1, 1, 800, 2300, 550, '#C19A6B'));
  lines.push(line('m1-barra', 'Barra ropa M1', 740, 25, 1, 'si', '#A0A0A0', 25, '', 1));
  lines.push(...cajon('1', '1', 1, '#8B5A2B', '#D9C2A3', 'inferior'));

  lines.push('# --- Modulo 2: cuerpo derecho ---');
  lines.push(...baseTapaLateralesFondo(2, 2, 800, 2300, 550, '#8B5A2B'));
  lines.push(line('m2-repisa-superior', 'Repisa superior M2', 740, 350, 1, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(line('m2-repisa-inferior', 'Repisa inferior M2', 740, 350, 2, 'si', '#D9C2A3', 15, 'T,B,L,R', 2));
  lines.push(...cajon('2', '1', 2, '#C19A6B', '#D9C2A3', 'inferior'));

  examples.push({ name: 'Ejemplo_CSV_Armario_Puertas_Corredizas.csv', dataName: 'ejemplo-armario.csv', lines });
}

for (const ex of examples) {
  const content = ex.lines.join('\n') + '\n';
  fs.writeFileSync(path.join(DOCS_DIR, ex.name), content, 'utf8');
  fs.writeFileSync(path.join(DATA_DIR, ex.dataName), content, 'utf8');
  console.log('Generado:', ex.name, '->', ex.dataName);
}
