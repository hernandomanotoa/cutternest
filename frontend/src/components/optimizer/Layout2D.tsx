import { useMemo, useState } from 'react'
import type { BoardResult, Placement } from '../../types'
import { useSelectionStore } from '../../stores/selectionStore'
import { defsPatronesVeta, patronVetaId, type DireccionVeta } from '../../utils/grainPatternSvg'
import { etiquetaPieza } from '../../utils/labelFit'

interface Layout2DProps {
  board: BoardResult
  margenMm?: number
}

// Backend now returns mm, so scale down for SVG to keep the same on-screen size.
const SCALE = 0.1

function utilizationTone(value: number): 'success' | 'warning' | 'danger' {
  if (value >= 85) return 'success'
  if (value >= 70) return 'warning'
  return 'danger'
}

function direccionVeta(p: Placement): DireccionVeta {
  return p.veta === 'vertical' ? 'vertical' : 'horizontal'
}

function strokeColor(tone: string): string {
  if (tone === 'success') return 'hsl(var(--success))'
  if (tone === 'warning') return 'hsl(var(--warning))'
  return 'hsl(var(--danger))'
}

// Aristas del rectángulo colocado que llevan tapacantos. Las letras
// describen la pieza en su orientación; rotada 90°, las cabezas T/B caen
// en los lados cortos del rectángulo y los longitudinales L/R en los largos.
const LADOS_ROTADO: Record<string, 'T' | 'B' | 'L' | 'R'> = { T: 'L', B: 'R', L: 'T', R: 'B' }
const COLOR_CANTO = '#15803d'

function aristasCanteadas(p: Placement): Array<'T' | 'B' | 'L' | 'R'> {
  const letras = (p.cantos || '').split(',').map((s) => s.trim().toUpperCase()).filter((l) => 'TBLR'.includes(l))
  const unicos = [...new Set(letras)] as Array<'T' | 'B' | 'L' | 'R'>
  return p.rotado ? unicos.map((l) => LADOS_ROTADO[l]) : unicos
}

export function Layout2D({ board, margenMm = 0 }: Layout2DProps) {
  const width = board.ancho * SCALE
  const height = board.alto * SCALE
  const margin = margenMm * SCALE
  const { selectedPieceCode, setSelectedPieceCode } = useSelectionStore()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const pieces = useMemo(() => {
    const map = new Map<string, Placement>()
    for (const p of board.placements) {
      map.set(p.id, p)
    }
    return map
  }, [board.placements])

  const selectedPlacement = selectedPieceCode ? pieces.get(selectedPieceCode) ?? null : null

  // Veta procedural: defs por cada (color, dirección) único del tablero.
  // Dirección = sentido de veta del backend (rotate=false ⇒ paralela al
  // ancho del tablero). Misma semilla en todas → veta coherente entre piezas.
  const defsVeta = useMemo(() => {
    const direccionVeta = (p: Placement): DireccionVeta =>
      p.veta === 'vertical' ? 'vertical' : 'horizontal'
    const pares = [...new Map(
      board.placements.map((p) => [`${p.color.toLowerCase()}|${direccionVeta(p)}`, [p.color, direccionVeta(p)] as const]),
    ).values()]
    return defsPatronesVeta(pares)
  }, [board.placements])

  return (
    <div className='relative w-full rounded-xl border border-border bg-card p-2'>
      <div className='mb-2 flex items-center justify-between text-sm'>
        <span className='font-medium text-foreground'>
          Tablero {board.board_index + 1}
        </span>
        <span
          className='inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold'
          style={{
            borderColor: strokeColor(utilizationTone(board.utilizacion)),
            color: strokeColor(utilizationTone(board.utilizacion)),
            backgroundColor: `${strokeColor(utilizationTone(board.utilizacion))}10`,
          }}
        >
          {board.utilizacion}% utilización
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className='h-auto w-full cursor-crosshair rounded-lg border border-border bg-muted/30'
        onClick={() => setSelectedPieceCode(null)}
      >
        <defs dangerouslySetInnerHTML={{ __html: defsVeta }} />

        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill='hsl(var(--muted) / 0.3)'
          stroke='hsl(var(--border))'
          strokeWidth={0.5}
        />

        {margin > 0 && (
          <rect
            x={margin}
            y={margin}
            width={Math.max(0, width - 2 * margin)}
            height={Math.max(0, height - 2 * margin)}
            fill='none'
            stroke='hsl(var(--primary))'
            strokeWidth={0.4}
            strokeDasharray='2 2'
          />
        )}

        {board.placements.map((p, i) => {
          const isSelected = selectedPieceCode === p.id
          const isHovered = hoveredId === p.id
          const isDimmed = selectedPieceCode && selectedPieceCode !== p.id
          const strokeWidth = isSelected ? 1.2 : 0.4
          const stroke = isSelected
            ? 'hsl(var(--primary))'
            : isHovered
              ? 'hsl(var(--foreground))'
              : 'hsl(var(--border))'
          const x = p.x * SCALE
          const y = p.y * SCALE
          const w = p.w * SCALE
          const h = p.h * SCALE
          const cx = x + w / 2
          const cy = y + h / 2
          // Etiqueta adaptativa: nombre + medidas si caben; si no, nombre
          // truncado; si no, id; en piezas angostas y altas va rotada 90°.
          // Las diminutas no llevan texto (tooltip + barra de selección).
          const etiqueta = etiquetaPieza({
            nombre: p.nombre,
            id: p.id,
            w,
            h,
            maxFont: Math.max(3, Math.min(w, h) * 0.16),
            minFont: 3,
          })
          const etiquetaRotada = etiqueta?.rotada ?? false

          return (
            <g
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPieceCode(p.id)
              }}
              onMouseEnter={() => setHoveredId(p.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: 'pointer' }}
              opacity={isDimmed ? 0.55 : isHovered ? 1 : 0.92}
            >
              <title>
                {p.nombre} · {p.w.toFixed(1)}×{p.h.toFixed(1)} mm{p.rotado ? ' · rotada 90°' : ''}
                {p.cantos ? ` · cantos: ${p.cantos}` : ''}
              </title>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={0.4}
                fill={`url(#${patronVetaId(p.color, direccionVeta(p))})`}
                stroke={stroke}
                strokeWidth={strokeWidth}
                style={{ transition: 'all 150ms ease' }}
              />
              <g pointerEvents='none'>
                {aristasCanteadas(p).map((lado) =>
                  lado === 'T' ? (
                    <line key='T' x1={x} y1={y + 1.2} x2={x + w} y2={y + 1.2} stroke={COLOR_CANTO} strokeWidth={1.6} />
                  ) : lado === 'B' ? (
                    <line key='B' x1={x} y1={y + h - 1.2} x2={x + w} y2={y + h - 1.2} stroke={COLOR_CANTO} strokeWidth={1.6} />
                  ) : lado === 'L' ? (
                    <line key='L' x1={x + 1.2} y1={y} x2={x + 1.2} y2={y + h} stroke={COLOR_CANTO} strokeWidth={1.6} />
                  ) : (
                    <line key='R' x1={x + w - 1.2} y1={y} x2={x + w - 1.2} y2={y + h} stroke={COLOR_CANTO} strokeWidth={1.6} />
                  )
                )}
              </g>
              {etiqueta && (
                <g
                  transform={etiquetaRotada ? `rotate(90, ${cx}, ${cy})` : undefined}
                  pointerEvents='none'
                >
                  {etiqueta.lineas.map((linea, li) => (
                    <text
                      key={li}
                      x={cx}
                      y={cy + (li - (etiqueta.lineas.length - 1) / 2) * etiqueta.fontSize * 1.25}
                      textAnchor='middle'
                      dominantBaseline='middle'
                      fontSize={etiqueta.fontSize}
                      fill={li === 0 ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'}
                    >
                      {linea}
                    </text>
                  ))}
                </g>
              )}
              {p.rotado && (
                <g transform={`translate(${x + w - 6}, ${y + 6})`} pointerEvents='none'>
                  <circle r='4' fill='hsl(var(--primary))' />
                  <text
                    x={0}
                    y={1}
                    textAnchor='middle'
                    dominantBaseline='middle'
                    fontSize={4}
                    fill='hsl(var(--primary-foreground))'
                  >
                    ⟳
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </svg>

      {selectedPlacement && (
        <div className='mt-2 rounded-md border border-border bg-muted/50 p-2 text-xs text-foreground'>
          <span className='font-medium'>{selectedPlacement.nombre}</span>
          <span className='mx-2 text-muted-foreground'>·</span>
          <span>{selectedPlacement.w.toFixed(1)}×{selectedPlacement.h.toFixed(1)} mm</span>
          {selectedPlacement.rotado && (
            <>
              <span className='mx-2 text-muted-foreground'>·</span>
              <span className='text-primary'>Rotada 90°</span>
            </>
          )}
          {selectedPlacement.cantos && (
            <>
              <span className='mx-2 text-muted-foreground'>·</span>
              <span style={{ color: COLOR_CANTO }}>Cantos: {selectedPlacement.cantos}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
