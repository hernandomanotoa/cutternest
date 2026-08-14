import type { PieceInput } from '../types'

export interface PieceGroup {
  key: string
  ancho: number
  alto: number
  espesor: number
  cantidad: number
  nombres: string[]
  colores: string[]
}

export function groupPiecesByDimensions(pieces: PieceInput[]): PieceGroup[] {
  const map = new Map<string, PieceGroup>()
  for (const p of pieces) {
    const key = `${p.ancho.toFixed(3)}|${p.alto.toFixed(3)}|${p.espesor.toFixed(3)}`
    const existing = map.get(key)
    if (existing) {
      existing.cantidad += p.cantidad
      if (!existing.nombres.includes(p.nombre)) existing.nombres.push(p.nombre)
      if (!existing.colores.includes(p.color)) existing.colores.push(p.color)
    } else {
      map.set(key, {
        key,
        ancho: p.ancho,
        alto: p.alto,
        espesor: p.espesor,
        cantidad: p.cantidad,
        nombres: [p.nombre],
        colores: [p.color],
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad)
}

export function totalPieces(pieces: PieceInput[]): number {
  return pieces.reduce((sum, p) => sum + p.cantidad, 0)
}
