// instructions.js — generación de instrucciones textuales por paso

export function generarInstruccion(paso, piezasData) {
  const ids = paso.piezas || [];
  const piezas = ids.map((id) => piezasData[id]).filter(Boolean);

  const laterales = piezas.filter((p) => p.nombre.toLowerCase().includes('lateral'));
  const bases = piezas.filter((p) => p.nombre.toLowerCase().includes('base'));
  const tapas = piezas.filter((p) => p.nombre.toLowerCase().includes('tapa') || p.nombre.toLowerCase().includes('techo'));
  const fondos = piezas.filter((p) => p.nombre.toLowerCase().includes('fondo') || p.nombre.toLowerCase().includes('trasera'));
  const repisas = piezas.filter((p) => p.nombre.toLowerCase().includes('repisa') || p.nombre.toLowerCase().includes('estante'));
  const puertas = piezas.filter((p) => p.nombre.toLowerCase().includes('puerta'));
  const cajones = piezas.filter((p) => p.nombre.toLowerCase().includes('cajon'));
  const zocalos = piezas.filter((p) => p.nombre.toLowerCase().includes('zocalo'));
  const barras = piezas.filter((p) => p.nombre.toLowerCase().includes('barra'));

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
    return `Armar cajones: laterales + base + frente + fondo. Instalar correderas telescópicas ya confirmadas.`;
  }

  if (zocalos.length > 0) {
    return `Fijar zócalo(s) a la base y laterales, dejando patas niveladoras ajustables.`;
  }

  if (barras.length > 0) {
    return `Instalar barras cromadas de ropa a la altura deseada, ancladas en laterales.`;
  }

  return `Ensamblar ${piezas.map((p) => p.nombre).join(', ')}.`;
}

export function toolsForStep(paso, piezasData) {
  const ids = paso.piezas || [];
  const piezas = ids.map((id) => piezasData[id]).filter(Boolean);
  const tools = new Set(['metro', 'lápiz']);

  piezas.forEach((p) => {
    const name = p.nombre.toLowerCase();
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
  });

  return Array.from(tools);
}
