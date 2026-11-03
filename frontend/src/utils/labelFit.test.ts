import { describe, it, expect } from 'vitest'
import { etiquetaPieza, truncarATexto } from './labelFit'

describe('etiquetaPieza — etiquetas adaptativas', () => {
  it('pieza grande: nombre + medidas en dos líneas, sin rotar', () => {
    const e = etiquetaPieza({ nombre: 'Lateral izquierdo M1', id: 'm1-lateral-izq', w: 240, h: 60 })
    expect(e).not.toBeNull()
    expect(e!.rotada).toBe(false)
    expect(e!.lineas[0]).toBe('Lateral izquierdo M1')
    expect(e!.lineas[1]).toContain('mm')
  })

  it('pieza mediana/pequeña: las MEDIDAS siempre visibles cuando caben', () => {
    const e = etiquetaPieza({ nombre: 'Fondo zapatera extraible 1 M1', id: 'm1zapatera1-fondo', w: 59, h: 6 })
    expect(e).not.toBeNull()
    expect(e!.rotada).toBe(false)
    // El nombre + medidas no caben a dos líneas, pero las medidas solas sí:
    // las piezas pequeñas muestran sus dimensiones.
    expect(e!.lineas).toHaveLength(1)
    expect(e!.lineas[0]).toContain('×')
  })

  it('pieza muy angosta pero alta: medidas rotadas', () => {
    const e = etiquetaPieza({ nombre: 'Lateral cajon 3 M1', id: 'm1cajon3-lateral-izq', w: 5.6, h: 60 })
    expect(e).not.toBeNull()
    expect(e!.rotada).toBe(true)
    expect(e!.lineas[0]).toContain('×')
  })

  it('pieza angosta y alta: texto rotado usando el alto como longitud', () => {
    const e = etiquetaPieza({ nombre: 'Ala inferior Gola C 3', id: 'm1gola-c3-ala-inf', w: 7.3, h: 64.6 })
    expect(e).not.toBeNull()
    expect(e!.rotada).toBe(true)
    expect(e!.lineas[0].length).toBeGreaterThan(0)
  })

  it('pieza diminuta: null (su descripción va en la leyenda/tooltip)', () => {
    const e = etiquetaPieza({ nombre: 'Division zapatera extraible 1 M1', id: 'm1zapatera1-division', w: 5, h: 2 })
    expect(e).toBeNull()
  })

  it('nunca desborda: ancho estimado de cada línea ≤ longitud disponible', () => {
    const casos = [
      { nombre: 'Base cajon 4 M1', id: 'm1cajon4-base', w: 59, h: 53 },
      { nombre: 'Lateral cajon 3 M1', id: 'm1cajon3-lateral-izq', w: 5.6, h: 60 },
      { nombre: 'Montante zocalo S1 1', id: 'glb-zocalo-s1-montante-1', w: 5.7, h: 10 },
    ]
    for (const c of casos) {
      const e = etiquetaPieza({ ...c, maxFont: 10, minFont: 3 })
      if (!e) continue
      const largo = e.rotada ? c.h : c.w
      const ancho = e.rotada ? c.w : c.h
      for (const linea of e.lineas) {
        expect(linea.length * e.fontSize * 0.58).toBeLessThanOrEqual(largo + 1e-6)
      }
      expect(e.lineas.length * e.fontSize * 1.25).toBeLessThanOrEqual(ancho + 1e-6)
    }
  })
})

describe('truncarATexto', () => {
  it('devuelve el texto intacto si cabe', () => {
    expect(truncarATexto('abc', 100, 10)).toBe('abc')
  })
  it('trunca con elipsis si no cabe', () => {
    const t = truncarATexto('abcdefghij', 30, 10) // 10 chars × 5.8 = 58 > 30
    expect(t).not.toBeNull()
    expect(t!).toContain('…')
    expect(t!.length * 10 * 0.58).toBeLessThanOrEqual(30 + 1e-6)
  })
  it('null si ni un carácter cabe', () => {
    expect(truncarATexto('abc', 3, 10)).toBeNull()
  })
})
