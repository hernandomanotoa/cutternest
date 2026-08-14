import type { PieceInput } from '../types'

const STORAGE_KEY = 'cutternest-pieces-template'

export function loadTemplate(fallback: PieceInput[]): PieceInput[] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as PieceInput[]
    if (!Array.isArray(parsed)) return fallback
    return parsed
  } catch {
    return fallback
  }
}

export function saveTemplate(pieces: PieceInput[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pieces))
}

export function clearTemplate(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function hasTemplate(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) !== null
}
