import { describe, it, expect } from 'vitest'
import { groupPiecesForCantos, letrasCanto } from './cantoSummary'
import type { PieceInput } from '../types'

const pieza = (id: string, ancho: number, alto: number, cantidad = 1, cantos = '', espesor = 15): PieceInput => ({
  id, nombre: id, ancho, alto, cantidad, rotate: true, color: '#C19A6B', espesor, cantos,
})

describe('groupPiecesForCantos', () => {
  it('agrupa por ancho×alto×espesor y suma cantidades', () => {
    const grupos = groupPiecesForCantos([
      pieza('a', 644, 227, 2, 'T,B,L,R'),
      pieza('b', 644, 227, 3, 'T,B,L,R'),
      pieza('c', 600, 2400, 1, 'L'),
    ])
    expect(grupos).toHaveLength(2)
    expect(grupos[0].ancho).toBe(600) // mayor área primero
    expect(grupos[0].cantidad).toBe(1)
    expect(grupos[1].cantidad).toBe(5)
    expect(grupos[1].cantos).toBe('T,B,L,R')
  })

  it('detecta cantos distintos dentro de un grupo', () => {
    const grupos = groupPiecesForCantos([
      pieza('a', 644, 227, 1, 'T,B,L,R'),
      pieza('b', 644, 227, 1, 'B'),
    ])
    expect(grupos[0].variosCantos).toBe(true)
  })

  it('ignora piezas sin dimensiones y conserva el espesor en la clave', () => {
    const grupos = groupPiecesForCantos([
      pieza('a', 0, 100),
      pieza('b', 100, 100, 1, 'T', 15),
      pieza('c', 100, 100, 1, 'T', 18),
    ])
    expect(grupos).toHaveLength(2)
  })
})

describe('letrasCanto', () => {
  it('normaliza, filtra y deduplica', () => {
    expect(letrasCanto('t, b, L, R')).toEqual(['T', 'B', 'L', 'R'])
    expect(letrasCanto('b,b')).toEqual(['B'])
    expect(letrasCanto('X,')).toEqual([])
    expect(letrasCanto('')).toEqual([])
  })
})
