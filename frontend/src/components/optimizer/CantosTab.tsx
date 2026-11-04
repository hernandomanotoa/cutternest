import type { PieceInput } from '../../types'
import { groupPiecesForCantos, letrasCanto } from '../../utils/cantoSummary'

const COLOR_CANTO = '#15803d'

// Forma de la pieza a escala, con las aristas que llevan tapacantos en
// verde (T arriba, B abajo, L izquierda, R derecha — la pieza como se
// fabrica, no su colocación en el tablero).
function FormaPieza({ ancho, alto, cantos }: { ancho: number; alto: number; cantos: string }) {
  const BOX_W = 132
  const BOX_H = 84
  const PAD = 12
  const scale = Math.min((BOX_W - 2 * PAD) / ancho, (BOX_H - 2 * PAD) / alto)
  const w = Math.max(10, ancho * scale)
  const h = Math.max(10, alto * scale)
  const x = (BOX_W - w) / 2
  const y = (BOX_H - h) / 2
  const lados = new Set(letrasCanto(cantos))
  const grosor = 4.5
  return (
    <svg viewBox={`0 0 ${BOX_W} ${BOX_H}`} className='h-auto w-full' role='img' aria-label={`Forma ${ancho}×${alto}`}>
      <rect x={x} y={y} width={w} height={h} fill='hsl(var(--muted))' stroke='hsl(var(--border))' strokeWidth={1.5} />
      {lados.has('T') && <line x1={x} y1={y} x2={x + w} y2={y} stroke={COLOR_CANTO} strokeWidth={grosor} />}
      {lados.has('B') && <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={COLOR_CANTO} strokeWidth={grosor} />}
      {lados.has('L') && <line x1={x} y1={y} x2={x} y2={y + h} stroke={COLOR_CANTO} strokeWidth={grosor} />}
      {lados.has('R') && <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={COLOR_CANTO} strokeWidth={grosor} />}
      {lados.has('T') && <text x={x + w / 2} y={y - 3} textAnchor='middle' fontSize={9} fill={COLOR_CANTO} fontWeight='bold'>T</text>}
      {lados.has('B') && <text x={x + w / 2} y={y + h + 10} textAnchor='middle' fontSize={9} fill={COLOR_CANTO} fontWeight='bold'>B</text>}
      {lados.has('L') && <text x={x - 4} y={y + h / 2 + 3} textAnchor='end' fontSize={9} fill={COLOR_CANTO} fontWeight='bold'>L</text>}
      {lados.has('R') && <text x={x + w + 4} y={y + h / 2 + 3} textAnchor='start' fontSize={9} fill={COLOR_CANTO} fontWeight='bold'>R</text>}
    </svg>
  )
}

export function CantosTab({ pieces }: { pieces: PieceInput[] }) {
  const grupos = groupPiecesForCantos(pieces)
  if (!grupos.length) {
    return (
      <div className='flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border py-12 text-center'>
        <p className='max-w-sm text-sm text-muted-foreground'>
          No hay piezas todavía. Carga un CSV o agrega piezas para ver el resumen de cantos.
        </p>
      </div>
    )
  }
  return (
    <div>
      <p className='mb-3 text-xs text-muted-foreground'>
        Grupos por tamaño (ancho × alto × espesor). Borde verde = arista con tapacantos (T arriba, B abajo, L izquierda, R derecha).
      </p>
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
        {grupos.map((g) => (
          <div key={g.key} className='rounded-md border border-border bg-background p-3'>
            <FormaPieza ancho={g.ancho} alto={g.alto} cantos={g.variosCantos ? '' : g.cantos} />
            <div className='mt-2 space-y-0.5 text-center'>
              <p className='text-sm font-medium text-foreground'>
                {g.ancho}×{g.alto} <span className='text-muted-foreground'>· {g.espesor} mm</span>
              </p>
              <p className='text-xs text-muted-foreground'>
                cantidad <span className='font-semibold text-foreground'>×{g.cantidad}</span>
              </p>
              <p className='text-xs font-medium' style={{ color: g.cantos ? COLOR_CANTO : 'hsl(var(--muted-foreground))' }}>
                {g.variosCantos ? 'cantos: varios en el grupo' : g.cantos ? `cantos: ${g.cantos}` : 'sin cantos'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
