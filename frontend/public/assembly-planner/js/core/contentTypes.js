// js/core/contentTypes.js — Catálogo de tipos de contenido del Constructor.
// Alturas ergonómicas extraídas de los ejemplos del menú Personal
// (ejemplo-closet-abierto-modular, ejemplo-closet-zapatera-mixta,
// ejemplo-cajonera-alturas-mixtas) — fuente única versionada en repo.
//
// Concepto generalizado (repisa / cajón / zapatera):
//   - Repisa: panel fijo, sin frente ni gaps (ocupa su espesor).
//   - Cajón: frente BAJO + caja 30 mm más baja + cara (frente interior) +
//     gaps de apilado. El frente nunca cubre todo el vano.
//   - Zapatera: frente VARIABLE. Si es BAJO (planos/tenis/tacones) lleva
//     cara + gaps como el cajón; si es COMPLETO (botas: cubre todo el vano)
//     va SIN cara ni gaps — el frente se integra a la bandeja y cierra la
//     abertura entera. Los laterales de la bandeja son bajos en ambos
//     casos: solo cubren la riel (RAIL_SIDE_HEIGHT) para ver y sacar el
//     calzado.

// Altura de los laterales de la bandeja zapatera: cubre la corredera
// telescópica (~45 mm de perfil) con margen de rigidez.
export const RAIL_SIDE_HEIGHT = 100;

// Altura del borde de la "bandeja a la vista" (tipo 'bandeja'): un poco más
// alto que la riel (RAIL_SIDE_HEIGHT), para que la bandeja se vea completa
// por arriba y por el frente cuando va sin frente decorativo.
export const BANDEJA_RIM_HEIGHT = 120;

// ── Tag de tipo en el nombre (sobrevive al CSV) ────────────────────────────
// El tipo de una unidad-cajón/zapatera se estampa entre corchetes en el
// nombre de su pieza ancla (frente, o cara si va sin frente): las versiones
// y exportaciones re-parsean el CSV y solo las columnas sobreviven — el
// nombre es la única portadora fiable del contrato. Sin tag (catálogo o
// diseños previos), los consumidores caen a su heurística histórica.

// Estampa el tag en el nombre: 'Frente zapatera [bandeja] extraible 1 M1'.
export function stampTipoTag(nombre, tipoId) {
  if (!tipoId) return nombre;
  return String(nombre).replace(/(\S+)/, `$1 [${tipoId}]`);
}

// Extrae el id de tipo del nombre ('Frente zapatera [bandeja] …' → 'bandeja').
export function tipoTagDe(nombre) {
  const m = String(nombre || '').match(/\[([a-z][a-z0-9-]*)\]/i);
  return m ? m[1].toLowerCase() : null;
}

// Vano de la unidad a partir de su cara ancla: con tag, el delta sale del
// contrato (cajaDelta = frente − caja; el frente siempre es vano − 3); sin
// tag (catálogo/diseños previos), el histórico 30 + 3 = 33.
export function vanoDesdeCara(cara, frenteLuzAlto = 3) {
  const t = tipoTagDe(cara?.nombre);
  const tipo = t ? getContentType('shoeRack', t) : null;
  const delta = (Number(tipo?.cajaDelta) || 30) + frenteLuzAlto;
  return (Number(cara?.alto) || 140) + delta;
}

// Contrato de tipo (fuente única que consumen builder, gola, apilado y UI):
//   - altoVano: zona vertical que la unidad reserva en el apilado.
//   - frente.completo: la zapatera cierra el vano entero sin cara (botas).
//   - frente.conFrenteDefault: si al agregar la bandeja lleva frente
//     decorativo por defecto (el checkbox "Frente zapatera" arranca así).
//   - frente.fijoEnGola: el frente NO se reescala al aplicar gola.
//   - cajaDelta: frente − caja (la cara queda 2·ESP_BASE detrás del frente).
//   - fondoMetodo (solo cajones): sistema de montaje del fondo. 'apoyado'
//     (default, retrocompatible) = fondo estructural interno a los laterales,
//     apoyado sobre la base. 'ranurado' = fondo embutido en una ranura
//     corrida fresada en la cara interior de cada lateral (ver
//     DRAWER_GROOVE_DEPTH en core/config.js): el fondo se corta más ancho
//     (interior + 2·ranura) y sube casi a la cara superior del lateral
//     (alto = lateral − 2·ranura).
//   - bandeja (solo zapateras): ladosIguales (sin frente, todos los lados
//     al mismo alto) y rim (alto de ese borde; null = lateral bajo de riel).

export const DRAWER_TYPES = [
  {
    id: 'delgado',
    label: 'Delgado — accesorios y ropa interior',
    altoVano: 130,
    frenteCompleto: false,
    conFrenteDefault: true, // el cajón siempre lleva frente
    fijoEnGola: false,
    cajaDelta: 30,
    fondoMetodo: 'apoyado',
  },
  {
    id: 'estandar',
    label: 'Estándar — camisetas, camisas, pantalones',
    altoVano: 200,
    frenteCompleto: false,
    conFrenteDefault: true,
    fijoEnGola: false,
    cajaDelta: 30,
    fondoMetodo: 'apoyado',
  },
  {
    id: 'profundo',
    label: 'Profundo — suéteres y sábanas',
    altoVano: 280,
    frenteCompleto: false,
    conFrenteDefault: true,
    fijoEnGola: false,
    cajaDelta: 30,
    fondoMetodo: 'apoyado',
  },
];

export const SHOE_RACK_TYPES = [
  {
    id: 'planos',
    label: 'Zapatos planos — vano 180',
    altoVano: 180,
    frenteCompleto: false,
    conFrenteDefault: true, // por defecto las zapateras llevan frente
    fijoEnGola: true, // el frente de zapatera no se reescala: conserva su tipo
    cajaDelta: 30,
  },
  {
    id: 'tenis',
    label: 'Tenis / calzado grueso — vano 200',
    altoVano: 200,
    frenteCompleto: false,
    conFrenteDefault: true,
    fijoEnGola: true,
    cajaDelta: 30,
  },
  {
    id: 'tacones',
    label: 'Tacones — vano 220',
    altoVano: 220,
    frenteCompleto: false,
    conFrenteDefault: true,
    fijoEnGola: true,
    cajaDelta: 30,
  },
  {
    id: 'botines',
    label: 'Botines — vano 220',
    altoVano: 220,
    frenteCompleto: false,
    conFrenteDefault: true,
    fijoEnGola: true,
    cajaDelta: 30,
  },
  {
    id: 'botas',
    label: 'Botas altas — vano 450, frente completo (sin cara)',
    altoVano: 450,
    frenteCompleto: true,
    conFrenteDefault: true, // el frente es el cierre estructural de la bandeja
    fijoEnGola: true,
    cajaDelta: 30,
  },
  {
    // Bandeja a la vista: su razón de ser es verse — por defecto va SIN
    // frente y TODOS los lados (cara, laterales, fondo y división) quedan
    // al MISMO alto (rim, un borde apenas más alto que la riel) para que la
    // cara no sobresalga del lateral.
    id: 'bandeja',
    label: 'Bandeja a la vista — lados iguales (vano 160)',
    altoVano: 160,
    frenteCompleto: false,
    conFrenteDefault: false,
    ladosIguales: true,
    rim: 120, // = BANDEJA_RIM_HEIGHT
    fijoEnGola: true,
    cajaDelta: 30,
  },
];

// Resuelve un tipo por id en cualquiera de los dos catálogos.
export function getContentType(kind, typeId) {
  const catalog = kind === 'shoeRack' ? SHOE_RACK_TYPES : DRAWER_TYPES;
  return catalog.find((t) => t.id === typeId) || null;
}

// Método de montaje del fondo declarado por un tipo de cajón (contrato por
// tag [tipo] en el nombre del frente/cara). Sin tag, con id desconocido o
// con tipo sin el campo (diseños previos) cae a 'apoyado': es el método
// histórico y garantiza la retrocompatibilidad de los CSV viejos.
export function fondoMetodoDeTipo(typeId) {
  if (!typeId) return 'apoyado';
  const metodo = getContentType('drawer', typeId)?.fondoMetodo;
  return metodo === 'ranurado' ? 'ranurado' : 'apoyado';
}
