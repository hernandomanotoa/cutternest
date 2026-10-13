import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OptimizerPage } from './OptimizerPage'
import { api } from '../../api/client'
import { fetchCatalog } from '../../utils/catalog'
import type { BoardResult, CatalogResponse, Project } from '../../types'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:8000/api/v1',
}))

vi.mock('../../utils/catalog', () => ({
  fetchCatalog: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import toast from 'react-hot-toast'

afterEach(() => cleanup())

const mockCatalog: CatalogResponse = {
  board_formats: [{ name: 'Estándar', width_mm: 2440, height_mm: 1220, country: 'EC' }],
  materials: [
    { name: 'MDF Melamina', description: '', thicknesses: [18], prices: { '18': 9.5 } },
  ],
  colors: [],
}

const mockProject: Project = {
  id: 'p1',
  name: 'Proyecto Demo',
  board_width_mm: 2440,
  board_height_mm: 1220,
  board_thickness_mm: 18,
  material_type: 'MDF Melamina',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
}

const mockBoard: BoardResult = {
  board_index: 0,
  ancho: 2440,
  alto: 1220,
  utilizacion: 82,
  placements: [
    {
      id: 'base',
      nombre: 'Base',
      x: 5,
      y: 5,
      w: 1200,
      h: 600,
      color: '#FF6B6B',
      espesor: 18,
      rotado: false,
    },
  ],
}

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={state ? [{ pathname: '/optimizer', state }] : ['/optimizer']}>
      <OptimizerPage />
    </MemoryRouter>
  )
}

describe('OptimizerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(fetchCatalog).mockResolvedValue(mockCatalog)
    vi.mocked(api.get).mockResolvedValue({ data: {} })
    vi.mocked(api.post).mockResolvedValue({ data: {} })
  })

  it('renderiza título, formulario de tablero y piezas del ejemplo', async () => {
    renderPage()

    expect(screen.getByText('Optimizador de cortes')).toBeInTheDocument()
    expect(screen.getByText('Tablero')).toBeInTheDocument()
    expect(screen.getAllByText('Agregar pieza').length).toBeGreaterThan(0)
    expect(screen.getByText('Piezas (11)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Base')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Optimizar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar piezas' })).toBeInTheDocument()
  })

  it('muestra estado vacío al limpiar las piezas', async () => {
    renderPage()

    await waitFor(() => expect(screen.getByText('Piezas (11)')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))

    expect(
      await screen.findByText(/No hay piezas todavía/i)
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar piezas' })).toBeDisabled()
  })

  it('agrega una pieza nueva desde el formulario', async () => {
    renderPage()

    fireEvent.change(screen.getByPlaceholderText('Nombre'), { target: { value: 'Puerta' } })
    fireEvent.change(screen.getByPlaceholderText('Ancho (mm)'), { target: { value: '500' } })
    fireEvent.change(screen.getByPlaceholderText('Alto (mm)'), { target: { value: '700' } })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar pieza' }))

    expect(screen.getByText('Piezas (12)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Puerta')).toBeInTheDocument()
  })

  it('optimiza: crea el proyecto, deshabilita el botón mientras carga y muestra resultados', async () => {
    let resolveOptimize: (value: unknown) => void = () => {}
    vi.spyOn(window, 'prompt').mockReturnValue('Proyecto Demo')
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/projects') return Promise.resolve({ data: mockProject })
      if (url === '/projects/p1/optimize') {
        return new Promise((resolve) => {
          resolveOptimize = resolve
        })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    renderPage()

    const optimizeButton = screen.getByRole('button', { name: 'Optimizar' })
    fireEvent.click(optimizeButton)

    await waitFor(() => expect(optimizeButton).toBeDisabled())
    expect(api.post).toHaveBeenCalledWith('/projects', expect.any(Object))

    resolveOptimize({ data: { tableros: [mockBoard], total_tableros: 1 } })

    await waitFor(() => expect(screen.getByText('Resultados')).toBeInTheDocument())
    expect(toast.success).toHaveBeenCalledWith('Optimizado en 1 tablero(s)')
    expect(screen.getByText('Resumen')).toBeInTheDocument()
    expect(screen.getByText('Utilización promedio')).toBeInTheDocument()
    expect(screen.getByText('82% utilización')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Cotizar/i })).toBeInTheDocument()
  })

  it('muestra error cuando la optimización falla', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Proyecto Demo')
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/projects') return Promise.resolve({ data: mockProject })
      if (url === '/projects/p1/optimize') {
        return Promise.reject({ response: { data: { detail: 'Pieza demasiado grande' } } })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Optimizar' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Pieza demasiado grande')
    )
    expect(screen.queryByText('Resultados')).not.toBeInTheDocument()
  })

  it('muestra error al cargar el proyecto vinculado desde navegación', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/projects/p1') {
        return Promise.reject({ response: { data: { detail: 'Proyecto no encontrado' } } })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    renderPage({ projectId: 'p1' })

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Proyecto no encontrado')
    )
  })

  it('muestra error cuando falla la carga del catálogo', async () => {
    vi.mocked(fetchCatalog).mockRejectedValue({ response: { data: { detail: 'Catálogo no disponible' } } })

    renderPage()

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Catálogo no disponible')
    )
  })
})
