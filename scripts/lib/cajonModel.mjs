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
// la caja, entre los laterales) + tirador. La zapatera (vocabulario
// 'zapatera') agrega la división transversal (7 piezas, espejo de
// addShoeTray): misma luz que el fondo y alto del lateral, rol
// drawer_divider.
// Reglas (las mismas que valida js/csvParser.js):
//   W = anchoModulo − 2E · D = profundidadModulo − E − E (E = espesorModulo)
//   frente.ancho = N===1 ? W−2 : floor((W − (N−1)×3)/N) − 1  (debe ser ≤ W−2)
//   frente.alto = altoVano − 3
//   profCajon = D − 25 (corredera telescópica) o D − 15 (volquete/abatible)
//   lateral = profCajon × (frente.alto − 2E): ABRAZA a cara y fondo
//   fondo = interior × latAlto: ESTRUCTURAL, interno a los laterales y a
//   piso (la cara es su par frontal, también interna y a todo lo alto)
//   fondo ranurado (opts.fondoMetodo 'ranurado', solo corredera): embutido
//   en ranura corrida a grooveDepth mm de la cara interior de cada lateral
//   (espejo de addDrawer/closetBuilderService.js): se corta más ANCHO
//   (interior + 2·ranura, cantos enterrados) y sube casi a la cara superior
//   del lateral (alto = latAlto − 2·ranura)
//   base = interior × (profCajon − 2E): confinada entre cara y fondo
// Caja telescópica (RAIL_TYPES.telescopica, holgura 12,7 mm por lado):
//   vanoCajon = N===1 ? W : frente.ancho + 2 (vano individual del cajón)
//   boxExterior = round(vanoCajon − 25,4) · interior = boxExterior − 2E
//   base/fondo/cara miden el INTERIOR de la caja (no el ancho del frente
//   decorativo: éste es ~24 mm más ancho que lo que permite la corredera).
// opts.vocabulario 'zapatera' nombra "zapatera extraible" en vez de "cajon"
// (zapatera-cajón: se desliza en rieles sin la palabra "cajon" en el nombre).
// Modos del frente de la zapatera (espejo de addShoeTray, solo 'zapatera'):
//   modoFrente 'completo' (default): frente decorativo + tirador + cara alta.
//   'borde': bandeja abierta SIN frente ni tirador; la cara se emite BAJA
//   (borde frontal de bordeFrontal mm, clamp 20..frenteAlto−2E).
//   'personalizado': frente con altoFrente (default vano−3), cara baja de
//   bordeFrontal y borde trasero (altoFondo) / división (altoDivision)
//   independientes (default: alto del lateral). Con frente o sin él.
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
    vocabulario = 'cajon',
    espesorModulo = 15, // espesor REAL del casco: W/D y caja descuentan E
    division = true,    // zapatera: división transversal (espejo de addShoeTray)
    fondoMetodo = 'apoyado', // 'apoyado' | 'ranurado' (espejo de addDrawer)
    grooveDepth = 6,    // = DRAWER_GROOVE_DEPTH (core/config.js)
    modoFrente = 'completo', // zapatera: 'completo'|'borde'|'personalizado'
    bordeFrontal = 40,  // alto del borde frontal bajo (modos borde/personalizado)
    altoFondo = null,   // borde trasero independiente (default: alto del lateral)
    altoDivision = null,// división independiente (default: alto del lateral)
    altoFrente = null,  // frente independiente (default: altoVano − 3)
  } = opts;
  const E = espesorModulo; // espesor laterales/fondo del MODULO y de la caja
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
    ? Math.min(frenteAlto - 2 * E, altBandeja)
    : frenteAlto - 2 * E;
  // Modos de la zapatera (espejo de addShoeTray): el modo solo aplica con
  // vocabulario 'zapatera' y corredera (el volquete no lleva cara).
  // 'personalizado' baja la cara (bordeFrontal) pero MANTIENE el frente
  // (espejo de conFrente default true; cajon() no tiene opt de frente sí/no).
  const esModoBorde = vocabulario === 'zapatera' && !volquete && modoFrente === 'borde';
  const caraBaja = esModoBorde || (vocabulario === 'zapatera' && !volquete && modoFrente === 'personalizado');
  const frenteAltoEf = altoFrente ?? frenteAlto;
  const bordeEf = Math.max(20, Math.min(Number(bordeFrontal) || 40, frenteAlto - 2 * E));
  const altoFondoEf = Math.max(20, Math.min(altoFondo ?? latAlto, frenteAlto));
  const altoDivisionEf = Math.max(20, Math.min(altoDivision ?? latAlto, frenteAlto));
  const llevaFrente = !esModoBorde; // 'borde' nunca; 'personalizado' con frente
  const caraAlto = caraBaja ? bordeEf : latAlto;
  // El volquete/abatible queda fuera del modelo de corredera: mantiene el
  // cálculo clásico derivado del frente decorativo y sin pieza de cara.
  const interior = volquete
    ? frenteAncho - 2 * E
    : Math.round((nPorFila === 1 ? W : frenteAncho + 2) - 2 * 12.7) - 2 * E;
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
  const rows = [];
  if (llevaFrente) {
    rows.push(`m${sm}-${idp}-frente,Frente ${frenteVocab}${label} M${parent},${frenteAncho},${frenteAltoEf},1,si,${colorFrente},15,"T,B,L,R",${sm}`);
  }
  rows.push(
    `m${sm}-${idp}-lateral-izq,Lateral ${vocab}${label}${ladoIzq} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${E},"T,B,L",${sm}`,
    `m${sm}-${idp}-lateral-der,Lateral ${vocab}${label}${ladoDer} M${parent},${profCajon},${latAlto},1,no,${colorLateral},${E},"T,B,R",${sm}`
  );
  if (!volquete) {
    // Fondo: según el método. Apoyado: interno a los laterales, a todo lo
    // alto (estructural a piso); la base queda confinada entre él y la cara.
    // Ranurado: embutido en ranura corrida — más ancho (cantos enterrados
    // ranura mm en cada lateral) y casi a la cara superior del lateral.
    const ranurado = fondoMetodo === 'ranurado';
    const ranura = ranurado
      ? Math.min(Number(grooveDepth) > 0 ? Number(grooveDepth) : 6, Math.max(1, Math.floor(E / 2)))
      : 0;
    const fondoAncho = interior + 2 * ranura;
    const fondoAlto = Math.max(0, altoFondoEf - 2 * ranura);
    rows.push(`m${sm}-${idp}-fondo,Fondo ${vocab}${label} M${parent},${fondoAncho},${fondoAlto},1,no,#F2F2F2,${E},,${sm}`);
    rows.push(`m${sm}-${idp}-cara,Cara ${vocab}${label} M${parent},${interior},${caraAlto},1,no,${colorLateral},${E},"T,B,L,R",${sm}`);
  } else {
    // Volquete/abatible: se conserva el fondo clásico derivado del frente.
    rows.push(`m${sm}-${idp}-fondo,Fondo ${vocab}${label} M${parent},${interior},${latAlto - E},1,no,#F2F2F2,${E},,${sm}`);
  }
  if (esZapatera && !volquete && division) {
    // División transversal (espejo de addShoeTray): misma luz que el fondo
    // y alto del lateral; apoyo de la fila delantera a media profundidad.
    rows.push(`m${sm}-${idp}-division,Division ${vocab}${label} M${parent},${interior},${altoDivisionEf},1,no,${colorLateral},${E},"T,B,L,R",${sm}`);
  }
  rows.push(
    // Base confinada (perimetral): largo = lateral − 2·espLat, entre la
    // cara y el fondo.
    `m${sm}-${idp}-base,Base ${vocab}${label} M${parent},${interior},${volquete ? profCajon : profCajon - 2 * E},1,si,${colorLateral},${E},"T,B,L,R",${sm}`
  );
  if (llevaFrente) {
    rows.push(`m${sm}-${idp}-tirador,Tirador ${vocab}${label} M${parent},2,20,1,no,#A0A0A0,5,,${sm}`);
  }
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

// Zócalo inferior por módulo (modelo 100% modular sin piezas globales):
// frente de zócalo INTERNO (embutido entre los laterales, ancho−2t): el
// renderer lo clasifica como 'plinth' con montaje 'internal'
// (classifyPlinthMount: ancho ≈ moduleW − 2·espesor) y lo dibuja retranqueado
// entre las caras interiores de los laterales.
export function zocaloModulo(mod, parent, ancho, altoZocalo, color) {
  const E = 15;
  return [
    line(`m${mod}-zocalo`, `Zocalo M${parent}`, ancho - 2 * E, altoZocalo, 1, 'si', color, 15, 'T,B,L,R', mod),
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
