import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Assembly3DV2 } from './Assembly3DV2'
import type { AssemblyConnector, AssemblyPiece3D } from '../../types'

const samplePieces: AssemblyPiece3D[] = [
  {
    id: 'base',
    nombre: 'Base',
    ancho: 120,
    alto: 1.8,
    profundidad: 60,
    color: '#FF6B6B',
    posicion: { x: 0, y: 0, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'lateral-izq',
    nombre: 'Lateral Izq',
    ancho: 1.8,
    alto: 180,
    profundidad: 60,
    color: '#45B7D1',
    posicion: { x: 0, y: 1.8, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
  },
]

const sampleConnectors: AssemblyConnector[] = [
  {
    tipo: 'confirmat',
    posicion: { x: 0.9, y: 5, z: 5 },
    direccion: { x: 1, y: 0, z: 0 },
    piezas: ['lateral-izq', 'base'],
  },
]

describe('Assembly3DV2', () => {
  it('renders without crashing', () => {
    const { container } = render(
      <Assembly3DV2 pieces={samplePieces} connectors={sampleConnectors} />
    )
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('renders with exploded view', () => {
    const { container } = render(
      <Assembly3DV2 pieces={samplePieces} connectors={sampleConnectors} exploded />
    )
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
