// Etiquetas adaptativas para los layouts de corte: el nombre completo solo
// cuando la pieza lo permite; si no, nombre truncado con '…', luego el id
// corto, y en piezas angostas y altas el texto va rotado 90° (usa el alto
// como longitud). Si nada cabe, la descripción vive en la leyenda lateral.

export interface EtiquetaPieza {
  lineas: string[]
  fontSize: number
  rotada: boolean
}

const ANCHO_CARACTER = 0.58 // factor medio de ancho de glifo (sans)
const INTERLINEADO = 1.25

function anchoTexto(texto: string, fontSize: number): number {
  return Math.max(1, texto.length) * fontSize * ANCHO_CARACTER
}

export function truncarATexto(texto: string, maxAncho: number, fontSize: number): string | null {
  if (anchoTexto(texto, fontSize) <= maxAncho) return texto
  for (let n = texto.length - 1; n > 0; n--) {
    const candidato = `${texto.slice(0, n)}…`
    if (anchoTexto(candidato, fontSize) <= maxAncho) return candidato
  }
  return null
}

function mejorEtiqueta(
  candidatos: string[][],
  largo: number,
  ancho: number,
  maxFont: number,
  minFont: number,
): EtiquetaPieza | null {
  for (const lineas of candidatos) {
    const caracteres = Math.max(...lineas.map((l) => l.length))
    // La fuente más grande con la que TODAS las líneas caben a lo largo y
    // apiladas a lo ancho.
    const porLargo = largo / Math.max(1, caracteres * ANCHO_CARACTER)
    const porAncho = ancho / (lineas.length * INTERLINEADO)
    const fontSize = Math.min(maxFont, porLargo, porAncho)
    if (fontSize >= minFont) {
      return { lineas, fontSize, rotada: false }
    }
  }
  return null
}

export function etiquetaPieza(opciones: {
  nombre: string
  id: string
  w: number
  h: number
  maxFont?: number
  minFont?: number
}): EtiquetaPieza | null {
  const { nombre, id, w, h, maxFont = 10, minFont = 3 } = opciones
  const medidas = `${opciones.w.toFixed(1)}×${opciones.h.toFixed(1)}`
  const candidatos: string[][] = [
    [nombre, `${medidas} mm`],
    [nombre],
    [id],
  ]
  if (h < minFont * INTERLINEADO) return null
  // 1) Texto COMPLETO horizontal.
  const horizontal = mejorEtiqueta(candidatos, w, h, maxFont, minFont)
  if (horizontal) return horizontal
  // 2) Texto completo rotado (piezas angostas y altas: un nombre entero
  //    rotado se lee mejor que tres letras horizontal).
  const rotada = mejorEtiqueta(candidatos, h, w, maxFont, minFont)
  if (rotada) return { ...rotada, rotada: true }
  // 3) Último recurso: fragmento truncado horizontal con '…' a fuente mínima.
  for (const linea of [nombre, id]) {
    const trozo = truncarATexto(linea, w, minFont)
    if (trozo) return { lineas: [trozo], fontSize: minFont, rotada: false }
  }
  return null
}
