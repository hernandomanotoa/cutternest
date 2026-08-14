import type { PieceInput } from '../types'

const VERSION = 'CutterNest Piezas v1'
const BASE_COLUMNS = ['id', 'nombre', 'ancho', 'alto', 'cantidad', 'rotar', 'color', 'espesor', 'cantos']
const OPTIONAL_COLUMNS = ['modulo']
const COLUMNS = [...BASE_COLUMNS, ...OPTIONAL_COLUMNS]
// Hash refleja el formato con modulo como columna opcional
const TEMPLATE_HASH = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2'
const BOM = '\uFEFF'

export { VERSION, BASE_COLUMNS, OPTIONAL_COLUMNS, COLUMNS, TEMPLATE_HASH }

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function unescapeCsv(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/""/g, '"')
  }
  return value
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)
  return values
}

function headerMatches(actual: string[], expected: string[]): boolean {
  if (actual.length < expected.length) return false
  return expected.every((h, i) => h === actual[i])
}

export function generateCsv(pieces: PieceInput[]): string {
  const header = `# ${VERSION}\n# hash: ${TEMPLATE_HASH}\n${COLUMNS.join(',')}\n`
  const rows = pieces
    .map((p) =>
      [
        escapeCsv(p.id || ''),
        escapeCsv(p.nombre),
        String(p.ancho),
        String(p.alto),
        String(p.cantidad),
        p.rotar ? 'si' : 'no',
        p.color,
        String(p.espesor),
        escapeCsv(p.cantos || ''),
        escapeCsv(p.modulo || ''),
      ].join(',')
    )
    .join('\n')
  return BOM + header + rows + '\n'
}

export function parseCsv(text: string): { valid: true; pieces: PieceInput[] } | { valid: false; error: string } {
  const normalized = text.replace(/^\uFEFF/, '')
  const lines = normalized.split(/\r?\n/).map((l) => l.trim())

  let versionOk = false
  let header: string[] | null = null

  for (const line of lines) {
    if (line === '' || line.startsWith('#')) {
      if (line.includes(VERSION)) versionOk = true
      continue
    }
    if (header === null) {
      header = parseCsvLine(line).map((v) => unescapeCsv(v).trim())
      break
    }
  }

  if (!versionOk) {
    return { valid: false, error: 'Archivo no reconocido: falta la cabecera de CutterNest Piezas' }
  }
  if (header === null) {
    return { valid: false, error: 'Archivo no valido: falta la fila de encabezados' }
  }
  const hasModulo = header.length === COLUMNS.length && headerMatches(header, COLUMNS)
  const baseOnly = header.length === BASE_COLUMNS.length && headerMatches(header, BASE_COLUMNS)
  if (!hasModulo && !baseOnly) {
    return { valid: false, error: `Archivo no valido: las columnas deben ser ${BASE_COLUMNS.join(', ')} (opcionalmente seguido de modulo)` }
  }

  const hasModuloCol = hasModulo

  const pieces: PieceInput[] = []
  let rowIndex = 0
  for (const line of lines) {
    if (line === '' || line.startsWith('#')) continue
    if (header === null || header.join(',') === line) {
      header = []
      continue
    }
    rowIndex++
    const values = parseCsvLine(line).map((v) => unescapeCsv(v).trim())
    const expectedCols = hasModuloCol ? COLUMNS.length : BASE_COLUMNS.length
    if (values.length !== expectedCols) {
      return { valid: false, error: `Fila ${rowIndex}: numero de columnas incorrecto` }
    }
    const [
      id,
      nombre,
      anchoStr,
      altoStr,
      cantidadStr,
      rotarStr,
      color,
      espesorStr,
      cantos,
      modulo,
    ] = hasModuloCol ? values : [...values, '']
    if (!nombre) {
      return { valid: false, error: `Fila ${rowIndex}: el nombre es obligatorio` }
    }
    const ancho = parseFloat(anchoStr)
    const alto = parseFloat(altoStr)
    const cantidad = parseInt(cantidadStr, 10)
    const espesor = parseFloat(espesorStr)
    if (Number.isNaN(ancho) || ancho <= 0) {
      return { valid: false, error: `Fila ${rowIndex}: ancho debe ser un numero positivo` }
    }
    if (Number.isNaN(alto) || alto <= 0) {
      return { valid: false, error: `Fila ${rowIndex}: alto debe ser un numero positivo` }
    }
    if (Number.isNaN(cantidad) || cantidad <= 0) {
      return { valid: false, error: `Fila ${rowIndex}: cantidad debe ser un entero positivo` }
    }
    if (Number.isNaN(espesor) || espesor <= 0) {
      return { valid: false, error: `Fila ${rowIndex}: espesor debe ser un numero positivo` }
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return { valid: false, error: `Fila ${rowIndex}: color debe ser hex de 6 digitos (ej. #FF6B6B)` }
    }
    if (rotarStr !== 'si' && rotarStr !== 'no') {
      return { valid: false, error: `Fila ${rowIndex}: rotar debe ser 'si' o 'no'` }
    }
    pieces.push({
      id: id || nombre.toLowerCase().replace(/\s+/g, '-'),
      nombre,
      ancho,
      alto,
      cantidad,
      rotar: rotarStr === 'si',
      color,
      espesor,
      cantos: cantos || '',
      modulo: modulo || undefined,
    })
  }

  return { valid: true, pieces }
}

export function downloadCsv(csv: string, filename = 'cutternest-piezas.csv'): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
