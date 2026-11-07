import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { OffcutRegistrar } from './OffcutRegistrar'
import { api } from '../../api/client'
import toast from 'react-hot-toast'

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  API_BASE_URL: 'http://localhost:8000/api/v1',
}))

vi.mock('react-hot-toast', () => {
  const fn = vi.fn()
  return { default: Object.assign(fn, { success: vi.fn(), error: vi.fn() }) }
})

afterEach(() => cleanup())

const CANDIDATOS = {
  offcuts: [
    { x: 0, y: 0, ancho: 600, alto: 400 },
    { x: 1200, y: 600, ancho: 300, alto: 300 },
  ],
}

describe('OffcutRegistrar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('detecta sobrantes y los lista con checkbox', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: CANDIDATOS })
    render(<OffcutRegistrar projectId='p1' boardIndex={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Detectar sobrantes/ }))

    await waitFor(() => expect(screen.getByText('600×400 mm')).toBeInTheDocument())
    expect(screen.getByText('300×300 mm')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/projects/p1/layouts/0/offcuts')
  })

  it('con 404 muestra un toast informativo sin romper', async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 404 } })
    render(<OffcutRegistrar projectId='p1' boardIndex={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Detectar sobrantes/ }))

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('El detector de sobrantes aún no está disponible en el backend')
    )
  })

  it('registra los seleccionados con ?registrar=true y toast con ids', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: CANDIDATOS })
    vi.mocked(api.post).mockResolvedValue({ data: { ...CANDIDATOS, registrados: [7, 8] } })
    render(<OffcutRegistrar projectId='p1' boardIndex={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Detectar sobrantes/ }))
    await waitFor(() => expect(screen.getByText('600×400 mm')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /Registrar seleccionados/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/projects/p1/layouts/0/offcuts',
        { offcuts: CANDIDATOS.offcuts },
        { params: { registrar: true } }
      )
    )
    expect(toast.success).toHaveBeenCalledWith('Sobrantes registrados: 7, 8')
  })

  it('respeta el checkbox: solo registra los elegidos', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: CANDIDATOS })
    vi.mocked(api.post).mockResolvedValue({ data: { registrados: [7] } })
    render(<OffcutRegistrar projectId='p1' boardIndex={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Detectar sobrantes/ }))
    await waitFor(() => expect(screen.getByText('300×300 mm')).toBeInTheDocument())

    const checks = screen.getAllByRole('checkbox')
    fireEvent.click(checks[1]) // desmarca el segundo
    fireEvent.click(screen.getByRole('button', { name: /Registrar seleccionados \(1\)/ }))

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/projects/p1/layouts/0/offcuts',
        { offcuts: [CANDIDATOS.offcuts[0]] },
        { params: { registrar: true } }
      )
    )
  })

  it('tolerante: acepta campos alternos y omite entradas inválidas', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        offcuts: [
          { x: 0, y: 0, w: 500, h: 250 },
          { ancho: 'nada', alto: 0 },
          'basura',
        ],
      },
    })
    render(<OffcutRegistrar projectId='p1' boardIndex={0} />)

    fireEvent.click(screen.getByRole('button', { name: /Detectar sobrantes/ }))

    await waitFor(() => expect(screen.getByText('500×250 mm')).toBeInTheDocument())
    expect(screen.queryByText(/nada/)).not.toBeInTheDocument()
  })
})
