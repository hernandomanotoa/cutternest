# csvParser.js — Parser, validación y exportación de CSV

## Código fuente completo

Archivo: `frontend/public/assembly-planner/js/csvParser.js`

```javascript
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
  validateDimensions(pieces, warnings);

  return {
    ok: errors.length === 0,
    pieces,
    errors,
    warnings,
  };
}

function normalizeName(s) {
  return String(s || '').toLowerCase().trim();
}

function nameMatches(piece, keywords) {
  const n = normalizeName(piece.nombre);
  return keywords.some((k) => n.includes(k));
}

function findPieces(pieces, keywords) {
  return pieces.filter((p) => nameMatches(p, keywords));
}

function findPiece(pieces, keywords) {
  return pieces.find((p) => nameMatches(p, keywords));
}

function groupByModule(pieces) {
  const groups = {};
  pieces.forEach((p) => {
    const mod = String(p.modulo || '1').trim();
    if (!groups[mod]) groups[mod] = [];
    groups[mod].push(p);
  });
  return groups;
}

function isSubModule(modId, parentId) {
  return modId !== parentId && modId.startsWith(parentId);
}

function validateDimensions(pieces, warnings) {
  const modules = groupByModule(pieces);
  const moduleIds = Object.keys(modules);
  const globalModules = moduleIds.filter((m) => m.toLowerCase() === 'estructura' || m.toLowerCase() === 'global');
  const nonGlobal = moduleIds.filter((m) => !globalModules.includes(m));

  const isSubModule = (modId) => nonGlobal.some((other) => other !== modId && modId.startsWith(other) && !other.startsWith(modId));
  const subModules = nonGlobal.filter(isSubModule);
  const parentModules = nonGlobal.filter((m) => !isSubModule(m));

  parentModules.forEach((modId) => {
    const modPieces = modules[modId];
    const base = findPiece(modPieces, ['base']);
    const top = findPiece(modPieces, ['tapa', 'techo']);
    const laterals = findPieces(modPieces, ['lateral']);
    const back = findPiece(modPieces, ['fondo', 'trasera']);

    const isRectangularCabinet = !modPieces.some((p) =>
      ['pata', 'pie ', 'tablero', 'superficie', 'asiento', 'respaldo', 'respaldar', 'banco'].some((k) =>
        normalizeName(p.nombre).includes(k)
      )
    );

    if (isRectangularCabinet) {
      if (!base) warnings.push(`Módulo ${modId}: falta pieza base.`);
      if (!top) warnings.push(`Módulo ${modId}: falta pieza tapa.`);
      if (laterals.length < 2) warnings.push(`Módulo ${modId}: faltan laterales (se encontraron ${laterals.length}).`);
      if (!back) warnings.push(`Módulo ${modId}: falta pieza fondo/trasera.`);
    }

    if (base && top) {
      if (Math.abs(base.ancho - top.ancho) > 1) {
        warnings.push(`Módulo ${modId}: base (${base.ancho} mm) y tapa (${top.ancho} mm) tienen anchos diferentes.`);
      }
      if (Math.abs(base.alto - top.alto) > 1) {
        warnings.push(`Módulo ${modId}: base (${base.alto} mm) y tapa (${top.alto} mm) tienen profundidades diferentes.`);
      }
    }
    if (back && base && Math.abs(back.ancho - base.ancho) > 1) {
      warnings.push(`Módulo ${modId}: fondo (${back.ancho} mm) y base (${base.ancho} mm) tienen anchos diferentes.`);
    }

    const sideThickness = laterals.length ? laterals[0].espesor : base ? base.espesor : 0;
    const lateralHeight = laterals.length ? Math.max(laterals[0].ancho, laterals[0].alto) : 0;
    const interiorWidth = base ? base.ancho - 2 * sideThickness : 0;

    if (back && laterals.length && Math.abs(back.alto - lateralHeight) > 1) {
      warnings.push(`Módulo ${modId}: fondo (${back.alto} mm) y lateral (${lateralHeight} mm) tienen alturas diferentes.`);
    }

    // Estantes/repisas
    const shelves = findPieces(modPieces, ['estante', 'repisa']);
    shelves.forEach((s) => {
      if (interiorWidth > 0 && s.ancho > interiorWidth + 1) {
        warnings.push(`Módulo ${modId}: "${s.nombre}" (${s.ancho} mm) excede ancho interior (${interiorWidth} mm).`);
      }
    });

    // Cajones (submódulos)
    const drawerSubs = subModules.filter((m) => m.startsWith(modId));
    drawerSubs.forEach((subId) => {
      const subPieces = modules[subId];
      const front = findPiece(subPieces, ['frente']);
      const subLaterals = findPieces(subPieces, ['lateral']);
      const subBack = findPiece(subPieces, ['fondo']);

      if (front && interiorWidth > 0 && front.ancho > interiorWidth - 3 + 1) {
        warnings.push(`Módulo ${modId} → ${subId}: frente cajón (${front.ancho} mm) no cabe en interior (${interiorWidth} mm).`);
      }

      if (base && subLaterals.length) {
        const maxDepth = base.alto - 10;
        subLaterals.forEach((lat) => {
          const latRealHeight = Math.max(lat.ancho, lat.alto);
          if (latRealHeight > maxDepth + 1) {
            warnings.push(`Módulo ${modId} → ${subId}: lateral cajón "${lat.nombre}" (${latRealHeight} mm) excede profundidad disponible (${maxDepth} mm).`);
          }
        });
      }

      if (front && subBack && subLaterals.length) {
        const expectedBackWidth = front.ancho - 2 * subLaterals[0].espesor;
        if (Math.abs(subBack.ancho - expectedBackWidth) > 2) {
          warnings.push(`Módulo ${modId} → ${subId}: fondo cajón (${subBack.ancho} mm) debería ser ≈ ${expectedBackWidth} mm (frente − 2×espesor lateral).`);
        }
      }
    });

    // Laterales con rotate=si
    laterals.forEach((lat) => {
      if (lat.rotate && lat.alto <= lat.ancho) {
        warnings.push(`Módulo ${modId}: "${lat.nombre}" tiene rotate=si pero alto (${lat.alto} mm) ≤ ancho (${lat.ancho} mm). Se recomienda rotate=no para laterales.`);
      }
    });
  });

  // Estructura global
  globalModules.forEach((gmod) => {
    const globalPieces = modules[gmod];
    const zocalo = findPiece(globalPieces, ['zocalo']);
    const sumaBases = parentModules.reduce((sum, modId) => {
      const b = findPiece(modules[modId], ['base']);
      return sum + (b ? b.ancho : 0);
    }, 0);
    if (zocalo && sumaBases > 0 && Math.abs(zocalo.ancho - sumaBases) > 1) {
      warnings.push(`Estructura global: zócalo (${zocalo.ancho} mm) no coincide con suma de bases (${sumaBases} mm). Verifica que incluya solo módulos que toquen el suelo.`);
    }
  });
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

  // Fondo decorativo (solo si parece panel decorativo, no accesorio)
  if (piece.espesor <= 5 && ['fondo', 'trasera', 'posterior', 'decor', 'tapacanto'].some((k) => name.includes(k))) {
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

```
