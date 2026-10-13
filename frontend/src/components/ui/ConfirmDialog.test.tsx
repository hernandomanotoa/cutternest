import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog'

const baseProps = {
  open: true,
  title: '¿Eliminar Proyecto X?',
  message: 'Esta acción no se puede deshacer.',
  confirmLabel: 'Eliminar',
  cancelLabel: 'Cancelar',
}

let onOpenChange: ReturnType<typeof vi.fn>
let onConfirm: ReturnType<typeof vi.fn>

beforeEach(() => {
  onOpenChange = vi.fn()
  onConfirm = vi.fn()
})

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  render(<ConfirmDialog {...baseProps} onOpenChange={onOpenChange} onConfirm={onConfirm} {...overrides} />)
}

describe('ConfirmDialog', () => {
  it('no renderiza contenido cuando está cerrado', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renderiza título, mensaje y acciones cuando está abierto', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('¿Eliminar Proyecto X?')).toBeInTheDocument()
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  it('llama onConfirm al confirmar', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('llama onOpenChange(false) al cancelar', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('cierra con Escape', () => {
    renderDialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
