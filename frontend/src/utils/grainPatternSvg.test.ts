import { describe, it, expect } from 'vitest'

import {
  mulberry32,
  oscurecerHex,
  patronVetaId,
  patronVetaDef,
  defsPatronesVeta,
  type DireccionVeta,
} from './grainPatternSvg'

describe('grainPatternSvg — veta procedural para el plano de corte', () => {
  it('mulberry32 es determinista y vive en [0,1)', () => {
    const a = mulberry32(11)
    const b = mulberry32(11)
    const seq = Array.from({ length: 10 }, () => a())
    expect(seq).toEqual(Array.from({ length: 10 }, () => b()))
    for (const v of seq) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('oscurecerHex conserva formato y baja el brillo', () => {
    expect(oscurecerHex('#ffffff', 0.5)).toBe('#808080')
    expect(oscurecerHex('#C9A876', 0.5)).toBe('#65543b')
    expect(oscurecerHex('mal')).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('patronVetaId: estable, insensible a mayúsculas, distinto por dirección y variante', () => {
    expect(patronVetaId('#C19A6B', 'horizontal')).toBe(patronVetaId('#c19a6b', 'horizontal'))
    expect(patronVetaId('#c19a6b', 'horizontal')).not.toBe(patronVetaId('#c19a6b', 'vertical'))
    expect(patronVetaId('#c19a6b', 'horizontal')).not.toBe(patronVetaId('#c19a6b', 'horizontal', true))
  })

  it('patronVetaDef: determinista, 9 vetas, base solo cuando no es soloVetas, vertical rota', () => {
    const a = patronVetaDef('#c19a6b', 'horizontal')
    expect(a).toBe(patronVetaDef('#c19a6b', 'horizontal'))
    expect((a.match(/<path /g) || []).length).toBe(9)
    expect(a).toContain('fill="#c19a6b"')
    const soloVetas = patronVetaDef('#c19a6b', 'horizontal', { soloVetas: true })
    expect(soloVetas).not.toContain('fill="#c19a6b"')
    expect(patronVetaDef('#c19a6b', 'vertical')).toContain('patternTransform="rotate(90)"')
    // Otra semilla → otras vetas (misma estructura).
    expect(patronVetaDef('#c19a6b', 'horizontal', { semilla: 1 })).not.toBe(a)
  })

  it('defsPatronesVeta: deduplica pares y devuelve defs vacío sin piezas', () => {
    expect(defsPatronesVeta([])).toBe('')
    const pares: ReadonlyArray<readonly [string, DireccionVeta]> = [
      ['#c19a6b', 'horizontal'],
      ['#c19a6b', 'horizontal'],
      ['#8b5a2b', 'vertical'],
    ]
    const defs = defsPatronesVeta(pares)
    expect((defs.match(/<pattern /g) || []).length).toBe(2)
    expect(defs.startsWith('<defs>')).toBe(true)
  })
})
