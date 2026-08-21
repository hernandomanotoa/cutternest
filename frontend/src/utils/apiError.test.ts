import { describe, it, expect } from 'vitest'
import { getApiErrorMessage } from './apiError'

describe('getApiErrorMessage', () => {
  it('returns detail string when only detail is present', () => {
    const err = { response: { data: { detail: 'Campo requerido' } } }
    expect(getApiErrorMessage(err)).toBe('Campo requerido')
  })

  it('prepends code to detail message', () => {
    const err = { response: { data: { detail: 'La pieza excede el tablero', code: 'PIECE_TOO_LARGE' } } }
    expect(getApiErrorMessage(err)).toBe('[PIECE_TOO_LARGE] La pieza excede el tablero')
  })

  it('handles array details with code prefix', () => {
    const err = { response: { data: { detail: ['Falta ancho', 'Falta alto'], code: 'VALIDATION_ERROR' } } }
    expect(getApiErrorMessage(err)).toBe('[VALIDATION_ERROR] Falta ancho, Falta alto')
  })

  it('falls back to err.message', () => {
    const err = { message: 'Network error' }
    expect(getApiErrorMessage(err)).toBe('Network error')
  })

  it('returns default for null input', () => {
    expect(getApiErrorMessage(null)).toBe('Error desconocido')
  })
})
