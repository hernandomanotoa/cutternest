import { useMemo, useState } from 'react'
import type { BoardResult, Placement } from '../../types'
import { useSelectionStore } from '../../stores/selectionStore'

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

function strokeColor(tone: string): string {
  if (tone === 'success') return 'hsl(var(--success))'
  if (tone === 'warning') return 'hsl(var(--warning))'
  return 'hsl(var(--danger))'
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
        <defs>
          <pattern id='woodGrain' width={20 * SCALE} height={20 * SCALE} patternUnits='userSpaceOnUse'>
            <rect width={20 * SCALE} height={20 * SCALE} fill='hsl(var(--muted) / 0.3)' />
            <path d={`M0,${10 * SCALE} Q${10 * SCALE},0 ${20 * SCALE},${10 * SCALE}`} stroke='hsl(var(--border))' strokeWidth={0.3 * SCALE} fill='none' />
          </pattern>
        </defs>

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
              </title>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={0.4}
                fill={p.color}
                stroke={stroke}
                strokeWidth={strokeWidth}
                style={{ transition: 'all 150ms ease' }}
              />
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                fill='url(#woodGrain)'
                opacity={0.15}
                pointerEvents='none'
              />
              <text
                x={x + w / 2}
                y={y + h / 2}
                textAnchor='middle'
                dominantBaseline='middle'
                fontSize={Math.max(4, Math.min(w, h) * 0.14)}
                fill='hsl(var(--foreground))'
                pointerEvents='none'
              >
                {p.nombre}
              </text>
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
        </div>
      )}
    </div>
  )
}
