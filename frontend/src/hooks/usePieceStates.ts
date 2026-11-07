import { useCallback, useEffect, useState } from 'react'

// Estados de avance de una pieza en el taller.
// Flujo: pendiente → cortada → cantada → lista.
export type PieceState = 'pendiente' | 'cortada' | 'cantada' | 'lista'

export const PIECE_STATES: PieceState[] = ['pendiente', 'cortada', 'cantada', 'lista']

export const PIECE_STATE_LABELS: Record<PieceState, string> = {
  pendiente: 'Pendiente',
  cortada: 'Cortada',
  cantada: 'Cantada',
  lista: 'Lista',
}

// Transiciones permitidas: siempre hacia adelante, y un paso atrás para
// corregir errores de marcado sin perder el resto del avance.
const TRANSICIONES: Record<PieceState, PieceState[]> = {
  pendiente: ['cortada'],
  cortada: ['cantada', 'pendiente'],
  cantada: ['lista', 'cortada'],
  lista: ['cantada'],
}

export type PieceStatesMap = Record<string, PieceState>

export interface PieceStateAction {
  type: 'set'
  pieceId: string
  estado: PieceState
}

export function canTransition(from: PieceState | undefined, to: PieceState): boolean {
  const actual: PieceState = from ?? 'pendiente'
  if (actual === to) return true
  return TRANSICIONES[actual].includes(to)
}

// Reducer puro: ignora las transiciones inválidas (devuelve el estado sin
// cambios) para que la UI no pueda saltarse el flujo del taller.
export function pieceStatesReducer(
  state: PieceStatesMap,
  action: PieceStateAction
): PieceStatesMap {
  if (action.type !== 'set') return state
  if (!canTransition(state[action.pieceId], action.estado)) return state
  return { ...state, [action.pieceId]: action.estado }
}

export function storageKeyFor(projectId: string): string {
  return `cutternest-piece-states-${projectId}`
}

export function loadPieceStates(projectId: string | null): PieceStatesMap {
  if (!projectId || typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(storageKeyFor(projectId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const map: PieceStatesMap = {}
    for (const [id, estado] of Object.entries(parsed)) {
      if (typeof estado === 'string' && (PIECE_STATES as string[]).includes(estado)) {
        map[id] = estado as PieceState
      }
    }
    return map
  } catch {
    return {}
  }
}

export function savePieceStates(projectId: string, states: PieceStatesMap) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKeyFor(projectId), JSON.stringify(states))
  } catch { /* sin storage: los estados viven solo en memoria */ }
}

// Estados de pieza por proyecto. Persiste en localStorage bajo
// `cutternest-piece-states-{projectId}`; sin proyecto el hook queda
// deshabilitado (enabled=false) y setEstado no-op.
export function usePieceStates(projectId: string | null) {
  const [states, setStates] = useState<PieceStatesMap>(() => loadPieceStates(projectId))

  useEffect(() => {
    setStates(loadPieceStates(projectId))
  }, [projectId])

  const setEstado = useCallback(
    (pieceId: string, estado: PieceState) => {
      if (!projectId || !pieceId) return
      setStates((prev) => {
        const next = pieceStatesReducer(prev, { type: 'set', pieceId, estado })
        if (next !== prev) savePieceStates(projectId, next)
        return next
      })
    },
    [projectId]
  )

  const getEstado = useCallback(
    (pieceId: string): PieceState => states[pieceId] ?? 'pendiente',
    [states]
  )

  return { states, getEstado, setEstado, enabled: Boolean(projectId) }
}
