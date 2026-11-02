// src/utils/grainPatternSvg.ts — Patrón SVG procedural de veta de madera
// para el plano de corte del optimizador (Layout2D). Genera <pattern>
// deterministas (semilla fija) derivados del color base de cada pieza; el
// color de la veta se calcula oscureciendo el base. Puerto tipado del
// generador del Assembly Planner (js/utils/grainPattern.js): mantener la
// lógica equivalente en ambos.

export type DireccionVeta = 'vertical' | 'horizontal'

export interface OpcionesPatronVeta {
  /** solo vetas (sin rect de base): overlay sobre el color sombreado */
  soloVetas?: boolean
  semilla?: number
}

const SEMILLA_VETA = 20261102
const TILE = 28
const N_VETAS = 9

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rango = (rng: () => number, min: number, max: number) => min + rng() * (max - min)

/** Oscurece un '#rrggbb' multiplicando RGB por (1 − factor). */
export function oscurecerHex(hex: string, factor = 0.35): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#5a4632'
  const n = parseInt(m[1], 16)
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 - factor))))
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`
}

function hashId(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function patronVetaId(color: string, direccion: DireccionVeta, soloVetas = false): string {
  return `gv-${hashId(`${color.toLowerCase()}|${direccion}|${soloVetas ? 'sv' : 'c'}`)}`
}

/**
 * Markup <pattern> de veta procedural: rect de color base (salvo soloVetas)
 * + 9 vetas finas onduladas en el color oscurecido. Dirección 'vertical'
 * rota el tile 90° (la veta corre a lo largo de Y).
 */
export function patronVetaDef(
  color: string,
  direccion: DireccionVeta,
  opts: OpcionesPatronVeta = {},
): string {
  const semilla = opts.semilla ?? SEMILLA_VETA
  const soloVetas = !!opts.soloVetas
  const id = patronVetaId(color, direccion, soloVetas)
  const rng = mulberry32(semilla)
  const veta = oscurecerHex(color, 0.38)
  const boost = soloVetas ? 1.5 : 1
  const partes: string[] = []
  for (let i = 0; i < N_VETAS; i += 1) {
    const baseY = (i + 0.5) * (TILE / N_VETAS) + rango(rng, -1.5, 1.5)
    const amp = rango(rng, 0.6, 2.2)
    const f1 = rango(rng, 0.25, 0.6)
    const f2 = rango(rng, 0.6, 1.1)
    const p1 = rango(rng, 0, Math.PI * 2)
    const p2 = rango(rng, 0, Math.PI * 2)
    const grosor = rango(rng, 0.4, 1.1).toFixed(2)
    const opacidad = Math.min(0.55, rango(rng, 0.14, 0.32) * boost).toFixed(2)
    let d = ''
    for (let x = 0; x <= TILE; x += 2) {
      const y = baseY + amp * Math.sin(x * f1 + p1) + (amp / 2) * Math.sin(x * f2 + p2)
      d += `${x === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(2)}`
    }
    partes.push(`<path d="${d}" fill="none" stroke="${veta}" stroke-width="${grosor}" opacity="${opacidad}"/>`)
  }
  const transform = direccion === 'vertical' ? ' patternTransform="rotate(90)"' : ''
  const base = soloVetas ? '' : `<rect width="${TILE}" height="${TILE}" fill="${color}"/>`
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}"${transform}>${base}${partes.join('')}</pattern>`
}

/** Defs combinados para la lista de (color, dirección) únicos de un plano. */
export function defsPatronesVeta(
  pares: ReadonlyArray<readonly [string, DireccionVeta]>,
): string {
  const unicos = new Map<string, string>()
  for (const [color, direccion] of pares) {
    const clave = `${color.toLowerCase()}|${direccion}`
    if (!unicos.has(clave)) unicos.set(clave, patronVetaDef(color, direccion))
  }
  if (!unicos.size) return ''
  return `<defs>${[...unicos.values()].join('')}</defs>`
}
