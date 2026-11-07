import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  usePieceStates,
  pieceStatesReducer,
  canTransition,
  loadPieceStates,
  savePieceStates,
  storageKeyFor,
  PIECE_STATES,
} from './usePieceStates'

describe('canTransition / pieceStatesReducer', () => {
  it('permite el flujo completo pendiente → cortada → cantada → lista', () => {
    let state = pieceStatesReducer({}, { type: 'set', pieceId: 'p1', estado: 'cortada' })
    state = pieceStatesReducer(state, { type: 'set', pieceId: 'p1', estado: 'cantada' })
    state = pieceStatesReducer(state, { type: 'set', pieceId: 'p1', estado: 'lista' })
    expect(state).toEqual({ p1: 'lista' })
  })

  it('permite retroceder un paso para corregir', () => {
    let state = pieceStatesReducer({}, { type: 'set', pieceId: 'p1', estado: 'cantada' })
    state = pieceStatesReducer(state, { type: 'set', pieceId: 'p1', estado: 'cortada' })
    expect(state).toEqual({ p1: 'cortada' })
  })

  it('ignora transiciones inválidas (saltos hacia adelante)', () => {
    const state = pieceStatesReducer({}, { type: 'set', pieceId: 'p1', estado: 'lista' })
    expect(state).toEqual({})
  })

  it('ignora transiciones inválidas desde un estado intermedio', () => {
    let state = pieceStatesReducer({}, { type: 'set', pieceId: 'p1', estado: 'cortada' })
    state = pieceStatesReducer(state, { type: 'set', pieceId: 'p1', estado: 'lista' })
    expect(state).toEqual({ p1: 'cortada' })
  })

  it('no repite estado válido para cada uno de los 4 estados', () => {
    for (const estado of PIECE_STATES) {
      expect(canTransition(estado, estado)).toBe(true)
    }
  })
})

describe('persistencia loadPieceStates / savePieceStates', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('guarda y recarga el mapa de estados por proyecto', () => {
    savePieceStates('p1', { base: 'cortada', tapa: 'lista' })
    expect(loadPieceStates('p1')).toEqual({ base: 'cortada', tapa: 'lista' })
  })

  it('usa una clave distinta por proyecto', () => {
    savePieceStates('p1', { base: 'cortada' })
    expect(loadPieceStates('p2')).toEqual({})
    expect(storageKeyFor('p1')).not.toBe(storageKeyFor('p2'))
  })

  it('descarta valores corruptos o estados desconocidos', () => {
    window.localStorage.setItem(
      storageKeyFor('p1'),
      JSON.stringify({ ok: 'cantada', mal: 'inexistente', otro: 42 })
    )
    expect(loadPieceStates('p1')).toEqual({ ok: 'cantada' })
  })

  it('sin proyecto devuelve mapa vacío', () => {
    expect(loadPieceStates(null)).toEqual({})
  })
})

describe('usePieceStates', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('marca estados y persiste en localStorage', () => {
    const { result } = renderHook(() => usePieceStates('p1'))
    expect(result.current.enabled).toBe(true)
    expect(result.current.getEstado('base')).toBe('pendiente')

    act(() => result.current.setEstado('base', 'cortada'))

    expect(result.current.getEstado('base')).toBe('cortada')
    expect(loadPieceStates('p1')).toEqual({ base: 'cortada' })
  })

  it('sin proyecto queda deshabilitado y setEstado no persiste', () => {
    const { result } = renderHook(() => usePieceStates(null))
    expect(result.current.enabled).toBe(false)
    act(() => result.current.setEstado('base', 'cortada'))
    expect(result.current.getEstado('base')).toBe('pendiente')
    expect(window.localStorage.getItem(storageKeyFor('null'))).toBeNull()
  })

  it('recarga los estados al cambiar de proyecto', () => {
    savePieceStates('p1', { base: 'lista' })
    const { result, rerender } = renderHook(
      ({ pid }) => usePieceStates(pid),
      { initialProps: { pid: 'p1' as string | null } }
    )
    expect(result.current.getEstado('base')).toBe('lista')
    rerender({ pid: 'p2' })
    expect(result.current.getEstado('base')).toBe('pendiente')
  })
})
