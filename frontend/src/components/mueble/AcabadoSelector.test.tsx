import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AcabadoSelector } from './AcabadoSelector'
import { ACABADOS } from '../../utils/texturasMadera'

describe('AcabadoSelector', () => {
  it('lista "Color plano" + los 7 acabados de la paleta', () => {
    render(<AcabadoSelector value={null} onChange={() => {}} />)
    const select = screen.getByLabelText('Acabado de melamina') as HTMLSelectElement
    const opciones = Array.from(select.options).map((o) => o.value)
    expect(opciones[0]).toBe('')
    expect(opciones).toHaveLength(1 + Object.keys(ACABADOS).length)
    expect(screen.getByText('Roble Claro')).toBeInTheDocument()
    expect(screen.getByText('Negro Mate')).toBeInTheDocument()
  })

  it('al cambiar emite el id; "Color plano" emite null', () => {
    const onChange = vi.fn()
    render(<AcabadoSelector value={null} onChange={onChange} />)
    const select = screen.getByLabelText('Acabado de melamina')
    fireEvent.change(select, { target: { value: 'nogal' } })
    expect(onChange).toHaveBeenCalledWith('nogal')
    fireEvent.change(select, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('refleja el acabado activo', () => {
    render(<AcabadoSelector value='wengue' onChange={() => {}} />)
    const select = screen.getByLabelText('Acabado de melamina') as HTMLSelectElement
    expect(select.value).toBe('wengue')
  })
})
