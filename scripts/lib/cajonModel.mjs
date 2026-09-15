// scripts/lib/cajonModel.mjs — Modelo de cajón y cascos del generador de
// ejemplos. Extraído de generar-ejemplos-assembly.mjs para poder probarlo en
// scripts/lib/cajonModel.test.mjs (test de propiedades contra js/csvParser.js)
// sin ejecutar el generador entero.

export function line(id, nombre, ancho, alto, cantidad, rotate, color, espesor, cantos, modulo) {
  return `${id},${nombre},${ancho},${alto},${cantidad},${rotate},${color},${espesor},"${cantos}",${modulo}`;
}

export function fondo(id, nombre, ancho, alto, color, modulo) {
  return line(id, nombre, ancho, alto, 1, 'no', color, 15, '', modulo);
}

export function tirador(id, nombre, color, modulo) {
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
//   boxExterior = round(vanoCajon − 25,4) · interior = boxExterior − 2·espLat
//   base/fondo/cara miden el INTERIOR de la caja (no el ancho del frente
//   decorativo: éste es ~24 mm más ancho que lo que permite la corredera).
// opts.vocabulario 'zapatera' nombra "zapatera extraible" en vez de "cajon"
// (zapatera-cajón: se desliza en rieles sin la palabra "cajon" en el nombre).
export function cajon(parent, index, opts) {
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

// Fondo de casco INTERNO (embutido): mide la luz interior (ancho−2t × alto−2t)
// para que classifyBackPanelMount lo clasifique como montaje interno.
export function baseTapaLateralesFondo(mod, parent, ancho, alto, prof, colorCuerpo) {
  const E = 15;
  return [
    line(`m${mod}-base`, `Base modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-tapa`, `Tapa modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-lateral-izq`, `Lateral izquierdo M${parent}`, prof, alto, 1, 'no', colorCuerpo, 15, 'T,B,L', mod),
    line(`m${mod}-lateral-der`, `Lateral derecho M${parent}`, prof, alto, 1, 'no', colorCuerpo, 15, 'T,B,R', mod),
    fondo(`m${mod}-fondo`, `Fondo modulo M${parent}`, ancho - 2 * E, alto - 2 * E, '#F2F2F2', mod)
  ];
}

export function header(titulo, desc) {
  return `# CutterNest Piezas v1\n# ${titulo}\n# ${desc}\nid,nombre,ancho,alto,cantidad,rotate,color,espesor,cantos,modulo`;
}

export function zocaloCajon(nombre, anchoTotal, profundidad, altoZocalo, color) {
  return [
    line('glb-zocalo', `Zocalo corrido ${nombre}`, anchoTotal, altoZocalo, 1, 'si', color, 15, 'T,B,L,R', 'estructura'),
    line('glb-zocalo-lateral-izq', `Lateral zocalo izquierdo ${nombre}`, profundidad, altoZocalo, 1, 'no', color, 15, 'T,B,L', 'estructura'),
    line('glb-zocalo-lateral-der', `Lateral zocalo derecho ${nombre}`, profundidad, altoZocalo, 1, 'no', color, 15, 'T,B,R', 'estructura'),
  ];
}

// Casco de módulo para el modelo zócalo-cajón: base INTERNA (ancho−2t × prof−2t)
// apoyada sobre el zócalo y laterales de altura TOTAL del mueble (zócalo incluido).
export function cascoZocaloCajon(mod, parent, ancho, altoTotal, prof, colorCuerpo) {
  const E = 15;
  return [
    line(`m${mod}-base`, `Base modulo M${parent}`, ancho - 2 * E, prof - 2 * E, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-tapa`, `Tapa modulo M${parent}`, ancho, prof, 1, 'si', colorCuerpo, 15, 'T,B,L,R', mod),
    line(`m${mod}-lateral-izq`, `Lateral izquierdo M${parent}`, prof, altoTotal, 1, 'no', colorCuerpo, 15, 'T,B,L', mod),
    line(`m${mod}-lateral-der`, `Lateral derecho M${parent}`, prof, altoTotal, 1, 'no', colorCuerpo, 15, 'T,B,R', mod),
    fondo(`m${mod}-fondo`, `Fondo modulo M${parent}`, ancho - 2 * E, altoTotal - 2 * E, '#F2F2F2', mod),
  ];
}
