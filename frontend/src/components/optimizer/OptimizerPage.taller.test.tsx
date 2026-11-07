import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OptimizerPage } from './OptimizerPage'
import { api } from '../../api/client'
import { fetchCatalog } from '../../utils/catalog'
import { loadPieceStates } from '../../hooks/usePieceStates'
import type { BoardResult, CatalogResponse } from '../../types'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  API_BASE_URL: 'http://localhost:8000/api/v1',
}))

vi.mock('../../utils/catalog', () => ({
  fetchCatalog: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}))

afterEach(() => cleanup())

const mockCatalog: CatalogResponse = {
  board_formats: [{ name: 'Estándar', width_mm: 2440, height_mm: 1220, country: 'EC' }],
  materials: [{ name: 'MDF Melamina', description: '', thicknesses: [18], prices: { '18': 9.5 } }],
  colors: [],
}

const mockBoard: BoardResult = {
  board_index: 0,
  ancho: 2440,
  alto: 1220,
  utilizacion: 82,
  placements: [
    { id: 'base', nombre: 'Base', x: 5, y: 5, w: 1200, h: 600, color: '#FF6B6B', espesor: 18, rotado: false },
  ],
}

function renderTaller(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: '/optimizer', search: '?modo=taller', state: state ?? {} },
      ]}
    >
      <OptimizerPage />
    </MemoryRouter>
  )
}

describe('OptimizerPage — modo taller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
  })

  it('muestra el banner y oculta el formulario de agregar pieza', async () => {
    renderTaller()

    expect(screen.getByRole('status')).toHaveTextContent('Modo taller — solo lectura')
    expect(screen.queryByText('Agregar pieza')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpiar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Importar / Exportar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comparar modos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar piezas' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Optimizar' })).toBeInTheDocument()
    // Las pestañas visibles siguen ahí
    expect(screen.getByText('Piezas (11)')).toBeInTheDocument()
    expect(screen.getByText('Conteo')).toBeInTheDocument()
    expect(screen.getAllByText('Cantos').length).toBeGreaterThan(0)
    // La tabla queda en solo lectura: el nombre de la primera pieza es un input deshabilitado
    expect(screen.getByDisplayValue('Base')).toBeDisabled()
  })

  it('el botón salir quita el modo taller', async () => {
    renderTaller()

    fireEvent.click(screen.getByRole('button', { name: 'salir' }))

    await waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    )
    expect(screen.getAllByText('Agregar pieza').length).toBeGreaterThan(0)
  })

  it('acepta el alias ?modo_taller', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/optimizer', search: '?modo_taller' }]}>
        <OptimizerPage />
      </MemoryRouter>
    )
    expect(screen.getByRole('status')).toHaveTextContent('Modo taller')
  })
})

describe('OptimizerPage — estados de pieza (P3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
  })

  it('sin proyecto el select de estado está deshabilitado', async () => {
    render(
      <MemoryRouter initialEntries={['/optimizer']}>
        <OptimizerPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText('Piezas (11)')).toBeInTheDocument())
    expect(screen.getByLabelText('Estado de Base')).toBeDisabled()
  })

  it('con proyecto el estado se marca y persiste en localStorage', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/optimizer', state: { projectId: 'p1' } }]}>
        <OptimizerPage />
      </MemoryRouter>
    )
    const select = await screen.findByLabelText('Estado de Base')
    expect(select).toBeEnabled()

    fireEvent.change(select, { target: { value: 'cortada' } })

    expect(loadPieceStates('p1')).toEqual({ base: 'cortada' })
  })

  it('en Resultados muestra el avance Cortadas X/Y y el badge por placement', async () => {
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/projects/p1/optimize') {
        return Promise.resolve({ data: { tableros: [mockBoard], total_tableros: 1 } })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/optimizer', state: { projectId: 'p1' } }]}>
        <OptimizerPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Optimizar' }))

    await waitFor(() => expect(screen.getByText('Cortadas 0/1')).toBeInTheDocument())
    expect(screen.getByText('Base · Pendiente')).toBeInTheDocument()

    // Marcar la pieza como cortada (volver a la pestaña Piezas) actualiza
    // el resumen y el badge en Resultados.
    fireEvent.click(screen.getByRole('button', { name: /Piezas \(11\)/ }))
    fireEvent.change(screen.getByLabelText('Estado de Base'), { target: { value: 'cortada' } })
    fireEvent.click(screen.getByRole('button', { name: /Resultados/ }))
    await waitFor(() => expect(screen.getByText('Cortadas 1/1')).toBeInTheDocument())
    expect(screen.getByText('Base · Cortada')).toBeInTheDocument()
  })
})
