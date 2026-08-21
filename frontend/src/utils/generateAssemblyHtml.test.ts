import { describe, it, expect } from 'vitest'
import { generateAssemblyHtml } from './generateAssemblyHtml'
import type { AssemblyResponse } from '../types'

function makeResponse(): AssemblyResponse {
  return {
    pasos: [
      {
        id: 's1',
        numero: 1,
        code: 'S1',
        titulo: 'Preparar base',
        descripcion: 'Colocar la base sobre la mesa',
        piezas: ['base'],
        piezas_3d: [
          {
            id: 'base',
            nombre: 'Base',
            ancho: 100,
            alto: 20,
            profundidad: 50,
            color: '#d4a574',
            posicion: { x: 0, y: 0, z: 0 },
            rotacion: { x: 0, y: 0, z: 0 },
          },
        ],
        conectores: [],
        connector_ids: [],
        herramientas: ['destornillador'],
        dependencies: [],
        tiempo_estimado_min: 10,
        status: 'pending',
      },
      {
        id: 's2',
        numero: 2,
        code: 'S2',
        titulo: 'Montar laterales',
        descripcion: 'Fijar los laterales',
        piezas: ['lat1', 'lat2'],
        piezas_3d: [
          {
            id: 'lat1',
            nombre: 'Lateral 1',
            ancho: 20,
            alto: 80,
            profundidad: 50,
            color: '#d4a574',
            posicion: { x: 0, y: 0, z: 0 },
            rotacion: { x: 0, y: 0, z: 0 },
          },
          {
            id: 'lat2',
            nombre: 'Lateral 2',
            ancho: 20,
            alto: 80,
            profundidad: 50,
            color: '#d4a574',
            posicion: { x: 0, y: 0, z: 0 },
            rotacion: { x: 0, y: 0, z: 0 },
          },
        ],
        conectores: [{ tipo: 'tornillo', posicion: { x: 0, y: 0, z: 0 }, direccion: { x: 0, y: 0, z: 0 }, piezas: ['lat1', 'base'] }],
        connector_ids: ['c1'],
        herramientas: ['taladro'],
        dependencies: ['s1'],
        tiempo_estimado_min: 20,
        status: 'pending',
      },
    ],
    vista_completa: [],
    conectores_completos: [{ tipo: 'tornillo', posicion: { x: 0, y: 0, z: 0 }, direccion: { x: 0, y: 0, z: 0 }, piezas: ['lat1', 'base'] }],
    modules: [],
    pieces: [],
    connectors: [],
    steps: [],
    levels: [['base'], ['lat1', 'lat2']],
  }
}

describe('generateAssemblyHtml', () => {
  it('includes project title and summary counts', () => {
    const html = generateAssemblyHtml(makeResponse())
    expect(html).toContain('Manual: Preparar base')
    expect(html).toContain('Preparar base')
    expect(html).toContain('Montar laterales')
    expect(html).toContain('>2</p>') // steps count
    expect(html).toContain('>1</p>') // connectors count
    expect(html).toContain('>30 min</p>') // total time
  })

  it('renders the levels timeline', () => {
    const response = makeResponse()
    const html = generateAssemblyHtml(response, response.levels)
    expect(html).toContain('Nivel 1')
    expect(html).toContain('Nivel 2')
    expect(html).toContain('base')
    expect(html).toContain('lat1')
  })

  it('renders step rows with pieces, tools and prerequisites', () => {
    const html = generateAssemblyHtml(makeResponse())
    expect(html).toContain('Preparar base')
    expect(html).toContain('Montar laterales')
    expect(html).toContain('destornillador')
    expect(html).toContain('taladro')
    expect(html).toContain('s1')
  })
})
