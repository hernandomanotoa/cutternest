import { describe, it, expect } from 'vitest'
import { groupPiecesByDimensions, totalPieces } from './pieceCounter'
import type { PieceInput } from '../types'

describe('pieceCounter', () => {
  const pieces: PieceInput[] = [
    { id: 'a', nombre: 'Base', ancho: 120, alto: 60, cantidad: 2, rotar: true, color: '#FF6B6B', espesor: 18, cantos: '' },
    { id: 'b', nombre: 'Tapa', ancho: 120, alto: 60, cantidad: 1, rotar: true, color: '#4ECDC4', espesor: 18, cantos: '' },
    { id: 'c', nombre: 'Lateral', ancho: 50, alto: 180, cantidad: 3, rotar: false, color: '#45B7D1', espesor: 18, cantos: '' },
    { id: 'd', nombre: 'Lateral 2', ancho: 50, alto: 180, cantidad: 1, rotar: false, color: '#45B7D1', espesor: 15, cantos: '' },
  ]

  it('totals piece quantities', () => {
    expect(totalPieces(pieces)).toBe(7)
  })

  it('groups by ancho, alto and espesor', () => {
    const groups = groupPiecesByDimensions(pieces)
    expect(groups).toHaveLength(3)
    const g120x60x18 = groups.find((g) => g.ancho === 120 && g.alto === 60 && g.espesor === 18)
    expect(g120x60x18?.cantidad).toBe(3)
    expect(g120x60x18?.nombres).toEqual(['Base', 'Tapa'])
    const g50x180x18 = groups.find((g) => g.ancho === 50 && g.alto === 180 && g.espesor === 18)
    expect(g50x180x18?.cantidad).toBe(3)
    expect(g50x180x18?.nombres).toEqual(['Lateral'])
    const g50x180x15 = groups.find((g) => g.ancho === 50 && g.alto === 180 && g.espesor === 15)
    expect(g50x180x15?.cantidad).toBe(1)
  })

  it('sorts groups by quantity descending', () => {
    const groups = groupPiecesByDimensions(pieces)
    expect(groups[0].cantidad).toBeGreaterThanOrEqual(groups[1].cantidad)
  })
})
