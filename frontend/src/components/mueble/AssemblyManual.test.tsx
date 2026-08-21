import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AssemblyManual } from './AssemblyManual'
import type { AssemblyResponse } from '../../types'

function makeResponse(): AssemblyResponse {
  return {
    pasos: [
      {
        id: 's1',
        numero: 1,
        code: 'S1',
        titulo: 'Preparar base',
        descripcion: 'Base',
        piezas: ['base'],
        piezas_3d: [],
        conectores: [],
        connector_ids: [],
        herramientas: [],
        dependencies: [],
        tiempo_estimado_min: 10,
        status: 'pending',
      },
    ],
    vista_completa: [],
    conectores_completos: [],
    modules: [],
    pieces: [],
    connectors: [],
    steps: [],
  }
}

describe('AssemblyManual', () => {
  it('renders HTML and PDF buttons', () => {
    render(<AssemblyManual response={makeResponse()} fileName='estanteria' />)
    expect(screen.getByText('Descargar HTML')).toBeInTheDocument()
    expect(screen.getByText('Descargar PDF')).toBeInTheDocument()
  })

  it('disables buttons when response is null', () => {
    render(<AssemblyManual response={null} />)
    expect(screen.getByText('Descargar HTML')).toBeDisabled()
    expect(screen.getByText('Descargar PDF')).toBeDisabled()
  })

  it('renders children as a trigger', () => {
    render(
      <AssemblyManual response={makeResponse()}>
        <span>Exportar</span>
      </AssemblyManual>
    )
    expect(screen.getByText('Exportar')).toBeInTheDocument()
  })
})
