import { describe, it, expect } from 'vitest'
import {
  classifyPieceType,
  byTipoTamano,
  displayOrder,
  sortPieces,
  type SortMode,
} from './pieceSorter'
import type { PieceInput } from '../types'

const pieza = (nombre: string, ancho: number, alto: number): PieceInput => ({
  id: nombre.toLowerCase().replace(/\s+/g, '-'),
  nombre,
  ancho,
  alto,
  cantidad: 1,
  rotate: true,
  color: '#3B82F6',
  espesor: 18,
  cantos: '',
})

describe('classifyPieceType', () => {
  it('clasifica por keyword del nombre (español de taller)', () => {
    expect(classifyPieceType(pieza('Lateral izquierdo M1', 600, 2400)).rank).toBe(0)
    expect(classifyPieceType(pieza('Fondo modulo M1', 820, 2220)).rank).toBe(1)
    expect(classifyPieceType(pieza('Frente [estandar] cajon 1', 818, 227)).rank).toBe(4)
    expect(classifyPieceType(pieza('Repisa 1 M1', 820, 585)).rank).toBe(5)
    expect(classifyPieceType(pieza('Zocalo marco frente', 820, 100)).rank).toBe(7)
    expect(classifyPieceType(pieza('Tirador cajon 1', 120, 20)).rank).toBe(9)
  })

  it('desconocida cae al grupo de repisas/estantes (rank 5)', () => {
    expect(classifyPieceType(pieza('Pieza rara', 100, 100)).rank).toBe(5)
  })
})

describe('byTipoTamano', () => {
  it('ordena por tipo primero y luego por área descendente', () => {
    const laterales = [pieza('Lateral chico', 400, 1200), pieza('Lateral grande', 600, 2400)]
    const frente = pieza('Frente cajon 1', 818, 227)
    const sorted = [frente, ...laterales].sort(byTipoTamano)
    expect(sorted[0].nombre).toBe('Lateral grande')
    expect(sorted[1].nombre).toBe('Lateral chico')
    expect(sorted[2].nombre).toBe('Frente cajon 1')
  })
})

describe('displayOrder', () => {
  const piezas = [
    pieza('Tirador', 150, 30),
    pieza('Lateral izquierdo', 600, 2400),
    pieza('Estante 1', 900, 300),
    pieza('Lateral derecho', 600, 2400),
  ]

  it("'manual' conserva el orden original", () => {
    expect(displayOrder(piezas, 'manual' as SortMode)).toEqual([0, 1, 2, 3])
  })

  it("'tipo' ordena laterales primero manteniendo los índices originales", () => {
    const order = displayOrder(piezas, 'tipo')
    expect(order[0]).toBe(1) // Lateral izquierdo
    expect(order[1]).toBe(3) // Lateral derecho
    expect(order[2]).toBe(2) // Estante
    expect(order[3]).toBe(0) // Tirador
    // Es una permutación completa: ningún índice se pierde ni se repite.
    expect([...order].sort()).toEqual([0, 1, 2, 3])
  })

  it("'tamano' ordena por área descendente", () => {
    const order = displayOrder(piezas, 'tamano')
    expect(order[0]).toBe(1) // 600x2400
    expect(order[3]).toBe(0) // 150x30
  })
})

describe('sortPieces', () => {
  it('devuelve una copia ordenada sin mutar la entrada', () => {
    const piezas = [pieza('Tirador', 150, 30), pieza('Lateral', 600, 2400)]
    const sorted = sortPieces(piezas, 'tipo')
    expect(sorted[0].nombre).toBe('Lateral')
    expect(piezas[0].nombre).toBe('Tirador')
  })
})
