import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { AcabadoSelector } from './AcabadoSelector'
import { ACABADOS, COMBINACIONES } from '../../utils/texturasMadera'

function renderSelector(props?: Partial<Parameters<typeof AcabadoSelector>[0]>) {
  return render(
    <AcabadoSelector
      value={null}
      alcance='todo'
      onChange={() => {}}
      onAlcanceChange={() => {}}
      {...props}
    />
  )
}

describe('AcabadoSelector', () => {
  it('muestra combinaciones (doble muestra), "Color plano" + los 7 acabados', () => {
    renderSelector()
    const grupo = screen.getByRole('group', { name: 'Acabado de melamina' })
    const botones = grupo.querySelectorAll('button')
    // Combinaciones + color plano + acabados + 2 de alcance.
    expect(botones).toHaveLength(
      Object.keys(COMBINACIONES).length + 1 + Object.keys(ACABADOS).length + 2
    )
    expect(screen.getByText('Roble + Blanco')).toBeInTheDocument()
    expect(screen.getByText('Roble Claro')).toBeInTheDocument()
    expect(screen.getByText('Negro Mate')).toBeInTheDocument()
    // Cada acabado suelto lleva su muestra de color (colorBase).
    const roble = screen.getByText('Roble Claro').closest('button')!
    const muestra = roble.querySelector('span[aria-hidden]') as HTMLElement
    expect(muestra.style.backgroundColor).toBe('rgb(201, 168, 118)')
  })

  it('una combinación emite {exterior, interior}; un acabado suelto interior blanco; "Color plano" null', () => {
    const onChange = vi.fn()
    renderSelector({ onChange })
    fireEvent.click(screen.getByText('Nogal + Blanco'))
    expect(onChange).toHaveBeenCalledWith({ exterior: 'nogal', interior: 'blanco' })
    fireEvent.click(screen.getByText('Grafito + Negro'))
    expect(onChange).toHaveBeenCalledWith({ exterior: 'grafito', interior: 'negro' })
    fireEvent.click(screen.getByText('Wengué'))
    expect(onChange).toHaveBeenCalledWith({ exterior: 'wengue', interior: 'blanco' })
    fireEvent.click(screen.getByText('Color plano'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('marca activa la selección equivalente (combinación o acabado + blanco)', () => {
    renderSelector({ value: { exterior: 'roble', interior: 'blanco' } })
    expect(screen.getByText('Roble + Blanco').closest('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Roble Claro').closest('button')?.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Nogal').closest('button')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('alcance: botones "Todo el mueble" / "Solo módulos internos"', () => {
    const onAlcanceChange = vi.fn()
    renderSelector({ alcance: 'todo', onAlcanceChange })
    const grupo = screen.getByRole('group', { name: 'Alcance del acabado' })
    const [todo, internos] = grupo.querySelectorAll('button')
    expect(todo.getAttribute('aria-pressed')).toBe('true')
    expect(internos.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(internos)
    expect(onAlcanceChange).toHaveBeenCalledWith('internos')
  })
})
