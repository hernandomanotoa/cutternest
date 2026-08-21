// structural.js — análisis de cargas, pandeo, vuelco y riesgo

const DEFAULT_E_MPA = 2500;
const DEFAULT_SIGMA_MPA = 18;
const DEFAULT_DEFLEXION_LIMIT = 250; // L/250

export function calcularCargaRepisa(ancho, profundidad, espesor, E_MPa = DEFAULT_E_MPA, sigma_MPa = DEFAULT_SIGMA_MPA, deflexionLimite_L = DEFAULT_DEFLEXION_LIMIT) {
  const L = ancho / 1000;
  const b = profundidad / 1000;
  const h = espesor / 1000;
  const E = E_MPa * 1e6;
  const sigma = sigma_MPa * 1e6;

  const W = b * h ** 2 / 6;
  const qFlexion = 12 * sigma * W / (L ** 2);
  const I = b * h ** 3 / 12;
  const qDeflexion = 384 * E * I * (1 / deflexionLimite_L) / (L ** 3);
  const qMax = Math.min(qFlexion, qDeflexion);
  const cargaTotal = (qMax * L) / 9.81;

  return {
    cargaTotalKg: Math.round(cargaTotal),
    limitante: qFlexion < qDeflexion ? 'flexion' : 'deflexion',
    deflexionMm: (qMax * L ** 4 / (384 * E * I)) * 1000,
    luz: ancho,
    profundidad: profundidad,
    espesor: espesor,
  };
}

export function clasificarRiesgo(pieza) {
  const name = pieza.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const luz = Math.max(pieza.ancho, pieza.alto);

  if (pieza.espesor <= 5 && (name.includes('fondo') || name.includes('trasera') || name.includes('decor') || name.includes('tapacanto'))) {
    return { level: 'info', label: 'Fondo decorativo', color: '#3b82f6', accion: 'No estructural' };
  }

  if (pieza.espesor <= 5) {
    return { level: 'success', label: 'Bajo', color: '#10b981', accion: 'Pieza menor: sin acción' };
  }

  if ((name.includes('repisa') || name.includes('estante')) && luz > 800 && pieza.espesor <= 15) {
    return { level: 'danger', label: 'Crítico', color: '#ef4444', accion: 'Obligatorio: divisor vertical o soporte central' };
  }

  if ((name.includes('repisa') || name.includes('estante')) && luz >= 600 && luz <= 800 && pieza.espesor <= 15) {
    return { level: 'warning', label: 'Alto', color: '#f97316', accion: 'Recomendado: soporte intermedio' };
  }

  if ((name.includes('repisa') || name.includes('estante')) && luz >= 400 && luz < 600 && pieza.espesor === 15) {
    return { level: 'medium', label: 'Medio', color: '#fbbf24', accion: 'Opcional: soporte si carga > 15 kg' };
  }

  return { level: 'success', label: 'Bajo', color: '#10b981', accion: 'Sin acción necesaria' };
}

export function calcularVuelco(mueble) {
  const pesoEstructura = mueble.pesoVacio || 120;
  const cargaContenido = mueble.cargaMaxima || 350;
  const profundidad = mueble.profundidad / 1000;

  const escenarios = [
    { nombre: 'Vacío', peso: pesoEstructura, vuelco: 10 },
    { nombre: 'Normal', peso: pesoEstructura + cargaContenido * 0.4, vuelco: 15 },
    { nombre: 'Lleno', peso: pesoEstructura + cargaContenido, vuelco: 20 },
    { nombre: 'Lleno + Cajón abierto', peso: pesoEstructura + cargaContenido, vuelco: 20 + 30 * 0.25 * 9.81 },
    { nombre: 'Lleno + Carga frontal', peso: pesoEstructura + cargaContenido, vuelco: 20 + 50 * 0.15 * 9.81 },
  ];

  return escenarios.map((e) => {
    const fs = (e.peso * 9.81 * (profundidad / 2)) / e.vuelco;
    return {
      nombre: e.nombre,
      fs: Number(fs.toFixed(2)),
      seguro: fs >= 1.5,
    };
  });
}

export function estimatePieceWeight(pieza) {
  // Melamina ~ 0.7 kg/dm^3
  const ancho = pieza.ancho / 100;
  const alto = pieza.alto / 100;
  const espesor = pieza.espesor / 10;
  return ancho * alto * espesor * 0.7 * pieza.cantidad;
}

export function getProfundidadMueble(piezas) {
  // Tomar el menor de ancho/alto de las piezas base/tapa
  const bases = piezas.filter((p) => p.nombre.toLowerCase().includes('base') || p.nombre.toLowerCase().includes('tapa'));
  if (bases.length === 0) return 600;
  return Math.min(...bases.map((b) => Math.min(b.ancho, b.alto)));
}
