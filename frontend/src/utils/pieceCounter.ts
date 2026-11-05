import type { PieceInput } from '../types'
import { CATEGORIAS_CANTO, cantosCanonicos, categoriaCanto } from './cantoClasificacion'

export interface PatronCantos {
  /** Forma canónica lado-indistinta: 'T/B', 'T,B', 'T,B,L/R', '' (sin laminar). */
  patron: string
  unidades: number
  categoria: number
}

export interface PieceGroup {
  key: string
  ancho: number
  alto: number
  espesor: number
  cantidad: number
  nombres: string[]
  colores: string[]
  /** Patrones de canto del grupo (lado indistinto) con sus unidades. */
  cantos: PatronCantos[]
}

export function groupPiecesByDimensions(pieces: PieceInput[]): PieceGroup[] {
  const map = new Map<string, PieceGroup>()
  for (const p of pieces) {
    const key = `${p.ancho.toFixed(3)}|${p.alto.toFixed(3)}|${p.espesor.toFixed(3)}`
    const canonico = cantosCanonicos(p.cantos || '')
    const categoria = categoriaCanto(p.cantos || '', p.ancho, p.alto)
    const existing = map.get(key)
    if (existing) {
      existing.cantidad += p.cantidad
      if (!existing.nombres.includes(p.nombre)) existing.nombres.push(p.nombre)
      if (!existing.colores.includes(p.color)) existing.colores.push(p.color)
      const patron = existing.cantos.find((c) => c.patron === canonico)
      if (patron) patron.unidades += p.cantidad
      else existing.cantos.push({ patron: canonico, unidades: p.cantidad, categoria })
    } else {
      map.set(key, {
        key,
        ancho: p.ancho,
        alto: p.alto,
        espesor: p.espesor,
        cantidad: p.cantidad,
        nombres: [p.nombre],
        colores: [p.color],
        cantos: [{ patron: canonico, unidades: p.cantidad, categoria }],
      })
    }
  }
  const groups = Array.from(map.values())
  for (const g of groups) {
    g.cantos.sort((a, b) => b.unidades - a.unidades)
  }
  return groups.sort((a, b) => b.cantidad - a.cantidad)
}

/** Etiqueta corta de la clasificación (9 categorías) para tooltips/leyendas. */
export function nombreCategoria(categoria: number): string {
  return CATEGORIAS_CANTO[categoria] ?? ''
}

export function totalPieces(pieces: PieceInput[]): number {
  return pieces.reduce((sum, p) => sum + p.cantidad, 0)
}
