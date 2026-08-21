import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AssemblyPlanner } from './AssemblyPlanner'
import type { AssemblyPiece3D } from '../../types'

function makePiece(id: string): AssemblyPiece3D {
  return {
    id,
    nombre: `Pieza ${id}`,
    ancho: 10,
    alto: 10,
    profundidad: 10,
    color: '#d4a574',
    posicion: { x: 0, y: 0, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
  }
}

describe('AssemblyPlanner', () => {
  const pieces = [makePiece('A'), makePiece('B'), makePiece('C')]

  it('renders nodes for pieces', () => {
    render(
      <AssemblyPlanner
        pieces={pieces}
        dependencies={[]}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument()
  })

  it('clicking two nodes adds an edge', () => {
    const onChange = vi.fn()
    render(
      <AssemblyPlanner
        pieces={pieces}
        dependencies={[]}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    fireEvent.click(screen.getByRole('button', { name: 'B' }))

    expect(onChange).toHaveBeenCalledWith([['A', 'B']])
  })

  it('clicking same pair again removes the edge', () => {
    const onChange = vi.fn()
    render(
      <AssemblyPlanner
        pieces={pieces}
        dependencies={[['A', 'B']]}
        onChange={onChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    fireEvent.click(screen.getByRole('button', { name: 'B' }))

    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('shows a cycle warning when a cycle would be created', () => {
    render(
      <AssemblyPlanner
        pieces={pieces}
        dependencies={[
          ['A', 'B'],
          ['B', 'C'],
        ]}
        onChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'C' }))
    fireEvent.click(screen.getByRole('button', { name: 'A' }))

    expect(screen.getByText(/Ciclo detectado/)).toBeInTheDocument()
  })
})
