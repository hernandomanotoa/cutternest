import { describe, it, expect, beforeEach } from 'vitest'
import { loadTemplate, saveTemplate, clearTemplate, hasTemplate } from './pieceTemplate'
import type { PieceInput } from '../types'

const sample: PieceInput[] = [
  { id: 'a', nombre: 'Base', ancho: 120, alto: 60, cantidad: 1, rotar: true, color: '#FF6B6B', espesor: 18, cantos: '' },
]

describe('pieceTemplate localStorage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns fallback when no template is stored', () => {
    expect(loadTemplate(sample)).toEqual(sample)
    expect(hasTemplate()).toBe(false)
  })

  it('saves and loads a template', () => {
    saveTemplate(sample)
    expect(hasTemplate()).toBe(true)
    expect(loadTemplate([])).toEqual(sample)
  })

  it('clears the template', () => {
    saveTemplate(sample)
    clearTemplate()
    expect(hasTemplate()).toBe(false)
    expect(loadTemplate(sample)).toEqual(sample)
  })

  it('returns fallback on invalid JSON', () => {
    window.localStorage.setItem('cutternest-pieces-template', 'not-json')
    expect(loadTemplate(sample)).toEqual(sample)
  })
})
