// hardware.js — cálculo de lista de herrajes e insumos

function uniquePieces(piezas, predicate) {
  const seen = new Set();
  return piezas.filter((p) => {
    if (!predicate(p)) return false;
    const key = p.originalId || p.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function calculateHardware(piezas, dependencies) {
  const herrajes = [];
  const structural = dependencies.filter((d) => d.type === 'estructural').length;
  const fondos = uniquePieces(piezas, (p) => p.nombre.toLowerCase().includes('fondo'));
  const repisas = uniquePieces(piezas, (p) => p.nombre.toLowerCase().includes('repisa') || p.nombre.toLowerCase().includes('estante'));
  const cajones = uniquePieces(piezas, (p) => p.nombre.toLowerCase().includes('cajon'));
  const barras = uniquePieces(piezas, (p) => p.nombre.toLowerCase().includes('barra'));
  const modulos = new Set(piezas.map((p) => p.modulo)).size || 1;
  const puertas = uniquePieces(piezas, (p) => p.nombre.toLowerCase().includes('puerta'));

  // Cajas euro
  if (structural > 0) {
    herrajes.push({
      nombre: 'Cajas euro',
      cantidad: structural * 2,
      especificacion: 'Ø15 mm, prof. 12.5 mm',
      prioridad: 'Alta',
      bloqueante: false,
    });
  }

  // Tornillos confirmat para fondos
  if (fondos.length > 0) {
    herrajes.push({
      nombre: 'Tornillos confirmat',
      cantidad: fondos.length * 8,
      especificacion: '7×50 mm para tablero 15 mm',
      prioridad: 'Alta',
      bloqueante: false,
    });
  }

  // Soportes de repisa
  if (repisas.length > 0) {
    herrajes.push({
      nombre: 'Soportes metálicos anticaída',
      cantidad: repisas.length * 2,
      especificacion: 'Con perno y tuerca, no a presión',
      prioridad: 'Alta',
      bloqueante: false,
    });
  }

  // Correderas
  if (cajones.length > 0) {
    const pares = Math.ceil(cajones.length / 2);
    herrajes.push({
      nombre: 'Correderas telescópicas',
      cantidad: pares,
      especificacion: '450 mm, cierre suave (CONFIRMAR ANTES DE CORTAR)',
      prioridad: 'Media',
      bloqueante: true,
    });
  }

  // Barras
  if (barras.length > 0) {
    herrajes.push({
      nombre: 'Barras cromadas',
      cantidad: barras.length,
      especificacion: 'Ø25 mm, longitud a medir después de armar estructura',
      prioridad: 'Media',
      bloqueante: false,
    });
  }

  // Escuadras
  herrajes.push({
    nombre: 'Escuadras metálicas',
    cantidad: (modulos - 1) * 4 + 6,
    especificacion: '50×50 mm, 2 agujeros',
    prioridad: 'Alta',
    bloqueante: false,
  });

  // Patas niveladoras
  herrajes.push({
    nombre: 'Patas niveladoras ocultas',
    cantidad: modulos * 2,
    especificacion: 'Regulables ±15 mm',
    prioridad: 'Media',
    bloqueante: false,
  });

  // Bisagras y tiradores
  if (puertas.length > 0) {
    herrajes.push({
      nombre: 'Bisagras',
      cantidad: puertas.length * 2,
      especificacion: 'Para puerta de 18 mm',
      prioridad: 'Alta',
      bloqueante: false,
    });
    herrajes.push({
      nombre: 'Tiradores',
      cantidad: puertas.length,
      especificacion: 'A elección estética',
      prioridad: 'Media',
      bloqueante: false,
    });
  }

  // Cantos PVC
  const cantoTotal = piezas.reduce((sum, p) => {
    const lados = (p.cantos || '').split(',').filter((s) => s.trim() !== '').length;
    return sum + ((p.ancho + p.alto) * 2 * lados) / 4;
  }, 0);
  if (cantoTotal > 0) {
    herrajes.push({
      nombre: 'Cantos PVC',
      cantidad: Math.ceil(cantoTotal / 1000),
      especificacion: '0.8 mm, color a juego',
      unidad: 'metros',
      prioridad: 'Alta',
      bloqueante: false,
    });
  }

  return herrajes;
}
