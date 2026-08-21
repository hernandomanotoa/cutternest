import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QuotePage } from './QuotePage'
import { api } from '../../api/client'
import type { Project } from '../../types'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('../../utils/catalog', () => ({
  fetchCatalog: vi.fn().mockResolvedValue({
    board_formats: [{ name: 'Estándar', width_mm: 2440, height_mm: 1220, country: 'EC' }],
    materials: [{ name: 'MDF Melamina', description: '', thicknesses: [18], prices: { '18': 9.5 } }],
    colors: [],
  }),
}))

afterEach(() => cleanup())

const mockProject: Project = {
  id: 'p1',
  name: 'Estantería',
  board_width_mm: 2440,
  board_height_mm: 1220,
  board_thickness_mm: 18,
  material_type: 'MDF Melamina',
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
}

const mockHardwareTemplates = [
  { item: 'Bisagra cazoleta 35mm', precio_unit: 1.2, categoria: 'bisagras' },
  { item: 'Tornillo confirmat 6.4x50', precio_unit: 0.15, categoria: 'tornillos' },
]

const mockQuotes = [
  {
    id: 'q1',
    project_id: 'p1',
    material_cost: 10,
    hardware_cost: 5,
    labor_cost: 3,
    total: 23.4,
    margin: 1.3,
    pdf_path: '/exports/quote.pdf',
    created_at: '2024-01-01T10:00:00',
  },
]

describe('QuotePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === `/projects/${mockProject.id}`) return Promise.resolve({ data: mockProject })
      if (url === '/quotes/hardware-templates') return Promise.resolve({ data: mockHardwareTemplates })
      if (url === `/projects/${mockProject.id}/quotes`) return Promise.resolve({ data: mockQuotes })
      return Promise.resolve({ data: {} })
    })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        quote_id: 'q2',
        project_id: 'p1',
        breakdown: { material: 10, hardware: 5, mano_obra: 3, subtotal: 18, total: 23.4 },
        hardware: [],
        pdf_path: '/exports/quote.pdf',
        created_at: '2024-01-01',
      },
    })
  })

  it('renders parameters and live breakdown', async () => {
    render(
      <MemoryRouter initialEntries={['/quote/p1']}>
        <Routes>
          <Route path='/quote/:projectId' element={<QuotePage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByText('Cotización')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByDisplayValue('9.5')).toBeInTheDocument())
    expect(screen.getByText('Sugerido: $9.50')).toBeInTheDocument()
    expect(screen.getByText('Desglose')).toBeInTheDocument()
  })

  it('recalculates total when hardware is added', async () => {
    render(
      <MemoryRouter initialEntries={['/quote/p1']}>
        <Routes>
          <Route path='/quote/:projectId' element={<QuotePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Agregar item')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Agregar item'))

    const table = screen.getByRole('table')
    const rows = within(table).getAllByRole('row')
    const addRow = rows[rows.length - 2] // last data row before the add button row

    const itemInput = within(addRow).getByPlaceholderText('Item')
    fireEvent.change(itemInput, { target: { value: 'Tornillo' } })

    const cantidadInput = within(addRow).getByDisplayValue('1')
    fireEvent.change(cantidadInput, { target: { value: '10' } })

    const precioInput = within(addRow).getByDisplayValue('0')
    fireEvent.change(precioInput, { target: { value: '0.5' } })

    expect(await within(table).findByText('$5.00')).toBeInTheDocument()
  })

  it('generates PDF on button click', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <MemoryRouter initialEntries={['/quote/p1']}>
        <Routes>
          <Route path='/quote/:projectId' element={<QuotePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Generar PDF')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Generar PDF'))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/projects/p1/quote', expect.any(Object)))
    expect(openSpy).toHaveBeenCalledWith('/exports/quote.pdf', '_blank', 'noopener,noreferrer')

    openSpy.mockRestore()
  })

  it('adds a hardware item from a template chip', async () => {
    render(
      <MemoryRouter initialEntries={['/quote/p1']}>
        <Routes>
          <Route path='/quote/:projectId' element={<QuotePage />} />
        </Routes>
      </MemoryRouter>
    )

    const chip = await screen.findByText('Bisagra cazoleta 35mm ($1.20)')
    expect(chip).toBeInTheDocument()

    fireEvent.click(chip)

    const table = screen.getByRole('table')
    expect(await within(table).findByDisplayValue('Bisagra cazoleta 35mm')).toBeInTheDocument()
    expect(within(table).getByDisplayValue('1.2')).toBeInTheDocument()
  })

  it('shows project quote history and opens the PDF', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(
      <MemoryRouter initialEntries={['/quote/p1']}>
        <Routes>
          <Route path='/quote/:projectId' element={<QuotePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Historial de cotizaciones')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Mostrar historial'))

    expect(await screen.findByText('$23.40')).toBeInTheDocument()

    const pdfButton = screen.getByLabelText('Abrir PDF')
    fireEvent.click(pdfButton)

    expect(openSpy).toHaveBeenCalledWith('/exports/quote.pdf', '_blank', 'noopener,noreferrer')

    openSpy.mockRestore()
  })
})
