import { describe, it, expect } from 'vitest'
import { groupPiecesByDimensions, nombreCategoria, totalPieces } from './pieceCounter'
import type { PieceInput } from '../types'

describe('pieceCounter', () => {
  const pieces: PieceInput[] = [
    { id: 'a', nombre: 'Base', ancho: 1200, alto: 600, cantidad: 2, rotate: true, color: '#FF6B6B', espesor: 18, cantos: '' },
    { id: 'b', nombre: 'Tapa', ancho: 1200, alto: 600, cantidad: 1, rotate: true, color: '#4ECDC4', espesor: 18, cantos: '' },
    { id: 'c', nombre: 'Lateral', ancho: 500, alto: 1800, cantidad: 3, rotate: false, color: '#45B7D1', espesor: 18, cantos: '' },
    { id: 'd', nombre: 'Lateral 2', ancho: 500, alto: 1800, cantidad: 1, rotate: false, color: '#45B7D1', espesor: 15, cantos: '' },
  ]

  it('totals piece quantities', () => {
    expect(totalPieces(pieces)).toBe(7)
  })

  it('groups by ancho, alto and espesor', () => {
    const groups = groupPiecesByDimensions(pieces)
    expect(groups).toHaveLength(3)
    const g1200x600x18 = groups.find((g) => g.ancho === 1200 && g.alto === 600 && g.espesor === 18)
    expect(g1200x600x18?.cantidad).toBe(3)
    expect(g1200x600x18?.nombres).toEqual(['Base', 'Tapa'])
    const g500x1800x18 = groups.find((g) => g.ancho === 500 && g.alto === 1800 && g.espesor === 18)
    expect(g500x1800x18?.cantidad).toBe(3)
    expect(g500x1800x18?.nombres).toEqual(['Lateral'])
    const g500x1800x15 = groups.find((g) => g.ancho === 500 && g.alto === 1800 && g.espesor === 15)
    expect(g500x1800x15?.cantidad).toBe(1)
  })

  it('sorts groups by quantity descending', () => {
    const groups = groupPiecesByDimensions(pieces)
    expect(groups[0].cantidad).toBeGreaterThanOrEqual(groups[1].cantidad)
  })

  it('agrupa los cantos por par canónico (T=B, L=R) con su clasificación', () => {
    const conCantos: PieceInput[] = [
      // laterales: 3 con T,B,L + 2 con T,B,R → un solo patrón T,B,L/R (5 und)
      { id: 'li', nombre: 'Lateral izq', ancho: 500, alto: 1800, cantidad: 3, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,L' },
      { id: 'ld', nombre: 'Lateral der', ancho: 500, alto: 1800, cantidad: 2, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,R' },
      // mismas medidas pero sin laminar → segundo patrón en el mismo grupo
      { id: 'fo', nombre: 'Fondo', ancho: 500, alto: 1800, cantidad: 4, rotate: false, color: '#F2F2F2', espesor: 18, cantos: '' },
    ]
    const groups = groupPiecesByDimensions(conCantos)
    expect(groups).toHaveLength(1)
    const g = groups[0]
    expect(g.cantidad).toBe(9)
    expect(g.cantos).toHaveLength(2)
    expect(g.cantos[0]).toEqual({ patron: 'T,B,L/R', unidades: 5, categoria: 7 })
    expect(nombreCategoria(g.cantos[0].categoria)).toBe('1 Largo + 2 Cortos')
    expect(g.cantos[1]).toEqual({ patron: '', unidades: 4, categoria: 0 })
  })
})
