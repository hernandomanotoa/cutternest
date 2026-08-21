import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { InventoryPage } from './InventoryPage'
import { api } from '../../api/client'
import type { InventoryItem, InventoryMovement } from '../../types'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}))

vi.mock('../../utils/catalog', () => ({
  fetchCatalog: vi.fn().mockResolvedValue({ board_formats: [], materials: [], colors: [] }),
}))

afterEach(() => cleanup())

const mockItems: InventoryItem[] = [
  { id: '1', tipo: 'tablero', espesor_mm: 18, ancho_mm: 2440, alto_mm: 1220, cantidad: 5, estado: 'nuevo', area_m2: 2.97, created_at: '2024-01-01' },
  { id: '2', tipo: 'sobrante', espesor_mm: 18, ancho_mm: 1000, alto_mm: 500, cantidad: 2, estado: 'sobrante', area_m2: 0.5, created_at: '2024-01-02' },
]

const alertItems: InventoryItem[] = [
  { id: '3', tipo: 'tablero', espesor_mm: 18, ancho_mm: 1200, alto_mm: 600, cantidad: 1, estado: 'nuevo', area_m2: 0.72, created_at: '2024-01-03' },
]

const mockMovements: InventoryMovement[] = [
  { id: 'm1', inventory_id: '1', tipo: 'entrada', cantidad: 5, motivo: 'Compra inicial', created_at: '2024-01-01T10:00:00' },
  { id: 'm2', inventory_id: '1', tipo: 'salida', cantidad: 1, motivo: null, created_at: '2024-01-02T10:00:00' },
]

describe('InventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: mockItems })
  })

  it('renders tabs and loads inventory', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Inventario')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tableros' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sobrantes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Alertas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Movimientos' })).toBeInTheDocument()

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/inventory', expect.any(Object)))
    expect(screen.getByText('2440×1220 mm')).toBeInTheDocument()
  })

  it('filters by estado', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('2440×1220 mm')).toBeInTheDocument())

    const estadoSelect = screen.getByDisplayValue('Todos los estados')
    fireEvent.change(estadoSelect, { target: { value: 'sobrante' } })

    expect(screen.queryByText('2440×1220 mm')).not.toBeInTheDocument()
    expect(screen.getByText('1000×500 mm')).toBeInTheDocument()
  })

  it('sorts by area descending by default', async () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('2.97')).toBeInTheDocument())

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows.find((r) => r.textContent?.includes('2.97'))
    expect(firstDataRow).toBeDefined()
  })

  it('loads low stock alerts when Alertas tab is selected', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/inventory/alerts') return Promise.resolve({ data: alertItems })
      return Promise.resolve({ data: mockItems })
    })

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('2440×1220 mm')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Alertas' }))

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/inventory/alerts', { params: { threshold: 2 } }))
    expect(await screen.findByText('1200×600 mm')).toBeInTheDocument()
  })

  it('shows movements for a selected item', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/inventory') return Promise.resolve({ data: mockItems })
      if (url === `/inventory/${mockItems[0].id}/movements`) return Promise.resolve({ data: mockMovements })
      return Promise.resolve({ data: [] })
    })

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('2440×1220 mm')).toBeInTheDocument())

    const movementButtons = screen.getAllByRole('button', { name: 'Ver movimientos' })
    fireEvent.click(movementButtons[0])

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/inventory/${mockItems[0].id}/movements`))
    expect(await screen.findByText('Compra inicial')).toBeInTheDocument()
    expect(screen.getByText('salida')).toBeInTheDocument()
  })

  it('restocks an item inline and refreshes the list', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { ...mockItems[0], cantidad: 8 } })

    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('2440×1220 mm')).toBeInTheDocument())

    const restockButtons = screen.getAllByRole('button', { name: /reponer/i })
    fireEvent.click(restockButtons[0])

    const motivoInput = await screen.findByPlaceholderText('Motivo de la reposición')
    const cantidadInput = screen.getAllByDisplayValue('1')[0]

    fireEvent.change(cantidadInput, { target: { value: '3' } })
    fireEvent.change(motivoInput, { target: { value: 'Compra de reposición' } })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(`/inventory/${mockItems[0].id}/restock`, {
        cantidad: 3,
        motivo: 'Compra de reposición',
      })
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/inventory', expect.any(Object)))
  })
})
