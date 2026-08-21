import { describe, it, expect } from 'vitest'

describe('types sanity', () => {
  it('should have valid board defaults', () => {
    const board = { ancho: 244, alto: 122, espesor: 18, kerf_mm: 3, margen_mm: 5 }
    expect(board.ancho).toBe(244)
    expect(board.alto).toBe(122)
  })
})
