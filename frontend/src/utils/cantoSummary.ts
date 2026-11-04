import type { PieceInput } from '../types'

// Agrupamiento para la pestaña «Cantos»: mismos grupos por dimensiones que
// la columna «Rot.» (ancho × alto × espesor), con la cantidad total y los
// cantos representativos del grupo.

export interface CantoSummaryGroup {
  key: string
  ancho: number
  alto: number
  espesor: number
  /** cantidad total de piezas del grupo (suma de unidades) */
  cantidad: number
  /** cantos representativos (los del primer integrante; '' si no hay) */
  cantos: string
  /** true si las piezas del grupo tienen cantos distintos entre sí */
  variosCantos: boolean
}

export function groupPiecesForCantos(pieces: PieceInput[]): CantoSummaryGroup[] {
  const map = new Map<string, CantoSummaryGroup & { vistos: Set<string> }>()
  for (const p of pieces) {
    if (!(Number(p.ancho) > 0) || !(Number(p.alto) > 0)) continue
    const key = `${Number(p.ancho)}|${Number(p.alto)}|${Number(p.espesor)}`
    const cantos = (p.cantos || '').trim()
    const existente = map.get(key)
    if (existente) {
      existente.cantidad += Math.max(1, Number(p.cantidad) || 1)
      existente.vistos.add(cantos)
      existente.variosCantos = existente.vistos.size > 1
      if (!existente.cantos && cantos) existente.cantos = cantos
    } else {
      map.set(key, {
        key,
        ancho: Number(p.ancho),
        alto: Number(p.alto),
        espesor: Number(p.espesor),
        cantidad: Math.max(1, Number(p.cantidad) || 1),
        cantos,
        variosCantos: false,
        vistos: new Set([cantos]),
      })
    }
  }
  return [...map.values()]
    .map(({ vistos: _vistos, ...grupo }) => grupo)
    .sort((a, b) => b.ancho * b.alto - a.ancho * a.alto)
}

/** Letras de canto válidas y normalizadas (mayúsculas, sin vacíos). */
export function letrasCanto(cantos: string): string[] {
  return [...new Set(
    (cantos || '').split(',').map((s) => s.trim().toUpperCase()).filter((l) => l.length === 1 && 'TBLR'.includes(l))
  )]
}
