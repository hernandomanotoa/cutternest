import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AssemblyPage } from './AssemblyPage'
import { api } from '../../api/client'
import type { AssemblyResponse } from '../../types'

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockAssembly: AssemblyResponse = {
  pasos: [
    {
      id: 'step-1',
      numero: 1,
      code: 'P01',
      titulo: 'Base y laterales',
      descripcion: 'Colocar la base y unir los laterales.',
      piezas: ['base', 'lateral-izq'],
      piezas_3d: [
        {
          id: 'base',
          nombre: 'Base',
          ancho: 1200,
          alto: 18,
          profundidad: 600,
          color: '#D97706',
          posicion: { x: 0, y: 0, z: 0 },
          rotacion: { x: 0, y: 0, z: 0 },
        },
        {
          id: 'lateral-izq',
          nombre: 'Lateral Izq',
          ancho: 18,
          alto: 1800,
          profundidad: 600,
          color: '#D97706',
          posicion: { x: 0, y: 18, z: 0 },
          rotacion: { x: 0, y: 0, z: 0 },
        },
      ],
      conectores: [],
      connector_ids: [],
      herramientas: ['Taladro'],
      dependencies: [],
      tiempo_estimado_min: 10,
      status: 'PENDING',
      camera: {
        position: [100, 100, 100],
        target: [60, 90, 30],
      },
    },
  ],
  vista_completa: [
    {
      id: 'base',
      nombre: 'Base',
      ancho: 1200,
      alto: 18,
      profundidad: 600,
      color: '#D97706',
      posicion: { x: 0, y: 0, z: 0 },
      rotacion: { x: 0, y: 0, z: 0 },
    },
    {
      id: 'lateral-izq',
      nombre: 'Lateral Izq',
      ancho: 18,
      alto: 1800,
      profundidad: 600,
      color: '#D97706',
      posicion: { x: 0, y: 18, z: 0 },
      rotacion: { x: 0, y: 0, z: 0 },
    },
  ],
  conectores_completos: [],
  modules: [],
  pieces: [
    {
      id: 'base',
      codigo: 'base',
      categoria: 'estructura',
      tipo_pieza: 'base',
      posicion_esperada: { x: 0, y: 0, z: 0 },
      rotacion_esperada: { x: 0, y: 0, z: 0 },
      tolerancia_posicion_mm: 2,
      tolerancia_rotacion_deg: 5,
      estado: 'PENDING',
      dependencias: [],
    },
    {
      id: 'lateral-izq',
      codigo: 'lateral-izq',
      categoria: 'estructura',
      tipo_pieza: 'lateral',
      posicion_esperada: { x: 0, y: 18, z: 0 },
      rotacion_esperada: { x: 0, y: 0, z: 0 },
      tolerancia_posicion_mm: 2,
      tolerancia_rotacion_deg: 5,
      estado: 'PENDING',
      dependencias: [],
    },
  ],
  connectors: [],
  steps: [],
  dependencies: [['base', 'lateral-izq']],
  levels: [['base'], ['lateral-izq']],
}

describe('AssemblyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ data: mockAssembly })
  })

  it('renders assembly title and step description', async () => {
    render(
      <MemoryRouter initialEntries={['/assembly/proj-1']}>
        <Routes>
          <Route path='/assembly/:projectId' element={<AssemblyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Vista previa del mueble armado')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Asistente'))
    await waitFor(() => expect(screen.getByText('Ensamblaje')).toBeInTheDocument())
    expect(screen.getByText(/Base y laterales/)).toBeInTheDocument()
    expect(screen.getAllByText(/Colocar la base y unir los laterales/)).toHaveLength(2)
  })

  it('shows validation panel after validating step', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        step_id: 'step-1',
        valid: true,
        piece_results: {
          base: { valid: true, errors: [] },
          'lateral-izq': { valid: true, errors: [] },
        },
        errors: [],
      },
    })

    render(
      <MemoryRouter initialEntries={['/assembly/proj-1']}>
        <Routes>
          <Route path='/assembly/:projectId' element={<AssemblyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Asistente')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Asistente'))
    await waitFor(() => expect(screen.getByText('Validar paso')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Validar paso'))

    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument())
    expect(screen.getAllByText('0.0 mm')).toHaveLength(2)
  })

  it('switches to planner mode and renders the graph', async () => {
    render(
      <MemoryRouter initialEntries={['/assembly/proj-1']}>
        <Routes>
          <Route path='/assembly/:projectId' element={<AssemblyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Planificador')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Planificador'))
    await waitFor(() => expect(screen.getByRole('img', { name: 'Editor de grafo de ensamblaje' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'base' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'lateral-izq' })).toBeInTheDocument()
  })

  it('saves the plan from the planner', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } })

    render(
      <MemoryRouter initialEntries={['/assembly/proj-1']}>
        <Routes>
          <Route path='/assembly/:projectId' element={<AssemblyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Planificador')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Planificador'))
    await waitFor(() => expect(screen.getByText('Guardar plan')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Guardar plan'))

    await waitFor(() =>
      expect(vi.mocked(api.post)).toHaveBeenCalledWith('/projects/proj-1/assembly/plan', {
        dependencies: mockAssembly.dependencies,
        save: true,
      })
    )
  })

  it('shows level timeline in assistant mode', async () => {
    render(
      <MemoryRouter initialEntries={['/assembly/proj-1']}>
        <Routes>
          <Route path='/assembly/:projectId' element={<AssemblyPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Asistente')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Asistente'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nivel 1' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Nivel 2' })).toBeInTheDocument()
  })
})
