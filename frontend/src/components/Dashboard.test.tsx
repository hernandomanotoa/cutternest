import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { useAuth } from '../hooks/useAuth'
import { api } from '../api/client'
import type { InventoryItem, Project } from '../types'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(),
    },
  }
})

function setupAuth(partial: Partial<ReturnType<typeof useAuth.getState>> = {}) {
  useAuth.setState({
    user: null,
    mode: null,
    isAuthenticated: true,
    isGuest: false,
    guestProjectId: null,
    ...partial,
  })
}

describe('Dashboard', () => {
  beforeEach(() => {
    ;(api.get as ReturnType<typeof vi.fn>).mockReset()
    setupAuth({ isAuthenticated: true, isGuest: false })
  })

  it('renders loading state and then KPIs for principal user', async () => {
    const inventory: InventoryItem[] = [
      {
        id: 'i1',
        tipo: 'MDF Melamina',
        espesor_mm: 18,
        ancho_mm: 2440,
        alto_mm: 1220,
        cantidad: 5,
        estado: 'nuevo',
        area_m2: 2.97,
        created_at: '2026-08-01T00:00:00',
      },
    ]

    const offcuts: InventoryItem[] = []

    const projects: Project[] = [
      {
        id: 'p1',
        name: 'Estantería modular',
        material_type: 'MDF Melamina',
        board_thickness_mm: 18,
        board_width_mm: 2440,
        board_height_mm: 1220,
        created_at: '2026-08-10T00:00:00',
        updated_at: '2026-08-10T00:00:00',
      },
    ]

    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/inventory') return Promise.resolve({ data: inventory })
      if (url === '/inventory/offcuts') return Promise.resolve({ data: offcuts })
      if (url === '/projects') return Promise.resolve({ data: projects })
      if (url === '/projects/p1/layouts')
        return Promise.resolve({ data: [{ utilization: 82 }] })
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    expect(screen.getByText('Panel principal')).toBeInTheDocument()
    expect(screen.getByText('Tableros en inventario')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('82%')).toBeInTheDocument()
    })

    expect(screen.getByText('Proyectos activos')).toBeInTheDocument()
    expect(screen.getByText('Utilización promedio')).toBeInTheDocument()
    expect(screen.getByText('Accesos rápidos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /optimización rápida/i })).toBeInTheDocument()
  })

  it('shows guest-only actions when in guest mode', async () => {
    setupAuth({ isAuthenticated: true, isGuest: true, guestProjectId: 'p1' })

    const projects: Project[] = [
      {
        id: 'p1',
        name: 'Cocina base',
        material_type: 'MDF Melamina',
        board_thickness_mm: 18,
        board_width_mm: 1830,
        board_height_mm: 2440,
        created_at: '2026-08-12T00:00:00',
        updated_at: '2026-08-12T00:00:00',
      },
    ]

    ;(api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/projects') return Promise.resolve({ data: projects })
      if (url === '/projects/p1/layouts')
        return Promise.resolve({ data: [{ utilization: 75 }] })
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /ver proyecto vinculado/i })
      ).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /nuevo proyecto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /registrar sobrante/i })).not.toBeInTheDocument()
  })
})
