import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PresentationSheet } from './PresentationSheet'
import type { BoardResult } from '../../types'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  API_BASE_URL: 'http://localhost:8000/api/v1',
}))

afterEach(() => cleanup())

const boards: BoardResult[] = [
  {
    board_index: 0,
    ancho: 2440,
    alto: 1220,
    utilizacion: 82,
    placements: [],
  },
]

function renderSheet(precioM2 = 0) {
  return render(
    <PresentationSheet
      projectName='Clóset Principal'
      projectId='p1'
      boards={boards}
      totalPieces={11}
      precioM2={precioM2}
      onClose={() => {}}
    />
  )
}

describe('PresentationSheet', () => {
  it('muestra nombre del proyecto, fecha y footer CutterNest', () => {
    renderSheet()
    expect(screen.getByText('Clóset Principal')).toBeInTheDocument()
    expect(screen.getByText('CutterNest')).toBeInTheDocument()
    expect(screen.getByText(/Tablero 1 · 2440×1220 mm · 82% de aprovechamiento/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Layout del tablero 1' })).toHaveAttribute(
      'src',
      'http://localhost:8000/api/v1/projects/p1/layouts/0/png'
    )
  })

  it('resume piezas, tableros y aprovechamiento promedio', () => {
    renderSheet()
    expect(screen.getByText('Piezas')).toBeInTheDocument()
    expect(screen.getByText('11')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('82%')).toBeInTheDocument()
    expect(screen.queryByText('Costo estimado')).not.toBeInTheDocument()
  })

  it('muestra el costo estimado solo cuando precioM2 > 0', () => {
    renderSheet(9.5)
    expect(screen.getByText('Costo estimado')).toBeInTheDocument()
  })

  it('agrega y retira la clase de impresión del body', () => {
    const { unmount } = renderSheet()
    expect(document.body.classList.contains('cn-printing')).toBe(true)
    unmount()
    expect(document.body.classList.contains('cn-printing')).toBe(false)
  })
})
