import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Assembly3DV2 } from './Assembly3DV2'
import type { AssemblyConnector, AssemblyPiece3D } from '../../types'

const samplePieces: AssemblyPiece3D[] = [
  {
    id: 'base',
    nombre: 'Base',
    ancho: 1200,
    alto: 18,
    profundidad: 600,
    color: '#FF6B6B',
    posicion: { x: 0, y: 0, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
  },
  {
    id: 'lateral-izq',
    nombre: 'Lateral Izq',
    ancho: 18,
    alto: 1800,
    profundidad: 600,
    color: '#45B7D1',
    posicion: { x: 0, y: 18, z: 0 },
    rotacion: { x: 0, y: 0, z: 0 },
  },
]

const sampleConnectors: AssemblyConnector[] = [
  {
    tipo: 'confirmat',
    posicion: { x: 9, y: 50, z: 50 },
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

  it('renders with explode factor', () => {
    const { container } = render(
      <Assembly3DV2 pieces={samplePieces} connectors={sampleConnectors} explodeFactor={0.5} />
    )
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('renders with selected piece code', () => {
    const { container } = render(
      <Assembly3DV2 pieces={samplePieces} connectors={sampleConnectors} selectedCode='base' />
    )
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
