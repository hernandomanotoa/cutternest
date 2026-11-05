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

  it('agrupa por medidas + clasificación: cantos distintos → registros adicionales', () => {
    const conCantos: PieceInput[] = [
      // laterales: 3 con T,B,L + 2 con T,B,R → MISMA clasificación
      // (600×2380: L/R largos, T/B cortos → 1 Largo + 2 Cortos) y MISMO par
      // canónico: un solo registro de 5 und.
      { id: 'li', nombre: 'Lateral izq', ancho: 500, alto: 1800, cantidad: 3, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,L' },
      { id: 'ld', nombre: 'Lateral der', ancho: 500, alto: 1800, cantidad: 2, rotate: false, color: '#45B7D1', espesor: 18, cantos: 'T,B,R' },
      // mismas medidas pero sin laminar → clasificación distinta (Sin
      // laminar) → registro ADICIONAL, no se mezcla con el anterior.
      { id: 'fo', nombre: 'Fondo', ancho: 500, alto: 1800, cantidad: 4, rotate: false, color: '#F2F2F2', espesor: 18, cantos: '' },
    ]
    const groups = groupPiecesByDimensions(conCantos)
    expect(groups).toHaveLength(2)
    const sinLaminar = groups.find((g) => g.cantos[0].categoria === 0)!
    expect(sinLaminar.cantidad).toBe(4)
    expect(sinLaminar.cantos).toEqual([{ patron: '', unidades: 4, categoria: 0 }])
    const cantedos = groups.find((g) => g.cantos[0].categoria === 7)!
    expect(cantedos.cantidad).toBe(5)
    expect(cantedos.cantos).toEqual([{ patron: 'T,B,L/R', unidades: 5, categoria: 7 }])
    expect(nombreCategoria(cantedos.cantos[0].categoria)).toBe('1 Largo + 2 Cortos')
  })

  it('mismas medidas con clasificación largo/corto distinta → registros separados', () => {
    // 646×585 (apaisada: T/B largos, L/R cortos): 'T,B' = 2 Largos;
    // 'L,R' = 2 Cortos. Clasificaciones distintas pese a medidas idénticas.
    const mixtas: PieceInput[] = [
      { id: 'r', nombre: 'Repisa', ancho: 646, alto: 585, cantidad: 2, rotate: false, color: '#D9C2A3', espesor: 15, cantos: 'T,B' },
      { id: 'm', nombre: 'Montante', ancho: 646, alto: 585, cantidad: 3, rotate: false, color: '#C19A6B', espesor: 15, cantos: 'L,R' },
    ]
    const groups = groupPiecesByDimensions(mixtas)
    expect(groups).toHaveLength(2)
    const dosLargos = groups.find((g) => g.cantos[0].categoria === 4)!
    expect(dosLargos.cantidad).toBe(2)
    expect(dosLargos.cantos[0].patron).toBe('T,B')
    const dosCortos = groups.find((g) => g.cantos[0].categoria === 2)!
    expect(dosCortos.cantidad).toBe(3)
    expect(dosCortos.cantos[0].patron).toBe('L,R')
  })
})
