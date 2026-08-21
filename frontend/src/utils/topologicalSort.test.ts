import { describe, it, expect } from 'vitest'
import { topologicalLevels, detectCycle } from './topologicalSort'

describe('topologicalLevels', () => {
  it('produces 3 levels for a simple chain A→B→C', () => {
    const result = topologicalLevels(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
    ])
    expect(result.levels).toEqual([['A'], ['B'], ['C']])
    expect(result.sorted).toEqual(['A', 'B', 'C'])
    expect(result.cycle).toBeUndefined()
  })

  it('produces 3 levels for a diamond A→B, A→C, B→D, C→D', () => {
    const result = topologicalLevels(['A', 'B', 'C', 'D'], [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
    ])
    expect(result.levels).toEqual([['A'], ['B', 'C'], ['D']])
    expect(result.sorted).toEqual(['A', 'B', 'C', 'D'])
  })

  it('places isolated nodes in level 0', () => {
    const result = topologicalLevels(['A', 'B', 'C'], [['A', 'B']])
    expect(result.levels[0]).toContain('C')
    expect(result.levels[0]).toContain('A')
    expect(result.levels).toHaveLength(2)
    expect(result.levels[1]).toEqual(['B'])
  })

  it('returns empty levels and a cycle when one exists', () => {
    const result = topologicalLevels(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ])
    expect(result.levels).toEqual([])
    expect(result.sorted).toEqual([])
    expect(result.cycle).toBeDefined()
    expect(result.cycle!.length).toBeGreaterThan(0)
  })
})

describe('detectCycle', () => {
  it('returns null for acyclic graphs', () => {
    expect(detectCycle(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']])).toBeNull()
  })

  it('finds a cycle in a 3-node graph', () => {
    const cycle = detectCycle(['A', 'B', 'C'], [
      ['A', 'B'],
      ['B', 'C'],
      ['C', 'A'],
    ])
    expect(cycle).not.toBeNull()
    expect(cycle).toHaveLength(3)
    expect(new Set(cycle)).toEqual(new Set(['A', 'B', 'C']))
  })
})
