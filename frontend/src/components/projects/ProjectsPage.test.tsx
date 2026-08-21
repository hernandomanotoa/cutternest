import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectsPage } from './ProjectsPage'
import { useAuth } from '../../hooks/useAuth'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../../utils/catalog', () => ({
  fetchCatalog: vi.fn(() =>
    Promise.resolve({
      materials: [
        { name: 'MDF Melamina', description: 'Melamina', thicknesses: [18], prices: {} },
        { name: 'MDF Crudo', description: 'Crudo', thicknesses: [15, 18], prices: {} },
      ],
      board_formats: [
        { name: 'Estándar', width_mm: 1830, height_mm: 2440, country: 'EC' },
      ],
      colors: [],
    })
  ),
}))

import { api } from '../../api/client'

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuth.setState({
      user: null,
      mode: 'principal',
      isAuthenticated: true,
      isGuest: false,
      guestProjectId: null,
    })
  })

  it('renders project cards when projects exist', async () => {
    const projects = [
      {
        id: 'proj-1',
        name: 'Cocina L',
        description: 'Proyecto de prueba',
        board_width_mm: 1830,
        board_height_mm: 2440,
        board_thickness_mm: 18,
        material_type: 'MDF Melamina',
        use_offcuts: false,
        created_at: '2026-08-10T10:00:00Z',
        updated_at: '2026-08-10T10:00:00Z',
      },
    ]

    const layouts = [
      {
        board_index: 0,
        board_width_mm: 1830,
        board_height_mm: 2440,
        utilization: 0.92,
        placements: [{ id: 'p1' }, { id: 'p2' }],
        svg_path: '/exports/layout_0.svg',
        png_path: '/exports/layout_0.png',
      },
    ]

    const progress = {
      project_id: 'proj-1',
      percentage: 75.5,
      completed_steps: 3,
      total_steps: 4,
    }

    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/projects' || url.startsWith('/projects?')) return Promise.resolve({ data: projects })
      if (url === '/templates') return Promise.resolve({ data: [] })
      if (url === '/projects/proj-1/layouts') return Promise.resolve({ data: layouts })
      if (url === '/projects/proj-1/progress') return Promise.resolve({ data: progress })
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Cocina L')).toBeInTheDocument())
    expect(screen.getByText('Proyecto de prueba')).toBeInTheDocument()
    expect(screen.getByText('MDF Melamina', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('1830×2440 mm')).toBeInTheDocument()
    expect(screen.getByText('2 piezas')).toBeInTheDocument()
    expect(screen.getByText('92% uso')).toBeInTheDocument()
    expect(screen.getByText('76% progreso')).toBeInTheDocument()
  })

  it('renders empty state with templates when no projects exist', async () => {
    const templates = [
      {
        id: 'tmpl-1',
        nombre: 'Estantería Modular',
        descripcion: 'Estantería ajustable',
        parametros: {
          ancho: { min: 60, max: 240, default: 120, step: 10 },
        },
      },
    ]

    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/projects' || url.startsWith('/projects?')) return Promise.resolve({ data: [] })
      if (url === '/templates') return Promise.resolve({ data: templates })
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    )

    await waitFor(() =>
      expect(screen.getByText('Aún no tienes proyectos')).toBeInTheDocument()
    )
    expect(screen.getByText('Estantería Modular')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getAllByText('Usar plantilla')).toHaveLength(5)
    )
  })

  it('sends query params when filtering', async () => {
    const projects = [
      {
        id: 'proj-2',
        name: 'Clóset principal',
        description: 'Clóset grande',
        board_width_mm: 1830,
        board_height_mm: 2440,
        board_thickness_mm: 18,
        material_type: 'MDF Crudo',
        use_offcuts: false,
        created_at: '2026-08-10T10:00:00Z',
        updated_at: '2026-08-10T10:00:00Z',
      },
    ]

    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/projects' || url.startsWith('/projects?')) return Promise.resolve({ data: projects })
      if (url === '/templates') return Promise.resolve({ data: [] })
      if (url === '/projects/proj-2/layouts') return Promise.resolve({ data: [] })
      if (url === '/projects/proj-2/progress') return Promise.resolve({ data: { project_id: 'proj-2', percentage: 0, completed_steps: 0, total_steps: 0 } })
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter>
        <ProjectsPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Clóset principal')).toBeInTheDocument())

    const searchInput = screen.getByLabelText('Buscar proyectos')
    fireEvent.change(searchInput, { target: { value: 'Clóset' } })

    await waitFor(
      () => {
        const calls = (api.get as ReturnType<typeof vi.fn>).mock.calls.map((call) => String(call[0]))
        const filteredCall = calls.find((url: string) => url.includes('query=Cl%C3%B3set'))
        expect(filteredCall).toBeDefined()
      },
      { timeout: 2000 }
    )
  })
})
