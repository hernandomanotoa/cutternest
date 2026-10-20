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

export const DRAWER_TYPES = [
  {
    id: 'delgado',
    label: 'Delgado — accesorios y ropa interior',
    altoVano: 130,
    frenteCompleto: false,
  },
  {
    id: 'estandar',
    label: 'Estándar — camisetas, camisas, pantalones',
    altoVano: 200,
    frenteCompleto: false,
  },
  {
    id: 'profundo',
    label: 'Profundo — suéteres y sábanas',
    altoVano: 280,
    frenteCompleto: false,
  },
];

export const SHOE_RACK_TYPES = [
  {
    id: 'planos',
    label: 'Zapatos planos — vano 180',
    altoVano: 180,
    frenteCompleto: false,
  },
  {
    id: 'tenis',
    label: 'Tenis / calzado grueso — vano 200',
    altoVano: 200,
    frenteCompleto: false,
  },
  {
    id: 'tacones',
    label: 'Tacones — vano 220',
    altoVano: 220,
    frenteCompleto: false,
  },
  {
    id: 'botines',
    label: 'Botines — vano 220',
    altoVano: 220,
    frenteCompleto: false,
  },
  {
    id: 'botas',
    label: 'Botas altas — vano 450, frente completo (sin cara)',
    altoVano: 450,
    frenteCompleto: true,
  },
];

// Resuelve un tipo por id en cualquiera de los dos catálogos.
export function getContentType(kind, typeId) {
  const catalog = kind === 'shoeRack' ? SHOE_RACK_TYPES : DRAWER_TYPES;
  return catalog.find((t) => t.id === typeId) || null;
}
