import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AcabadoSelector } from './AcabadoSelector'
import { ACABADOS } from '../../utils/texturasMadera'

describe('AcabadoSelector', () => {
  it('muestra "Color plano" + los 7 acabados como botones con muestra', () => {
    render(<AcabadoSelector value={null} onChange={() => {}} />)
    const grupo = screen.getByRole('group', { name: 'Acabado de melamina' })
    const botones = grupo.querySelectorAll('button')
    expect(botones).toHaveLength(1 + Object.keys(ACABADOS).length)
    expect(screen.getByText('Roble Claro')).toBeInTheDocument()
    expect(screen.getByText('Negro Mate')).toBeInTheDocument()
    // Cada acabado lleva su muestra de color (colorBase).
    const roble = screen.getByText('Roble Claro').closest('button')!
    // jsdom normaliza el style a rgb(); comparamos el valor computado.
    const muestra = roble.querySelector('span[aria-hidden]') as HTMLElement
    expect(muestra.style.backgroundColor).toBe('rgb(201, 168, 118)')
  })

  it('al pulsar un acabado emite su id; "Color plano" emite null', () => {
    const onChange = vi.fn()
    render(<AcabadoSelector value={null} onChange={onChange} />)
    fireEvent.click(screen.getByText('Nogal'))
    expect(onChange).toHaveBeenCalledWith('nogal')
    fireEvent.click(screen.getByText('Color plano'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('marca el acabado activo (aria-pressed)', () => {
    render(<AcabadoSelector value='wengue' onChange={() => {}} />)
    expect(screen.getByText('Wengué').closest('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Roble Claro').closest('button')?.getAttribute('aria-pressed')).toBe('false')
  })
})
