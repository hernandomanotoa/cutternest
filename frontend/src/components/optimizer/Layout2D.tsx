import type { BoardResult } from '../../types'

export function Layout2D({ board }: { board: BoardResult }) {
  const width = board.ancho
  const height = board.alto

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className='w-full h-auto border border-gray-300 bg-gray-50'>
      <rect x={0} y={0} width={width} height={height} fill='#f9fafb' stroke='#374151' strokeWidth={0.5} />
      {board.placements.map((p, i) => (
        <g key={i}>
          <rect
            x={p.x}
            y={p.y}
            width={p.w}
            height={p.h}
            fill={p.color}
            stroke='#1f2937'
            strokeWidth={0.3}
            opacity={0.85}
          />
          <text
            x={p.x + p.w / 2}
            y={p.y + p.h / 2}
            textAnchor='middle'
            dominantBaseline='middle'
            fontSize={Math.min(p.w, p.h) * 0.15}
            fill='#111827'
          >
            {p.nombre}
          </text>
          <text
            x={p.x + p.w / 2}
            y={p.y + p.h / 2 + Math.min(p.w, p.h) * 0.18}
            textAnchor='middle'
            dominantBaseline='middle'
            fontSize={Math.min(p.w, p.h) * 0.1}
            fill='#374151'
          >
            {p.w.toFixed(1)}x{p.h.toFixed(1)}
          </text>
        </g>
      ))}
    </svg>
  )
}
