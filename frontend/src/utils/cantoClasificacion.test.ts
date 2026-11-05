import { describe, it, expect } from 'vitest'
import {
  CATEGORIAS_CANTO,
  categoriaCanto,
  cantosParaCategoria,
  clasificarCantos,
  ladosLargo,
  metrosCanto,
} from './cantoClasificacion'
import type { PieceInput } from '../types'

const pieza = (ancho: number, alto: number, cantos = '', cantidad = 1): PieceInput => ({
  id: `${ancho}x${alto}`, nombre: 'P', ancho, alto, cantidad, rotate: true,
  color: '#C19A6B', espesor: 15, cantos,
})

describe('categorización de cantos (9 categorías)', () => {
  it('cubre las 9 categorías (pieza apaisada 644×227: T,B largos; L,R cortos)', () => {
    const casos: Array<[string, number]> = [
      ['', 0],              // Sin laminar
      ['L', 1],             // 1 Corto
      ['L,R', 2],           // 2 Cortos
      ['T', 3],             // 1 Largo
      ['T,B', 4],           // 2 Largos
      ['T,L', 5],           // 1 Largo + 1 Corto
      ['T,B,L', 6],         // 2 Largos + 1 Corto
      ['T,L,R', 7],         // 1 Largo + 2 Cortos
      ['T,B,L,R', 8],       // 4 Lados
    ]
    for (const [cantos, esperada] of casos) {
      expect(categoriaCanto(cantos, 644, 227)).toBe(esperada)
      expect(CATEGORIAS_CANTO[esperada]).toBeTruthy()
    }
  })

  it('pieza vertical (600×2400): L,R largos; T,B cortos', () => {
    expect(categoriaCanto('L', 600, 2400)).toBe(3) // 1 Largo
    expect(categoriaCanto('T,B', 600, 2400)).toBe(2) // 2 Cortos
    expect(categoriaCanto('L,T', 600, 2400)).toBe(5)
    expect(ladosLargo(600, 2400).has('L')).toBe(true)
    expect(ladosLargo(600, 2400).has('T')).toBe(false)
  })
})

describe('metros lineales de tapacanto', () => {
  it('suma las aristas canteadas con su longitud real por unidad', () => {
    // 644×227, cantos T,B,L,R: 2×644 + 2×227 = 1742 mm × 3 und = 5226 mm
    expect(metrosCanto(pieza(644, 227, 'T,B,L,R', 3))).toBeCloseTo(5.226)
    // 600×2400, canto L (arista larga 2400) × 2 und
    expect(metrosCanto(pieza(600, 2400, 'L', 2))).toBeCloseTo(4.8)
    expect(metrosCanto(pieza(600, 2400, '', 2))).toBe(0)
  })
})

describe('clasificarCantos', () => {
  it('agrupa por categoría+medidas+cantos y suma unidades y metros', () => {
    const r = clasificarCantos([
      pieza(644, 227, 'T,B,L,R', 2),
      pieza(644, 227, 'T,B,L,R', 1),
      pieza(600, 2400, 'L', 10),
      pieza(650, 585, '', 4),
    ])
    expect(r.filas).toHaveLength(3)
    const porCat = (c: number) => r.filas.filter((f) => f.categoria === c)
    expect(porCat(0)[0].unidades).toBe(4) // Sin laminar
    expect(porCat(3)[0].unidades).toBe(10) // 1 Largo (600×2400, 'L/R')
    expect(porCat(3)[0].cantos).toBe('L/R')
    expect(porCat(8)[0].unidades).toBe(3) // 4 Lados
    expect(r.totalUnidades).toBe(17)
    // lateral 10×2400 mm = 24 m + frentes 3×1742 mm = 5.226 m
    expect(r.totalMetros).toBeCloseTo(24 + 5.226)
  })

  it('lado indistinto (T=B, L=R): piezas que difieren solo en el lado del par suman en la misma fila', () => {
    const r = clasificarCantos([
      pieza(650, 585, 'B', 3), // apaisada: B es largo
      pieza(650, 585, 'T', 2), // mismo par → misma fila
      pieza(400, 300, 'L', 1), // apaisada: L es corto
      pieza(400, 300, 'R', 4), // mismo par → misma fila
    ])
    expect(r.filas).toHaveLength(2)
    const filaLargo = r.filas.find((f) => f.categoria === 3)
    expect(filaLargo?.cantos).toBe('T/B')
    expect(filaLargo?.unidades).toBe(5)
    expect(filaLargo?.metros).toBeCloseTo(5 * 650 / 1000)
    const filaCorta = r.filas.find((f) => f.categoria === 1)
    expect(filaCorta?.cantos).toBe('L/R')
    expect(filaCorta?.unidades).toBe(5)
    expect(filaCorta?.metros).toBeCloseTo(5 * 300 / 1000)
  })
})

describe('cantosParaCategoria (edición masiva: categoría + medidas → letras)', () => {
  it('pieza apaisada 646×585 (T/B largos, L/R cortos; B = frente primero)', () => {
    expect(cantosParaCategoria(0, 646, 585)).toBe('')
    expect(cantosParaCategoria(1, 646, 585)).toBe('L')
    expect(cantosParaCategoria(2, 646, 585)).toBe('L,R')
    expect(cantosParaCategoria(3, 646, 585)).toBe('B')
    expect(cantosParaCategoria(4, 646, 585)).toBe('B,T')
    expect(cantosParaCategoria(5, 646, 585)).toBe('B,L')
    expect(cantosParaCategoria(6, 646, 585)).toBe('B,T,L')
    expect(cantosParaCategoria(7, 646, 585)).toBe('B,L,R')
    expect(cantosParaCategoria(8, 646, 585)).toBe('B,T,L,R')
  })

  it('pieza vertical 600×2380 (L/R largos, T/B cortos)', () => {
    expect(cantosParaCategoria(3, 600, 2380)).toBe('L')
    expect(cantosParaCategoria(4, 600, 2380)).toBe('L,R')
    expect(cantosParaCategoria(1, 600, 2380)).toBe('B')
    expect(cantosParaCategoria(7, 600, 2380)).toBe('L,B,T')
    expect(cantosParaCategoria(8, 600, 2380)).toBe('L,R,B,T')
  })

  it('redondeo: la categoría de las letras generadas es la pedida (idempotencia)', () => {
    for (let cat = 0; cat < 9; cat++) {
      for (const [w, h] of [[646, 585], [600, 2380], [500, 500]] as const) {
        expect(categoriaCanto(cantosParaCategoria(cat, w, h), w, h)).toBe(cat)
      }
    }
  })
})
