import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StepTimeline } from './StepTimeline'

const steps = [
  { id: 's1', numero: 1, titulo: 'Preparar' },
  { id: 's2', numero: 2, titulo: 'Montar laterales' },
  { id: 's3', numero: 3, titulo: 'Colocar base' },
]

describe('StepTimeline', () => {
  afterEach(() => cleanup())
  it('renders current step label', () => {
    render(<StepTimeline steps={steps} currentStep={1} onStepChange={vi.fn()} />)
    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument()
  })

  it('calls onStepChange when clicking next/previous', () => {
    const onChange = vi.fn()
    render(<StepTimeline steps={steps} currentStep={1} onStepChange={onChange} />)

    fireEvent.click(screen.getByText('Anterior'))
    expect(onChange).toHaveBeenCalledWith(0)

    fireEvent.click(screen.getByText('Siguiente'))
    expect(onChange).toHaveBeenCalledWith(2)
  })

  it('disables previous on first step', () => {
    render(<StepTimeline steps={steps} currentStep={0} onStepChange={vi.fn()} />)
    expect(screen.getByText('Anterior')).toBeDisabled()
    expect(screen.getByText('Siguiente')).not.toBeDisabled()
  })

  it('disables next on last step', () => {
    render(<StepTimeline steps={steps} currentStep={2} onStepChange={vi.fn()} />)
    expect(screen.getByText('Siguiente')).toBeDisabled()
    expect(screen.getByText('Anterior')).not.toBeDisabled()
  })

  it('calls onStepChange when clicking a step dot', () => {
    const onChange = vi.fn()
    render(<StepTimeline steps={steps} currentStep={0} onStepChange={onChange} />)

    const dots = screen.getAllByLabelText(/Paso \d:/)
    expect(dots).toHaveLength(3)

    fireEvent.click(dots[2])
    expect(onChange).toHaveBeenCalledWith(2)
  })
})
