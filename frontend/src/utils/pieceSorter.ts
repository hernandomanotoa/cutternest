import type { PieceInput } from '../types'

// Clasificación por tipo de pieza (keyword del nombre, español de taller).
// El rank fija el orden de aparición en la tabla y en el empaquetado del
// optimizador: estructurales grandes primero, decorativas al final. La
// ITERACIÓN va de lo más específico a lo más genérico (zócalo antes que
// frente: "Zocalo marco frente" es zócalo).
const TIPO_KEYWORDS: Array<[number, string[], string]> = [
  [0, ['lateral', 'costado', 'montante'], 'Laterales / costados'],
  [7, ['zócalo', 'zocalo', 'plinth'], 'Zócalos'],
  [1, ['fondo', 'trasera'], 'Fondos / traseras'],
  [2, ['tapa'], 'Tapas'],
  [3, ['base'], 'Bases'],
  [6, ['división', 'division'], 'Divisiones'],
  [4, ['frente', 'puerta'], 'Frentes / puertas'],
  [5, ['repisa', 'estante', 'entrepaño', 'entrepano', 'maletero', 'amarre', 'travesaño', 'travesano'], 'Repisas / estantes'],
  [8, ['pata'], 'Patas'],
  [9, ['tirador', 'jaladera', 'manija'], 'Tiradores'],
]

export interface PieceType {
  rank: number
  label: string
}

export function classifyPieceType(piece: Pick<PieceInput, 'nombre'>): PieceType {
  const n = (piece.nombre || '').toLowerCase()
  for (const [rank, keywords, label] of TIPO_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return { rank, label }
  }
  return { rank: 5, label: 'Repisas / estantes' }
}

// Comparador: tipo de pieza y luego tamaño (área y lado largo descendentes).
export function byTipoTamano(a: PieceInput, b: PieceInput): number {
  const ta = classifyPieceType(a)
  const tb = classifyPieceType(b)
  if (ta.rank !== tb.rank) return ta.rank - tb.rank
  const areaA = a.ancho * a.alto
  const areaB = b.ancho * b.alto
  if (areaA !== areaB) return areaB - areaA
  return Math.max(b.ancho, b.alto) - Math.max(a.ancho, a.alto)
}

export function byTamano(a: PieceInput, b: PieceInput): number {
  const areaA = a.ancho * a.alto
  const areaB = b.ancho * b.alto
  if (areaA !== areaB) return areaB - areaA
  return Math.max(b.ancho, b.alto) - Math.max(a.ancho, a.alto)
}

export type SortMode = 'manual' | 'tipo' | 'tamano'

// Índices de visualización en el orden pedido (la fuente de verdad, `piezas`,
// nunca se muta: las ediciones mapean de vuelta al índice original).
export function displayOrder(pieces: PieceInput[], mode: SortMode): number[] {
  const idx = pieces.map((_, i) => i)
  if (mode === 'tipo') idx.sort((a, b) => byTipoTamano(pieces[a], pieces[b]))
  else if (mode === 'tamano') idx.sort((a, b) => byTamano(pieces[a], pieces[b]))
  return idx
}

export function sortPieces(pieces: PieceInput[], mode: Exclude<SortMode, 'manual'>): PieceInput[] {
  return [...pieces].sort(mode === 'tipo' ? byTipoTamano : byTamano)
}
