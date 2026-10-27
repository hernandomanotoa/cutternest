// instructions.js — generación de instrucciones textuales por paso

import { railInstallText } from './railHardwareService.js';

// Normaliza un nombre de pieza para el matcheo por keyword: minúsculas y sin
// acentos (p. ej. "Zócalo" → "zocalo"), igual que structural.js/clasificarRiesgo.
function normalizar(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function generarInstruccion(paso, piezasData) {
  const ids = paso.piezas || [];
  const piezas = ids.map((id) => piezasData[id]).filter(Boolean);

  const laterales = piezas.filter((p) => normalizar(p.nombre).includes('lateral'));
  const bases = piezas.filter((p) => normalizar(p.nombre).includes('base'));
  const tapas = piezas.filter((p) => { const n = normalizar(p.nombre); return n.includes('tapa') || n.includes('techo'); });
  const fondos = piezas.filter((p) => { const n = normalizar(p.nombre); return n.includes('fondo') || n.includes('trasera'); });
  const repisas = piezas.filter((p) => { const n = normalizar(p.nombre); return n.includes('repisa') || n.includes('estante'); });
  const puertas = piezas.filter((p) => normalizar(p.nombre).includes('puerta'));
  const cajones = piezas.filter((p) => normalizar(p.nombre).includes('cajon'));
  const zocalos = piezas.filter((p) => normalizar(p.nombre).includes('zocalo'));
  const barras = piezas.filter((p) => normalizar(p.nombre).includes('barra'));
  const golas = piezas.filter((p) => normalizar(p.nombre).includes('gola'));
  const cabeceros = piezas.filter((p) => normalizar(p.nombre).includes('cabecero'));
  const tarimas = piezas.filter((p) => normalizar(p.nombre).includes('tarima'));
  const laminasSomier = piezas.filter((p) => {
    const n = normalizar(p.nombre);
    return n.includes('somier') || n.includes('lamina');
  });

  if (laterales.length > 0) {
    return `Colocar ${laterales.length} laterales de pie, paralelos, verificando orientación de cantos. Asegurar que queden a escuadra.`;
  }

  if (bases.length > 0 || tapas.length > 0) {
    const names = [...bases, ...tapas].map((p) => p.nombre).join(' y ');
    return `Unir ${names} a los laterales usando cajas euro o tornillos confirmat. Dejar tornillos a media para ajuste final.`;
  }

  if (fondos.length > 0) {
    return `Fijar el fondo. Si hay ranura: deslizar antes de cerrar el último lateral. Si no: atornillar por detrás cada 200 mm + cola blanca en perímetro.`;
  }

  if (repisas.length > 0) {
    const adv = repisas.some((p) => p.riesgo === 'critico' || p.riesgo === 'alto')
      ? ' Verificar riesgo de pandeo; usar soportes si corresponde.'
      : '';
    return `Instalar ${repisas.length} repisa(s) con soportes metálicos anticaída. Verificar nivel con burbuja. Carga máxima: 25 kg distribuidos.${adv}`;
  }

  if (puertas.length > 0) {
    return `Colocar ${puertas.length} puerta(s) abatible(s): bisagras, tiradores y calce inferior. Verificar apertura libre.`;
  }

  if (cajones.length > 0) {
    // La mención de correderas se parametriza por tipo de riel inferido; con
    // tipos mezclados se listan los textos de cada tipo presente una vez.
    const textos = [...new Set(cajones.map((p) => railInstallText(p)))];
    const hayAbatible = cajones.some((p) => {
      const n = normalizar(p.nombre);
      return n.includes('abatible') || n.includes('volquete');
    });
    const piston = hayAbatible
      ? ' Instalar el pistón de gas entre el frente abatible y el lateral, uno a cada lado, con el mueble en posición vertical.'
      : '';
    return `Armar cajones: laterales + base + frente + fondo. ${textos.join(' ')}${piston}`;
  }

  if (cabeceros.length > 0) {
    return `Fijar el cabecero a la estructura de la base con esquineros metálicos de unión, verificando escuadra y altura final respecto a la tarima.`;
  }

  if (tarimas.length > 0) {
    return `Instalar la tarima sobre la base con esquineros metálicos de unión. Si el ancho es de 1400 mm o más, añadir el soporte central de tarima bajo su cara inferior.`;
  }

  if (laminasSomier.length > 0) {
    return `Colocar las láminas de somier sobre la tarima con separación de 50–80 mm, empezando por el centro hacia los extremos.`;
  }

  if (zocalos.length > 0) {
    return `Fijar zócalo(s) a la base y laterales, dejando patas niveladoras ajustables.`;
  }

  if (barras.length > 0) {
    return `Instalar barras cromadas de ropa a la altura deseada, ancladas en laterales.`;
  }

  if (golas.length > 0) {
    return `Colocación de perfiles gola: atornillar cada perfil retranqueado detrás del plano de frentes, dejando el hueco de agarre hacia arriba. El cajón superior cierra en L (frente extendido, sin tira).`;
  }

  return `Ensamblar ${piezas.map((p) => p.nombre).join(', ')}.`;
}

export function toolsForStep(paso, piezasData) {
  const ids = paso.piezas || [];
  const piezas = ids.map((id) => piezasData[id]).filter(Boolean);
  const tools = new Set(['metro', 'lápiz']);

  piezas.forEach((p) => {
    const name = normalizar(p.nombre);
    if (name.includes('lateral') || name.includes('base') || name.includes('tapa')) {
      tools.add('taladro');
      tools.add('escuadra');
      tools.add('tornillos confirmat');
    }
    if (name.includes('fondo')) {
      tools.add('clavadora / atornillador');
      tools.add('cola blanca');
    }
    if (name.includes('repisa') || name.includes('estante')) {
      tools.add('nivel');
      tools.add('soportes metálicos anticaída');
    }
    if (name.includes('puerta')) {
      tools.add('bisagras');
      tools.add('tiradores');
      tools.add('destornillador');
    }
    if (name.includes('cajon')) {
      tools.add('correderas telescópicas');
      tools.add('martillo de goma');
    }
    if (name.includes('zocalo')) {
      tools.add('patas niveladoras');
    }
    if (name.includes('gola')) {
      tools.add('atornillador');
      tools.add('taladro');
    }
    if (name.includes('cabecero') || name.includes('tarima')) {
      tools.add('taladro');
      tools.add('escuadra');
      tools.add('esquineros metálicos de unión');
    }
    if (name.includes('somier') || name.includes('lamina')) {
      tools.add('láminas de somier');
    }
    if (name.includes('abatible') || name.includes('volquete')) {
      tools.add('pistones de gas 600 N');
    }
  });

  return Array.from(tools);
}
