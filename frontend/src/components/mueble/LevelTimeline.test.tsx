import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LevelTimeline } from './LevelTimeline'

const levels = [['A', 'B'], ['C'], ['D', 'E']]

describe('LevelTimeline', () => {
  it('renders all levels and piece badges', () => {
    render(<LevelTimeline levels={levels} currentLevel={0} />)
    expect(screen.getByText('Nivel 1')).toBeInTheDocument()
    expect(screen.getByText('Nivel 2')).toBeInTheDocument()
    expect(screen.getByText('Nivel 3')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('calls onLevelChange when a level is clicked', () => {
    const onChange = vi.fn()
    render(<LevelTimeline levels={levels} currentLevel={0} onLevelChange={onChange} />)

    fireEvent.click(screen.getByText('Nivel 2'))
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('uses getPieceLabel when provided', () => {
    render(
      <LevelTimeline
        levels={levels}
        currentLevel={0}
        getPieceLabel={(id) => `Pieza ${id}`}
      />
    )
    expect(screen.getByText('Pieza A')).toBeInTheDocument()
  })
})
