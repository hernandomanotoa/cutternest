// csvParser.js — parseo, validación y exportación de CSV

import { isHexColor, normalizeColor } from './utils.js';

export const EXPECTED_HEADERS = ['id', 'nombre', 'ancho', 'alto', 'cantidad', 'rotate', 'color', 'espesor', 'cantos', 'modulo'];

export function parseCSV(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));
  if (nonEmpty.length < 2) {
    return { ok: false, error: 'El CSV debe tener al menos una línea de cabecera y una de datos.' };
  }

  const headers = splitCSVLine(nonEmpty[0]);
  if (!headers.every((h, i) => EXPECTED_HEADERS[i] === h)) {
    return {
      ok: false,
      error: `Cabecera inválida. Esperado: ${EXPECTED_HEADERS.join(',')}. Recibido: ${headers.join(',')}.`,
    };
  }

  const pieces = [];
  const errors = [];
  const warnings = [];
  const seenIds = new Set();

  for (let i = 1; i < nonEmpty.length; i++) {
    const row = splitCSVLine(nonEmpty[i]);
    if (row.length === 1 && row[0] === '') continue;
    if (row.length !== headers.length) {
      errors.push(`Fila ${i + 1}: número de columnas incorrecto (${row.length} vs ${headers.length}).`);
      continue;
    }

    const raw = Object.fromEntries(headers.map((h, idx) => [h, row[idx].trim()]));
    const line = i + 1;
    const generated = validatePiece(raw, line, seenIds, errors, warnings);
    if (generated && generated.length > 0) {
      generated.forEach((p) => {
        pieces.push(p);
        seenIds.add(p.id);
      });
    }
  }

  // Detecciones globales
  pieces.forEach((p) => classifyPiece(p, pieces, warnings));

  return {
    ok: errors.length === 0,
    pieces,
    errors,
    warnings,
  };
}

function splitCSVLine(line) {
  const result = [];
  let current = '';
  let insideQuotes = false;
  for (const char of line) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function validatePiece(raw, line, seenIds, errors, warnings) {
  const base = {
    id: raw.id,
    nombre: raw.nombre,
    ancho: parseFloat(raw.ancho),
    alto: parseFloat(raw.alto),
    cantidad: parseInt(raw.cantidad, 10),
    rotate: raw.rotate.toLowerCase() === 'si' || raw.rotate.toLowerCase() === 'sí' || raw.rotate === '1' || raw.rotate.toLowerCase() === 'true',
    color: normalizeColor(raw.color),
    espesor: parseFloat(raw.espesor),
    cantos: raw.cantos || '',
    modulo: raw.modulo || '1',
  };

  if (!base.id) errors.push(`Fila ${line}: id vacío.`);
  else if (seenIds.has(base.id)) errors.push(`Fila ${line}: id duplicado "${base.id}".`);

  if (!base.nombre) warnings.push(`Fila ${line}: nombre vacío para "${base.id}".`);

  if (!Number.isFinite(base.ancho) || base.ancho <= 0) errors.push(`Fila ${line}: ancho debe ser numérico > 0.`);
  if (!Number.isFinite(base.alto) || base.alto <= 0) errors.push(`Fila ${line}: alto debe ser numérico > 0.`);
  if (!Number.isInteger(base.cantidad) || base.cantidad < 1) errors.push(`Fila ${line}: cantidad debe ser entero ≥ 1.`);
  if (!Number.isFinite(base.espesor) || base.espesor <= 0) errors.push(`Fila ${line}: espesor debe ser numérico > 0.`);
  if (!isHexColor(base.color)) warnings.push(`Fila ${line}: color "${base.color}" no es un hex válido.`);

  if (errors.some((e) => e.startsWith(`Fila ${line}:`))) return [];

  if (base.cantidad === 1) return [base];

  // Expandir cantidad > 1 en instancias individuales
  const instances = [];
  for (let i = 1; i <= base.cantidad; i++) {
    instances.push({
      ...base,
      id: `${base.id}-${i}`,
      originalId: base.id,
      instanceIndex: i,
      cantidad: 1,
    });
  }
  return instances;
}

function classifyPiece(piece, allPieces, warnings) {
  const name = piece.nombre.toLowerCase();
  const sides = piece.cantos.split(',').filter((s) => s.trim() !== '').length;

  // Detectar si el modulo tiene algun soporte o divisor que reduzca la luz de repisas/estantes
  function hasSoporteEnModulo() {
    return allPieces.some((p) => {
      if (p.modulo !== piece.modulo) return false;
      const n = p.nombre.toLowerCase();
      return ['soporte', 'montante', 'divisor', 'travesano', 'travesaño', 'refuerzo', 'cantonera'].some((k) => n.includes(k));
    });
  }

  // Fondo decorativo
  if (piece.espesor <= 5) {
    piece.tipo = 'fondo_decorativo';
    warnings.push(`"${piece.nombre}" tiene ${piece.espesor} mm: fondo decorativo, no estructural.`);
  }

  // Horizontal / vertical / fondo por cantos
  if (sides === 4) {
    piece.orientacion = 'horizontal';
  } else if (sides === 3) {
    piece.orientacion = 'vertical';
  } else if (sides === 0) {
    piece.orientacion = 'fondo';
  } else {
    piece.orientacion = 'mixto';
  }

  // Pandeo en repisas/estantes
  const luz = Math.max(piece.ancho, piece.alto);
  const conSoporte = hasSoporteEnModulo();
  if ((name.includes('repisa') || name.includes('estante')) && luz > 800 && piece.espesor <= 15) {
    if (conSoporte) {
      piece.riesgo = 'medio';
    } else {
      piece.riesgo = 'critico';
      warnings.push(`CRÍTICO: "${piece.nombre}" (luz ${luz} mm, espesor ${piece.espesor} mm) requiere soporte central o divisor.`);
    }
  } else if ((name.includes('repisa') || name.includes('estante')) && luz >= 600 && luz <= 800 && piece.espesor <= 15) {
    piece.riesgo = 'alto';
    warnings.push(`ALTO: "${piece.nombre}" (luz ${luz} mm) recomienda soporte intermedio.`);
  } else if ((name.includes('repisa') || name.includes('estante')) && luz >= 400 && luz < 600 && piece.espesor === 15) {
    piece.riesgo = 'medio';
  } else if ((name.includes('repisa') || name.includes('estante')) && luz < 400) {
    piece.riesgo = 'bajo';
  }
}

export function piecesToCSV(pieces) {
  const header = EXPECTED_HEADERS.join(',');
  // Colapsar instancias expandidas de vuelta a filas originales
  const groups = {};
  pieces.forEach((p) => {
    const key = p.originalId || p.id;
    if (!groups[key]) {
      groups[key] = { ...p, id: key, cantidad: 0, _instances: [] };
    }
    groups[key].cantidad += 1;
    groups[key]._instances.push(p.id);
  });
  const rows = Object.values(groups).map((p) => {
    const cantos = p.cantos ? `"${p.cantos}"` : '';
    return `${p.id},${p.nombre},${p.ancho},${p.alto},${p.cantidad},${p.rotate ? 'si' : 'no'},${p.color},${p.espesor},${cantos},${p.modulo}`;
  });
  return [header, ...rows].join('\n');
}

export function createEmptyPiece(index = 1) {
  return {
    id: `pieza-${index}`,
    nombre: 'Nueva pieza',
    ancho: 100,
    alto: 100,
    cantidad: 1,
    rotate: false,
    color: '#4ECDC4',
    espesor: 18,
    cantos: 'T,B,L,R',
    modulo: '1',
  };
}
