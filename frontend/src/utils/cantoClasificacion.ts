import type { PieceInput } from '../types'
import { letrasCanto } from './cantoSummary'

// Clasificación de cantos en 9 categorías (spec del taller): se cuenta
// cuántas aristas canteadas son LARGAS (las dos paralelas al lado más
// largo de la pieza) y cuántas CORTAS. El lado es indistinto (T = B y
// L = R): la laminación va por pares de cortes lineales, así que la
// agrupación usa la forma canónica (T/B, L/R) sin distinguir izquierda de
// derecha ni arriba de abajo. La identificación individual (T,B,L,R) y los
// metros lineales se conservan pieza a pieza.

export const CATEGORIAS_CANTO = [
  'Sin laminar',
  '1 Corto',
  '2 Cortos',
  '1 Largo',
  '2 Largos',
  '1 Largo + 1 Corto',
  '2 Largos + 1 Corto',
  '1 Largo + 2 Cortos',
  '4 Lados',
] as const

/** Aristas LARGAS de la pieza, referenciadas por letra: las que miden lo
 * del lado más largo de la pieza. La decisión es 100% por las dimensiones
 * (el que mida más = largo; los opuestos son iguales: dos largos o dos
 * cortos) — las letras T,B,L,R solo identifican qué arista es cada una, no
 * determinan largo/corto. */
export function ladosLargo(ancho: number, alto: number): Set<string> {
  return ancho >= alto ? new Set(['T', 'B']) : new Set(['L', 'R'])
}

/** Cantos en forma canónica: el lado es indistinto (T = B y L = R — la
 * laminación va por pares de cortes lineales y el tablero se lamina a los
 * dos lados). Un lado del par → 'T/B'; ambos → 'T,B'. Igual con L/R. */
export function cantosCanonicos(cantos: string): string {
  const letras = letrasCanto(cantos)
  const tiene = (l: string) => letras.includes(l)
  const partes: string[] = []
  const tb = (tiene('T') ? 1 : 0) + (tiene('B') ? 1 : 0)
  if (tb === 2) partes.push('T,B')
  else if (tb === 1) partes.push('T/B')
  const lr = (tiene('L') ? 1 : 0) + (tiene('R') ? 1 : 0)
  if (lr === 2) partes.push('L,R')
  else if (lr === 1) partes.push('L/R')
  return partes.join(',')
}

/** Índice (0–8) de la categoría de la pieza según sus cantos. */
export function categoriaCanto(cantos: string, ancho: number, alto: number): number {
  const largos = ladosLargo(ancho, alto)
  let nL = 0
  let nC = 0
  for (const letra of letrasCanto(cantos)) {
    if (largos.has(letra)) nL += 1
    else nC += 1
  }
  if (nL + nC === 0) return 0
  if (nL === 0) return nC === 1 ? 1 : 2
  if (nC === 0) return nL === 1 ? 3 : 4
  if (nL === 1 && nC === 1) return 5
  if (nL === 2 && nC === 1) return 6
  if (nL === 1 && nC === 2) return 7
  return 8
}

/** Metros lineales de tapacanto de una pieza (todos sus cantos × unidades).
 * Longitud de arista: T/B corren a lo largo del ancho; L/R del alto. */
export function metrosCanto(p: PieceInput): number {
  let mm = 0
  for (const letra of letrasCanto(p.cantos || '')) {
    mm += letra === 'T' || letra === 'B' ? p.ancho : p.alto
  }
  return (mm * Math.max(1, p.cantidad || 1)) / 1000
}

export interface FilaClasificacion {
  categoria: number
  medidas: string
  ancho: number
  alto: number
  espesor: number
  cantos: string
  unidades: number
  metros: number
}

export interface ClasificacionCantos {
  filas: FilaClasificacion[]
  totalMetros: number
  totalUnidades: number
}

export function clasificarCantos(pieces: PieceInput[]): ClasificacionCantos {
  const mapa = new Map<string, FilaClasificacion>()
  for (const p of pieces) {
    if (!(Number(p.ancho) > 0) || !(Number(p.alto) > 0)) continue
    const cantos = (p.cantos || '').trim()
    // Agrupación por lado indistinto: T=B y L=R (cortes lineares por pares);
    // los metros se calculan con las letras reales (la arista mide igual en
    // ambos lados del par).
    const canonico = cantosCanonicos(cantos)
    const cat = categoriaCanto(cantos, p.ancho, p.alto)
    const key = `${cat}|${p.ancho}|${p.alto}|${p.espesor}|${canonico}`
    const und = Math.max(1, Number(p.cantidad) || 1)
    const metros = metrosCanto({ ...p, cantidad: und })
    const existente = mapa.get(key)
    if (existente) {
      existente.unidades += und
      existente.metros += metros
    } else {
      mapa.set(key, {
        categoria: cat,
        medidas: `${p.ancho}×${p.alto}`,
        ancho: Number(p.ancho),
        alto: Number(p.alto),
        espesor: Number(p.espesor),
        cantos: canonico,
        unidades: und,
        metros,
      })
    }
  }
  const filas = [...mapa.values()].sort(
    (a, b) => a.categoria - b.categoria || b.ancho * b.alto - a.ancho * a.alto
  )
  return {
    filas,
    totalMetros: filas.reduce((s, f) => s + f.metros, 0),
    totalUnidades: filas.reduce((s, f) => s + f.unidades, 0),
  }
}
