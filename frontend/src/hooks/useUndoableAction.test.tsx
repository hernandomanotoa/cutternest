import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Children } from 'react'
import { renderHook, act } from '@testing-library/react'
import { useUndoableAction } from './useUndoableAction'
import toast from 'react-hot-toast'

function findButton(node: any): any {
  if (!node) return null
  if (node.type === 'button') return node
  const children = Children.toArray(node.props?.children)
  for (const child of children) {
    const found = findButton(child)
    if (found) return found
  }
  return null
}

vi.mock('react-hot-toast', () => ({
  default: {
    custom: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}))

describe('useUndoableAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delays execution and shows undo toast', async () => {
    vi.useFakeTimers()
    try {
      const onExecute = vi.fn().mockResolvedValue(undefined)
      const { result } = renderHook(() => useUndoableAction({ onExecute, delayMs: 50 }))

      act(() => {
        result.current.execute()
      })

      expect(toast.custom).toHaveBeenCalled()
      expect(onExecute).not.toHaveBeenCalled()
      expect(result.current.isPending).toBe(true)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60)
      })

      expect(onExecute).toHaveBeenCalledTimes(1)
      expect(result.current.isPending).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not execute when undone before delay', () => {
    vi.useFakeTimers()
    try {
      const onExecute = vi.fn().mockResolvedValue(undefined)
      const onUndo = vi.fn().mockResolvedValue(undefined)
      let undoCallback: (() => void) | null = null

      vi.mocked(toast.custom).mockImplementation((fn: any) => {
        const t = { id: 'toast-1' }
        const element = fn(t)
        const rendered = element.type(element.props)
        const undoButton = findButton(rendered)
        undoCallback = undoButton?.props?.onClick
        return 'toast-1'
      })

      const { result } = renderHook(() => useUndoableAction({ onExecute, onUndo, delayMs: 50 }))

      act(() => {
        result.current.execute()
      })

      act(() => {
        if (undoCallback) undoCallback()
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(onExecute).not.toHaveBeenCalled()
      expect(onUndo).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
